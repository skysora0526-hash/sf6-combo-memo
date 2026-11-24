import { useMemo, useState, type KeyboardEvent } from 'react'
import type { MoveCategory, MoveDef } from '../types'
import { CATEGORY_META } from '../data'
import { moveLabel, moveMatches } from '../lib/route'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'

interface Props {
  moves: MoveDef[]
  onPick: (m: MoveDef, od: boolean) => void
  onText: (text: string) => void
  replaceMode?: boolean
}

const SECTIONS: { cat: MoveCategory; cols: string }[] = [
  { cat: 'normal', cols: 'grid-cols-3 sm:grid-cols-6' },
  { cat: 'special', cols: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' },
  { cat: 'unique', cols: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' },
  { cat: 'super', cols: 'grid-cols-4' },
  { cat: 'drive', cols: 'grid-cols-2 sm:grid-cols-3' },
  { cat: 'system', cols: 'grid-cols-3 sm:grid-cols-5' },
  { cat: 'connector', cols: 'grid-cols-4' },
]

export function MovePalette({ moves, onPick, onText, replaceMode }: Props) {
  const notation = useStore((s) => s.notation)
  const [q, setQ] = useState('')
  const [od, setOd] = useState(false)
  const [showJump, setShowJump] = useState(false)

  const results = useMemo(() => (q.trim() ? moves.filter((m) => moveMatches(m, q)) : []), [moves, q])

  const pick = (m: MoveDef) => {
    const useOd = od && m.category === 'special'
    onPick(m, useOd)
    if (useOd) setOd(false)
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (results[0] && !e.shiftKey) pick(results[0])
      else if (q.trim()) onText(q)
      setQ('')
    } else if (e.key === 'Escape') setQ('')
  }

  const btn = (m: MoveDef) => {
    const label = moveLabel(m, notation)
    const sub = notation === 'numpad' ? m.short ?? m.name : m.numpad
    return (
      <button
        key={m.id}
        type="button"
        className={`move-btn ${CATEGORY_META[m.category].className} ${od && m.category === 'special' ? 'ring-1 ring-c-drive' : ''}`}
        onClick={() => pick(m)}
        title={[m.name, m.numpad, m.aliases?.join(' / ')].filter(Boolean).join('  ')}
        data-move={m.id}
      >
        <span className="block truncate pl-1.5">{label}</span>
        {sub && sub !== label && <span className="block truncate pl-1.5 text-[10px] font-normal text-ink-3">{sub}</span>}
      </button>
    )
  }

  return (
    <section className={`panel p-3 ${replaceMode ? 'border-c-super/70' : ''}`} aria-label="技パレット">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1">
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <input
            className="input pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="技名を検索 / 直接入力（Enter で追加）"
            aria-label="技名を検索または直接入力"
            data-testid="move-search"
          />
        </div>
        <button
          type="button"
          className={`btn ${od ? 'border-c-drive bg-c-drive/15 text-c-drive' : ''}`}
          onClick={() => setOd(!od)}
          aria-pressed={od}
          title="次に押す必殺技を OD 版にする（ドライブ 2 本）"
        >
          OD
        </button>
      </div>

      {replaceMode && (
        <p className="mb-3 rounded-md border border-c-super/40 bg-c-super/10 px-3 py-1.5 text-xs text-c-super">
          差し替えモード: 次に押した技で、選択中の技を置き換えます
        </p>
      )}

      {q.trim() ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">{results.slice(0, 24).map(btn)}</div>
          {results.length === 0 && <p className="text-sm text-ink-3">一致する技がありません。</p>}
          <button
            type="button"
            className="btn btn-sm cat-connector"
            onClick={() => {
              onText(q)
              setQ('')
            }}
          >
            <Icon name="plus" className="size-3.5" />「{q.trim()}」をそのまま追加
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {SECTIONS.map(({ cat, cols }) => {
            let list = moves.filter((m) => m.category === cat)
            if (cat === 'normal') {
              const isBase = (m: MoveDef) => /^(st|cr)[lmh][pk]$/.test(m.id)
              const jumps = list.filter((m) => !isBase(m))
              const ground = list.filter(isBase)
              list = showJump ? [...ground, ...jumps] : ground
            }
            if (!list.length) return null
            return (
              <div key={cat}>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className={`${CATEGORY_META[cat].className} size-2 rounded-full`} style={{ background: 'var(--cat)' }} />
                  <h3 className="text-xs font-bold tracking-wider text-ink-2">{CATEGORY_META[cat].label}</h3>
                  {cat === 'normal' && (
                    <button type="button" className="ml-auto text-xs text-ink-3 underline-offset-2 hover:text-ink hover:underline" onClick={() => setShowJump(!showJump)}>
                      {showJump ? 'ジャンプ攻撃などを隠す' : 'ジャンプ攻撃・投げ・追加技を表示'}
                    </button>
                  )}
                </div>
                <div className={`grid gap-1.5 ${cols}`}>{list.map(btn)}</div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
