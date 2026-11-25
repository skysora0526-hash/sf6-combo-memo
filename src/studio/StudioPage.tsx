import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import AiRecognize, { type StudioMode } from '../pages/AiRecognize'
import { useCharacter, useMoves, useStore } from '../store/useStore'
import { decodeFeature, encodeFeature, FEATURE_VERSION } from '../ai/featureCodec'
import { evaluate, scoreSamples, type LabeledSample } from '../ai/scoring'
import { SUGGEST_THRESHOLD } from '../ai/registry'
import type { Classifier } from '../ai/types'
import { uid } from '../lib/id'
import { copyText } from '../lib/text'
import { moveLabel } from '../lib/route'
import { Icon } from '../components/Icon'
import { toast } from '../components/ui'
import { clearCharacter, deleteSample, listSamples, putSamples, type Sample } from './datasetDb'
import { buildModel, type DatasetFile } from './exportModel'

type Tab = 'label' | 'dataset' | 'export'
const pct = (x: number) => `${Math.round(x * 100)}%`
const MIN_PER_MOVE = 5

function download(name: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export default function StudioPage() {
  const { charId } = useParams()
  const ch = useCharacter(charId)
  const moves = useMoves(ch, true)
  const notation = useStore((s) => s.notation)
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'label'
  const [samples, setSamples] = useState<Sample[]>([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    if (!charId) return
    try {
      setSamples(await listSamples(charId))
    } catch {
      toast('データセットを読み込めませんでした（このブラウザでは IndexedDB が使えない可能性があります）', 'err')
    }
    setLoaded(true)
  }, [charId])
  useEffect(() => {
    setLoaded(false)
    reload()
  }, [reload])

  const decoded: LabeledSample[] = useMemo(
    () => samples.filter((s) => s.featureVersion === FEATURE_VERSION).map((s) => ({ moveId: s.moveId, label: s.label, feature: decodeFeature(s.feature) })),
    [samples],
  )

  // ラベル付け中の候補表示には、今のデータセットを使う
  const studioClassifier: Classifier = useMemo(
    () => ({
      id: 'studio',
      name: '学習中のデータセット',
      description: '',
      status: 'experimental',
      classify: (ev, _f, ctx) => (ev.feature ? scoreSamples(ev.feature, decoded, ctx.moves, 'studio') : []),
    }),
    [decoded],
  )

  const studio: StudioMode = useMemo(
    () => ({
      lockedSettings: samples[0] ? { roiId: samples[0].roiId, fps: samples[0].fps } : undefined,
      classifiers: [studioClassifier],
      sampleCount: samples.length,
      onAdd: async (items) => {
        await putSamples(
          items.map((x) => ({
            id: uid(),
            characterId: charId!,
            moveId: x.moveId,
            label: x.label,
            feature: encodeFeature(x.ev.feature!),
            featureVersion: FEATURE_VERSION,
            thumb: x.thumb,
            video: x.video,
            start: x.ev.start,
            end: x.ev.end,
            roiId: x.roiId,
            fps: x.fps,
            createdAt: Date.now(),
          })),
        )
        await reload()
      },
    }),
    [samples, studioClassifier, charId, reload],
  )

  if (!charId || !ch) return <AiRecognize studio={studio} />

  const tabs: { id: Tab; label: string }[] = [
    { id: 'label', label: '1. ラベル付け' },
    { id: 'dataset', label: `2. データセット (${samples.length})` },
    { id: 'export', label: '3. 評価・書き出し' },
  ]

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-c-unique/40 bg-c-unique/10 px-4 py-2 text-xs text-c-unique">
        開発者モード: ここで作ったモデルを <code>public/ai-models/</code> に置くと、一般ユーザーの AI 認識で使われます。このページは一般向けビルドには含まれません。
      </div>
      <div className="flex gap-1 border-b border-line" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === t.id ? 'border-c-unique text-ink' : 'border-transparent text-ink-3 hover:text-ink'}`}
            onClick={() => setParams(t.id === 'label' ? {} : { tab: t.id }, { replace: true })}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ラベル付けはタブを切り替えても解析結果を保つため、非表示にするだけ */}
      <div hidden={tab !== 'label'}>
        <AiRecognize studio={studio} />
      </div>

      {tab === 'dataset' && loaded && (
        <Dataset
          samples={samples}
          moveName={(id) => {
            const m = moves.find((x) => x.id === id)
            return m ? moveLabel(m, notation) : id
          }}
          moveCat={(id) => moves.find((x) => x.id === id)?.category ?? 'unknown'}
          onDelete={async (id) => {
            await deleteSample(id)
            await reload()
          }}
          onClear={async () => {
            await clearCharacter(charId)
            await reload()
            toast('データセットを消去しました')
          }}
        />
      )}

      {tab === 'export' && loaded && <ExportPanel charId={charId} charName={ch.name} samples={samples} decoded={decoded} moves={moves} onImported={reload} />}
    </div>
  )
}

function Dataset({
  samples,
  moveName,
  moveCat,
  onDelete,
  onClear,
}: {
  samples: Sample[]
  moveName: (id: string) => string
  moveCat: (id: string) => string
  onDelete: (id: string) => void
  onClear: () => void
}) {
  const [armed, setArmed] = useState(false)
  const groups = useMemo(() => {
    const m = new Map<string, Sample[]>()
    samples.forEach((s) => m.set(s.moveId, [...(m.get(s.moveId) ?? []), s]))
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [samples])
  if (!samples.length) return <p className="panel p-6 text-center text-sm text-ink-2">まだサンプルがありません。「1. ラベル付け」で動画を解析し、区間に技を付けて追加してください。</p>
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
        {samples.length} サンプル / {groups.length} 技 / {new Set(samples.map((s) => s.video)).size} 本の動画 ・ 解析設定: {samples[0].roiId} / {samples[0].fps}fps
        <button className="btn btn-sm btn-danger ml-auto" onClick={() => (armed ? onClear() : setArmed(true))}>
          {armed ? 'もう一度押すとこのキャラのデータセットを全消去' : '全消去'}
        </button>
      </div>
      {groups.map(([moveId, list]) => (
        <section key={moveId} className="panel p-3" data-testid="dataset-move">
          <div className="mb-2 flex items-center gap-2">
            <span className={`cat-${moveCat(moveId)} step step-text`}>{moveName(moveId)}</span>
            <span className="text-xs text-ink-3">{list.length} サンプル</span>
            {list.length < MIN_PER_MOVE && <span className="chip border-c-super/50 text-c-super">あと {MIN_PER_MOVE - list.length} 件以上推奨</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {list.map((s) => (
              <figure key={s.id} className="group relative w-28">
                {s.thumb ? <img src={s.thumb} alt="" className="aspect-video w-full rounded bg-black object-cover" /> : <div className="aspect-video w-full rounded bg-black" />}
                <figcaption className="truncate text-[10px] text-ink-3" title={s.video}>
                  {s.video} {s.start.toFixed(1)}s
                </figcaption>
                <button
                  className="absolute top-1 right-1 hidden rounded bg-black/70 p-1 text-red-300 group-hover:block focus:block"
                  onClick={() => onDelete(s.id)}
                  aria-label="このサンプルを削除"
                >
                  <Icon name="trash" className="size-3" />
                </button>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function ExportPanel({
  charId,
  charName,
  samples,
  decoded,
  moves,
  onImported,
}: {
  charId: string
  charName: string
  samples: Sample[]
  decoded: LabeledSample[]
  moves: ReturnType<typeof useMoves>
  onImported: () => void
}) {
  const videos = useMemo(() => samples.filter((s) => s.featureVersion === FEATURE_VERSION).map((s) => s.video), [samples])
  const multiVideo = new Set(videos).size >= 2
  const ev = useMemo(() => (decoded.length >= 2 ? evaluate(decoded, moves, SUGGEST_THRESHOLD, multiVideo ? videos : undefined) : null), [decoded, moves, videos, multiVideo])
  const name = (id: string) => moves.find((m) => m.id === id)?.name ?? id
  const thin = useMemo(() => {
    const c = new Map<string, number>()
    decoded.forEach((s) => c.set(s.moveId, (c.get(s.moveId) ?? 0) + 1))
    return [...c.entries()].filter(([, n]) => n < MIN_PER_MOVE)
  }, [decoded])
  const modelJson = () => JSON.stringify(buildModel(charId, samples))

  const importDataset = async (f: File) => {
    try {
      const j = JSON.parse(await f.text()) as DatasetFile
      if (j.format !== 'sf6-combo-memo-dataset' || !Array.isArray(j.samples)) throw new Error()
      if (j.characterId !== charId) {
        toast(`別キャラ（${j.characterId}）のデータセットです`, 'err')
        return
      }
      await putSamples(j.samples.map((s) => ({ ...s, characterId: charId })))
      onImported()
      toast(`${j.samples.length} サンプルを読み込みました（同じ ID は上書き）`)
    } catch {
      toast('データセットのファイルではありません', 'err')
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="panel space-y-3 p-4">
        <h2 className="font-bold">精度の評価</h2>
        {!ev ? (
          <p className="text-sm text-ink-3">評価には 2 サンプル以上必要です。</p>
        ) : (
          <>
            <p className="text-xs text-ink-3">
              {multiVideo
                ? '動画単位の交差検証: 各サンプルを、別の動画から取ったサンプルだけで判定した結果です。'
                : '1 件抜き交差検証です。動画が 1 本だけなので、実際より高く出ます。別の動画（別の試合・別の画質）からもサンプルを追加してください。'}
            </p>
            <dl className="grid grid-cols-3 gap-2 text-center" data-testid="eval">
              <div className="rounded-lg bg-panel-2 p-3">
                <dt className="text-[11px] text-ink-3">1 位が正解</dt>
                <dd className="font-display text-2xl font-bold">{pct(ev.top1)}</dd>
              </div>
              <div className="rounded-lg bg-panel-2 p-3">
                <dt className="text-[11px] text-ink-3">自動選択される割合</dt>
                <dd className="font-display text-2xl font-bold">{pct(ev.coverage)}</dd>
              </div>
              <div className="rounded-lg bg-panel-2 p-3">
                <dt className="text-[11px] text-ink-3">自動選択時の正解率</dt>
                <dd className="font-display text-2xl font-bold">{ev.coverage ? pct(ev.precisionAtThreshold) : '-'}</dd>
              </div>
            </dl>
            <p className="text-xs text-ink-3">「自動選択」はユーザー画面で信頼度 {pct(SUGGEST_THRESHOLD)} 以上の候補が初期選択される状態です（それでもユーザーの確認が必要です）。</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-ink-3">
                  <tr>
                    <th className="py-1">技</th>
                    <th className="py-1 text-right">サンプル</th>
                    <th className="py-1 text-right">正解率</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {ev.perMove.map((p) => (
                    <tr key={p.moveId} className="border-t border-line">
                      <td className="py-1">{name(p.moveId)}</td>
                      <td className="py-1 text-right">{p.n}</td>
                      <td className={`py-1 text-right ${p.correct / p.n < 0.6 ? 'text-red-300' : ''}`}>{pct(p.correct / p.n)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ev.confusions.length > 0 && (
              <div>
                <span className="label">よく間違える組み合わせ</span>
                <ul className="space-y-0.5 text-sm text-ink-2">
                  {ev.confusions.map((c) => (
                    <li key={c.actual + c.predicted}>
                      {name(c.actual)} → {name(c.predicted)} と判定: {c.count} 回
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <section className="panel space-y-3 p-4">
        <h2 className="font-bold">モデルを書き出す</h2>
        {thin.length > 0 && (
          <p className="rounded border border-c-super/40 bg-c-super/10 p-2 text-xs text-c-super">
            サンプルが {MIN_PER_MOVE} 件未満の技: {thin.map(([id, n]) => `${name(id)}(${n})`).join('、')}。少ない技はユーザー画面で信頼度が低く出ます。
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={!decoded.length} onClick={() => download(`${charId}.json`, modelJson())} data-testid="download-model">
            <Icon name="download" />
            {charId}.json をダウンロード
          </button>
          <button
            className="btn"
            disabled={!decoded.length}
            onClick={async () => toast((await copyText(modelJson())) ? 'モデルの JSON をコピーしました' : 'コピーに失敗しました', 'info')}
          >
            <Icon name="copy" />
            JSON をコピー
          </button>
        </div>
        <div className="rounded-lg bg-[#0d0f14] p-3 text-xs text-ink-2">
          <p className="mb-1 font-semibold text-ink">公開サイトに反映する手順</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>上のボタンで <code>{charId}.json</code> をダウンロード</li>
            <li>
              GitHub のリポジトリで <code>public/ai-models</code> フォルダを開き、「Add file」→「Upload files」で <code>{charId}.json</code> をアップロードして Commit
              （同じ名前のファイルは上書きされます）
            </li>
            <li>数分で公開サイトが自動で更新され、{charName} の AI 認識で候補が出るようになります</li>
          </ol>
          <p className="mt-2 text-ink-3">
            コマンドを使う場合: <code>node scripts/install-model.mjs {charId}.json</code>（形式を検証してから配置します）
          </p>
        </div>

        <h3 className="pt-2 text-sm font-bold">データセットの保存・移行</h3>
        <p className="text-xs text-ink-3">データセットはこのブラウザだけに保存されています。別の PC で続けるときや、バックアップに使ってください（サムネイル込み）。</p>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-sm"
            disabled={!samples.length}
            onClick={() =>
              download(
                `${charId}-dataset.json`,
                JSON.stringify({ format: 'sf6-combo-memo-dataset', version: 1, characterId: charId, exportedAt: new Date().toISOString(), samples } satisfies DatasetFile),
              )
            }
          >
            <Icon name="download" className="size-3.5" />
            データセットを書き出す
          </button>
          <label className="btn btn-sm cursor-pointer">
            <Icon name="upload" className="size-3.5" />
            データセットを読み込む
            <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importDataset(e.target.files[0])} />
          </label>
        </div>
      </section>
      <p className="text-xs text-ink-3 lg:col-span-2">
        判定方式: 区間ごとに、動きの中心を基準に切り出した「変化の形」と「動きの向き」を特徴量にした k 近傍法です。
        画面上の位置には左右されませんが、カメラの移動・相手キャラの動き・エフェクトも変化として入るため、同じ技でも状況によって変わります。
        評価の数字を見ながら、技ごとに複数の試合・立ち位置・相手からサンプルを集めてください。
      </p>
    </div>
  )
}
