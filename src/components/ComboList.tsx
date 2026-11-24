import { useMemo, useState } from 'react'
import type { Combo } from '../types'
import { mergeCharacters, resolveMoves, useStore } from '../store/useStore'
import { allTags, filterCombos, type ComboFilter } from '../lib/filter'
import { routeToString } from '../lib/route'
import { FilterBar } from './FilterBar'
import { ComboCard } from './ComboCard'
import { Empty, Modal, toast } from './ui'
import { Icon } from './Icon'

interface Props {
  combos: Combo[]
  filter: ComboFilter
  setFilter: (f: ComboFilter) => void
  showChar?: boolean
  emptyAction?: React.ReactNode
  onShare?: (ids: string[]) => void
}

export function ComboList({ combos, filter, setFilter, showChar, emptyAction, onShare }: Props) {
  const customCharacters = useStore((s) => s.customCharacters)
  const charOverrides = useStore((s) => s.charOverrides)
  const customMoves = useStore((s) => s.customMoves)
  const hiddenMoves = useStore((s) => s.hiddenMoves)
  const notation = useStore((s) => s.notation)
  const deleteCombos = useStore((s) => s.deleteCombos)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [confirm, setConfirm] = useState<string[] | null>(null)

  const chars = useMemo(() => mergeCharacters({ customCharacters, charOverrides }), [customCharacters, charOverrides])
  const movesFor = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof resolveMoves>>()
    return (id: string) => {
      if (!cache.has(id)) cache.set(id, resolveMoves(chars.find((c) => c.id === id), { customMoves, hiddenMoves }, true))
      return cache.get(id)!
    }
  }, [chars, customMoves, hiddenMoves])

  const list = useMemo(
    () => filterCombos(combos, filter, (c) => routeToString(c.route, movesFor(c.characterId), notation, ' ') + ' ' + c.route.map((r) => r.label).join(' ')),
    [combos, filter, movesFor, notation],
  )
  const tags = useMemo(() => allTags(combos), [combos])
  const toggleSel = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <div className="space-y-3">
      <FilterBar value={filter} onChange={setFilter} tags={tags} characters={showChar ? chars.filter((c) => combos.some((x) => x.characterId === c.id)) : undefined} />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-3">
          {list.length} / {combos.length} 件
        </span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {selecting ? (
            <>
              <button className="btn btn-sm" onClick={() => setSelected(selected.length === list.length ? [] : list.map((c) => c.id))}>
                {selected.length === list.length && list.length ? '全解除' : '表示中を全選択'}
              </button>
              {onShare && (
                <button className="btn btn-sm btn-primary" disabled={!selected.length} onClick={() => onShare(selected)}>
                  <Icon name="share" className="size-3.5" />
                  {selected.length} 件を共有
                </button>
              )}
              <button className="btn btn-sm btn-danger" disabled={!selected.length} onClick={() => setConfirm(selected)}>
                削除
              </button>
              <button
                className="btn btn-sm"
                onClick={() => {
                  setSelecting(false)
                  setSelected([])
                }}
              >
                完了
              </button>
            </>
          ) : (
            combos.length > 0 && (
              <button className="btn btn-sm" onClick={() => setSelecting(true)}>
                <Icon name="check" className="size-3.5" />
                複数選択
              </button>
            )
          )}
        </div>
      </div>

      {combos.length === 0 ? (
        <Empty title="まだコンボが登録されていません">{emptyAction}</Empty>
      ) : list.length === 0 ? (
        <Empty title="条件に一致するコンボがありません" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <ComboCard
              key={c.id}
              combo={c}
              ch={chars.find((x) => x.id === c.characterId)}
              moves={movesFor(c.characterId)}
              showChar={showChar}
              selectable={selecting}
              selected={selected.includes(c.id)}
              onSelect={() => toggleSel(c.id)}
              onShare={onShare ? () => onShare([c.id]) : undefined}
              onDelete={() => setConfirm([c.id])}
            />
          ))}
        </div>
      )}

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="コンボを削除">
        <p className="mb-4 text-sm text-ink-2">
          {confirm?.length === 1 ? `「${combos.find((c) => c.id === confirm[0])?.name}」` : `${confirm?.length} 件のコンボ`}を削除します。元に戻せません。
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={() => setConfirm(null)}>
            キャンセル
          </button>
          <button
            className="btn btn-danger"
            data-testid="confirm-delete"
            onClick={() => {
              deleteCombos(confirm!)
              setSelected((s) => s.filter((x) => !confirm!.includes(x)))
              toast(`${confirm!.length} 件削除しました`)
              setConfirm(null)
            }}
          >
            削除する
          </button>
        </div>
      </Modal>
    </div>
  )
}
