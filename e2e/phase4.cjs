// Phase 4 E2E: エラー処理・スマホ表示
const { chromium, devices } = require('playwright')
const assert = require('node:assert/strict')
const BASE = process.argv[2] || 'http://localhost:4173/'
const SHOTS = process.env.SHOTS || 'e2e/screenshots'
const ok = (m) => console.log('  ✓ ' + m)

;(async () => {
  const browser = await chromium.launch()

  // 壊れた保存データでも起動する
  {
    const page = await browser.newPage()
    await page.goto(BASE)
    await page.evaluate(() => localStorage.setItem('sf6-combo-memo', '{broken json'))
    await page.reload()
    await page.getByText('キャラクター選択').waitFor()
    ok('保存データが壊れていても起動する')
    await page.goto(`${BASE}#/no/such/page`)
    await page.getByText('ページが見つかりません。').waitFor()
    ok('存在しないページは 404 表示')
    await page.goto(`${BASE}#/c/unknown-char`)
    await page.getByText('キャラクターが見つかりません。').waitFor()
    ok('存在しないキャラは案内を表示')
    await page.close()
  }

  // 保存容量超過
  {
    const page = await browser.newPage()
    await page.goto(`${BASE}#/c/ryu/new`)
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('quota', 'QuotaExceededError')
      }
    })
    await page.click('[data-move=crmk]')
    await page.getByTestId('save-combo').click()
    await page.getByText('ブラウザに保存できませんでした').waitFor()
    ok('保存容量超過時にエラーを通知（アプリは落ちない）')
    await page.close()
  }

  // スマホ
  {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    const noHScroll = async (label) => {
      const sw = await page.evaluate(() => document.documentElement.scrollWidth)
      const cw = await page.evaluate(() => document.documentElement.clientWidth)
      assert.ok(sw <= cw, `${label}: horizontal scroll ${sw} > ${cw}`)
    }
    await page.goto(`${BASE}#/`)
    await noHScroll('select')
    await page.goto(`${BASE}#/c/ken/new`)
    for (const id of ['crmk', 'cancel', 'sp5', 'cdr', 'sthp', 'sp2']) await page.tap(`[data-move=${id}]`)
    await noHScroll('editor')
    await page.getByTestId('save-combo-mobile').tap()
    await page.waitForURL(/#\/c\/ken$/)
    await page.getByTestId('combo-card').first().waitFor()
    ok('スマホ: 下部の保存バーから保存できる')
    await noHScroll('list')
    await page.screenshot({ path: `${SHOTS}/30-mobile-list.png` })
    await page.getByRole('button', { name: '共有' }).first().tap()
    const url = await page.getByTestId('share-url').inputValue()
    await noHScroll('share dialog')
    await page.goto(url)
    await page.getByTestId('combo-card').first().waitFor()
    await noHScroll('share view')
    await page.goto(`${BASE}#/c/ken/ai`)
    await page.getByTestId('video-input').setInputFiles('e2e/fixtures/combo.webm')
    await page.waitForFunction(() => document.querySelector('video')?.duration > 6)
    await page.getByTestId('analyze').tap()
    await page.getByTestId('event-count').waitFor({ timeout: 30000 })
    await noHScroll('ai')
    await page.screenshot({ path: `${SHOTS}/31-mobile-ai.png`, fullPage: true })
    ok('スマホ: 一覧・共有・AI 画面で横スクロールなし、AI 解析も動作')
    assert.deepEqual(errors, [])
    await ctx.close()
  }

  await browser.close()
  console.log('PHASE 4 OK')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
