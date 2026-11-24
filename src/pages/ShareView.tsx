import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { mergeCharacters, resolveMoves, useStore } from '../store/useStore'
import { decodeShare, ShareDecodeError, type SharedCombo } from '../lib/share'
import { importShared } from '../lib/importShared'
import type { CharacterDef, Combo } from '../types'
import { ComboCard } from '../components/ComboCard'
import { Empty, toast } from '../components/ui'
import { Icon } from '../components/Icon'

export default function ShareView() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('d') ?? ''
  const st = useStore()
  const chars = useMemo(() => mergeCharacters(st), [st])
  const [picked, setPicked] = useState<number[] | null>(null)

  const result = useMemo((): { list: SharedCombo[]; error?: string } => {
    try {
      return { list: decodeShare(token) }
    } catch (e) {
      return { list: [], error: e instanceof ShareDecodeError ? e.message : '共有データを読み込めませんでした' }
    }
  }, [token])

  if (result.error)
    return (
      <Empty title={result.error}>
        <Link to="/" className="btn">
          トップへ
        </Link>
      </Empty>
    )

  const list = result.list
  const sel = picked ?? list.map((_, i) => i)
  const toggle = (i: number) => setPicked(sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i])

  const doImport = () => {
    const n = importShared(sel.map((i) => list[i]))
    toast(`${n} 件を自分のメモ帳に追加しました`)
    const firstChar = useStore.getState().combos[0]?.characterId
    navigate(firstChar && sel.length && sel.every((i) => list[i].characterId === list[sel[0]].characterId) ? `/c/${firstChar}` : '/combos')
  }

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center gap-3 p-4">
        <div>
          <p className="font-display text-xs font-bold tracking-[0.3em] text-accent">SHARED COMBOS</p>
          <h1 className="text-xl font-bold">共有されたコンボ（{list.length} 件）</h1>
          <p className="text-xs text-ink-3">閲覧専用です。自分のメモ帳にコピーすると編集できます。</p>
        </div>
        <button className="btn btn-primary ml-auto" onClick={doImport} disabled={!sel.length} data-testid="import-shared">
          <Icon name="download" />
          {sel.length === list.length ? 'すべて' : `${sel.length} 件を`}自分のメモ帳にコピー
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((s, i) => {
          const ch: CharacterDef =
            chars.find((c) => c.id === s.characterId) ??
            ({ id: s.characterId, name: s.charName, nameEn: s.charName, color: '#8b95a7', order: 0, moves: [] } as CharacterDef)
          const sit = st.situations.find((x) => x.label === s.situationLabel)
          const combo: Combo = {
            ...s,
            id: `shared-${i}`,
            situation: sit?.id ?? s.situationLabel,
            favorite: false,
            source: 'shared',
            createdAt: 0,
            updatedAt: 0,
          }
          return (
            <ComboCard
              key={i}
              combo={combo}
              ch={ch}
              moves={resolveMoves(ch, st, true)}
              showChar
              readOnly
              selectable={list.length > 1}
              selected={sel.includes(i)}
              onSelect={() => toggle(i)}
            />
          )
        })}
      </div>
    </div>
  )
}
