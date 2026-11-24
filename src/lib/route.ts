import type { MoveDef, Notation, RouteStep } from '../types'
import { uid } from './id'

export function moveLabel(m: MoveDef, notation: Notation): string {
  if (notation === 'numpad') return m.numpad ?? m.short ?? m.name
  if (notation === 'short') return m.short ?? m.name
  return m.name
}

/** ルート上の 1 ステップの表示名。技データにあれば表記設定に従い、なければ保存時のラベル */
export function stepLabel(step: RouteStep, moves: MoveDef[] | Map<string, MoveDef>, notation: Notation): string {
  const m = step.moveId
    ? moves instanceof Map
      ? moves.get(step.moveId)
      : moves.find((x) => x.id === step.moveId)
    : undefined
  const base = m ? moveLabel(m, notation) : step.label
  return step.od ? `OD ${base}` : base
}

export function stepFromMove(m: MoveDef, od = false): RouteStep {
  return { id: uid(), moveId: m.id, label: m.name, category: m.category, od: od || undefined }
}

export function stepFromText(text: string): RouteStep {
  return { id: uid(), label: text.trim(), category: 'connector' }
}

/** ルートからゲージ消費量を推定（OD 技 = ドライブ 2 本） */
export function estimateGauges(route: RouteStep[], moves: MoveDef[]): { sa: number; drive: number } {
  const map = new Map(moves.map((m) => [m.id, m]))
  let sa = 0
  let drive = 0
  for (const s of route) {
    const m = s.moveId ? map.get(s.moveId) : undefined
    if (s.od) drive += 2
    if (m?.driveCost) drive += m.driveCost
    if (m?.saCost) sa += m.saCost
  }
  return { sa: Math.min(sa, 3), drive: Math.min(drive, 6) }
}

export function routeToString(route: RouteStep[], moves: MoveDef[], notation: Notation, sep = ' → '): string {
  const map = new Map(moves.map((m) => [m.id, m]))
  return route.map((s) => stepLabel(s, map, notation)).join(sep)
}

/** 検索用: ひらがな/カタカナ・全角/半角・大小文字を正規化 */
export function normalize(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .replace(/[\s・.]/g, '')
}

export function moveMatches(m: MoveDef, q: string): boolean {
  const nq = normalize(q)
  if (!nq) return true
  return [m.name, m.short, m.numpad, ...(m.aliases ?? [])].some((x) => x && normalize(x).includes(nq))
}
