// Phase 1 E2E: node e2e/phase1.cjs [baseURL]
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const BASE = process.argv[2] || 'http://localhost:4173/'
const SHOTS = process.env.SHOTS || 'e2e/screenshots'

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  const steps = () => page.locator('[data-testid=route-step]').allInnerTexts()
  const ok = (msg) => console.log('  ✓ ' + msg)
  const cards = async (n) => {
    for (let i = 0; i < 40; i++) {
      if ((await page.getByTestId('combo-card').count()) === n) return n
      await page.waitForTimeout(100)
    }
    return page.getByTestId('combo-card').count()
  }

  await page.goto(BASE)
  assert.equal(await page.locator('[data-testid=char-tile]').count(), 30)
  ok('キャラ選択: 30 キャラ表示')
  await page.screenshot({ path: `${SHOTS}/01-select.png` })

  await page.getByRole('link', { name: /ディージェイ/ }).click()
  await page.getByTestId('new-combo').click()
  for (const id of ['crmk', 'cancel', 'sp1', 'cdr', 'sthp', 'sa3']) await page.click(`[data-move=${id}]`)
  assert.deepEqual(await steps(), ['中足', 'キャンセル', 'エアスラッシャー', 'CR', '立強P', 'SA3'])
  ok('技ボタンでルートに追加')

  // 削除 → 途中挿入
  await page.locator('[data-testid=route-step]').nth(1).click()
  await page.getByLabel('この技を削除').click()
  assert.deepEqual((await steps()).slice(0, 2), ['中足', 'エアスラッシャー'])
  await page.locator('[data-testid=route-step]').nth(0).click()
  await page.getByRole('button', { name: '後に挿入' }).click()
  await page.click('[data-move=cancel]')
  assert.deepEqual((await steps()).slice(0, 3), ['中足', 'キャンセル', 'エアスラッシャー'])
  ok('技の削除と途中への挿入')

  // 差し替え（入力ミス修正）
  await page.locator('[data-testid=route-step]', { hasText: '立強P' }).click()
  await page.getByRole('button', { name: '差し替え' }).click()
  await page.click('[data-move=sthk]')
  assert.ok((await steps()).includes('立強K') && !(await steps()).includes('立強P'))
  ok('差し替えで入力ミスを修正')

  // 並べ替え + 技ごとの備考 + 技名の直接修正
  // 差し替え後も選択は維持される
  await page.getByLabel('前へ移動').click()
  assert.deepEqual(await steps(), ['中足', 'キャンセル', 'エアスラッシャー', '立強K', 'CR', 'SA3'])
  await page.getByLabel('技ごとの備考').fill('最速で')
  ok('並べ替えと技ごとの備考')
  // 選択中の立強K の名前を直接修正
  await page.getByLabel('技名を修正').fill('立強K（1段止め）')
  assert.ok((await steps()).some((s) => s.startsWith('立強K（1段止め）')))
  ok('技名の直接修正')
  await page.locator('h1').click()
  await page.keyboard.press('Escape')
  assert.equal(await page.getByText('番目に挿入中').count(), 0)

  // 検索 + 直接入力 + undo/redo
  const search = page.getByTestId('move-search')
  await search.fill('えあすら')
  assert.ok(await page.locator('[data-move=sp1]').isVisible())
  await search.press('Enter')
  assert.equal((await steps()).at(-1), 'エアスラッシャー')
  await search.fill('歩きキャンセル')
  await search.press('Shift+Enter')
  assert.equal((await steps()).at(-1), '歩きキャンセル')
  ok('技名検索（ひらがな）と直接入力')
  await page.locator('body').click({ position: { x: 5, y: 300 } })
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+z')
  assert.equal((await steps()).at(-1), 'SA3')
  await page.keyboard.press('Control+Shift+z')
  assert.equal((await steps()).at(-1), 'エアスラッシャー')
  await page.keyboard.press('Backspace')
  assert.equal((await steps()).at(-1), 'SA3')
  ok('Undo / Redo / Backspace')

  await page.getByTestId('combo-name').fill('中足始動・中央')
  await page.getByRole('radio', { name: '難易度3' }).click()
  await page.getByTestId('combo-damage').fill('3800')
  await page.getByRole('button', { name: 'ルートから推定した値を入れる' }).click()
  await page.getByLabel('タグを追加').fill('実戦')
  await page.getByLabel('タグを追加').press('Enter')
  await page.getByTestId('combo-notes').fill('タイミングに注意')
  await page.screenshot({ path: `${SHOTS}/02-editor.png` })
  await page.getByTestId('save-combo').click()
  await page.waitForURL(/#\/c\/deejay$/)
  const card = page.getByTestId('combo-card').first()
  assert.match(await card.innerText(), /3800/)
  assert.match(await card.innerText(), /中足始動・中央/)
  ok('コンボ保存 → 一覧に表示（SA/ドライブはルートから推定: SA3 / CR=3）')
  assert.match(await card.innerText(), /SA[\s\S]*3[\s\S]*DRIVE[\s\S]*3\.0/)

  // 2 件目
  await page.getByTestId('new-combo').click()
  for (const id of ['stlp', 'stlp', 'sp1']) await page.click(`[data-move=${id}]`)
  await page.getByRole('button', { name: '画面端', exact: true }).click()
  await page.getByTestId('combo-damage').fill('1200')
  await page.getByTestId('save-combo').click()
  await page.waitForURL(/#\/c\/deejay$/)
  assert.equal(await cards(2), 2)
  assert.match(await page.getByTestId('combo-card').first().innerText(), /弱P始動・画面端/)
  ok('名前未入力時は自動命名（立弱P始動・画面端）')

  // リロードで永続化
  await page.reload()
  assert.equal(await cards(2), 2)
  ok('リロード後もデータが残る（localStorage）')

  // 絞り込み
  await page.getByRole('button', { name: /絞り込み/ }).click()
  await page.getByLabel('ダメージ最小').fill('2000')
  assert.equal(await cards(1), 1)
  await page.getByLabel('ダメージ最小').fill('')
  await page.getByRole('button', { name: '画面端' }).first().click()
  assert.equal(await cards(1), 1)
  await page.getByRole('button', { name: '条件をリセット' }).click()
  await page.getByLabel('コンボを検索').fill('中足')
  assert.equal(await cards(1), 1)
  await page.getByLabel('コンボを検索').fill('')
  await page.getByRole('button', { name: '#実戦' }).click()
  assert.equal(await cards(1), 1)
  await page.getByRole('button', { name: '条件をリセット' }).click()
  ok('検索・絞り込み（ダメージ / 状況 / キーワード / タグ）')

  // お気に入り
  await page.getByTestId('combo-card').nth(1).getByLabel('お気に入り登録').click()
  await page.waitForTimeout(100)
  assert.match(await page.getByTestId('combo-card').first().innerText(), /中足始動/)
  await page.getByRole('button', { name: 'お気に入り', exact: true }).click()
  assert.equal(await cards(1), 1)
  await page.getByRole('button', { name: 'お気に入り', exact: true }).click()
  ok('お気に入り登録・お気に入りが先頭・お気に入りのみ表示')
  await page.screenshot({ path: `${SHOTS}/03-list.png`, fullPage: true })

  // 編集
  await page.getByTestId('combo-card').nth(0).getByRole('link', { name: '編集' }).click()
  await page.getByTestId('combo-name').fill('中足始動・中央（改）')
  await page.getByTestId('save-combo').click()
  await page.waitForURL(/#\/c\/deejay$/)
  await cards(2)
  assert.match(await page.getByTestId('combo-card').nth(0).innerText(), /（改）/)
  ok('コンボ編集')

  // 未保存の離脱確認
  await page.getByTestId('new-combo').click()
  await page.click('[data-move=crmk]')
  await page.getByRole('link', { name: '全コンボ' }).first().click()
  await page.getByText('保存されていない変更があります').waitFor({ timeout: 3000 })
  await page.getByRole('button', { name: '破棄して移動' }).click()
  await page.waitForURL(/#\/combos$/)
  assert.equal(await cards(2), 2)
  ok('未保存で離れるときに確認ダイアログ')

  // 削除
  await page.getByTestId('combo-card').first().getByLabel('削除').click()
  await page.getByTestId('confirm-delete').click()
  assert.equal(await cards(1), 1)
  ok('コンボ削除')

  // キャラメモ
  await page.goto(BASE + '#/c/deejay?tab=memo')
  await page.getByTestId('char-memo').fill('対空は 2HP')
  await page.waitForTimeout(600)
  await page.reload()
  assert.equal(await page.getByTestId('char-memo').inputValue(), '対空は 2HP')
  ok('キャラ専用メモの保存')

  // 技リスト: 技追加 → パレットに出る
  await page.goto(BASE + '#/c/deejay?tab=moves')
  await page.getByLabel('技名', { exact: true }).fill('マシンガンアッパー')
  await page.getByRole('button', { name: '技を追加' }).click()
  await page.goto(BASE + '#/c/deejay/new')
  assert.ok(await page.getByRole('button', { name: /マシンガンアッパー/ }).isVisible())
  ok('キャラ別の技追加（JSON 定義 + ユーザー追加）')

  // スマホ
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: await ctx.storageState() })
  const mp = await mob.newPage()
  await mp.goto(BASE + '#/c/deejay/new')
  for (const id of ['crmk', 'cancel', 'sp1']) await mp.click(`[data-move=${id}]`)
  const sw = await mp.evaluate(() => document.documentElement.scrollWidth)
  assert.ok(sw <= 390, 'no horizontal scroll: ' + sw)
  await mp.screenshot({ path: `${SHOTS}/04-mobile-editor.png` })
  await mp.goto(BASE + '#/c/deejay')
  await mp.screenshot({ path: `${SHOTS}/05-mobile-list.png` })
  ok('スマホ幅で横スクロールなし')

  assert.deepEqual(errors, [])
  ok('コンソールエラーなし')
  await browser.close()
  console.log('PHASE 1 OK')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
