import type { Classifier } from '../types'
import { useTemplates } from '../templateStore'
import { scoreSamples } from '../scoring'

export { simToConfidence, evidenceCap } from '../scoring'

/**
 * テンプレート照合（ユーザー個人の学習・実験的）。
 * 確認画面でユーザーが確定した区間の特徴量と比べ、似ている技を候補にする。
 */
export const templateClassifier: Classifier = {
  id: 'template',
  name: 'あなたの学習データ（実験的）',
  description: 'あなたが確定した過去の区間と比べて候補を出します。学習例が増えるほど信頼度が上がります。',
  status: 'experimental',
  classify(event, _frames, ctx) {
    if (!event.feature) return []
    const tpls = useTemplates.getState().templates.filter((t) => t.characterId === ctx.characterId)
    return scoreSamples(event.feature, tpls, ctx.moves, 'template')
  },
}
