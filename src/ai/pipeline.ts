import type { AnalysisResult, AnalyzeContext, Classifier, DetectedEvent, Roi, Segmenter } from './types'
import { motionEnergy, adaptiveThreshold, segmentFeature, smooth } from './features'
import { sampleFrames } from './video'
import { uid } from '../lib/id'

export interface PipelineOptions {
  start: number
  end: number
  fps: number
  roi: Roi
  sensitivity: number
  segmenter: Segmenter
  classifiers: Classifier[]
}

/**
 * 解析パイプライン:
 *   フレーム抽出 → 区間検出（Segmenter）→ 特徴量 → 分類（Classifier[]）→ 候補を統合
 * Segmenter / Classifier を差し替えるだけで、方式を変えられる。
 */
export async function runPipeline(
  video: HTMLVideoElement,
  opts: PipelineOptions,
  ctx: AnalyzeContext,
  onProgress: (stage: string, p: number) => void,
): Promise<AnalysisResult> {
  onProgress('フレームを抽出中', 0)
  const frames = await sampleFrames(video, opts, (p) => onProgress('フレームを抽出中', p * 0.85), ctx.signal)
  if (frames.length < 3) throw new Error('解析範囲が短すぎます')

  onProgress('動作区間を検出中', 0.87)
  const energy = smooth(motionEnergy(frames), 1)
  const segments = await opts.segmenter.segment(frames, ctx, { sensitivity: opts.sensitivity })

  onProgress('技の候補を照合中', 0.92)
  const events: DetectedEvent[] = []
  for (const s of segments) {
    const ev: DetectedEvent = { ...s, id: uid(), candidates: [], feature: segmentFeature(s, frames) }
    for (const c of opts.classifiers) {
      if (c.status === 'planned') continue
      ev.candidates.push(...(await c.classify(ev, frames, ctx)))
    }
    // 同じ技は信頼度が高いほうだけ残す
    const best = new Map<string, (typeof ev.candidates)[number]>()
    ev.candidates.forEach((x) => (!best.has(x.moveId) || best.get(x.moveId)!.confidence < x.confidence) && best.set(x.moveId, x))
    ev.candidates = [...best.values()].sort((a, b) => b.confidence - a.confidence)
    events.push(ev)
  }
  onProgress('完了', 1)
  return {
    duration: opts.end - opts.start,
    fps: opts.fps,
    energy: frames.map((f, i) => ({ t: f.t, v: energy[i] })),
    threshold: adaptiveThreshold(energy, opts.sensitivity),
    events,
    segmenterId: opts.segmenter.id,
    classifierIds: opts.classifiers.filter((c) => c.status !== 'planned').map((c) => c.id),
    frames,
  }
}

/** 手動で区間を追加する（検出漏れの補正用） */
export function manualEvent(t: number, frames?: Parameters<typeof segmentFeature>[1]): DetectedEvent {
  const s = { start: Math.max(0, t - 0.2), end: t + 0.3, peak: t, strength: 0 }
  return { ...s, id: uid(), candidates: [], feature: frames ? segmentFeature(s, frames) : undefined }
}
