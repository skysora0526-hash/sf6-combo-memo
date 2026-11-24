import type { Candidate, Classifier } from '../types'
import { cosine } from '../features'
import { useTemplates } from '../templateStore'

/** 類似度（コサイン）をざっくり 0〜1 の信頼度に写す。0.5 以下はほぼ無関係とみなす */
export const simToConfidence = (sim: number) => Math.max(0, Math.min(1, (sim - 0.5) / 0.45))

/**
 * テンプレート照合（ユーザー学習型・実験的）。
 * 確認画面でユーザーが確定した区間の特徴量と比べ、似ている技を候補にする。
 * 同じキャラ・同じ画質・同じ立ち位置ほど当たりやすい。テンプレートがないと何も返さない。
 */
/** 学習例が少ないうちは自信を持たない: 1 件 → 0.38, 2 件 → 0.61, 3 件 → 0.74, 5 件 → 0.88 */
export const evidenceCap = (n: number) => 0.95 * (1 - Math.pow(0.6, n))

/**
 * テンプレート照合（ユーザー学習型・実験的）。
 * 確認画面でユーザーが確定した区間の特徴量と比べ、似ている技を候補にする。
 * 信頼度 = 類似度 × 学習例の数による上限 ×（1 位と 2 位の差が小さいと減点）。
 * 同じキャラ・同じ画質・同じ立ち位置ほど当たりやすい。テンプレートがないと何も返さない。
 */
export const templateClassifier: Classifier = {
  id: 'template',
  name: 'テンプレート照合（学習型・実験的）',
  description: 'あなたが確定した過去の区間と見た目を比べて候補を出します。学習例が増えるほど信頼度が上がります。',
  status: 'experimental',
  classify(event, _frames, ctx) {
    if (!event.feature) return []
    const tpls = useTemplates.getState().templates.filter((t) => t.characterId === ctx.characterId)
    const byMove = new Map<string, { sim: number; n: number; label: string }>()
    for (const t of tpls) {
      const sim = cosine(event.feature, t.feature)
      const cur = byMove.get(t.moveId)
      byMove.set(t.moveId, { sim: Math.max(sim, cur?.sim ?? -1), n: (cur?.n ?? 0) + 1, label: t.label })
    }
    const ranked = [...byMove.entries()].sort((a, b) => b[1].sim - a[1].sim)
    const second = ranked[1]?.[1].sim ?? 0.5
    return ranked
      .map(([moveId, { sim, n, label }], i): Candidate => {
        let confidence = simToConfidence(sim) * evidenceCap(n)
        if (i === 0) confidence *= Math.min(1, Math.max(0.35, (sim - second) / 0.1))
        const m = ctx.moves.find((x) => x.id === moveId)
        return { moveId, label: m?.short ?? m?.name ?? label, confidence, source: 'template' }
      })
      .filter((c) => c.confidence >= 0.05)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3)
  },
}
