/**
 * 特徴量の保存形式。Int8 に量子化して base64 にする（1 サンプル約 770 文字）。
 * 特徴量の計算方法（features.ts の segmentFeature）を変えたら FEATURE_VERSION を上げること。
 * バージョンが違うモデルは比較できないので読み込まない。
 */
export const FEATURE_VERSION = 2

export function encodeFeature(f: number[]): string {
  const bytes = new Uint8Array(f.length)
  f.forEach((x, i) => {
    const q = Math.max(-127, Math.min(127, Math.round(x * 127)))
    bytes[i] = q & 0xff
  })
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin)
}

export function decodeFeature(s: string): number[] {
  const bin = atob(s)
  const out: number[] = new Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    const b = bin.charCodeAt(i)
    out[i] = (b > 127 ? b - 256 : b) / 127
  }
  return out
}
