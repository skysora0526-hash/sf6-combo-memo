import { create } from 'zustand'
import type { RouteStep } from '../types'

/** AI 認識画面 → コンボエディタへの受け渡し（保存はしない） */
interface DraftState {
  draft: { characterId: string; route: RouteStep[] } | null
  setDraft: (d: DraftState['draft']) => void
}
export const useDraft = create<DraftState>((set) => ({ draft: null, setDraft: (draft) => set({ draft }) }))
