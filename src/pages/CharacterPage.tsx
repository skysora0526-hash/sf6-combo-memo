import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { MoveCategory } from '../types'
import { useCharacter, useMoves, useStore } from '../store/useStore'
import { EMPTY_FILTER } from '../lib/filter'
import { CATEGORY_META } from '../data'
import { ComboList } from '../components/ComboList'
import { ShareDialog } from '../components/ShareDialog'
import { Avatar, Modal, toast } from '../components/ui'
import { Icon } from '../components/Icon'

type Tab = 'combos' | 'memo' | 'moves'
const NO_HIDDEN: string[] = []

export default function CharacterPage() {
  const { charId } = useParams()
  const ch = useCharacter(charId)
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'combos'
  const allCombos = useStore((s) => s.combos)
  const combos = useMemo(() => allCombos.filter((c) => c.characterId === charId), [allCombos, charId])
  const [filter, setFilter] = useState(EMPTY_FILTER)
  const [share, setShare] = useState<string[] | null>(null)
  const [imgOpen, setImgOpen] = useState(false)

  if (!ch) return <p className="text-ink-2">キャラクターが見つかりません。</p>

  const tabs: { id: Tab; label: string }[] = [
    { id: 'combos', label: `コンボ (${combos.length})` },
    { id: 'memo', label: 'キャラメモ' },
    { id: 'moves', label: '技リスト' },
  ]

  return (
    <div className="space-y-4">
      <div className="panel relative overflow-hidden p-4">
        <div className="pointer-events-none absolute inset-0 opacity-25" style={{ background: `linear-gradient(110deg, ${ch.color} 0%, transparent 55%)` }} />
        <div className="relative flex flex-wrap items-center gap-4">
          <button onClick={() => setImgOpen(true)} className="group relative" title="画像を設定">
            <Avatar ch={ch} size="size-16" />
            <span className="absolute inset-0 hidden items-center justify-center rounded-lg bg-black/60 text-[10px] group-hover:flex">画像設定</span>
          </button>
          <div className="min-w-0">
            <p className="font-display text-xs font-bold tracking-[0.3em] text-ink-2 uppercase">{ch.nameEn}</p>
            <h1 className="text-2xl font-bold">{ch.name}</h1>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Link to={`/c/${ch.id}/ai`} className="btn">
              <Icon name="ai" />
              AI 認識から作成
            </Link>
            <Link to={`/c/${ch.id}/new`} className="btn btn-primary" data-testid="new-combo">
              <Icon name="plus" />
              コンボを登録
            </Link>
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-line" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${tab === t.id ? 'border-accent text-ink' : 'border-transparent text-ink-3 hover:text-ink'}`}
            onClick={() => setParams(t.id === 'combos' ? {} : { tab: t.id }, { replace: true })}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'combos' && (
        <ComboList
          combos={combos}
          filter={filter}
          setFilter={setFilter}
          onShare={setShare}
          emptyAction={
            <Link to={`/c/${ch.id}/new`} className="btn btn-primary">
              <Icon name="plus" />
              最初のコンボを登録
            </Link>
          }
        />
      )}
      {tab === 'memo' && <CharMemo charId={ch.id} />}
      {tab === 'moves' && <MoveManager charId={ch.id} />}

      <ShareDialog ids={share} onClose={() => setShare(null)} />
      <ImageDialog open={imgOpen} onClose={() => setImgOpen(false)} charId={ch.id} current={ch.image} custom={!!ch.custom} />
    </div>
  )
}

function CharMemo({ charId }: { charId: string }) {
  const saved = useStore((s) => s.charMemos[charId] ?? '')
  const setMemo = useStore((s) => s.setCharMemo)
  const [text, setText] = useState(saved)
  useEffect(() => setText(saved), [charId]) // eslint-disable-line react-hooks/exhaustive-deps
  // 入力のたびに保存（軽いデバウンス）
  useEffect(() => {
    if (text === saved) return
    const t = setTimeout(() => setMemo(charId, text), 400)
    return () => clearTimeout(t)
  }, [text, saved, charId, setMemo])
  return (
    <div className="panel p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="label">キャラクター専用メモ（立ち回り・対策・確定反撃など）</span>
        <span className="text-xs text-ink-3">{text === saved ? '保存済み' : '保存中…'}</span>
      </div>
      <textarea
        className="input min-h-80 font-mono leading-relaxed"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'例:\n・ガード後の確定反撃\n・対空の選択肢\n・起き攻めのセットプレイ'}
        data-testid="char-memo"
      />
    </div>
  )
}

function MoveManager({ charId }: { charId: string }) {
  const ch = useCharacter(charId)
  const moves = useMoves(ch, true)
  const hiddenRaw = useStore((s) => s.hiddenMoves[charId])
  const hidden = hiddenRaw ?? NO_HIDDEN
  const toggleHidden = useStore((s) => s.toggleHiddenMove)
  const addCustomMove = useStore((s) => s.addCustomMove)
  const removeCustomMove = useStore((s) => s.removeCustomMove)
  const [form, setForm] = useState({ name: '', short: '', numpad: '', category: 'special' as MoveCategory })
  const cats: MoveCategory[] = ['special', 'unique', 'super', 'normal', 'drive', 'system', 'connector']

  return (
    <div className="space-y-4">
      {ch?.dataStatus === 'draft' && (
        <p className="rounded-lg border border-c-super/30 bg-c-super/5 px-3 py-2 text-xs text-c-super">
          このキャラの技データは初期データ（要確認）です。足りない技は下のフォームから追加できます。使わない技は「非表示」にすると技パレットに出なくなります。
        </p>
      )}
      <form
        className="panel grid gap-2 p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault()
          if (!form.name.trim()) return
          addCustomMove(charId, {
            name: form.name.trim(),
            short: form.short.trim() || undefined,
            numpad: form.numpad.trim() || undefined,
            category: form.category,
          })
          toast(`「${form.name}」を追加しました`)
          setForm({ ...form, name: '', short: '', numpad: '' })
        }}
      >
        <input className="input" placeholder="技名（例: 灼熱波動拳）" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="技名" />
        <input className="input" placeholder="略称" value={form.short} onChange={(e) => setForm({ ...form, short: e.target.value })} aria-label="略称" />
        <input className="input" placeholder="コマンド（236P）" value={form.numpad} onChange={(e) => setForm({ ...form, numpad: e.target.value })} aria-label="コマンド" />
        <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as MoveCategory })} aria-label="分類">
          {cats.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_META[c].label}
            </option>
          ))}
        </select>
        <button className="btn btn-primary">
          <Icon name="plus" />
          技を追加
        </button>
      </form>

      {cats.map((cat) => {
        const list = moves.filter((m) => m.category === cat)
        if (!list.length) return null
        return (
          <div key={cat}>
            <h3 className="mb-1.5 text-xs font-bold tracking-wider text-ink-2">{CATEGORY_META[cat].label}</h3>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((m) => {
                const isHidden = hidden.includes(m.id)
                return (
                  <div key={m.id} className={`${CATEGORY_META[cat].className} flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 ${isHidden ? 'opacity-40' : ''}`}>
                    <span className="size-2 shrink-0 rounded-full" style={{ background: 'var(--cat)' }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {m.name}
                        {m.custom && <span className="ml-1.5 text-[10px] text-accent-2">追加</span>}
                      </p>
                      <p className="truncate text-xs text-ink-3">{[m.short, m.numpad].filter(Boolean).join(' / ') || ' '}</p>
                    </div>
                    <button className="btn btn-sm btn-ghost" onClick={() => toggleHidden(charId, m.id)}>
                      {isHidden ? '表示' : '非表示'}
                    </button>
                    {m.custom && (
                      <button className="btn btn-sm btn-ghost text-red-300" onClick={() => removeCustomMove(charId, m.id)} aria-label={`${m.name} を削除`}>
                        <Icon name="trash" className="size-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ImageDialog({ open, onClose, charId, current, custom }: { open: boolean; onClose: () => void; charId: string; current?: string; custom: boolean }) {
  const setImage = useStore((s) => s.setCharImage)
  const deleteChar = useStore((s) => s.deleteCustomCharacter)
  const navigate = useNavigate()
  const [url, setUrl] = useState(current ?? '')
  useEffect(() => setUrl(current ?? ''), [current, open])

  const onFile = (f: File) => {
    // localStorage 容量対策として 128px に縮小して保存
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      const s = 128
      c.width = c.height = s
      const r = Math.max(s / img.width, s / img.height)
      c.getContext('2d')!.drawImage(img, (s - img.width * r) / 2, (s - img.height * r) / 2, img.width * r, img.height * r)
      setUrl(c.toDataURL('image/webp', 0.85))
      URL.revokeObjectURL(img.src)
    }
    img.src = URL.createObjectURL(f)
  }

  return (
    <Modal open={open} onClose={onClose} title="キャラクター画像">
      <div className="space-y-3">
        <input className="input" placeholder="画像 URL（https://...）" value={url.startsWith('data:') ? '（アップロード画像）' : url} onChange={(e) => setUrl(e.target.value)} />
        <label className="btn w-full cursor-pointer">
          <Icon name="upload" />
          画像ファイルを選択（128px に縮小して保存）
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        {url && <img src={url} alt="" className="size-20 rounded-lg object-cover" />}
        <div className="flex justify-between gap-2">
          <button className="btn btn-ghost" onClick={() => setUrl('')}>
            画像を外す
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setImage(charId, url)
              onClose()
            }}
          >
            保存
          </button>
        </div>
        {custom && (
          <div className="border-t border-line pt-3">
            <button
              className="btn btn-danger btn-sm"
              onClick={() => {
                if (confirm('このキャラクターと登録済みコンボをすべて削除します。よろしいですか？')) {
                  deleteChar(charId)
                  navigate('/')
                }
              }}
            >
              このキャラクターを削除
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
