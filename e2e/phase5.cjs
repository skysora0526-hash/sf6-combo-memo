// Phase 5 E2E: 開発者が学習スタジオでモデルを作る → 同梱 → 一般ユーザーが学習なしで使う
//   node e2e/phase5.cjs <userBase> <studioBase> <userDistDir>
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const USER = process.argv[2] || 'http://localhost:4173/'
const STUDIO = process.argv[3] || 'http://localhost:4174/'
const USER_DIST = process.argv[4] || 'dist'
const SHOTS = process.env.SHOTS || 'e2e/screenshots'
const ok = (m) => console.log('  ✓ ' + m)
// 動画内の 3 つの動き → 学習させる技（リュウ）
const LABELS = ['crmk', 'sp1', 'sp2'] // 中足 / 波動拳 / 昇龍拳

;(async () => {
  const browser = await chromium.launch()
  const errors = []

  // ---------- 開発者: 学習スタジオ ----------
  const dev = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })).newPage()
  dev.on('pageerror', (e) => errors.push(e.message))
  await dev.goto(`${STUDIO}#/`)
  await dev.getByRole('link', { name: '学習スタジオ' }).first().click()
  await dev.getByRole('link', { name: /リュウ/ }).click()
  await dev.getByText('開発者モード').waitFor()

  for (const [i, video] of ['e2e/fixtures/train-a.webm', 'e2e/fixtures/train-b.webm'].entries()) {
    if (i > 0) await dev.getByRole('button', { name: '別の動画' }).click()
    await dev.getByTestId('video-input').setInputFiles(video)
    await dev.waitForFunction(() => document.querySelector('video')?.duration > 6)
    await dev.getByTestId('analyze').click()
    await dev.getByTestId('event-count').waitFor({ timeout: 30000 })
    const ev = dev.getByTestId('ai-event')
    assert.equal(await ev.count(), 3, `${video}: 3 区間`)
    for (const [k, moveId] of LABELS.entries()) {
      await ev.nth(k).getByTestId('pick-move').click()
      await dev.locator(`[role=dialog] [data-move=${moveId}]`).click()
    }
    await dev.getByTestId('add-samples').click()
    await dev.getByText(/3 件を学習データに追加しました/).waitFor()
  }
  ok('学習スタジオ: 2 本の動画で区間に技を付けて学習データに追加（計 6 サンプル）')

  await dev.getByRole('tab', { name: /データセット/ }).click()
  await dev.getByTestId('dataset-move').first().waitFor()
  assert.equal(await dev.getByTestId('dataset-move').count(), 3)
  assert.match(await dev.locator('main').innerText(), /6 サンプル \/ 3 技 \/ 2 本の動画/)
  await dev.screenshot({ path: `${SHOTS}/40-studio-dataset.png`, fullPage: true })
  ok('データセット: 技ごとにサムネイル付きで一覧（3 技 × 2）')

  // 永続化（IndexedDB）
  await dev.reload()
  await dev.getByTestId('dataset-move').first().waitFor()
  ok('データセットはリロード後も残る（IndexedDB）')

  await dev.getByRole('tab', { name: /評価・書き出し/ }).click()
  await dev.getByTestId('eval').waitFor()
  console.log('      評価（動画単位）:', (await dev.getByTestId('eval').innerText()).replace(/\s+/g, ' '))
  assert.match(await dev.locator('main').innerText(), /動画単位の交差検証/)
  // 回帰: 立ち位置の違う動画どうしでも当たる（特徴量 v1 では 0% だった）
  assert.match(await dev.getByTestId('eval').innerText(), /1 位が正解\s*100%/)
  await dev.screenshot({ path: `${SHOTS}/41-studio-eval.png`, fullPage: true })
  const [dl] = await Promise.all([dev.waitForEvent('download'), dev.getByTestId('download-model').click()])
  const modelPath = `${SHOTS}/ryu-model.json`
  await dl.saveAs(modelPath)
  const model = JSON.parse(require('node:fs').readFileSync(modelPath, 'utf8'))
  assert.equal(model.samples.length, 6)
  assert.ok(!JSON.stringify(model).includes('data:image'), 'モデルにサムネイルを含めない')
  ok(`評価を表示し、モデルを書き出し（${(JSON.stringify(model).length / 1024).toFixed(1)}KB、サムネイル・動画名なし）`)

  // ---------- 同梱 ----------
  const out = execFileSync('node', ['scripts/install-model.mjs', modelPath, '--dir', `${USER_DIST}/ai-models`]).toString()
  console.log('      ' + out.trim())
  ok('install-model スクリプトで検証・配置')

  // ---------- 一般ユーザー ----------
  const user = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  user.on('pageerror', (e) => errors.push(e.message))
  await user.goto(`${USER}#/`)
  assert.equal(await user.getByRole('link', { name: '学習スタジオ' }).count(), 0)
  await user.goto(`${USER}#/studio`)
  await user.getByText('ページが見つかりません。').waitFor()
  ok('一般向けビルドには学習スタジオがない（メニューなし・URL も 404）')

  await user.goto(`${USER}#/c/ryu/ai`)
  await user.getByTestId('model-status').getByText(/6 サンプル \/ 3 技/).waitFor()
  await user.goto(`${USER}#/c/ken/ai`)
  await user.getByTestId('model-status').getByText('モデルはまだありません').waitFor()
  ok('ユーザー画面に開発者モデルの有無を表示（リュウ: あり / ケン: なし）')

  await user.goto(`${USER}#/c/ryu/ai`)
  await user.getByTestId('model-status').getByText(/6 サンプル/).waitFor()
  await user.getByTestId('video-input').setInputFiles('e2e/fixtures/combo.webm')
  await user.waitForFunction(() => document.querySelector('video')?.duration > 6)
  await user.getByTestId('analyze').click()
  await user.getByTestId('event-count').waitFor({ timeout: 30000 })
  const ev = user.getByTestId('ai-event')
  assert.equal(await ev.count(), 3)
  const expect = ['中足', '波動拳', '昇龍拳']
  for (let i = 0; i < 3; i++) {
    const t = (await ev.nth(i).innerText()).replace(/\s+/g, ' ')
    console.log(`      #${i + 1}: ${t.slice(0, 110)}`)
    // 1 位の候補チップ（技名 → 出どころ → %）
    const chip = ev.nth(i).locator('.chip').first()
    const chipText = (await chip.innerText()).replace(/\s+/g, ' ')
    assert.ok(chipText.startsWith(expect[i]), `#${i + 1} の 1 位は ${expect[i]}: ${chipText}`)
    assert.ok(chipText.includes('開発者'), '出どころは開発者モデル')
    assert.ok(!t.includes('✓ 確定'), 'ユーザーの確認なしに確定しない')
  }
  assert.equal(await user.evaluate(() => JSON.parse(localStorage.getItem('sf6-combo-memo-ai-templates') || '{"state":{"templates":[]}}').state.templates.length), 0)
  await user.screenshot({ path: `${SHOTS}/42-user-with-model.png`, fullPage: true })
  ok('ユーザーは自分で学習しなくても、開発者モデルの候補が正しい順で出る（確定はしない）')

  assert.deepEqual(errors, [])
  ok('コンソールエラーなし')
  await browser.close()
  console.log('PHASE 5 OK')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
