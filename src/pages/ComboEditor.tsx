import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom'
import type { Combo, Difficulty, MoveDef, RouteStep } from '../types'
import { useCharacter, useMoves, useStore } from '../store/useStore'
import { useDraft } from '../store/draft'
import { useHistory } from '../lib/useHistory'
import { estimateGauges, routeToString, stepFromMove, stepFromText } from '../lib/route'
import { allTags } from '../lib/filter'
import { MovePalette } from '../components/MovePalette'
import { RouteEditor } from '../components/RouteEditor'
import { TagInput } from '../components/TagInput'
import { Avatar, Modal, Stars, toast } from '../components/ui'
import { Icon } from '../components/Icon'
import { fmtGauge } from '../lib/text'

type Meta = Pick<Combo, 'name' | 'situation' | 'difficulty' | 'damage' | 'saGauge' | 'driveGauge' | 'notes' | 'tags' | 'favorite' | 'source'>

const DEFAULT_META: Meta = {
  name: '',
  situation: 'midscreen',
  difficulty: 2,
  damage: null,
  saGauge: 0,
  driveGauge: 0,
  notes: '',
  tags: [],
  favorite: false,
  source: 'manual',
}

export default function ComboEditor() {
  const { charId, comboId } = useParams()
  const navigate = useNavigate()
  const ch = useCharacter(charId)
  const moves = useMoves(ch)
  const combos = useStore((s) => s.combos)
  const situations = useStore((s) => s.situations)
  const addSituation = useStore((s) => s.addSituation)
  const addCombo = useStore((s) => s.addCombo)
  const updateCombo = useStore((s) => s.updateCombo)
  const notation = useStore((s) => s.notation)
  const { draft, setDraft } = useDraft()

  const existing = comboId ? combos.find((c) => c.id === comboId) : undefined
  const [meta, setMeta] = useState<Meta>(() => (existing ? { ...existing } : DEFAULT_META))
  const hist = useHistory<RouteStep[]>(existing?.route ?? [])
  const route = hist.state
  const [cursor, setCursor] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replaceMode, setReplaceMode] = useState(false)
  const [dirty, setDirty] = useState(false)
  const leaving = useRef(false)
  const [newSit, setNewSit] = useState<string | null>(null)

  // AI 認識結果の受け取り（StrictMode の二重実行でも 1 回だけ）
  const draftTaken = useRef(false)
  useEffect(() => {
    if (!draftTaken.current && !comboId && draft && draft.characterId === charId) {
      draftTaken.current = true
      hist.reset(draft.route)
      setMeta((m) => ({ ...m, source: 'ai' }))
      setDirty(true)
      setDraft(null)
      toast('AI 認識の結果を読み込みました。内容を確認してください', 'info')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setRoute = useCallback(
    (r: RouteStep[] | ((p: RouteStep[]) => RouteStep[])) => {
      hist.set(r)
      setDirty(true)
    },
    [hist],
  )
  const patch = (p: Partial<Meta>) => {
    setMeta((m) => ({ ...m, ...p }))
    setDirty(true)
  }

  const insert = (step: RouteStep) => {
    if (replaceMode && selectedId) {
      setRoute((r) => r.map((s) => (s.id === selectedId ? { ...step, id: s.id, note: s.note } : s)))
      setReplaceMode(false)
      return
    }
    setRoute((r) => {
      const at = cursor ?? r.length
      return [...r.slice(0, at), step, ...r.slice(at)]
    })
    if (cursor !== null) setCursor(cursor + 1)
    setSelectedId(null)
  }
  const onPick = (m: MoveDef, od: boolean) => insert(stepFromMove(m, od))
  const onText = (t: string) => t.trim() && insert(stepFromText(t))

  // キーボードショートカット
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable]')) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) hist.redo()
        else hist.undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        hist.redo()
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        if (!route.length) return
        e.preventDefault()
        if (selectedId) {
          setRoute((r) => r.filter((s) => s.id !== selectedId))
          setSelectedId(null)
        } else {
          const at = (cursor ?? route.length) - 1
          if (at < 0) return
          setRoute((r) => r.filter((_, i) => i !== at))
          if (cursor !== null) setCursor(Math.max(0, cursor - 1))
        }
      } else if (e.key === 'Escape') {
        setSelectedId(null)
        setReplaceMode(false)
        setCursor(null)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [hist, route.length, selectedId, cursor, setRoute])

  const est = useMemo(() => estimateGauges(route, moves), [route, moves])
  const tagSuggestions = useMemo(() => allTags(combos), [combos])

  const autoName = () => {
    const first = route.find((s) => s.category !== 'connector')
    const sit = situations.find((s) => s.id === meta.situation)?.label
    return [first && `${routeToString([first], moves, 'short')}始動`, sit].filter(Boolean).join('・') || '新しいコンボ'
  }

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  if (!ch) return <p className="text-ink-2">キャラクターが見つかりません。</p>
  if (comboId && !existing) return <p className="text-ink-2">コンボが見つかりません（削除された可能性があります）。</p>

  const save = (andNew = false) => {
    const data = { ...meta, name: meta.name.trim() || autoName(), characterId: ch.id, route }
    if (existing) updateCombo(existing.id, data)
    else addCombo(data)
    setDirty(false)
    toast(existing ? 'コンボを更新しました' : 'コンボを保存しました')
    if (andNew) {
      hist.reset([])
      setMeta({ ...DEFAULT_META, situation: meta.situation })
      setCursor(null)
      setSelectedId(null)
      return
    }
    leaving.current = true
    // 遷移が描画される前に別の画面へ移っても入力内容が残らないようにクリア
    hist.reset([])
    setMeta(DEFAULT_META)
    navigate(`/c/${ch.id}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/c/${ch.id}`} className="btn btn-ghost btn-sm" aria-label="戻る">
          <Icon name="left" />
        </Link>
        <Avatar ch={ch} size="size-10" />
        <div>
          <p className="text-xs text-ink-3">{ch.name}</p>
          <h1 className="text-xl font-bold">{existing ? 'コンボを編集' : '新しいコンボ'}</h1>
        </div>
        <div className="ml-auto flex gap-2">
          {!existing && (
            <button className="btn" onClick={() => save(true)} disabled={!route.length}>
              保存して続けて入力
            </button>
          )}
          <button className="btn btn-primary" onClick={() => save()} data-testid="save-combo">
            <Icon name="check" />
            保存
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <div className="sticky top-14 z-20 -mx-1 px-1 pt-1">
            <RouteEditor
              route={route}
              moves={moves}
              cursor={cursor}
              setCursor={setCursor}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              replaceMode={replaceMode}
              setReplaceMode={setReplaceMode}
              onChange={setRoute}
              undo={hist.undo}
              redo={hist.redo}
              canUndo={hist.canUndo}
              canRedo={hist.canRedo}
            />
          </div>
          <MovePalette moves={moves} onPick={onPick} onText={onText} replaceMode={replaceMode && !!selectedId} />
          <p className="text-xs text-ink-3">
            ショートカット: Backspace = 1 手削除 / Ctrl+Z = 元に戻す / Ctrl+Shift+Z = やり直す / Esc = 選択解除。技はドラッグで並べ替えできます。
          </p>
        </div>

        <aside id="meta" className="panel h-fit scroll-mt-20 space-y-4 p-4 lg:sticky lg:top-16">
          <label className="block">
            <span className="label">コンボ名</span>
            <div className="flex gap-1.5">
              <input className="input" value={meta.name} placeholder={autoName()} onChange={(e) => patch({ name: e.target.value })} data-testid="combo-name" />
              <button className="btn btn-sm shrink-0" type="button" onClick={() => patch({ name: autoName() })} title="ルートと状況から名前を作る">
                自動
              </button>
            </div>
          </label>

          <div>
            <span className="label">状況</span>
            <div className="flex flex-wrap gap-1.5">
              {situations.map((s) => (
                <button key={s.id} type="button" className={`chip ${meta.situation === s.id ? 'chip-on' : ''}`} onClick={() => patch({ situation: s.id })} aria-pressed={meta.situation === s.id}>
                  {s.label}
                </button>
              ))}
              <button type="button" className="chip border-dashed" onClick={() => setNewSit('')}>
                ＋追加
              </button>
            </div>
          </div>

          <div>
            <span className="label">難易度</span>
            <Stars value={meta.difficulty} onChange={(v) => patch({ difficulty: v as Difficulty })} size="size-6" />
          </div>

          <label className="block">
            <span className="label">ダメージ</span>
            <input
              className="input font-display text-lg font-bold"
              type="number"
              inputMode="numeric"
              min={0}
              value={meta.damage ?? ''}
              placeholder="例: 2400"
              onChange={(e) => patch({ damage: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
              data-testid="combo-damage"
            />
          </label>

          <div>
            <div className="flex items-center justify-between">
              <span className="label">SA ゲージ</span>
              <span className="text-xs text-ink-3">ルートから推定: {est.sa}</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[0, 1, 2, 3].map((n) => (
                <button key={n} type="button" className={`btn btn-sm ${meta.saGauge === n ? 'border-c-super bg-c-super/15 text-c-super' : ''}`} onClick={() => patch({ saGauge: n })} aria-pressed={meta.saGauge === n}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="label">ドライブゲージ</span>
              <span className="text-xs text-ink-3">ルートから推定: {fmtGauge(est.drive)}</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={6}
                step={0.5}
                className="flex-1 accent-[var(--color-c-drive)]"
                value={meta.driveGauge}
                onChange={(e) => patch({ driveGauge: Number(e.target.value) })}
                aria-label="ドライブゲージ"
              />
              <span className="font-display w-10 text-right text-lg font-bold text-c-drive">{fmtGauge(meta.driveGauge)}</span>
            </div>
            <button
              type="button"
              className="mt-1 text-xs text-ink-3 underline-offset-2 hover:text-ink hover:underline"
              onClick={() => patch({ saGauge: est.sa, driveGauge: est.drive })}
            >
              ルートから推定した値を入れる
            </button>
          </div>

          <div>
            <span className="label">タグ</span>
            <TagInput value={meta.tags} onChange={(tags) => patch({ tags })} suggestions={tagSuggestions} />
          </div>

          <label className="block">
            <span className="label">備考</span>
            <textarea className="input min-h-24" value={meta.notes} placeholder="タイミング、ヒット確認、状況の注意など" onChange={(e) => patch({ notes: e.target.value })} data-testid="combo-notes" />
          </label>

          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" className="accent-[var(--color-c-super)]" checked={meta.favorite} onChange={(e) => patch({ favorite: e.target.checked })} />
            お気に入りに登録
          </label>
          <p className="text-xs text-ink-3">表記: {notation === 'name' ? '正式名' : notation === 'short' ? '略称' : 'テンキー'}（右上で切り替え）</p>
        </aside>
      </div>

      {/* スマホ: 下部固定の保存バー（ボトムナビの上） */}
      <div className="fixed inset-x-0 bottom-[57px] sm:bottom-0 z-30 flex items-center gap-2 border-t border-line bg-bg/95 px-4 py-2 backdrop-blur lg:hidden">
        <span className="text-xs text-ink-3">{route.length} 手</span>
        <a href="#meta" onClick={(e) => { e.preventDefault(); document.getElementById('meta')?.scrollIntoView({ behavior: 'smooth' }) }} className="btn btn-sm btn-ghost">
          詳細を入力
        </a>
        <button className="btn btn-primary btn-sm ml-auto" onClick={() => save()} data-testid="save-combo-mobile">
          <Icon name="check" className="size-3.5" />
          保存
        </button>
      </div>
      <div className="h-12 lg:hidden" />

      <Modal open={newSit !== null} onClose={() => setNewSit(null)} title="状況を追加">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!newSit?.trim()) return
            const s = addSituation(newSit.trim())
            patch({ situation: s.id })
            setNewSit(null)
          }}
          className="space-y-3"
        >
          <input className="input" autoFocus value={newSit ?? ''} onChange={(e) => setNewSit(e.target.value)} placeholder="例: 起き攻め後" />
          <button className="btn btn-primary w-full">追加</button>
        </form>
      </Modal>

      <Modal open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} title="保存されていない変更があります">
        <p className="mb-4 text-sm text-ink-2">このページを離れると、編集中の内容は失われます。</p>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={() => blocker.reset?.()}>
            編集に戻る
          </button>
          <button className="btn btn-danger" onClick={() => blocker.proceed?.()}>
            破棄して移動
          </button>
        </div>
      </Modal>
    </div>
  )
}
