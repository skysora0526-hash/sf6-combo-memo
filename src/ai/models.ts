import { decodeFeature, FEATURE_VERSION } from './featureCodec'
import type { LabeledSample } from './scoring'

/**
 * 開発者が学習スタジオで作り、アプリに同梱するモデル。
 * 置き場所: public/ai-models/<characterId>.json（一覧は public/ai-models/index.json）
 * アプリの再ビルドなしで差し替えられるよう、実行時に fetch で読み込む。
 */
export interface ModelFile {
  format: 'sf6-combo-memo-model'
  version: 1
  featureVersion: number
  characterId: string
  createdAt: string
  /** 学習時の解析設定。利用時も同じ設定にしないと特徴量が合わない */
  roiId: string
  fps: number
  note?: string
  samples: { m: string; l: string; f: string }[]
}

export interface LoadedModel {
  file: ModelFile
  samples: LabeledSample[]
  moveCount: number
}

export interface ModelIndex {
  models: { characterId: string; samples: number; moves: number; createdAt: string }[]
}

export class ModelError extends Error {}

export function validateModel(raw: unknown): ModelFile {
  const m = raw as ModelFile
  if (!m || m.format !== 'sf6-combo-memo-model') throw new ModelError('SF6 Combo Memo のモデルファイルではありません')
  if (m.version !== 1) throw new ModelError(`対応していないモデル形式です（version ${m.version}）`)
  if (m.featureVersion !== FEATURE_VERSION)
    throw new ModelError(`特徴量のバージョンが違います（モデル ${m.featureVersion} / アプリ ${FEATURE_VERSION}）。学習スタジオで作り直してください`)
  if (typeof m.characterId !== 'string' || !Array.isArray(m.samples)) throw new ModelError('モデルファイルが壊れています')
  for (const s of m.samples) if (typeof s.m !== 'string' || typeof s.f !== 'string') throw new ModelError('モデルのサンプルが壊れています')
  return m
}

export function loadModelFile(file: ModelFile): LoadedModel {
  const samples = file.samples.map((s) => ({ moveId: s.m, label: s.l, feature: decodeFeature(s.f) }))
  return { file, samples, moveCount: new Set(samples.map((s) => s.moveId)).size }
}

const BASE = './ai-models/'
let indexPromise: Promise<ModelIndex> | null = null
const cache = new Map<string, Promise<LoadedModel | null>>()

export function fetchModelIndex(): Promise<ModelIndex> {
  indexPromise ??= fetch(`${BASE}index.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : { models: [] }))
    .then((j: ModelIndex) => (Array.isArray(j?.models) ? j : { models: [] }))
    .catch(() => ({ models: [] }))
  return indexPromise
}

/** 同梱モデルを読み込む。ない・壊れている・バージョン違いなら null（理由は console に出す） */
export function getBundledModel(characterId: string): Promise<LoadedModel | null> {
  if (!cache.has(characterId)) {
    cache.set(
      characterId,
      fetchModelIndex().then(async (idx) => {
        if (!idx.models.some((m) => m.characterId === characterId)) return null
        try {
          const r = await fetch(`${BASE}${encodeURIComponent(characterId)}.json`, { cache: 'no-cache' })
          if (!r.ok) return null
          return loadModelFile(validateModel(await r.json()))
        } catch (e) {
          console.warn(`[ai] ${characterId} のモデルを読み込めません:`, e instanceof Error ? e.message : e)
          return null
        }
      }),
    )
  }
  return cache.get(characterId)!
}

/** テスト用 */
export function resetModelCache() {
  indexPromise = null
  cache.clear()
}
