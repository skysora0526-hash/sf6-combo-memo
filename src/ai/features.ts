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

function normalizeVec(v: number[]): number[] {
  const mean = v.reduce((a, b) => a + b, 0) / v.length
  const c = v.map((x) => x - mean)
  const norm = Math.sqrt(c.reduce((a, b) => a + b * b, 0)) || 1
  return c.map((x) => x / norm)
}

/** 差分マップ |a - b|（フレームサイズのまま） */
function diffMap(a: Frame, b: Frame): Float32Array {
  const out = new Float32Array(a.gray.length)
  for (let i = 0; i < out.length; i++) out[i] = Math.abs(a.gray[i] - b.gray[i])
  return out
}

/** 動きの重心（ノイズを除くため平均以下の値は無視） */
function centroid(m: Float32Array, w: number, h: number): { x: number; y: number; mass: number } {
  let mean = 0
  for (let i = 0; i < m.length; i++) mean += m[i]
  mean /= m.length
  let sx = 0
  let sy = 0
  let mass = 0
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = m[y * w + x] - mean * 2
      if (v > 0) {
        sx += v * x
        sy += v * y
        mass += v
      }
    }
  return mass > 0 ? { x: sx / mass, y: sy / mass, mass } : { x: w / 2, y: h / 2, mass: 0 }
}

/** (cx, cy) を中心に side×side の範囲を n×n に縮小（はみ出しは 0） */
function cropGrid(m: Float32Array, w: number, h: number, cx: number, cy: number, side: number, n: number): number[] {
  const out: number[] = []
  const x0 = cx - side / 2
  const y0 = cy - side / 2
  const cell = side / n
  for (let gy = 0; gy < n; gy++)
    for (let gx = 0; gx < n; gx++) {
      let s = 0
      let c = 0
      for (let yy = Math.floor(y0 + gy * cell); yy < Math.floor(y0 + (gy + 1) * cell); yy++)
        for (let xx = Math.floor(x0 + gx * cell); xx < Math.floor(x0 + (gx + 1) * cell); xx++) {
          if (xx >= 0 && yy >= 0 && xx < w && yy < h) s += m[yy * w + xx]
          c++
        }
      out.push(c ? s / c : 0)
    }
  return out
}

const unit = (v: number[]) => {
  const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0))
  return n > 1e-6 ? v.map((x) => x / n) : v.map(() => 0)
}

/**
 * 区間の特徴量（FEATURE_VERSION 2）。画面上の「位置」に依存しないように作る。
 *   1. 動きの重心を中心に切り出した「開始→ピーク」「ピーク→終了」の変化の形（各 12×12）
 *   2. 区間内での動きの重心の移動方向（横・縦・斜め、前半と後半）
 * 各ブロックを長さ 1 にそろえて並べるので、コサイン類似度はブロックごとの一致度の平均に近くなる。
 */
export function segmentFeature(seg: Segment, frames: Frame[]): number[] {
  const at = (t: number) => frames.reduce((best, f) => (Math.abs(f.t - t) < Math.abs(best.t - t) ? f : best), frames[0])
  const a = at(seg.start)
  const p = at(seg.peak)
  const e = at(seg.end)
  const { w, h } = p
  const d1 = diffMap(a, p)
  const d2 = diffMap(p, e)
  const both = d1.map((x, i) => x + d2[i])
  const c = centroid(both, w, h)
  const side = h * 0.9
  const shape1 = cropGrid(d1, w, h, c.x, c.y, side, 12)
  const shape2 = cropGrid(d2, w, h, c.x, c.y, side, 12)

  // 区間内のフレーム間差分の重心の軌跡 → 前半・後半の移動方向
  const inSeg = frames.filter((f) => f.t >= seg.start - 1e-6 && f.t <= seg.end + 1e-6)
  const path: { x: number; y: number }[] = []
  for (let i = 1; i < inSeg.length; i++) {
    const cc = centroid(diffMap(inSeg[i - 1], inSeg[i]), w, h)
    if (cc.mass > 0) path.push(cc)
  }
  const dir = (from: number, to: number) => {
    if (path.length < 2) return [0, 0]
    const s = path[Math.min(path.length - 1, Math.floor(from * (path.length - 1)))]
    const t = path[Math.min(path.length - 1, Math.ceil(to * (path.length - 1)))]
    return [(t.x - s.x) / h, (t.y - s.y) / h]
  }
  const motion = unit([...dir(0, 0.5), ...dir(0.5, 1)])

  return [...normalizeVec(shape1), ...normalizeVec(shape2), ...motion]
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
