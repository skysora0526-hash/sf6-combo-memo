import { beforeEach, describe, expect, it } from 'vitest'
import type { Frame } from '../ai/types'
import { adaptiveThreshold, cosine, motionEnergy, segmentFeature, segmentsFromEnergy } from '../ai/features'
import { motionSegmenter } from '../ai/analyzers/motion'
import { evidenceCap, simToConfidence, templateClassifier } from '../ai/analyzers/template'
import { useTemplates } from '../ai/templateStore'
import { COMMON_MOVES } from '../data'

/** 静止画面の中で、指定した時間だけ四角形が動く合成フレーム */
function synth(fps: number, dur: number, active: [number, number][], kind: 'slide' | 'rise' | 'diag' = 'slide', noise = 3, x0 = 10): Frame[] {
  const w = 64
  const h = 36
  let seed = 1
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * noise
  return Array.from({ length: Math.round(dur * fps) }, (_, i) => {
    const t = i / fps
    const gray = new Uint8ClampedArray(w * h)
    const on = active.find(([s, e]) => t >= s && t <= e)
    const p = on ? (t - on[0]) / (on[1] - on[0]) : 0
    const bx = kind === 'rise' ? x0 + 18 : x0 + Math.round(p * (kind === 'diag' ? 16 : 30))
    const by = kind === 'slide' ? 14 : 24 - Math.round(p * 16)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) gray[y * w + x] = (x >= bx && x < bx + 8 && y >= by && y < by + 8 ? 220 : 40) + rnd()
    return { t, w, h, gray }
  })
}

describe('motion segmentation', () => {
  it('動きのある区間だけを検出する', () => {
    const frames = synth(10, 6, [
      [1, 1.6],
      [3, 3.5],
    ])
    const segs = motionSegmenter.segment(frames, { characterId: 'x', moves: [] }, { sensitivity: 0.5 }) as ReturnType<typeof segmentsFromEnergy>
    expect(segs).toHaveLength(2)
    expect(segs[0].start).toBeGreaterThanOrEqual(0.8)
    expect(segs[0].end).toBeLessThanOrEqual(1.9)
    expect(segs[1].start).toBeGreaterThanOrEqual(2.8)
    expect(segs[1].end).toBeLessThanOrEqual(3.8)
  })
  it('静止画面（ノイズのみ）では何も検出しない', () => {
    const frames = synth(10, 4, [])
    expect(motionSegmenter.segment(frames, { characterId: 'x', moves: [] }, { sensitivity: 0.5 })).toHaveLength(0)
  })
  it('近い区間は結合し、長すぎる区間は分割する', () => {
    const t = Array.from({ length: 100 }, (_, i) => i / 10)
    const e = t.map((x) => ((x > 1 && x < 1.5) || (x > 1.6 && x < 2) || (x > 4 && x < 9.5) ? 1 : 0))
    const segs = segmentsFromEnergy(e, t, 0.5, { maxDur: 2, minGap: 0.35 })
    expect(segs[0].start).toBeCloseTo(1, 1)
    expect(segs[0].end).toBeCloseTo(1.9, 1)
    expect(segs.length).toBe(4) // 1 + 5.5 秒を 3 分割
  })
  it('閾値はノイズレベルに追従する', () => {
    expect(adaptiveThreshold([0.01, 0.011, 0.012, 0.01, 0.2], 0.5)).toBeLessThan(0.05)
    expect(adaptiveThreshold([0.1, 0.12, 0.09, 0.11, 0.5], 0.5)).toBeGreaterThan(0.1)
  })
  it('energy は先頭 0', () => {
    expect(motionEnergy(synth(10, 1, []))[0]).toBe(0)
  })
})

describe('position invariance (feature v2)', () => {
  const feat = (kind: 'slide' | 'rise' | 'diag', x0: number) => {
    const frames = synth(10, 2, [[0.5, 1.2]], kind, 3, x0)
    return segmentFeature({ start: 0.4, end: 1.2, peak: 0.9, strength: 1 }, frames)
  }
  it('画面の別の位置で起きた同じ動きを、同じ動きとして判定できる', () => {
    const train = (['slide', 'rise', 'diag'] as const).flatMap((k) => [0, 4].map((x) => ({ moveId: k, label: k, feature: feat(k, x) })))
    for (const k of ['slide', 'rise', 'diag'] as const) {
      const sims = train.map((t) => ({ m: t.moveId, s: cosine(feat(k, 22), t.feature) })).sort((a, b) => b.s - a.s)
      expect(sims[0].m).toBe(k)
    }
  })
})

describe('template classifier', () => {
  beforeEach(() => useTemplates.setState({ templates: [] }))
  const ctx = { characterId: 'ryu', moves: COMMON_MOVES }
  const featureOf = (kind: 'slide' | 'rise', seedShift = 0) => {
    const frames = synth(10, 2, [[0.5 + seedShift, 1.2 + seedShift]], kind)
    const seg = { start: 0.4 + seedShift, end: 1.2 + seedShift, peak: 0.9 + seedShift, strength: 1 }
    return segmentFeature(seg, frames)
  }

  it('テンプレートがなければ候補なし（= 不明な動作）', () => {
    expect(templateClassifier.classify({ id: 'e', start: 0, end: 1, peak: 0.5, strength: 1, candidates: [], feature: featureOf('slide') }, [], ctx)).toEqual([])
  })
  it('学習例が 1 件だけなら、似ていても信頼度は低い（自動選択されない）', () => {
    const add = useTemplates.getState().add
    add({ characterId: 'ryu', moveId: 'crmk', label: '屈中K', feature: featureOf('slide') })
    add({ characterId: 'ryu', moveId: 'sthp', label: '立強P', feature: featureOf('rise') })
    const ev = (f: number[]) => ({ id: 'e', start: 0, end: 1, peak: 0.5, strength: 1, candidates: [], feature: f })
    const slide = templateClassifier.classify(ev(featureOf('slide', 0.05)), [], ctx) as { moveId: string; confidence: number }[]
    expect(slide[0].moveId).toBe('crmk')
    expect(slide[0].confidence).toBeLessThan(0.4)
    const rise = templateClassifier.classify(ev(featureOf('rise', 0.05)), [], ctx) as { moveId: string }[]
    expect(rise[0].moveId).toBe('sthp')
  })
  it('学習例が増え、他の技と明確に違えば高い信頼度になる', () => {
    const add = useTemplates.getState().add
    for (const d of [0, 0.02, 0.04, 0.06, 0.08]) {
      add({ characterId: 'ryu', moveId: 'crmk', label: '屈中K', feature: featureOf('slide', d) })
      add({ characterId: 'ryu', moveId: 'sthp', label: '立強P', feature: featureOf('rise', d) })
    }
    const ev = { id: 'e', start: 0, end: 1, peak: 0.5, strength: 1, candidates: [], feature: featureOf('slide', 0.05) }
    const res = templateClassifier.classify(ev, [], ctx) as { moveId: string; confidence: number }[]
    expect(res[0].moveId).toBe('crmk')
    expect(res[0].confidence).toBeGreaterThan(0.75)
    expect(res[1]?.confidence ?? 0).toBeLessThan(0.5)
  })
  it('他キャラのテンプレートは使わない', () => {
    useTemplates.getState().add({ characterId: 'ken', moveId: 'crmk', label: '屈中K', feature: featureOf('slide') })
    expect(templateClassifier.classify({ id: 'e', start: 0, end: 1, peak: 0.5, strength: 1, candidates: [], feature: featureOf('slide') }, [], ctx)).toEqual([])
  })
  it('類似度 → 信頼度の変換と学習例による上限', () => {
    expect(evidenceCap(1)).toBeLessThan(0.4)
    expect(evidenceCap(5)).toBeGreaterThan(0.85)
    expect(evidenceCap(100)).toBeLessThan(1)
    expect(simToConfidence(0.4)).toBe(0)
    expect(simToConfidence(1)).toBe(1)
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1)
  })
})
