#!/usr/bin/env node
// 学習スタジオで書き出したモデルを検証して public/ai-models/ に配置し、index.json を更新する
// 使い方: node scripts/install-model.mjs <model.json> [--dir public/ai-models]
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const dirIdx = args.indexOf('--dir')
const dir = dirIdx >= 0 ? args[dirIdx + 1] : 'public/ai-models'
const file = args.find((a, i) => !a.startsWith('--') && i !== dirIdx + 1)
if (!file) {
  console.error('使い方: node scripts/install-model.mjs <model.json> [--dir public/ai-models]')
  process.exit(1)
}

// src/ai/featureCodec.ts の FEATURE_VERSION と合わせる
const codec = fs.readFileSync(new URL('../src/ai/featureCodec.ts', import.meta.url), 'utf8')
const FEATURE_VERSION = Number(codec.match(/FEATURE_VERSION = (\d+)/)?.[1])

const fail = (m) => {
  console.error('✗ ' + m)
  process.exit(1)
}
let model
try {
  model = JSON.parse(fs.readFileSync(file, 'utf8'))
} catch (e) {
  fail(`JSON として読めません: ${e.message}`)
}
if (model.format !== 'sf6-combo-memo-model' || model.version !== 1) fail('SF6 Combo Memo のモデルファイルではありません')
if (model.featureVersion !== FEATURE_VERSION) fail(`特徴量のバージョンが違います（モデル ${model.featureVersion} / アプリ ${FEATURE_VERSION}）`)
if (!/^[a-z0-9-]+$/.test(model.characterId ?? '')) fail(`characterId が不正です: ${model.characterId}`)
const charFile = new URL(`../src/data/characters/${model.characterId}.json`, import.meta.url)
if (!fs.existsSync(charFile)) console.warn(`⚠ src/data/characters/${model.characterId}.json がありません（追加キャラ用のモデルとして配置します）`)
if (!Array.isArray(model.samples) || !model.samples.length) fail('サンプルがありません')
const len = Buffer.from(model.samples[0].f, 'base64').length
for (const s of model.samples) {
  if (typeof s.m !== 'string' || typeof s.f !== 'string') fail('サンプルの形式が不正です')
  if (Buffer.from(s.f, 'base64').length !== len) fail('特徴量の長さがそろっていません')
}

fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path.join(dir, `${model.characterId}.json`), JSON.stringify(model))
const idxPath = path.join(dir, 'index.json')
const idx = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, 'utf8')) : { models: [] }
const moves = new Set(model.samples.map((s) => s.m)).size
idx.models = [
  ...(idx.models ?? []).filter((m) => m.characterId !== model.characterId),
  { characterId: model.characterId, samples: model.samples.length, moves, createdAt: model.createdAt },
].sort((a, b) => a.characterId.localeCompare(b.characterId))
fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2) + '\n')
console.log(`✓ ${model.characterId}: ${model.samples.length} サンプル / ${moves} 技 → ${path.join(dir, model.characterId + '.json')}`)
