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
const cache = new Map<string, Promise<LoadedModel | null>>()

/**
 * 同梱モデルを読み込む。public/ai-models/<キャラID>.json を直接取りに行く。
 * index.json に載っていなくても読み込むので、GitHub の画面からファイルを
 * アップロードするだけでモデルを追加できる（index.json は一覧表示用の補助）。
 * ない・壊れている・バージョン違いなら null（理由は console に出す）。
 */
export function getBundledModel(characterId: string): Promise<LoadedModel | null> {
  if (!cache.has(characterId)) {
    cache.set(
      characterId,
      (async () => {
        try {
          const r = await fetch(`${BASE}${encodeURIComponent(characterId)}.json`, { cache: 'no-cache' })
          // ファイルがないとき、サーバーによっては 404 ではなく HTML を返すので種類も確認する
          if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null
          const file = validateModel(await r.json())
          if (file.characterId !== characterId) throw new ModelError(`ファイル名と中身のキャラが違います（${file.characterId}）`)
          return loadModelFile(file)
        } catch (e) {
          console.warn(`[ai] ${characterId} のモデルを読み込めません:`, e instanceof Error ? e.message : e)
          return null
        }
      })(),
    )
  }
  return cache.get(characterId)!
}

/** テスト用 */
export function resetModelCache() {
  cache.clear()
}
