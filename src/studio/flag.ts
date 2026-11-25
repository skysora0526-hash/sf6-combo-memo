/**
 * 学習スタジオ（開発者向け）を含めるか。
 * `npm run dev` か `npm run build:studio`（VITE_DEV_STUDIO=1）のときだけ有効。
 * 一般向けの `npm run build` では false になり、スタジオのコードはバンドルから除かれる。
 */
export const STUDIO_ENABLED = import.meta.env.DEV || import.meta.env.VITE_DEV_STUDIO === '1'
