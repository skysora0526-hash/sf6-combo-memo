import type { MoveDef } from '../types'

/** 解析用に縮小したフレーム（グレースケール） */
export interface Frame {
  t: number
  w: number
  h: number
  gray: Uint8ClampedArray
}

export interface Roi {
  /** 0〜1 の割合 */
  x: number
  y: number
  w: number
  h: number
}

export interface Segment {
  start: number
  end: number
  /** 区間内で動きが最大のフレーム時刻 */
  peak: number
  /** 区間の動きの強さ（0〜1） */
  strength: number
}

export interface Candidate {
  moveId: string
  label: string
  /** 0〜1。テンプレート照合などの類似度。確率ではない */
  confidence: number
  source: string
}

export interface DetectedEvent extends Segment {
  id: string
  candidates: Candidate[]
  /** 区間の特徴量（テンプレート学習用） */
  feature?: number[]
}

export interface AnalyzeContext {
  characterId: string
  moves: MoveDef[]
  signal?: AbortSignal
}

/**
 * 区間検出器: フレーム列から「何か動作が起きた区間」を切り出す。
 * 例: フレーム差分 / 姿勢推定の速度 / 入力表示の変化 など
 */
export interface Segmenter {
  id: string
  name: string
  description: string
  status: 'available' | 'experimental' | 'planned'
  segment(frames: Frame[], ctx: AnalyzeContext, opts: { sensitivity: number }): Segment[] | Promise<Segment[]>
}

/**
 * 分類器: 区間ごとに技の候補と信頼度を返す。返せない場合は空配列（= 不明な動作）。
 * 例: テンプレート照合 / ONNX モデル / マルチモーダル LLM API など
 */
export interface Classifier {
  id: string
  name: string
  description: string
  status: 'available' | 'experimental' | 'planned'
  classify(event: DetectedEvent, frames: Frame[], ctx: AnalyzeContext): Candidate[] | Promise<Candidate[]>
}

export interface AnalysisResult {
  duration: number
  fps: number
  /** 時系列の動き量（グラフ表示用） */
  energy: { t: number; v: number }[]
  threshold: number
  events: DetectedEvent[]
  segmenterId: string
  classifierIds: string[]
  /** 手動追加した区間の特徴量計算用（保存しない） */
  frames: Frame[]
}
