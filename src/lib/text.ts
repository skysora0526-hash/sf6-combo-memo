import type { CharacterDef, Combo, MoveDef, Notation, Situation } from '../types'
import { routeToString } from './route'

export const fmtGauge = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n))

export function situationLabel(id: string, situations: Situation[]): string {
  return situations.find((s) => s.id === id)?.label ?? id
}

/** 依頼書のコピー書式 */
export function comboToText(
  c: Combo,
  ch: CharacterDef | undefined,
  moves: MoveDef[],
  situations: Situation[],
  notation: Notation,
): string {
  const lines = [
    `【キャラクター】${ch?.name ?? c.characterId}`,
    `【コンボ名】${c.name}`,
    `【状況】${situationLabel(c.situation, situations)}`,
    `【難易度】${'★'.repeat(c.difficulty)}${'☆'.repeat(5 - c.difficulty)}`,
    `【ダメージ】${c.damage ?? '-'}`,
    `【SAゲージ】${c.saGauge}`,
    `【ドライブゲージ】${fmtGauge(c.driveGauge)}`,
  ]
  if (c.tags.length) lines.push(`【タグ】${c.tags.map((t) => `#${t}`).join(' ')}`)
  lines.push('【コンボルート】', routeToString(c.route, moves, notation) || '-')
  const stepNotes = c.route.filter((s) => s.note)
  if (stepNotes.length) {
    lines.push('【技ごとの備考】')
    c.route.forEach((s, i) => s.note && lines.push(`${i + 1}. ${s.label}: ${s.note}`))
  }
  if (c.notes.trim()) lines.push('【備考】', c.notes.trim())
  return lines.join('\n')
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // http 環境などのフォールバック
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}
