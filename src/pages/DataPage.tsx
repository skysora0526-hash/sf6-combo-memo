import { useState } from 'react'
import { useStore, STORAGE_KEY } from '../store/useStore'
import { EXPORT_APP, sanitizeCombo } from '../lib/share'
import { Modal, toast } from '../components/ui'
import { Icon } from '../components/Icon'
import type { Combo } from '../types'

export default function DataPage() {
  const st = useStore()
  const [pending, setPending] = useState<{ combos: Combo[]; full: Record<string, unknown> | null } | null>(null)
  const [wipe, setWipe] = useState(false)

  const bytes = (() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) ?? '').length * 2
    } catch {
      return 0
    }
  })()

  const exportAll = () => {
    const data = {
      combos: st.combos,
      charMemos: st.charMemos,
      customCharacters: st.customCharacters,
      charOverrides: st.charOverrides,
      customMoves: st.customMoves,
      hiddenMoves: st.hiddenMoves,
      situations: st.situations,
    }
    const blob = new Blob([JSON.stringify({ app: EXPORT_APP, version: 1, exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `sf6-combo-memo-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    toast('書き出しました')
  }

  const onFile = async (f: File) => {
    try {
      const json = JSON.parse(await f.text())
      const data = json?.data ?? json
      const rawCombos: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.combos) ? data.combos : []
      const combos = rawCombos.map(sanitizeCombo).filter((c): c is Combo => !!c)
      if (!combos.length && !data?.charMemos) throw new Error('empty')
      setPending({ combos, full: json?.app === EXPORT_APP && data?.situations ? data : null })
    } catch {
      toast('読み込めないファイルです（SF6 Combo Memo の JSON を選んでください）', 'err')
    }
  }

  const merge = () => {
    if (!pending) return
    const full = pending.full
    if (full) {
      // キャラ・技・状況・メモは不足分のみ追加
      const s = useStore.getState()
      const cc = (full.customCharacters as typeof s.customCharacters) ?? []
      const sits = (full.situations as typeof s.situations) ?? []
      s.replaceAll({
        customCharacters: [...s.customCharacters, ...cc.filter((c) => !s.customCharacters.some((x) => x.id === c.id))],
        situations: [...s.situations, ...sits.filter((x) => !s.situations.some((y) => y.id === x.id))],
        customMoves: { ...((full.customMoves as object) ?? {}), ...s.customMoves },
        charMemos: { ...((full.charMemos as object) ?? {}), ...s.charMemos },
      })
    }
    const n = st.importCombos(pending.combos)
    toast(`${n} 件のコンボを追加しました`)
    setPending(null)
  }

  const replace = () => {
    if (!pending) return
    const f = pending.full ?? {}
    st.replaceAll({
      combos: pending.combos,
      charMemos: (f.charMemos as never) ?? {},
      customCharacters: (f.customCharacters as never) ?? [],
      charOverrides: (f.charOverrides as never) ?? {},
      customMoves: (f.customMoves as never) ?? {},
      hiddenMoves: (f.hiddenMoves as never) ?? {},
      situations: (f.situations as never) ?? st.situations,
    })
    toast('データを置き換えました')
    setPending(null)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <p className="font-display text-xs font-bold tracking-[0.3em] text-accent">DATA</p>
        <h1 className="text-2xl font-bold">データ管理</h1>
      </div>

      <section className="panel space-y-3 p-4">
        <h2 className="font-bold">保存状況</h2>
        <p className="text-sm text-ink-2">
          データはこのブラウザ（localStorage）に保存されます。ページを再読み込みしても消えませんが、ブラウザのデータを消去すると消えます。定期的にバックアップを書き出してください。
        </p>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-panel-2 p-3">
            <dt className="text-xs text-ink-3">コンボ</dt>
            <dd className="font-display text-2xl font-bold">{st.combos.length}</dd>
          </div>
          <div className="rounded-lg bg-panel-2 p-3">
            <dt className="text-xs text-ink-3">キャラメモ</dt>
            <dd className="font-display text-2xl font-bold">{Object.values(st.charMemos).filter(Boolean).length}</dd>
          </div>
          <div className="rounded-lg bg-panel-2 p-3">
            <dt className="text-xs text-ink-3">使用容量</dt>
            <dd className="font-display text-2xl font-bold">{(bytes / 1024).toFixed(1)}KB</dd>
          </div>
        </dl>
      </section>

      <section className="panel space-y-3 p-4">
        <h2 className="font-bold">エクスポート / インポート</h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={exportAll}>
            <Icon name="download" />
            すべて JSON で書き出す
          </button>
          <label className="btn cursor-pointer">
            <Icon name="upload" />
            JSON を読み込む
            <input type="file" accept="application/json,.json" className="hidden" data-testid="import-file" onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFile(f)
              e.target.value = ''
            }} />
          </label>
        </div>
        <p className="text-xs text-ink-3">バックアップ全体と、共有ダイアログで書き出したコンボだけの JSON の両方を読み込めます。</p>
      </section>

      <section className="panel space-y-3 border-red-500/20 p-4">
        <h2 className="font-bold text-red-300">危険な操作</h2>
        <button className="btn btn-danger" onClick={() => setWipe(true)}>
          すべてのデータを削除
        </button>
      </section>

      <Modal open={!!pending} onClose={() => setPending(null)} title="インポート">
        <p className="mb-4 text-sm text-ink-2">
          {pending?.combos.length} 件のコンボが見つかりました。{pending?.full && 'キャラメモ・追加キャラ・追加技も含まれています。'}
        </p>
        <div className="flex flex-col gap-2">
          <button className="btn btn-primary" onClick={merge} data-testid="import-merge">
            今のデータに追加する
          </button>
          <button className="btn btn-danger" onClick={replace}>
            今のデータを置き換える
          </button>
        </div>
      </Modal>

      <Modal open={wipe} onClose={() => setWipe(false)} title="すべてのデータを削除">
        <p className="mb-4 text-sm text-ink-2">コンボ・メモ・追加キャラ・追加技がすべて削除されます。元に戻せません。</p>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={() => setWipe(false)}>
            キャンセル
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              st.replaceAll({ combos: [], charMemos: {}, customCharacters: [], charOverrides: {}, customMoves: {}, hiddenMoves: {} })
              setWipe(false)
              toast('削除しました')
            }}
          >
            削除する
          </button>
        </div>
      </Modal>
    </div>
  )
}
