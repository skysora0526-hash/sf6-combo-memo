// Phase 2 E2E: 共有・コピー・インポート/エクスポート
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const BASE = process.argv[2] || 'http://localhost:4173/'
const SHOTS = process.env.SHOTS || 'e2e/screenshots'
const ok = (m) => console.log('  ✓ ' + m)

async function waitCount(loc, n) {
  for (let i = 0; i < 50; i++) {
    if ((await loc.count()) === n) return
    await new Promise((r) => setTimeout(r, 100))
  }
  assert.equal(await loc.count(), n)
}

;(async () => {
  // ---------- ユーザー A ----------
  const browserA = await chromium.launch()
  const ctxA = await browserA.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const a = await ctxA.newPage()
  const errors = []
  a.on('pageerror', (e) => errors.push(e.message))
  await a.goto(BASE)

  const makeCombo = async (charId, moves, name, dmg, extra) => {
    await a.goto(`${BASE}#/c/${charId}/new`)
    for (const id of moves) await a.click(`[data-move=${id}]`)
    await a.getByTestId('combo-name').fill(name)
    await a.getByTestId('combo-damage').fill(String(dmg))
    if (extra) await extra()
    await a.getByTestId('save-combo').click()
    await a.waitForURL(new RegExp(`#/c/${charId}$`))
  }
  await makeCombo('deejay', ['crmk', 'cancel', 'sp1'], '中足始動・中央', 2400, async () => {
    await a.getByRole('button', { name: 'ルートから推定した値を入れる' }).click()
    await a.getByTestId('combo-notes').fill('タイミングに注意')
    await a.getByLabel('ドライブゲージ').fill('1')
  })
  await makeCombo('deejay', ['sthp', 'cdr', 'sthp', 'sa3'], '強P始動・SA3', 4200)
  await makeCombo('ryu', ['crmk', 'cancel', 'sp1'], 'リュウ中足波動', 1800)

  // テキストコピー（依頼書の書式）
  await a.goto(`${BASE}#/c/deejay`)
  await waitCount(a.getByTestId('combo-card'), 2)
  const card = a.getByTestId('combo-card').filter({ hasText: '中足始動・中央' })
  await card.getByRole('button', { name: 'コピー' }).click()
  const clip = await a.evaluate(() => navigator.clipboard.readText())
  for (const line of ['【キャラクター】ディージェイ', '【コンボ名】中足始動・中央', '【状況】中央', '【ダメージ】2400', '【SAゲージ】0', '【ドライブゲージ】1.0', '【コンボルート】\n中足 → キャンセル → エアスラッシャー', '【備考】\nタイミングに注意'])
    assert.ok(clip.includes(line), `clipboard missing: ${line}\n---\n${clip}`)
  ok('テキストコピー（依頼書の書式）')
  console.log(clip.split('\n').map((l) => '      ' + l).join('\n'))

  // 単体共有
  await card.getByRole('button', { name: '共有' }).click()
  const singleUrl = await a.getByTestId('share-url').inputValue()
  assert.match(singleUrl, /#\/share\?d=1\./)
  await a.screenshot({ path: `${SHOTS}/10-share-dialog.png` })
  await a.keyboard.press('Escape')
  ok(`単体の共有 URL 発行（${singleUrl.length} 文字）`)

  // 複数共有（全コンボ → 複数選択 → 3 件）
  await a.goto(`${BASE}#/combos`)
  await waitCount(a.getByTestId('combo-card'), 3)
  await a.getByRole('button', { name: '複数選択' }).click()
  await a.getByRole('button', { name: '表示中を全選択' }).click()
  await a.getByRole('button', { name: '3 件を共有' }).click()
  const multiUrl = await a.getByTestId('share-url').inputValue()
  assert.ok((await a.getByTestId('share-text').innerText()).includes('リュウ中足波動'))
  ok(`複数コンボの共有 URL 発行（3 件 / ${multiUrl.length} 文字）`)

  // JSON エクスポート
  await a.goto(`${BASE}#/data`)
  const [dl] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: 'すべて JSON で書き出す' }).click()])
  const exportPath = `${SHOTS}/backup.json`
  await dl.saveAs(exportPath)
  const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'))
  assert.equal(exported.app, 'sf6-combo-memo')
  assert.equal(exported.data.combos.length, 3)
  ok('JSON エクスポート')
  await browserA.close()

  // ---------- ユーザー B（別ブラウザ・空の localStorage） ----------
  const browserB = await chromium.launch()
  const ctxB = await browserB.newContext({ viewport: { width: 1280, height: 900 } })
  const b = await ctxB.newPage()
  b.on('pageerror', (e) => errors.push(e.message))
  await b.goto(BASE)
  assert.equal(await b.evaluate(() => JSON.parse(localStorage.getItem('sf6-combo-memo') || '{"state":{"combos":[]}}').state.combos.length), 0)

  await b.goto(singleUrl)
  await waitCount(b.getByTestId('combo-card'), 1)
  const text = await b.getByTestId('combo-card').innerText()
  assert.ok(text.includes('中足始動・中央') && text.includes('エアスラッシャー') && text.includes('2400') && text.includes('ディージェイ'))
  ok('別ユーザーが単体の共有 URL を閲覧できる')

  await b.goto(multiUrl)
  await waitCount(b.getByTestId('combo-card'), 3)
  await b.screenshot({ path: `${SHOTS}/11-share-view.png`, fullPage: true })
  // 回帰: 連続で作ったコンボのルート・備考が混ざらない
  const ryuText = await b.getByTestId('combo-card').filter({ hasText: 'リュウ中足波動' }).innerText()
  assert.ok(!ryuText.includes('SA3') && !ryuText.includes('タイミングに注意'), ryuText)
  assert.equal((ryuText.match(/›/g) || []).length, 2)
  // 2 件だけ選んでコピー
  await b.getByLabel('リュウ中足波動 を選択').uncheck()
  await b.getByTestId('import-shared').click()
  await b.waitForURL(/#\/c\/deejay$/)
  await waitCount(b.getByTestId('combo-card'), 2)
  await b.reload()
  await waitCount(b.getByTestId('combo-card'), 2)
  ok('別ユーザーが複数の共有 URL を閲覧し、選んだコンボを自分のメモ帳にコピー（リロード後も保持）')

  // 共有コピーしたコンボは編集できる
  await b.getByTestId('combo-card').first().getByRole('link', { name: '編集' }).click()
  await b.getByTestId('combo-name').fill('もらったコンボ（編集済み）')
  await b.getByTestId('save-combo').click()
  await b.waitForURL(/#\/c\/deejay$/)
  await b.getByText('もらったコンボ（編集済み）').waitFor({ timeout: 3000 })
  ok('コピーしたコンボを編集できる')

  // 壊れた URL
  await b.goto(singleUrl.slice(0, singleUrl.length - 40))
  await b.getByText(/展開できませんでした|壊れています/).waitFor()
  ok('途中で切れた URL はエラー表示')

  // JSON インポート
  await b.goto(`${BASE}#/data`)
  await b.getByTestId('import-file').setInputFiles(exportPath)
  await b.getByTestId('import-merge').click()
  await b.goto(`${BASE}#/combos`)
  await waitCount(b.getByTestId('combo-card'), 5)
  ok('JSON インポート（追加）')

  assert.deepEqual(errors, [])
  ok('コンソールエラーなし')
  await browserB.close()
  console.log('PHASE 2 OK')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
