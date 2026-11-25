import type { MoveDef } from '../types'
import type { Candidate } from './types'
import { cosine } from './features'

export interface LabeledSample {
  moveId: string
  label: string
  feature: number[]
}

/** 類似度（コサイン）を 0〜1 の信頼度に写す。0.5 以下はほぼ無関係とみなす */
export const simToConfidence = (sim: number) => Math.max(0, Math.min(1, (sim - 0.5) / 0.45))

/** 学習例が少ないうちは自信を持たない: 1 件 → 0.38, 2 件 → 0.61, 3 件 → 0.74, 5 件 → 0.88 */
export const evidenceCap = (n: number) => 0.95 * (1 - Math.pow(0.6, n))

/**
 * k 近傍法による技候補。
 * 近いサンプル k 件の「票」（類似度で重み付け）を技ごとに集計する。
 * 信頼度 = 票の割合 × その技で最も近いサンプルの類似度 × 学習例の数による上限
 * 似た技どうしで票が割れると、どちらの信頼度も下がる（= 自動選択されない）。
 */
export function scoreSamples(feature: number[], samples: LabeledSample[], moves: MoveDef[], source: string, k = 7): Candidate[] {
  if (!samples.length) return []
  const sims = samples.map((t) => ({ t, sim: cosine(feature, t.feature) })).sort((a, b) => b.sim - a.sim)
  const counts = new Map<string, number>()
  samples.forEach((t) => counts.set(t.moveId, (counts.get(t.moveId) ?? 0) + 1))
  const votes = new Map<string, { w: number; best: number; label: string }>()
  let total = 0
  for (const { t, sim } of sims.slice(0, Math.min(k, sims.length))) {
    const w = Math.max(0, sim - 0.5)
    total += w
    const v = votes.get(t.moveId) ?? { w: 0, best: sim, label: t.label }
    v.w += w
    v.best = Math.max(v.best, sim)
    votes.set(t.moveId, v)
  }
  if (total <= 0) return []
  return [...votes.entries()]
    .map(([moveId, v]): Candidate => {
      const confidence = (v.w / total) * simToConfidence(v.best) * evidenceCap(counts.get(moveId) ?? 1)
      const m = moves.find((x) => x.id === moveId)
      return { moveId, label: m?.short ?? m?.name ?? v.label, confidence, source }
    })
    .filter((c) => c.confidence >= 0.05)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)
}

export interface Evaluation {
  total: number
  /** 1 位の候補が正解だった割合（1 件抜き交差検証） */
  top1: number
  /** 信頼度が閾値以上になった割合 */
  coverage: number
  /** 閾値以上のときの正解率 */
  precisionAtThreshold: number
  perMove: { moveId: string; label: string; n: number; correct: number }[]
  confusions: { actual: string; predicted: string; count: number }[]
}

/**
 * 交差検証: 各サンプルを「それ以外」のサンプルで判定して、正しく当たるかを数える。
 * groups を渡すと同じグループ（= 同じ動画）のサンプルを判定から外す。
 * 同じ動画のサンプル同士は似すぎて実力より高く出るため、動画単位で外すほうが実際の精度に近い。
 */
export function evaluate(samples: LabeledSample[], moves: MoveDef[], threshold: number, groups?: string[]): Evaluation {
  let correct = 0
  let covered = 0
  let coveredCorrect = 0
  const per = new Map<string, { label: string; n: number; correct: number }>()
  const conf = new Map<string, number>()
  samples.forEach((s, i) => {
    const rest = samples.filter((_, j) => j !== i && (!groups || groups[j] !== groups[i]))
    const top = scoreSamples(s.feature, rest, moves, 'eval')[0]
    const ok = top?.moveId === s.moveId
    const p = per.get(s.moveId) ?? { label: s.label, n: 0, correct: 0 }
    p.n++
    if (ok) {
      correct++
      p.correct++
    } else if (top) {
      const k = `${s.moveId}\u0000${top.moveId}`
      conf.set(k, (conf.get(k) ?? 0) + 1)
    }
    per.set(s.moveId, p)
    if (top && top.confidence >= threshold) {
      covered++
      if (ok) coveredCorrect++
    }
  })
  const n = samples.length || 1
  return {
    total: samples.length,
    top1: correct / n,
    coverage: covered / n,
    precisionAtThreshold: covered ? coveredCorrect / covered : 0,
    perMove: [...per.entries()].map(([moveId, v]) => ({ moveId, ...v })).sort((a, b) => a.correct / a.n - b.correct / b.n),
    confusions: [...conf.entries()]
      .map(([k, count]) => {
        const [actual, predicted] = k.split('\u0000')
        return { actual, predicted, count }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
  }
}
