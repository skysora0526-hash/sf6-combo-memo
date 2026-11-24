import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCharacters, useStore } from '../store/useStore'
import { normalize } from '../lib/route'
import { Avatar, Modal } from '../components/ui'
import { Icon } from '../components/Icon'

export default function CharacterSelect() {
  const chars = useCharacters()
  const combos = useStore((s) => s.combos)
  const addCustomCharacter = useStore((s) => s.addCustomCharacter)
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [onlyUsed, setOnlyUsed] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', nameEn: '', color: '#ff2d78' })

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    combos.forEach((c) => m.set(c.characterId, (m.get(c.characterId) ?? 0) + 1))
    return m
  }, [combos])

  const list = chars.filter((c) => {
    if (onlyUsed && !counts.get(c.id)) return false
    const nq = normalize(q)
    return !nq || normalize(c.name).includes(nq) || normalize(c.nameEn).includes(nq)
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="font-display text-xs font-bold tracking-[0.3em] text-accent">SELECT YOUR FIGHTER</p>
          <h1 className="text-2xl font-bold">キャラクター選択</h1>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
            <input className="input w-48 pl-9" placeholder="キャラ名で検索" value={q} onChange={(e) => setQ(e.target.value)} aria-label="キャラクターを検索" />
          </div>
          <button className={`btn ${onlyUsed ? 'border-accent text-accent-2' : ''}`} onClick={() => setOnlyUsed(!onlyUsed)} aria-pressed={onlyUsed}>
            登録済みのみ
          </button>
          <button className="btn" onClick={() => setAdding(true)}>
            <Icon name="plus" />
            キャラ追加
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {list.map((c) => {
          const n = counts.get(c.id) ?? 0
          return (
            <Link
              key={c.id}
              to={`/c/${c.id}`}
              className="group panel relative flex flex-col items-center gap-2 overflow-hidden p-3 transition hover:-translate-y-0.5 hover:border-[var(--c)]"
              style={{ ['--c' as string]: c.color }}
              data-testid="char-tile"
            >
              <div className="absolute inset-x-0 top-0 h-0.5 opacity-60 transition group-hover:opacity-100" style={{ background: c.color }} />
              <Avatar ch={c} size="size-14" className="transition group-hover:scale-105" />
              <div className="w-full text-center">
                <p className="truncate text-sm font-bold">{c.name}</p>
                <p className="font-display truncate text-[11px] tracking-wider text-ink-3 uppercase">{c.nameEn}</p>
              </div>
              {n > 0 && <span className="absolute top-2 right-2 rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">{n}</span>}
            </Link>
          )
        })}
      </div>
      {list.length === 0 && <p className="text-center text-ink-3">該当するキャラクターがいません。</p>}

      <p className="text-xs text-ink-3">
        キャラ画像は著作権に配慮して同梱していません。各キャラのページで画像 URL を設定できます。技データは初期データです。キャラのページの「技リスト」で追加・非表示を設定できます。
      </p>

      <Modal open={adding} onClose={() => setAdding(false)} title="キャラクターを追加">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!form.name.trim()) return
            const ch = addCustomCharacter(form.name.trim(), form.nameEn.trim(), form.color)
            setAdding(false)
            navigate(`/c/${ch.id}`)
          }}
        >
          <label className="block">
            <span className="label">名前</span>
            <input className="input" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="block">
            <span className="label">英語名（アバター表示用）</span>
            <input className="input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
          </label>
          <label className="block">
            <span className="label">テーマカラー</span>
            <input type="color" className="h-10 w-20 rounded border border-line-2 bg-transparent" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          </label>
          <button className="btn btn-primary w-full">追加</button>
        </form>
      </Modal>
    </div>
  )
}
