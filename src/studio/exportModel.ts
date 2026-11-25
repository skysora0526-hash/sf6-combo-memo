import { FEATURE_VERSION } from '../ai/featureCodec'
import type { ModelFile } from '../ai/models'
import type { Sample } from './datasetDb'

/** データセット → アプリ同梱用のモデルファイル（サムネイルや動画名は含めない） */
export function buildModel(characterId: string, samples: Sample[], note?: string): ModelFile {
  const usable = samples.filter((s) => s.featureVersion === FEATURE_VERSION)
  const s0 = usable[0]
  return {
    format: 'sf6-combo-memo-model',
    version: 1,
    featureVersion: FEATURE_VERSION,
    characterId,
    createdAt: new Date().toISOString(),
    roiId: s0?.roiId ?? 'nohud',
    fps: s0?.fps ?? 10,
    note,
    samples: usable.map((s) => ({ m: s.moveId, l: s.label, f: s.feature })),
  }
}

/** データセットの書き出し形式（別の PC で学習を続けるため。サムネイル込み） */
export interface DatasetFile {
  format: 'sf6-combo-memo-dataset'
  version: 1
  characterId: string
  exportedAt: string
  samples: Sample[]
}
