import type { Frame, Segment } from './types'

/** 連続フレームの平均絶対差分（0〜1） */
export function motionEnergy(frames: Frame[]): number[] {
  const out = [0]
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1].gray
    const b = frames[i].gray
    let sum = 0
    for (let j = 0; j < a.length; j++) sum += Math.abs(a[j] - b[j])
    out.push(sum / a.length / 255)
  }
  return out
}

export function smooth(v: number[], r = 1): number[] {
  return v.map((_, i) => {
    let s = 0
    let n = 0
    for (let k = Math.max(0, i - r); k <= Math.min(v.length - 1, i + r); k++) {
      s += v[k]
      n++
    }
    return s / n
  })
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

/** 中央値 + k × MAD を閾値にする（動画ごとの明るさ・ノイズの違いに強い） */
export function adaptiveThreshold(energy: number[], sensitivity: number): number {
  const med = median(energy)
  const mad = median(energy.map((x) => Math.abs(x - med))) || 1e-4
  // sensitivity 0..1 → k 8..1.5
  const k = 8 - sensitivity * 6.5
  return Math.max(med + k * mad, 0.004)
}

/** 閾値を超えた区間を切り出し、短い隙間は結合、短すぎる区間は除外 */
export function segmentsFromEnergy(
  energy: number[],
  times: number[],
  threshold: number,
  opts: { minGap?: number; minDur?: number; maxDur?: number } = {},
): Segment[] {
  const { minGap = 0.15, minDur = 0.1, maxDur = 4 } = opts
  const raw: { s: number; e: number }[] = []
  let start = -1
  for (let i = 0; i < energy.length; i++) {
    const on = energy[i] > threshold
    if (on && start < 0) start = i
    if ((!on || i === energy.length - 1) && start >= 0) {
      raw.push({ s: start, e: on ? i : i - 1 })
      start = -1
    }
  }
  const merged: { s: number; e: number }[] = []
  for (const r of raw) {
    const last = merged.at(-1)
    if (last && times[r.s] - times[last.e] <= minGap) last.e = r.e
    else merged.push({ ...r })
  }
  const peakAll = Math.max(...energy, 1e-6)
  return merged
    .map(({ s, e }) => {
      // 差分は「前フレームとの差」なので開始は 1 フレーム前から
      const s0 = Math.max(0, s - 1)
      let p = s
      for (let i = s; i <= e; i++) if (energy[i] > energy[p]) p = i
      return { start: times[s0], end: times[e], peak: times[p], strength: Math.min(1, energy[p] / peakAll) }
    })
    .filter((x) => x.end - x.start >= minDur)
    .flatMap((x) => splitLong(x, maxDur))
}

function splitLong(s: Segment, maxDur: number): Segment[] {
  const d = s.end - s.start
  if (d <= maxDur) return [s]
  const n = Math.ceil(d / maxDur)
  return Array.from({ length: n }, (_, i) => {
    const start = s.start + (d / n) * i
    const end = start + d / n
    return { start, end, peak: (start + end) / 2, strength: s.strength }
  })
}

/* ---------- 特徴量（テンプレート照合用） ---------- */

const FW = 16
const FH = 9

function downsample(f: Frame): number[] {
  const out: number[] = []
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) {
      let s = 0
      let n = 0
      const x0 = Math.floor((x * f.w) / FW)
      const x1 = Math.floor(((x + 1) * f.w) / FW)
      const y0 = Math.floor((y * f.h) / FH)
      const y1 = Math.floor(((y + 1) * f.h) / FH)
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) {
          s += f.gray[yy * f.w + xx]
          n++
        }
      out.push(n ? s / n : 0)
    }
  return out
}

function normalizeVec(v: number[]): number[] {
  const mean = v.reduce((a, b) => a + b, 0) / v.length
  const c = v.map((x) => x - mean)
  const norm = Math.sqrt(c.reduce((a, b) => a + b * b, 0)) || 1
  return c.map((x) => x / norm)
}

/**
 * 区間の特徴量。静止した背景に引っ張られないよう「変化した場所」を主にする。
 *   [開始→ピークの変化 | ピーク→終了の変化 | 開始→終了の変化 | ピーク時の外観 × 0.35]
 */
export function segmentFeature(seg: Segment, frames: Frame[]): number[] {
  const at = (t: number) => frames.reduce((best, f) => (Math.abs(f.t - t) < Math.abs(best.t - t) ? f : best), frames[0])
  const a = downsample(at(seg.start))
  const p = downsample(at(seg.peak))
  const e = downsample(at(seg.end))
  const d1 = p.map((x, i) => Math.abs(x - a[i]))
  const d2 = e.map((x, i) => Math.abs(x - p[i]))
  const d3 = e.map((x, i) => Math.abs(x - a[i]))
  return [...normalizeVec(d1), ...normalizeVec(d2), ...normalizeVec(d3), ...normalizeVec(p).map((x) => x * 0.35)]
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}
