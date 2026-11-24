import { useState } from 'react'
import type { CharacterDef, Difficulty } from '../types'
import { activeFilterCount, EMPTY_FILTER, type ComboFilter, type SortKey } from '../lib/filter'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'

interface Props {
  value: ComboFilter
  onChange: (f: ComboFilter) => void
  tags: string[]
  characters?: CharacterDef[]
}

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'updated', label: '更新順' },
  { id: 'created', label: '作成順' },
  { id: 'damage', label: 'ダメージ順' },
  { id: 'difficulty', label: '易しい順' },
  { id: 'name', label: '名前順' },
]

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

export function FilterBar({ value: f, onChange, tags, characters }: Props) {
  const situations = useStore((s) => s.situations)
  const [open, setOpen] = useState(false)
  const set = (p: Partial<ComboFilter>) => onChange({ ...f, ...p })
  const count = activeFilterCount(f)

  return (
    <div className="panel p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <input
            className="input pl-9"
            placeholder="コンボ名・技名・タグ・備考で検索"
            value={f.q}
            onChange={(e) => set({ q: e.target.value })}
            aria-label="コンボを検索"
          />
        </div>
        {characters && (
          <select className="input w-auto" value={f.characterId} onChange={(e) => set({ characterId: e.target.value })} aria-label="キャラクター">
            <option value="">全キャラクター</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <select className="input w-auto" value={f.sort} onChange={(e) => set({ sort: e.target.value as SortKey })} aria-label="並び順">
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          className={`btn ${f.favoritesOnly ? 'border-c-super text-c-super' : ''}`}
          onClick={() => set({ favoritesOnly: !f.favoritesOnly })}
          aria-pressed={f.favoritesOnly}
        >
          <Icon name="star" filled={f.favoritesOnly} />
          <span className="hidden sm:inline">お気に入り</span>
        </button>
        <button className={`btn ${count ? 'border-accent text-accent-2' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
          <Icon name="filter" />
          絞り込み{count > 0 && <span className="rounded-full bg-accent px-1.5 text-[10px] text-white">{count}</span>}
        </button>
      </div>

      {open && (
        <div className="mt-3 grid gap-4 border-t border-line pt-3 md:grid-cols-2">
          <div>
            <span className="label">状況</span>
            <div className="flex flex-wrap gap-1.5">
              {situations.map((s) => (
                <button
                  key={s.id}
                  className={`chip ${f.situations.includes(s.id) ? 'chip-on' : ''}`}
                  onClick={() => set({ situations: toggle(f.situations, s.id) })}
                  aria-pressed={f.situations.includes(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="label">難易度</span>
            <div className="flex flex-wrap gap-1.5">
              {([1, 2, 3, 4, 5] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  className={`chip ${f.difficulties.includes(d) ? 'chip-on' : ''}`}
                  onClick={() => set({ difficulties: toggle(f.difficulties, d) })}
                  aria-pressed={f.difficulties.includes(d)}
                >
                  {'★'.repeat(d)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="label">ダメージ</span>
            <div className="flex items-center gap-2">
              <input className="input" type="number" inputMode="numeric" placeholder="最小" value={f.damageMin} onChange={(e) => set({ damageMin: e.target.value })} aria-label="ダメージ最小" />
              <span className="text-ink-3">〜</span>
              <input className="input" type="number" inputMode="numeric" placeholder="最大" value={f.damageMax} onChange={(e) => set({ damageMax: e.target.value })} aria-label="ダメージ最大" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="label">SA 消費 以下</span>
              <select className="input" value={f.saMax} onChange={(e) => set({ saMax: e.target.value })} aria-label="SA消費上限">
                <option value="">指定なし</option>
                {[0, 1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n} 本以下
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="label">ドライブ消費 以下</span>
              <select className="input" value={f.driveMax} onChange={(e) => set({ driveMax: e.target.value })} aria-label="ドライブ消費上限">
                <option value="">指定なし</option>
                {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} 本以下
                  </option>
                ))}
              </select>
            </div>
          </div>
          {tags.length > 0 && (
            <div className="md:col-span-2">
              <span className="label">タグ（すべて含む）</span>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <button key={t} className={`chip ${f.tags.includes(t) ? 'chip-on' : ''}`} onClick={() => set({ tags: toggle(f.tags, t) })} aria-pressed={f.tags.includes(t)}>
                    #{t}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="md:col-span-2">
            <button className="btn btn-sm btn-ghost" onClick={() => onChange({ ...EMPTY_FILTER, characterId: f.characterId, q: f.q, sort: f.sort })}>
              条件をリセット
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
