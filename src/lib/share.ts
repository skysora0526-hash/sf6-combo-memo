import LZString from 'lz-string'
import type { CharacterDef, Combo, Difficulty, MoveCategory, RouteStep, Situation } from '../types'
import { uid } from './id'

/**
 * 共有 URL 形式（方式 A: URL フラグメント埋め込み）
 *   #/share?d=1.<lz-string(JSON)>
 * JSON はキー名を省いた配列形式にして短くする。
 * 先頭の "1." はフォーマットのバージョン。
 */
const VERSION = '1'
const CATS: MoveCategory[] = ['normal', 'special', 'unique', 'super', 'drive', 'system', 'connector', 'unknown']

/** 共有 URL の長さの目安 */
export const URL_WARN = 2000 // 一部 SNS・チャットで切られ始める
export const URL_MAX = 8000 // これ以上はファイル共有を推奨

export interface SharedCombo extends Omit<Combo, 'id' | 'createdAt' | 'updatedAt' | 'favorite' | 'source'> {
  charName: string
  situationLabel: string
}

type PackedStep = [string, number, (string | 0)?, (string | 0)?, 1?]
type Packed = [string, string, string, string, number, number | null, number, number, PackedStep[], string, string[]]

function packStep(s: RouteStep): PackedStep {
  const out: PackedStep = [s.label, Math.max(0, CATS.indexOf(s.category)), s.moveId ?? 0, s.note ?? 0, s.od ? 1 : undefined]
  while (out.length > 2 && !out[out.length - 1]) out.pop()
  return out
}

export function encodeShare(combos: Combo[], chars: CharacterDef[], situations: Situation[]): string {
  const packed: Packed[] = combos.map((c) => [
    c.characterId,
    chars.find((x) => x.id === c.characterId)?.name ?? c.characterId,
    c.name,
    situations.find((s) => s.id === c.situation)?.label ?? c.situation,
    c.difficulty,
    c.damage,
    c.saGauge,
    c.driveGauge,
    c.route.map(packStep),
    c.notes,
    c.tags,
  ])
  return `${VERSION}.${LZString.compressToEncodedURIComponent(JSON.stringify(packed))}`
}

const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '')
const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d
}

export class ShareDecodeError extends Error {}

export function decodeShare(token: string): SharedCombo[] {
  const dot = token.indexOf('.')
  const ver = token.slice(0, dot)
  if (dot < 0 || ver !== VERSION) throw new ShareDecodeError('対応していない共有データの形式です')
  const json = LZString.decompressFromEncodedURIComponent(token.slice(dot + 1))
  if (!json) throw new ShareDecodeError('共有データを展開できませんでした（URL が途中で切れている可能性があります）')
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new ShareDecodeError('共有データが壊れています')
  }
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 500) throw new ShareDecodeError('共有データが空、または大きすぎます')
  return raw.map((p): SharedCombo => {
    if (!Array.isArray(p)) throw new ShareDecodeError('共有データが壊れています')
    const route = (Array.isArray(p[8]) ? p[8] : []).slice(0, 200).map(
      (s: unknown[]): RouteStep => ({
        id: uid(),
        label: str(s?.[0], 80) || '?',
        category: CATS[clamp(s?.[1], 0, CATS.length - 1, 6)],
        moveId: str(s?.[2], 80) || undefined,
        note: str(s?.[3], 300) || undefined,
        od: s?.[4] ? true : undefined,
      }),
    )
    return {
      characterId: str(p[0], 80),
      charName: str(p[1], 80),
      name: str(p[2], 200),
      situation: '',
      situationLabel: str(p[3], 80),
      difficulty: clamp(p[4], 1, 5, 2) as Difficulty,
      damage: p[5] === null || p[5] === undefined ? null : clamp(p[5], 0, 99999, 0),
      saGauge: clamp(p[6], 0, 3, 0),
      driveGauge: clamp(p[7], 0, 6, 0),
      route,
      notes: str(p[9], 5000),
      tags: (Array.isArray(p[10]) ? p[10] : []).map((t: unknown) => str(t, 40)).filter(Boolean).slice(0, 30),
    }
  })
}

export function shareUrl(token: string, base = `${location.origin}${location.pathname}`): string {
  return `${base}#/share?d=${token}`
}

/* ---------- JSON バックアップ ---------- */

export const EXPORT_APP = 'sf6-combo-memo'

export function sanitizeCombo(raw: unknown): Combo | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.characterId !== 'string' || !Array.isArray(r.route)) return null
  const route = (r.route as Record<string, unknown>[]).filter(Boolean).map(
    (s): RouteStep => ({
      id: uid(),
      label: str(s.label, 80) || '?',
      category: CATS.includes(s.category as MoveCategory) ? (s.category as MoveCategory) : 'connector',
      moveId: str(s.moveId, 80) || undefined,
      note: str(s.note, 300) || undefined,
      od: s.od ? true : undefined,
    }),
  )
  return {
    id: str(r.id, 40) || uid(),
    characterId: r.characterId,
    name: str(r.name, 200),
    situation: str(r.situation, 80) || 'midscreen',
    difficulty: clamp(r.difficulty, 1, 5, 2) as Difficulty,
    damage: r.damage === null || r.damage === undefined || r.damage === '' ? null : clamp(r.damage, 0, 99999, 0),
    saGauge: clamp(r.saGauge, 0, 3, 0),
    driveGauge: clamp(r.driveGauge, 0, 6, 0),
    route,
    notes: str(r.notes, 5000),
    tags: Array.isArray(r.tags) ? r.tags.map((t) => str(t, 40)).filter(Boolean) : [],
    favorite: !!r.favorite,
    source: r.source === 'ai' || r.source === 'shared' ? r.source : 'manual',
    createdAt: clamp(r.createdAt, 0, 9e15, Date.now()),
    updatedAt: clamp(r.updatedAt, 0, 9e15, Date.now()),
  }
}
