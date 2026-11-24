import type { Combo, Difficulty } from '../types'
import { normalize } from './route'

export type SortKey = 'updated' | 'created' | 'damage' | 'difficulty' | 'name'

export interface ComboFilter {
  q: string
  characterId: string
  situations: string[]
  difficulties: Difficulty[]
  damageMin: string
  damageMax: string
  saMax: string
  driveMax: string
  tags: string[]
  favoritesOnly: boolean
  sort: SortKey
}

export const EMPTY_FILTER: ComboFilter = {
  q: '',
  characterId: '',
  situations: [],
  difficulties: [],
  damageMin: '',
  damageMax: '',
  saMax: '',
  driveMax: '',
  tags: [],
  favoritesOnly: false,
  sort: 'updated',
}

const num = (s: string) => (s.trim() === '' ? null : Number(s))

export function activeFilterCount(f: ComboFilter): number {
  return (
    f.situations.length +
    f.difficulties.length +
    f.tags.length +
    [f.damageMin, f.damageMax, f.saMax, f.driveMax].filter((x) => x.trim() !== '').length +
    (f.favoritesOnly ? 1 : 0)
  )
}

/** q はコンボ名・タグ・備考・ルートのラベルを対象にした部分一致 */
export function filterCombos(combos: Combo[], f: ComboFilter, routeText?: (c: Combo) => string): Combo[] {
  const q = normalize(f.q)
  const dmin = num(f.damageMin)
  const dmax = num(f.damageMax)
  const sa = num(f.saMax)
  const dr = num(f.driveMax)
  const out = combos.filter((c) => {
    if (f.characterId && c.characterId !== f.characterId) return false
    if (f.favoritesOnly && !c.favorite) return false
    if (f.situations.length && !f.situations.includes(c.situation)) return false
    if (f.difficulties.length && !f.difficulties.includes(c.difficulty)) return false
    if (dmin !== null && (c.damage ?? -1) < dmin) return false
    if (dmax !== null && (c.damage ?? Infinity) > dmax) return false
    if (sa !== null && c.saGauge > sa) return false
    if (dr !== null && c.driveGauge > dr) return false
    if (f.tags.length && !f.tags.every((t) => c.tags.includes(t))) return false
    if (q) {
      const hay = normalize(
        [c.name, c.notes, ...c.tags, routeText ? routeText(c) : c.route.map((r) => r.label).join(' ')].join(' '),
      )
      if (!hay.includes(q)) return false
    }
    return true
  })
  const cmp: Record<SortKey, (a: Combo, b: Combo) => number> = {
    updated: (a, b) => b.updatedAt - a.updatedAt,
    created: (a, b) => b.createdAt - a.createdAt,
    damage: (a, b) => (b.damage ?? -1) - (a.damage ?? -1),
    difficulty: (a, b) => a.difficulty - b.difficulty,
    name: (a, b) => a.name.localeCompare(b.name, 'ja'),
  }
  // お気に入りは常に上
  return out.sort((a, b) => Number(b.favorite) - Number(a.favorite) || cmp[f.sort](a, b))
}

export function allTags(combos: Combo[]): string[] {
  return [...new Set(combos.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b, 'ja'))
}
