import { useMemo, useState, type DragEvent } from 'react'
import type { MoveDef, RouteStep } from '../types'
import { CATEGORY_META } from '../data'
import { stepLabel } from '../lib/route'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'

interface Props {
  route: RouteStep[]
  moves: MoveDef[]
  /** null = 末尾 */
  cursor: number | null
  setCursor: (c: number | null) => void
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  replaceMode: boolean
  setReplaceMode: (v: boolean) => void
  onChange: (route: RouteStep[]) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

export function RouteEditor(p: Props) {
  const { route, moves, cursor, setCursor, selectedId, setSelectedId, onChange } = p
  const notation = useStore((s) => s.notation)
  const map = useMemo(() => new Map(moves.map((m) => [m.id, m])), [moves])
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  const selIndex = route.findIndex((s) => s.id === selectedId)
  const sel = selIndex >= 0 ? route[selIndex] : null
  const effCursor = cursor ?? route.length

  const update = (id: string, patch: Partial<RouteStep>) => onChange(route.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const move = (from: number, to: number) => {
    if (to < 0 || to >= route.length || from === to) return
    const next = [...route]
    const [x] = next.splice(from, 1)
    next.splice(to, 0, x)
    onChange(next)
  }
  const remove = (i: number) => {
    onChange(route.filter((_, j) => j !== i))
    if (route[i]?.id === selectedId) setSelectedId(null)
    if (cursor !== null && i < cursor) setCursor(cursor - 1)
  }

  const onDrop = (slot: number) => (e: DragEvent) => {
    e.preventDefault()
    if (dragFrom === null) return
    const to = slot > dragFrom ? slot - 1 : slot
    move(dragFrom, to)
    setDragFrom(null)
    setDropAt(null)
  }

  const slot = (i: number) => {
    const active = effCursor === i
    const isDrop = dropAt === i && dragFrom !== null
    return (
      <button
        key={`slot-${i}`}
        type="button"
        className="group/slot relative flex h-9 w-3 shrink-0 items-center justify-center self-center"
        onClick={() => {
          setCursor(i === route.length ? null : i)
          p.setReplaceMode(false)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDropAt(i)
        }}
        onDrop={onDrop(i)}
        aria-label={`${i + 1} 番目に挿入`}
        title="ここに挿入"
      >
        <span
          className={`block w-0.5 rounded-full transition-all ${
            isDrop ? 'h-8 w-1 bg-c-drive' : active ? 'h-7 animate-pulse bg-accent' : 'h-3 bg-transparent group-hover/slot:h-6 group-hover/slot:bg-ink-3'
          }`}
        />
      </button>
    )
  }

  return (
    <section className="panel p-3" aria-label="コンボルート">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-xs font-bold tracking-wider text-ink-2">コンボルート</h2>
        <span className="text-xs text-ink-3">{route.length} 手</span>
        <div className="ml-auto flex gap-1">
          <button className="btn btn-sm" onClick={p.undo} disabled={!p.canUndo} title="元に戻す (Ctrl+Z)" aria-label="元に戻す">
            <Icon name="undo" className="size-3.5" />
          </button>
          <button className="btn btn-sm" onClick={p.redo} disabled={!p.canRedo} title="やり直す (Ctrl+Shift+Z)" aria-label="やり直す">
            <Icon name="redo" className="size-3.5" />
          </button>
          <button
            className="btn btn-sm btn-danger"
            disabled={!route.length}
            onClick={() => {
              onChange([])
              setSelectedId(null)
              setCursor(null)
            }}
          >
            クリア
          </button>
        </div>
      </div>

      <div
        className="flex min-h-14 flex-wrap items-center rounded-lg border border-dashed border-line-2 bg-[#0d0f14] px-1 py-2"
        data-testid="route"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setSelectedId(null)
            setCursor(null)
            p.setReplaceMode(false)
          }
        }}
      >
        {route.length === 0 && (
          <p className="px-3 text-sm text-ink-3">下の技ボタンを押すと、ここに順番に追加されます。</p>
        )}
        {route.map((s, i) => {
          const isSel = s.id === selectedId
          const isConn = s.category === 'connector'
          return (
            <div key={s.id} className="flex items-center">
              {slot(i)}
              {i > 0 && cursor !== i && <span className="-mx-1 text-ink-3" aria-hidden="true">›</span>}
              <button
                type="button"
                draggable
                onDragStart={() => setDragFrom(i)}
                onDragEnd={() => {
                  setDragFrom(null)
                  setDropAt(null)
                }}
                onClick={() => {
                  setSelectedId(isSel ? null : s.id)
                  p.setReplaceMode(false)
                }}
                className={`${CATEGORY_META[s.category].className} step step-text relative mx-0.5 cursor-grab ${
                  isConn ? 'border-dashed bg-transparent text-xs' : ''
                } ${s.category === 'unknown' ? 'border-dashed' : ''} ${isSel ? 'ring-2 ring-white/80' : ''} ${dragFrom === i ? 'opacity-40' : ''}`}
                aria-pressed={isSel}
                data-testid="route-step"
              >
                {stepLabel(s, map, notation)}
                {s.note && <Icon name="note" className="ml-1 inline size-3 text-ink-2" />}
                {s.ai && s.ai.confidence > 0 && s.ai.confidence < 1 && (
                  <span className="ml-1 text-[10px] font-normal text-ink-3">{Math.round(s.ai.confidence * 100)}%</span>
                )}
              </button>
            </div>
          )
        })}
        {route.length > 0 && slot(route.length)}
      </div>

      {cursor !== null && (
        <p className="mt-2 text-xs text-accent-2">
          {cursor + 1} 番目に挿入中 ・{' '}
          <button className="underline" onClick={() => setCursor(null)}>
            末尾に戻す
          </button>
        </p>
      )}

      {sel && (
        <div className="mt-3 rounded-lg border border-line-2 bg-panel-2 p-3" data-testid="step-editor">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ink-3">{selIndex + 1} 手目を編集</span>
            <div className="ml-auto flex flex-wrap gap-1">
              <button className="btn btn-sm" onClick={() => move(selIndex, selIndex - 1)} disabled={selIndex === 0} aria-label="前へ移動">
                <Icon name="left" className="size-3.5" />
              </button>
              <button className="btn btn-sm" onClick={() => move(selIndex, selIndex + 1)} disabled={selIndex === route.length - 1} aria-label="後ろへ移動">
                <Icon name="right" className="size-3.5" />
              </button>
              <button className="btn btn-sm" onClick={() => setCursor(selIndex)} title="この技の前に挿入">
                前に挿入
              </button>
              <button className="btn btn-sm" onClick={() => setCursor(selIndex + 1 >= route.length ? null : selIndex + 1)} title="この技の後に挿入">
                後に挿入
              </button>
              <button className={`btn btn-sm ${p.replaceMode ? 'border-c-super text-c-super' : ''}`} onClick={() => p.setReplaceMode(!p.replaceMode)} aria-pressed={p.replaceMode}>
                差し替え
              </button>
              <button className="btn btn-sm btn-danger" onClick={() => remove(selIndex)} aria-label="この技を削除">
                <Icon name="trash" className="size-3.5" />
              </button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <label className="block">
              <span className="label">技名</span>
              <input
                className="input"
                value={sel.moveId && map.get(sel.moveId) ? stepLabel({ ...sel, od: false }, map, notation) : sel.label}
                onChange={(e) => update(sel.id, { label: e.target.value, moveId: undefined, category: sel.category === 'unknown' ? 'connector' : sel.category })}
                aria-label="技名を修正"
              />
            </label>
            <label className="block">
              <span className="label">この技の備考</span>
              <input
                className="input"
                value={sel.note ?? ''}
                placeholder="例: 最速で / 1 段目だけ当てる"
                onChange={(e) => update(sel.id, { note: e.target.value || undefined })}
                aria-label="技ごとの備考"
              />
            </label>
          </div>
          {sel.category === 'special' && (
            <label className="mt-2 inline-flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" className="accent-[var(--color-c-drive)]" checked={!!sel.od} onChange={(e) => update(sel.id, { od: e.target.checked || undefined })} />
              OD 版（ドライブ 2 本）
            </label>
          )}
        </div>
      )}
    </section>
  )
}
