import { useState } from 'react'
import { Icon } from './Icon'

export function TagInput({ value, onChange, suggestions }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[] }) {
  const [text, setText] = useState('')
  const add = (raw: string) => {
    const t = raw.trim().replace(/^#/, '')
    if (t && !value.includes(t)) onChange([...value, t])
    setText('')
  }
  const rest = suggestions.filter((s) => !value.includes(s)).slice(0, 12)
  return (
    <div>
      <div className="input flex min-h-10 flex-wrap items-center gap-1.5 py-1.5">
        {value.map((t) => (
          <span key={t} className="chip chip-on">
            #{t}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`タグ ${t} を削除`}>
              <Icon name="x" className="size-3" />
            </button>
          </span>
        ))}
        <input
          className="min-w-24 flex-1 bg-transparent outline-none placeholder:text-ink-3"
          value={text}
          placeholder={value.length ? '' : '例: 実戦向け, 端運び'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ',' || e.key === '、') && !e.nativeEvent.isComposing) {
              e.preventDefault()
              add(text)
            } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
          }}
          onBlur={() => text && add(text)}
          aria-label="タグを追加"
        />
      </div>
      {rest.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {rest.map((s) => (
            <button key={s} type="button" className="chip hover:text-ink" onClick={() => add(s)}>
              +{s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
