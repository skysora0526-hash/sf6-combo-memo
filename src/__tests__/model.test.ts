import { describe, expect, it } from 'vitest'
import { decodeFeature, encodeFeature, FEATURE_VERSION } from '../ai/featureCodec'
import { evaluate, scoreSamples, type LabeledSample } from '../ai/scoring'
import { loadModelFile, ModelError, validateModel } from '../ai/models'
import { buildModel } from '../studio/exportModel'
import type { Sample } from '../studio/datasetDb'
import { COMMON_MOVES } from '../data'

const rnd = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
/** クラスごとに中心ベクトルを決め、ノイズを足したサンプルを作る */
function cluster(moveId: string, center: number[], n: number, noise: number, seed: number): LabeledSample[] {
  const r = rnd(seed)
  return Array.from({ length: n }, () => ({ moveId, label: moveId, feature: center.map((x) => x + r() * noise) }))
}
const center = (seed: number) => {
  const r = rnd(seed)
  return Array.from({ length: 64 }, () => r())
}

describe('feature codec', () => {
  it('Int8 量子化しても値はほぼ保たれる', () => {
    const f = Array.from({ length: 576 }, (_, i) => Math.sin(i) * 0.9)
    const back = decodeFeature(encodeFeature(f))
    expect(back).toHaveLength(576)
    expect(Math.max(...back.map((x, i) => Math.abs(x - f[i])))).toBeLessThan(0.005)
    expect(encodeFeature(f).length).toBeLessThan(800)
  })
})

describe('evaluate', () => {
  const data = [...cluster('crmk', center(1), 6, 0.2, 11), ...cluster('sthp', center(2), 6, 0.2, 12), ...cluster('cdr', center(3), 6, 0.2, 13)]
  it('分かれているデータでは正解率が高い', () => {
    const e = evaluate(data, COMMON_MOVES, 0.75)
    expect(e.total).toBe(18)
    expect(e.top1).toBe(1)
    expect(e.perMove).toHaveLength(3)
  })
  it('区別できないデータでは正解率が低く、取り違えが報告される', () => {
    const same = center(9)
    const mixed = [...cluster('crmk', same, 6, 0.3, 21), ...cluster('sthp', same, 6, 0.3, 22)]
    const e = evaluate(mixed, COMMON_MOVES, 0.75)
    expect(e.top1).toBeLessThan(0.8)
    expect(e.confusions.length).toBeGreaterThan(0)
    expect(e.coverage).toBeLessThan(0.5) // 自信のない判定は自動選択されない
  })
  it('動画単位の評価では、同じ動画のサンプルを判定に使わない', () => {
    // 動画 A にしか sthp がない → A の sthp は他の動画に手がかりがなく当たらない
    const a = cluster('sthp', center(5), 3, 0.05, 31)
    const b = cluster('crmk', center(6), 3, 0.05, 32)
    const groups = [...a.map(() => 'A'), ...b.map(() => 'B')]
    expect(evaluate([...a, ...b], COMMON_MOVES, 0.75).top1).toBe(1)
    expect(evaluate([...a, ...b], COMMON_MOVES, 0.75, groups).top1).toBe(0)
  })
})

describe('model file', () => {
  const sample = (moveId: string, f: number[]): Sample => ({
    id: moveId + f[0],
    characterId: 'ryu',
    moveId,
    label: moveId,
    feature: encodeFeature(f),
    featureVersion: FEATURE_VERSION,
    thumb: 'data:image/jpeg;base64,xxx',
    video: 'a.mp4',
    start: 0,
    end: 1,
    roiId: 'nohud',
    fps: 10,
    createdAt: 0,
  })
  it('データセット → モデル → 読み込み → 判定 が一周する（サムネイル・動画名は含めない）', () => {
    const c1 = center(1)
    const c2 = center(2)
    const model = buildModel('ryu', [sample('crmk', c1), sample('crmk', c1.map((x) => x * 0.98)), sample('sthp', c2)])
    const json = JSON.stringify(model)
    expect(json).not.toContain('a.mp4')
    expect(json).not.toContain('data:image')
    const loaded = loadModelFile(validateModel(JSON.parse(json)))
    expect(loaded.samples).toHaveLength(3)
    expect(loaded.moveCount).toBe(2)
    expect(scoreSamples(c1, loaded.samples, COMMON_MOVES, 'bundled')[0].moveId).toBe('crmk')
  })
  it('形式・特徴量バージョンが違うモデルは拒否する', () => {
    const m = buildModel('ryu', [sample('crmk', center(1))])
    expect(() => validateModel({ ...m, featureVersion: FEATURE_VERSION + 1 })).toThrow(ModelError)
    expect(() => validateModel({ foo: 1 })).toThrow(ModelError)
    expect(() => validateModel({ ...m, samples: [{ m: 1 }] })).toThrow(ModelError)
  })
})
