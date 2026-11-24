import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { uid } from '../lib/id'

/** ユーザーが確認画面で確定した区間の特徴量（AI 用の学習データ） */
export interface MoveTemplate {
  id: string
  characterId: string
  moveId: string
  label: string
  feature: number[]
  createdAt: number
}

const MAX_PER_CHAR = 60

interface TemplateState {
  templates: MoveTemplate[]
  add: (t: Omit<MoveTemplate, 'id' | 'createdAt'>) => void
  remove: (id: string) => void
  clear: (characterId: string) => void
}

/** 通常のコンボデータとは別のキーに保存（AI 機能を外しても本体に影響しない） */
export const useTemplates = create<TemplateState>()(
  persist(
    (set) => ({
      templates: [],
      add: (t) =>
        set((s) => {
          const feature = t.feature.map((x) => Math.round(x * 1000) / 1000) // 容量削減
          const mine = s.templates.filter((x) => x.characterId === t.characterId)
          const drop = mine.length >= MAX_PER_CHAR ? mine[0].id : null
          return { templates: [...s.templates.filter((x) => x.id !== drop), { ...t, feature, id: uid(), createdAt: Date.now() }] }
        }),
      remove: (id) => set((s) => ({ templates: s.templates.filter((x) => x.id !== id) })),
      clear: (characterId) => set((s) => ({ templates: s.templates.filter((x) => x.characterId !== characterId) })),
    }),
    { name: 'sf6-combo-memo-ai-templates', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
)
