import type { Frame, Roi } from './types'

export const FULL_ROI: Roi = { x: 0, y: 0, w: 1, h: 1 }

/** HUD（体力・ゲージ・タイマー）を除いたキャラの動作エリアの目安 */
export const ROI_PRESETS: { id: string; label: string; roi: Roi }[] = [
  { id: 'full', label: '画面全体', roi: FULL_ROI },
  { id: 'nohud', label: 'HUD を除く（上下をカット）', roi: { x: 0, y: 0.18, w: 1, h: 0.66 } },
  { id: 'center', label: '中央のみ', roi: { x: 0.15, y: 0.18, w: 0.7, h: 0.66 } },
]

export class AbortError extends Error {
  constructor() {
    super('aborted')
    this.name = 'AbortError'
  }
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (Math.abs(video.currentTime - t) < 1e-3 && video.readyState >= 2) return resolve()
    const done = () => {
      clearTimeout(timer)
      video.removeEventListener('seeked', done)
      video.removeEventListener('error', fail)
      resolve()
    }
    const fail = () => {
      clearTimeout(timer)
      reject(new Error('動画の読み込みに失敗しました'))
    }
    const timer = setTimeout(done, 3000)
    video.addEventListener('seeked', done)
    video.addEventListener('error', fail, { once: true })
    video.currentTime = t
  })
}

function drawRoi(video: HTMLVideoElement, ctx: CanvasRenderingContext2D, roi: Roi, w: number, h: number) {
  const vw = video.videoWidth
  const vh = video.videoHeight
  ctx.drawImage(video, roi.x * vw, roi.y * vh, roi.w * vw, roi.h * vh, 0, 0, w, h)
}

/** 指定 fps でフレームを抽出し、縮小グレースケールにする */
export async function sampleFrames(
  video: HTMLVideoElement,
  opts: { start: number; end: number; fps: number; roi: Roi; width?: number },
  onProgress?: (p: number) => void,
  signal?: AbortSignal,
): Promise<Frame[]> {
  const width = opts.width ?? 160
  if (!video.videoWidth) throw new Error('動画のサイズを取得できません')
  const height = Math.max(8, Math.round((width * (video.videoHeight * opts.roi.h)) / (video.videoWidth * opts.roi.w)))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const frames: Frame[] = []
  const step = 1 / opts.fps
  const total = Math.max(1, Math.floor((opts.end - opts.start) / step) + 1)
  video.pause()
  for (let i = 0; i < total; i++) {
    if (signal?.aborted) throw new AbortError()
    const t = Math.min(opts.end, opts.start + i * step)
    await seek(video, t)
    drawRoi(video, ctx, opts.roi, width, height)
    const rgba = ctx.getImageData(0, 0, width, height).data
    const gray = new Uint8ClampedArray(width * height)
    for (let p = 0, q = 0; p < rgba.length; p += 4, q++) gray[q] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8
    frames.push({ t, w: width, h: height, gray })
    onProgress?.((i + 1) / total)
  }
  return frames
}

/** 指定時刻のサムネイル（JPEG data URL） */
export async function thumbnailAt(video: HTMLVideoElement, t: number, width = 240): Promise<string> {
  await seek(video, t)
  const c = document.createElement('canvas')
  c.width = width
  c.height = Math.round((width * video.videoHeight) / video.videoWidth)
  c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.7)
}

/* ---------- 入力ソース ---------- */

export const canCaptureScreen = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== 'undefined'

/** 画面キャプチャを録画し、停止すると動画 Blob を返す */
export async function startScreenRecording(): Promise<{ stream: MediaStream; stop: () => Promise<Blob> }> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false })
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m))
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  rec.start(500)
  const stopped = new Promise<Blob>((resolve) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || 'video/webm' }))
  })
  // ユーザーがブラウザの「共有を停止」を押した場合
  stream.getVideoTracks()[0]?.addEventListener('ended', () => rec.state !== 'inactive' && rec.stop())
  return {
    stream,
    stop: async () => {
      if (rec.state !== 'inactive') rec.stop()
      stream.getTracks().forEach((t) => t.stop())
      return stopped
    },
  }
}
