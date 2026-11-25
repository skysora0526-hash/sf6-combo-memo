import type { Classifier } from '../types'
import { getBundledModel } from '../models'
import { scoreSamples } from '../scoring'

/**
 * 開発者モデル（アプリ同梱）。
 * 開発者が学習スタジオで技名を付けた区間と比べて候補を出す。ユーザーは学習なしで使える。
 */
export const bundledModelClassifier: Classifier = {
  id: 'bundled',
  name: '開発者モデル（同梱・実験的）',
  description: '開発者が学習させたデータと比べて候補を出します。モデルがあるキャラだけで動きます。',
  status: 'experimental',
  async classify(event, _frames, ctx) {
    if (!event.feature) return []
    const model = await getBundledModel(ctx.characterId)
    return model ? scoreSamples(event.feature, model.samples, ctx.moves, 'bundled') : []
  },
}
