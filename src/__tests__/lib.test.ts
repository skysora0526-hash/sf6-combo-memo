import { describe, expect, it } from 'vitest'
import type { Combo } from '../types'
import { EMPTY_FILTER, filterCombos } from '../lib/filter'
import { estimateGauges, moveMatches, normalize, routeToString, stepFromMove, stepFromText } from '../lib/route'
import { decodeShare, encodeShare, sanitizeCombo, ShareDecodeError } from '../lib/share'
import { comboToText } from '../lib/text'
import { BUILTIN_CHARACTERS, COMMON_MOVES, DEFAULT_SITUATIONS } from '../data'
import { resolveMoves } from '../store/useStore'

const dj = BUILTIN_CHARACTERS.find((c) => c.id === 'deejay')!
const moves = resolveMoves(dj, { customMoves: {}, hiddenMoves: {} })
const m = (id: string) => moves.find((x) => x.id === id)!

const combo = (p: Partial<Combo> = {}): Combo => ({
  id: 'x',
  characterId: 'deejay',
  name: '中足始動・中央',
  situation: 'midscreen',
  difficulty: 2,
  damage: 2400,
  saGauge: 0,
  driveGauge: 1,
  route: [stepFromMove(m('crmk')), stepFromMove(m('cancel')), stepFromMove(m('sp1'))],
  notes: 'タイミングに注意',
  tags: ['実戦'],
  favorite: false,
  source: 'manual',
  createdAt: 1,
  updatedAt: 1,
  ...p,
})

describe('data', () => {
  it('全キャラが JSON から読み込まれ、ID が重複しない', () => {
    expect(BUILTIN_CHARACTERS.length).toBeGreaterThanOrEqual(30)
    expect(new Set(BUILTIN_CHARACTERS.map((c) => c.id)).size).toBe(BUILTIN_CHARACTERS.length)
    expect(new Set(COMMON_MOVES.map((c) => c.id)).size).toBe(COMMON_MOVES.length)
  })
  it('技が未登録のキャラには必殺技1〜4 / 特殊技1〜3 のプレースホルダーが出る', () => {
    const ingrid = BUILTIN_CHARACTERS.find((c) => c.id === 'ingrid')!
    const mv = resolveMoves(ingrid, { customMoves: {}, hiddenMoves: {} })
    expect(mv.filter((x) => x.category === 'special').map((x) => x.name)).toEqual(['必殺技1', '必殺技2', '必殺技3', '必殺技4'])
    expect(mv.filter((x) => x.category === 'unique')).toHaveLength(3)
  })
  it('非表示の技は除外される', () => {
    const mv = resolveMoves(dj, { customMoves: {}, hiddenMoves: { deejay: ['sp1'] } })
    expect(mv.find((x) => x.id === 'sp1')).toBeUndefined()
  })
})

describe('route', () => {
  it('表記切り替え', () => {
    const r = combo().route
    expect(routeToString(r, moves, 'short')).toBe('中足 → キャンセル → エアスラッシャー')
    expect(routeToString(r, moves, 'name')).toBe('屈中K → キャンセル → エアスラッシャー')
    expect(routeToString(r, moves, 'numpad')).toBe('2MK → > → [4]6P')
  })
  it('直接入力のステップはラベルで表示', () => {
    expect(routeToString([stepFromText(' 歩きキャンセル ')], moves, 'short')).toBe('歩きキャンセル')
  })
  it('ゲージ推定: OD=2, DRC=3, SA3=3', () => {
    const r = [stepFromMove(m('sp1'), true), stepFromMove(m('cdr')), stepFromMove(m('sa3'))]
    expect(estimateGauges(r, moves)).toEqual({ sa: 3, drive: 5 })
  })
  it('技検索はひらがな・別名・テンキーで一致', () => {
    expect(normalize('えあ')).toBe(normalize('エア'))
    expect(moveMatches(m('crmk'), '中足')).toBe(true)
    expect(moveMatches(m('crmk'), '2mk')).toBe(true)
    expect(moveMatches(m('sp1'), 'えあすら')).toBe(true)
  })
})

describe('filter', () => {
  const list = [
    combo({ id: 'a', name: 'A', damage: 1500, difficulty: 1, situation: 'corner', tags: ['安定'], updatedAt: 3 }),
    combo({ id: 'b', name: 'B', damage: 3500, difficulty: 4, saGauge: 3, driveGauge: 3, updatedAt: 2 }),
    combo({ id: 'c', name: 'C', damage: null, favorite: true, characterId: 'ryu', updatedAt: 1 }),
  ]
  const ids = (f: Partial<typeof EMPTY_FILTER>) => filterCombos(list, { ...EMPTY_FILTER, ...f }).map((c) => c.id)
  it('お気に入りが常に先頭', () => expect(ids({})).toEqual(['c', 'a', 'b']))
  it('ダメージ範囲', () => expect(ids({ damageMin: '2000' })).toEqual(['b']))
  it('状況・難易度・タグ・キャラ', () => {
    expect(ids({ situations: ['corner'] })).toEqual(['a'])
    expect(ids({ difficulties: [4] })).toEqual(['b'])
    expect(ids({ tags: ['安定'] })).toEqual(['a'])
    expect(ids({ characterId: 'ryu' })).toEqual(['c'])
  })
  it('ゲージ上限', () => {
    expect(ids({ saMax: '0' })).toEqual(['c', 'a'])
    expect(ids({ driveMax: '2' })).toEqual(['c', 'a'])
  })
  it('キーワード（名前・ルート）', () => {
    expect(ids({ q: 'b' })).toEqual(['b'])
    expect(ids({ q: 'えあすらっしゃー' })).toHaveLength(3)
  })
  it('並べ替え', () => expect(ids({ sort: 'damage' })).toEqual(['c', 'b', 'a']))
})

describe('share', () => {
  it('エンコード → デコードで内容が保たれる', () => {
    const c = combo({ route: [...combo().route, { ...stepFromText('ディレイ'), note: '少し待つ' }], tags: ['a', 'b'] })
    const token = encodeShare([c, combo({ name: '2本目' })], BUILTIN_CHARACTERS, DEFAULT_SITUATIONS)
    expect(token.startsWith('1.')).toBe(true)
    const [d, d2] = decodeShare(token)
    expect(d.name).toBe(c.name)
    expect(d.charName).toBe('ディージェイ')
    expect(d.situationLabel).toBe('中央')
    expect(d.damage).toBe(2400)
    expect(d.route.map((r) => [r.label, r.moveId, r.category, r.note])).toEqual(c.route.map((r) => [r.label, r.moveId, r.category, r.note]))
    expect(d.tags).toEqual(['a', 'b'])
    expect(d2.name).toBe('2本目')
  })
  it('1 コンボの URL は十分短い', () => {
    const token = encodeShare([combo()], BUILTIN_CHARACTERS, DEFAULT_SITUATIONS)
    expect(token.length).toBeLessThan(400)
  })
  it('壊れた・切れた URL はエラー', () => {
    const token = encodeShare([combo()], BUILTIN_CHARACTERS, DEFAULT_SITUATIONS)
    expect(() => decodeShare(token.slice(0, 20))).toThrow(ShareDecodeError)
    expect(() => decodeShare('9.abc')).toThrow(ShareDecodeError)
    expect(() => decodeShare('garbage')).toThrow(ShareDecodeError)
  })
  it('不正な値は範囲内に丸める', () => {
    const c = sanitizeCombo({ characterId: 'ryu', route: [{ label: 'x', category: 'evil' }], difficulty: 99, saGauge: -5 })!
    expect(c.difficulty).toBe(5)
    expect(c.saGauge).toBe(0)
    expect(c.route[0].category).toBe('connector')
    expect(sanitizeCombo({ foo: 1 })).toBeNull()
  })
})

describe('text', () => {
  it('依頼書の書式でコピーできる', () => {
    const t = comboToText(combo(), dj, moves, DEFAULT_SITUATIONS, 'short')
    expect(t).toContain('【キャラクター】ディージェイ')
    expect(t).toContain('【コンボ名】中足始動・中央')
    expect(t).toContain('【ダメージ】2400')
    expect(t).toContain('【SAゲージ】0')
    expect(t).toContain('【ドライブゲージ】1.0')
    expect(t).toContain('【コンボルート】\n中足 → キャンセル → エアスラッシャー')
    expect(t).toContain('【備考】\nタイミングに注意')
  })
})
