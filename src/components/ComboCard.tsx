import { Link } from 'react-router-dom'
import type { CharacterDef, Combo, MoveDef } from '../types'
import { useStore } from '../store/useStore'
import { comboToText, copyText, fmtGauge, situationLabel } from '../lib/text'
import { Avatar, GaugeBar, Stars, toast } from './ui'
import { Icon } from './Icon'
import { RouteView } from './RouteView'

interface Props {
  combo: Combo
  ch: CharacterDef | undefined
  moves: MoveDef[]
  showChar?: boolean
  selectable?: boolean
  selected?: boolean
  onSelect?: () => void
  onShare?: () => void
  onDelete?: () => void
  readOnly?: boolean
}

export function ComboCard({ combo: c, ch, moves, showChar, selectable, selected, onSelect, onShare, onDelete, readOnly }: Props) {
  const situations = useStore((s) => s.situations)
  const notation = useStore((s) => s.notation)
  const toggleFavorite = useStore((s) => s.toggleFavorite)
  const duplicate = useStore((s) => s.duplicateCombo)

  const copy = async () => {
    const ok = await copyText(comboToText(c, ch, moves, situations, notation))
    toast(ok ? 'テキストをコピーしました' : 'コピーに失敗しました', ok ? 'ok' : 'err')
  }

  return (
    <article
      className={`panel group relative flex flex-col gap-3 p-4 transition ${selected ? 'border-accent ring-1 ring-accent' : 'hover:border-line-2'}`}
      data-testid="combo-card"
    >
      <header className="flex items-start gap-3">
        {selectable && (
          <input
            type="checkbox"
            className="mt-1 size-4 accent-[var(--color-accent)]"
            checked={selected}
            onChange={onSelect}
            aria-label={`${c.name} を選択`}
          />
        )}
        {showChar && ch && <Avatar ch={ch} size="size-9" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-bold">{c.name || '（無題）'}</h3>
            {c.source === 'ai' && <span className="chip border-c-unique/50 text-c-unique">AI</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
            {showChar && ch && <span className="font-semibold text-ink">{ch.name}</span>}
            <span className="chip">{situationLabel(c.situation, situations)}</span>
            <Stars value={c.difficulty} size="size-3.5" />
          </div>
        </div>
        {!readOnly && (
          <button
            className={`btn btn-ghost btn-sm ${c.favorite ? 'text-c-super' : 'text-ink-3'}`}
            onClick={() => toggleFavorite(c.id)}
            aria-label={c.favorite ? 'お気に入り解除' : 'お気に入り登録'}
            aria-pressed={c.favorite}
          >
            <Icon name="star" filled={c.favorite} />
          </button>
        )}
      </header>

      <RouteView route={c.route} moves={moves} />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 text-xs">
        <div>
          <span className="text-ink-3">DMG </span>
          <span className="font-display text-lg font-bold text-ink">{c.damage ?? '-'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-ink-3">SA</span>
          <GaugeBar value={c.saGauge} max={3} kind="sa" />
          <span className="text-ink-2">{c.saGauge}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-ink-3">DRIVE</span>
          <GaugeBar value={c.driveGauge} max={6} kind="drive" />
          <span className="text-ink-2">{fmtGauge(c.driveGauge)}</span>
        </div>
      </div>

      {(c.tags.length > 0 || c.notes) && (
        <div className="space-y-1.5">
          {c.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {c.tags.map((t) => (
                <span key={t} className="chip">#{t}</span>
              ))}
            </div>
          )}
          {c.notes && <p className="line-clamp-3 text-sm whitespace-pre-wrap text-ink-2">{c.notes}</p>}
        </div>
      )}

      <footer className="flex flex-wrap gap-1.5">
        <button className="btn btn-sm" onClick={copy}>
          <Icon name="copy" className="size-3.5" />
          コピー
        </button>
        {onShare && (
          <button className="btn btn-sm" onClick={onShare}>
            <Icon name="share" className="size-3.5" />
            共有
          </button>
        )}
        {!readOnly && (
          <>
            <Link className="btn btn-sm" to={`/c/${c.characterId}/edit/${c.id}`}>
              <Icon name="edit" className="size-3.5" />
              編集
            </Link>
            <button
              className="btn btn-sm"
              onClick={() => {
                duplicate(c.id)
                toast('複製しました')
              }}
            >
              <Icon name="dup" className="size-3.5" />
              複製
            </button>
            {onDelete && (
              <button className="btn btn-sm btn-danger ml-auto" onClick={onDelete} aria-label="削除">
                <Icon name="trash" className="size-3.5" />
              </button>
            )}
          </>
        )}
      </footer>
    </article>
  )
}
