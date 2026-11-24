import type { CharacterDef, MoveCategory, MoveDef, Situation } from '../types'
import common from './common-moves.json'

const files = import.meta.glob<{ default: CharacterDef }>('./characters/*.json', { eager: true })

/** 同梱キャラクター（src/data/characters/*.json を追加するだけで増える） */
export const BUILTIN_CHARACTERS: CharacterDef[] = Object.values(files)
  .map((m) => m.default)
  .sort((a, b) => a.order - b.order)

export const COMMON_MOVES: MoveDef[] = (common as { moves: MoveDef[] }).moves

export const DEFAULT_SITUATIONS: Situation[] = [
  { id: 'midscreen', label: '中央' },
  { id: 'corner', label: '画面端' },
  { id: 'nearcorner', label: '端付近' },
  { id: 'pointblank', label: '密着' },
  { id: 'punish', label: '確定反撃' },
  { id: 'counter', label: 'カウンター' },
  { id: 'punishcounter', label: 'パニッシュカウンター' },
  { id: 'antiair', label: '対空' },
  { id: 'burnout', label: 'バーンアウト' },
]

export const CATEGORY_META: Record<MoveCategory, { label: string; className: string }> = {
  normal: { label: '通常技', className: 'cat-normal' },
  special: { label: '必殺技', className: 'cat-special' },
  unique: { label: '特殊技', className: 'cat-unique' },
  super: { label: 'SA', className: 'cat-super' },
  drive: { label: 'ドライブ', className: 'cat-drive' },
  system: { label: '移動・ジャンプ', className: 'cat-system' },
  connector: { label: '繋ぎ', className: 'cat-connector' },
  unknown: { label: '不明', className: 'cat-unknown' },
}

/** 技が未登録のキャラ向けプレースホルダー（依頼の初期表示例） */
export function placeholderMoves(cat: 'special' | 'unique'): MoveDef[] {
  const n = cat === 'special' ? 4 : 3
  const label = cat === 'special' ? '必殺技' : '特殊技'
  return Array.from({ length: n }, (_, i) => ({
    id: `ph-${cat}${i + 1}`,
    name: `${label}${i + 1}`,
    category: cat,
  }))
}
