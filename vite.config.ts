/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** 開発者用ビルド（学習スタジオ入り）は検索エンジンに載せない */
const studioNoIndex = (): Plugin => ({
  name: 'studio-noindex',
  transformIndexHtml: (html) =>
    process.env.VITE_DEV_STUDIO === '1'
      ? html
          .replace('<head>', '<head>\n    <meta name="robots" content="noindex, nofollow" />')
          .replace('<title>SF6 Combo Memo</title>', '<title>SF6 Combo Studio（開発者用）</title>')
      : html,
})

export default defineConfig({
  plugins: [react(), tailwindcss(), studioNoIndex()],
  base: './',
  test: { environment: 'jsdom', globals: true },
})
