import { useMemo } from 'react'
import { mergeCharacters, resolveMoves, useStore } from '../store/useStore'
import { encodeShare, shareUrl, URL_MAX, URL_WARN } from '../lib/share'
import { comboToText, copyText } from '../lib/text'
import { Modal, toast } from './ui'
import { Icon } from './Icon'

export function ShareDialog({ ids, onClose }: { ids: string[] | null; onClose: () => void }) {
  const st = useStore()
  const chars = useMemo(() => mergeCharacters(st), [st])
  const combos = useMemo(() => (ids ? st.combos.filter((c) => ids.includes(c.id)) : []), [ids, st.combos])
  const url = useMemo(() => (combos.length ? shareUrl(encodeShare(combos, chars, st.situations)) : ''), [combos, chars, st.situations])
  const text = useMemo(
    () =>
      combos
        .map((c) => {
          const ch = chars.find((x) => x.id === c.characterId)
          return comboToText(c, ch, resolveMoves(ch, st, true), st.situations, st.notation)
        })
        .join('\n\n――――――――――\n\n'),
    [combos, chars, st],
  )

  const copy = async (s: string, what: string) => {
    const ok = await copyText(s)
    toast(ok ? `${what}をコピーしました` : 'コピーに失敗しました', ok ? 'ok' : 'err')
  }

  const download = () => {
    const blob = new Blob([JSON.stringify({ app: 'sf6-combo-memo', version: 1, exportedAt: new Date().toISOString(), data: { combos } }, null, 2)], {
      type: 'application/json',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `sf6-combos-${combos.length}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const len = url.length
  return (
    <Modal open={!!ids} onClose={onClose} title={`${combos.length} 件のコンボを共有`} wide>
      <div className="space-y-4">
        <div>
          <span className="label">共有 URL</span>
          <div className="flex gap-2">
            <input className="input font-mono text-xs" readOnly value={url} onFocus={(e) => e.target.select()} data-testid="share-url" />
            <button className="btn btn-primary shrink-0" onClick={() => copy(url, 'URL ')}>
              <Icon name="link" />
              URL をコピー
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            <span className={len > URL_MAX ? 'text-red-300' : len > URL_WARN ? 'text-c-super' : 'text-ink-3'}>{len.toLocaleString()} 文字</span>
            {len > URL_MAX ? (
              <span className="text-red-300">URL が長すぎて、ブラウザやアプリによっては開けません。JSON ファイルでの共有をおすすめします。</span>
            ) : len > URL_WARN ? (
              <span className="text-c-super">SNS やチャットでは URL が途中で切れることがあります。件数を減らすかファイルで共有してください。</span>
            ) : (
              <span className="text-ink-3">コンボのデータは URL の中に入っています。サーバーには保存されません。</span>
            )}
            <a className="ml-auto text-accent-2 underline" href={url} target="_blank" rel="noreferrer">
              プレビュー
            </a>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="label">テキスト</span>
            <button className="btn btn-sm" onClick={() => copy(text, 'テキスト')}>
              <Icon name="copy" className="size-3.5" />
              テキストをコピー
            </button>
          </div>
          <pre className="max-h-64 overflow-auto rounded-lg border border-line bg-[#0d0f14] p-3 text-xs whitespace-pre-wrap text-ink-2" data-testid="share-text">
            {text}
          </pre>
        </div>

        <div className="flex justify-end">
          <button className="btn btn-sm" onClick={download}>
            <Icon name="download" className="size-3.5" />
            JSON ファイルで書き出す
          </button>
        </div>
      </div>
    </Modal>
  )
}
