// Phase 3 E2E: AI 動作認識（動画入力 → 区間検出 → 確認・修正 → ルート変換 → 学習 → 再解析で候補）
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const BASE = process.argv[2] || 'http://localhost:4173/'
const SHOTS = process.env.SHOTS || 'e2e/screenshots'
const VIDEO = 'e2e/fixtures/combo.webm' // 1.0-1.5s 横移動 / 3.0-3.6s 斜め移動 / 5.0-5.4s 縦移動 の合成動画
const ok = (m) => console.log('  ✓ ' + m)

;(async () => {
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto(`${BASE}#/c/ryu/ai`)
  await page.getByText('今の解析は技名を自動で判定できません。').waitFor()
  assert.ok((await page.getByText('未実装', { exact: true }).count()) >= 4)
  ok('できること・できないこと（未実装の方式）を明示')

  const analyze = async () => {
    await page.getByTestId('analyze').click()
    await page.getByTestId('event-count').waitFor({ timeout: 30000 })
    await page.waitForTimeout(300)
    return page.getByTestId('ai-event')
  }

  await page.getByTestId('video-input').setInputFiles(VIDEO)
  await page.waitForFunction(() => document.querySelector('video')?.duration > 6)
  let ev = await analyze()
  const n = await ev.count()
  const times = (await ev.locator('.font-mono').allInnerTexts()).filter((t) => t.includes('s〜'))
  console.log('      検出区間:', times.join(' / '))
  assert.equal(n, 3, 'expected 3 segments')
  const starts = times.map((t) => parseFloat(t))
  assert.ok(Math.abs(starts[0] - 1.0) < 0.25 && Math.abs(starts[1] - 3.0) < 0.25 && Math.abs(starts[2] - 5.0) < 0.25, String(starts))
  ok('動画から 3 つの動作区間を正しい時刻で検出')
  assert.equal(await page.getByTestId('unknown').count(), 3)
  ok('学習データがない状態では、すべて「不明な動作」（勝手に確定しない）')
  await page.screenshot({ path: `${SHOTS}/20-ai-result.png`, fullPage: true })

  // ユーザーが修正: #1 = 中足, #2 = 波動拳, #3 は不明のまま
  const pick = async (i, moveId) => {
    await ev.nth(i).getByTestId('pick-move').click()
    await page.locator(`[role=dialog] [data-move=${moveId}]`).click()
  }
  await pick(0, 'crmk')
  await pick(1, 'sp1')
  assert.equal(await page.getByTestId('unknown').count(), 1)
  assert.ok((await ev.nth(0).innerText()).includes('✓ 確定'))
  ok('認識結果をユーザーが修正・確定')

  await page.getByTestId('convert').click()
  await page.waitForURL(/#\/c\/ryu\/new$/)
  const steps = () => page.locator('[data-testid=route-step]').allInnerTexts()
  await page.locator('[data-testid=route-step]').first().waitFor({ timeout: 3000 }).catch(() => {})
  await page.screenshot({ path: `${SHOTS}/22-ai-editor.png` })
  assert.deepEqual(await steps(), ['中足', '波動拳', '不明な動作'])
  ok('コンボルートに変換してエディタに読み込み（不明な動作はそのまま残る）')

  // エディタで仕上げ: 不明な動作を SA1 に差し替え、中足の後に キャンセル を挿入
  await page.locator('[data-testid=route-step]', { hasText: '不明な動作' }).click()
  await page.getByRole('button', { name: '差し替え' }).click()
  await page.click('[data-move=sa1]')
  await page.locator('[data-testid=route-step]').first().click()
  await page.getByRole('button', { name: '後に挿入' }).click()
  await page.click('[data-move=cancel]')
  assert.deepEqual(await steps(), ['中足', 'キャンセル', '波動拳', 'SA1'])
  await page.getByTestId('combo-name').fill('AI から作ったコンボ')
  await page.getByTestId('save-combo').click()
  await page.waitForURL(/#\/c\/ryu$/)
  await page.getByText('AI から作ったコンボ').waitFor()
  ok('不明な動作を手動で差し替えて保存（AI バッジ付き）')

  // 再解析: 学習した 2 区間に候補が出る
  await page.goto(`${BASE}#/c/ryu/ai`)
  await page.getByTestId('video-input').setInputFiles(VIDEO)
  await page.waitForFunction(() => document.querySelector('video')?.duration > 6)
  await page.getByText(/学習データ: 2 件/).waitFor()
  ev = await analyze()
  const t0 = await ev.nth(0).innerText()
  const t1 = await ev.nth(1).innerText()
  const t2 = await ev.nth(2).innerText()
  console.log('      #1:', t0.replace(/\s+/g, ' ').slice(0, 90))
  console.log('      #2:', t1.replace(/\s+/g, ' ').slice(0, 90))
  console.log('      #3:', t2.replace(/\s+/g, ' ').slice(0, 90))
  assert.match(t0, /中足\s*\d+%/)
  assert.match(t1, /波動拳\s*\d+%/)
  // 学習例 1 件では自信を持たない → 自動選択せず「不明な動作」+ 候補チップ
  assert.equal(await page.getByTestId('unknown').count(), 3)
  const pct = (t, name) => Number((t.match(new RegExp(name + '\\s*(\\d+)%')) || [])[1] ?? 0)
  assert.ok(pct(t0, '中足') > pct(t0, '波動拳'), '#1 は中足が上位')
  assert.ok(pct(t1, '波動拳') > pct(t1, '中足'), '#2 は波動拳が上位')
  assert.ok(pct(t2, '中足') < pct(t0, '中足'), '#3（未学習の縦移動）は #1 より中足の信頼度が低い')
  ok('学習データから候補と信頼度を表示（学習例 1 件では自動選択しない・未学習の動作は低信頼度）')
  await page.screenshot({ path: `${SHOTS}/21-ai-learned.png`, fullPage: true })

  assert.deepEqual(errors, [])
  ok('コンソールエラーなし')
  await browser.close()
  console.log('PHASE 3 OK')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
