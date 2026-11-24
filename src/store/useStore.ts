import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useMemo } from 'react'
import type { CharacterDef, Combo, MoveDef, Notation, Situation } from '../types'
import { BUILTIN_CHARACTERS, COMMON_MOVES, DEFAULT_SITUATIONS, placeholderMoves } from '../data'
import { uid } from '../lib/id'

export interface AppState {
  combos: Combo[]
  charMemos: Record<string, string>
  customCharacters: CharacterDef[]
  charOverrides: Record<string, { image?: string }>
  customMoves: Record<string, MoveDef[]>
  hiddenMoves: Record<string, string[]>
  situations: Situation[]
  notation: Notation

  addCombo: (c: Omit<Combo, 'id' | 'createdAt' | 'updatedAt'>) => Combo
  updateCombo: (id: string, patch: Partial<Combo>) => void
  deleteCombo: (id: string) => void
  deleteCombos: (ids: string[]) => void
  toggleFavorite: (id: string) => void
  duplicateCombo: (id: string) => Combo | undefined
  importCombos: (combos: Combo[]) => number
  setCharMemo: (charId: string, memo: string) => void
  addCustomCharacter: (name: string, nameEn: string, color: string) => CharacterDef
  deleteCustomCharacter: (id: string) => void
  setCharImage: (id: string, image: string) => void
  addCustomMove: (charId: string, move: Omit<MoveDef, 'id' | 'custom'>) => void
  removeCustomMove: (charId: string, moveId: string) => void
  toggleHiddenMove: (charId: string, moveId: string) => void
  addSituation: (label: string) => Situation
  removeSituation: (id: string) => void
  setNotation: (n: Notation) => void
  replaceAll: (data: Partial<AppState>) => void
}

export const STORAGE_KEY = 'sf6-combo-memo'

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      combos: [],
      charMemos: {},
      customCharacters: [],
      charOverrides: {},
      customMoves: {},
      hiddenMoves: {},
      situations: DEFAULT_SITUATIONS,
      notation: 'short',

      addCombo: (c) => {
        const now = Date.now()
        const combo: Combo = { ...c, id: uid(), createdAt: now, updatedAt: now }
        set((s) => ({ combos: [combo, ...s.combos] }))
        return combo
      },
      updateCombo: (id, patch) =>
        set((s) => ({
          combos: s.combos.map((c) => (c.id === id ? { ...c, ...patch, id, updatedAt: Date.now() } : c)),
        })),
      deleteCombo: (id) => set((s) => ({ combos: s.combos.filter((c) => c.id !== id) })),
      deleteCombos: (ids) => set((s) => ({ combos: s.combos.filter((c) => !ids.includes(c.id)) })),
      toggleFavorite: (id) =>
        set((s) => ({ combos: s.combos.map((c) => (c.id === id ? { ...c, favorite: !c.favorite } : c)) })),
      duplicateCombo: (id) => {
        const src = get().combos.find((c) => c.id === id)
        if (!src) return undefined
        const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = src
        return get().addCombo({ ...rest, name: `${src.name}（コピー）`, route: src.route.map((r) => ({ ...r, id: uid() })) })
      },
      importCombos: (list) => {
        const now = Date.now()
        const fresh = list.map((c, i) => ({ ...c, id: uid(), createdAt: now + i, updatedAt: now + i }))
        set((s) => ({ combos: [...fresh, ...s.combos] }))
        return fresh.length
      },
      setCharMemo: (charId, memo) => set((s) => ({ charMemos: { ...s.charMemos, [charId]: memo } })),
      addCustomCharacter: (name, nameEn, color) => {
        const ch: CharacterDef = {
          id: `custom-${uid()}`,
          name,
          nameEn: nameEn || name,
          color,
          order: 1000 + get().customCharacters.length,
          moves: [],
          custom: true,
        }
        set((s) => ({ customCharacters: [...s.customCharacters, ch] }))
        return ch
      },
      deleteCustomCharacter: (id) =>
        set((s) => ({
          customCharacters: s.customCharacters.filter((c) => c.id !== id),
          combos: s.combos.filter((c) => c.characterId !== id),
        })),
      setCharImage: (id, image) =>
        set((s) => ({ charOverrides: { ...s.charOverrides, [id]: { ...s.charOverrides[id], image } } })),
      addCustomMove: (charId, move) =>
        set((s) => ({
          customMoves: {
            ...s.customMoves,
            [charId]: [...(s.customMoves[charId] ?? []), { ...move, id: `cm-${uid()}`, custom: true }],
          },
        })),
      removeCustomMove: (charId, moveId) =>
        set((s) => ({
          customMoves: { ...s.customMoves, [charId]: (s.customMoves[charId] ?? []).filter((m) => m.id !== moveId) },
        })),
      toggleHiddenMove: (charId, moveId) =>
        set((s) => {
          const cur = s.hiddenMoves[charId] ?? []
          const next = cur.includes(moveId) ? cur.filter((x) => x !== moveId) : [...cur, moveId]
          return { hiddenMoves: { ...s.hiddenMoves, [charId]: next } }
        }),
      addSituation: (label) => {
        const existing = get().situations.find((s) => s.label === label)
        if (existing) return existing
        const sit = { id: `s-${uid()}`, label }
        set((s) => ({ situations: [...s.situations, sit] }))
        return sit
      },
      removeSituation: (id) => set((s) => ({ situations: s.situations.filter((x) => x.id !== id) })),
      setNotation: (notation) => set({ notation }),
      replaceAll: (data) => set(data),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        combos: s.combos,
        charMemos: s.charMemos,
        customCharacters: s.customCharacters,
        charOverrides: s.charOverrides,
        customMoves: s.customMoves,
        hiddenMoves: s.hiddenMoves,
        situations: s.situations,
        notation: s.notation,
      }),
    },
  ),
)

/* ---------- selectors ---------- */

export function mergeCharacters(s: Pick<AppState, 'customCharacters' | 'charOverrides'>): CharacterDef[] {
  return [...BUILTIN_CHARACTERS, ...s.customCharacters].map((c) =>
    s.charOverrides[c.id]?.image ? { ...c, image: s.charOverrides[c.id].image } : c,
  )
}

export function useCharacters(): CharacterDef[] {
  const custom = useStore((s) => s.customCharacters)
  const overrides = useStore((s) => s.charOverrides)
  return useMemo(() => mergeCharacters({ customCharacters: custom, charOverrides: overrides }), [custom, overrides])
}

export function useCharacter(id: string | undefined): CharacterDef | undefined {
  const chars = useCharacters()
  return chars.find((c) => c.id === id)
}

/** キャラ固有技 + ユーザー追加技 + 共通技。非表示技は includeHidden=false で除外 */
export function resolveMoves(
  ch: CharacterDef | undefined,
  s: Pick<AppState, 'customMoves' | 'hiddenMoves'>,
  includeHidden = false,
): MoveDef[] {
  if (!ch) return COMMON_MOVES
  const own = [...ch.moves, ...(s.customMoves[ch.id] ?? [])]
  const specials = own.some((m) => m.category === 'special') ? [] : placeholderMoves('special')
  const uniques = own.some((m) => m.category === 'unique') ? [] : placeholderMoves('unique')
  const hidden = new Set(s.hiddenMoves[ch.id] ?? [])
  const all = [...own, ...specials, ...uniques, ...COMMON_MOVES]
  return includeHidden ? all : all.filter((m) => !hidden.has(m.id))
}

export function useMoves(ch: CharacterDef | undefined, includeHidden = false): MoveDef[] {
  const customMoves = useStore((s) => s.customMoves)
  const hiddenMoves = useStore((s) => s.hiddenMoves)
  return useMemo(
    () => resolveMoves(ch, { customMoves, hiddenMoves }, includeHidden),
    [ch, customMoves, hiddenMoves, includeHidden],
  )
}
