import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { MoveDef, RouteStep } from '../types'
import { useCharacter, useCharacters, useMoves } from '../store/useStore'
import { useDraft } from '../store/draft'
import { CLASSIFIERS, SEGMENTERS, SUGGEST_THRESHOLD } from '../ai/registry'
import { manualEvent, runPipeline } from '../ai/pipeline'
import { AbortError, canCaptureScreen, ROI_PRESETS, startScreenRecording, thumbnailAt } from '../ai/video'
import { useTemplates } from '../ai/templateStore'
import type { AnalysisResult, DetectedEvent } from '../ai/types'
import { EnergyChart } from '../ai/EnergyChart'
import { MovePalette } from '../components/MovePalette'
import { RouteView } from '../components/RouteView'
import { Avatar, Modal, toast } from '../components/ui'
import { Icon } from '../components/Icon'
import { moveLabel } from '../lib/route'
import { uid } from '../lib/id'
import { useStore } from '../store/useStore'

interface Review {
  /** 選ばれた技。null = 不明な動作 */
  choice: string | null
  /** ユーザーが確認・確定したか */
  confirmed: boolean
  ignored: boolean
  learn: boolean
  thumb?: string
}

const fmt = (t: number) => `${t.toFixed(2)}s`
const MAX_RANGE = 90

export default function AiRecognize() {
  const { charId } = useParams()
  const navigate = useNavigate()
  const chars = useCharacters()
  const ch = useCharacter(charId)
  const moves = useMoves(ch)
  const notation = useStore((s) => s.notation)
  const setDraft = useDraft((s) => s.setDraft)
  const templates = useTemplates((s) => s.templates)
  const addTemplate = useTemplates((s) => s.add)
  const clearTemplates = useTemplates((s) => s.clear)
  const tplCount = templates.filter((t) => t.characterId === charId).length

  const videoRef = useRef<HTMLVideoElement>(null)
  const [src, setSrc] = useState<{ url: string; name: string } | null>(null)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [range, setRange] = useState<[number, number]>([0, 0])
  const [fps, setFps] = useState(10)
  const [sensitivity, setSensitivity] = useState(0.5)
  const [roiId, setRoiId] = useState('nohud')
  const [progress, setProgress] = useState<{ stage: string; p: number } | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [reviews, setReviews] = useState<Record<string, Review>>({})
  const [picking, setPicking] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [recording, setRecording] = useState<null | { stop: () => Promise<Blob> }>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const stopAtRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (src) URL.revokeObjectURL(src.url)
    },
    [src],
  )

  const moveMap = useMemo(() => new Map(moves.map((m) => [m.id, m])), [moves])

  if (!charId || !ch) {
    return (
      <div className="space-y-4">
        <Header />
        <p className="text-sm text-ink-2">解析するキャラクターを選んでください（キャラごとの技リストと学習データを使います）。</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {chars.map((c) => (
            <Link key={c.id} to={`/c/${c.id}/ai`} className="panel flex flex-col items-center gap-1.5 p-2 hover:border-line-2">
              <Avatar ch={c} size="size-10" />
              <span className="truncate text-xs">{c.name}</span>
            </Link>
          ))}
        </div>
      </div>
    )
  }

  const loadBlob = (blob: Blob, name: string) => {
    setSrc({ url: URL.createObjectURL(blob), name })
    setResult(null)
    setReviews({})
    setError(null)
  }

  const onFile = (f: File | undefined) => {
    if (!f) return
    if (!f.type.startsWith('video/') && !/\.(mp4|webm|mov|mkv)$/i.test(f.name)) {
      toast('動画ファイルを選んでください', 'err')
      return
    }
    loadBlob(f, f.name)
  }

  const capture = async () => {
    try {
      const r = await startScreenRecording()
      setRecording({ stop: r.stop })
      r.stream.getVideoTracks()[0]?.addEventListener('ended', async () => {
        const blob = await r.stop()
        setRecording(null)
        loadBlob(blob, '画面キャプチャ')
      })
      toast('録画中です。ゲーム画面でコンボを実行し、「録画停止」を押してください', 'info')
    } catch (e) {
      toast(e instanceof Error && e.name === 'NotAllowedError' ? '画面の共有が許可されませんでした' : '画面キャプチャを開始できませんでした', 'err')
    }
  }
  const stopCapture = async () => {
    if (!recording) return
    const blob = await recording.stop()
    setRecording(null)
    loadBlob(blob, '画面キャプチャ')
  }

  const onLoaded = () => {
    const v = videoRef.current!
    // MediaRecorder の webm は duration が Infinity になることがあるので、末尾へシークして確定させる
    if (!Number.isFinite(v.duration)) {
      v.currentTime = 1e7
      v.addEventListener(
        'durationchange',
        () => {
          v.currentTime = 0
          setDuration(v.duration)
          setRange([0, Math.min(v.duration, MAX_RANGE)])
        },
        { once: true },
      )
      return
    }
    setDuration(v.duration)
    setRange([0, Math.min(v.duration, MAX_RANGE)])
  }

  const analyze = async () => {
    const v = videoRef.current
    if (!v) return
    const ac = new AbortController()
    abortRef.current = ac
    setError(null)
    setResult(null)
    try {
      const res = await runPipeline(
        v,
        {
          start: range[0],
          end: range[1],
          fps,
          roi: ROI_PRESETS.find((r) => r.id === roiId)!.roi,
          sensitivity,
          segmenter: SEGMENTERS[0],
          classifiers: CLASSIFIERS,
        },
        { characterId: ch.id, moves, signal: ac.signal },
        (stage, p) => setProgress({ stage, p }),
      )
      const init: Record<string, Review> = {}
      for (const ev of res.events) {
        const top = ev.candidates[0]
        init[ev.id] = { choice: top && top.confidence >= SUGGEST_THRESHOLD ? top.moveId : null, confirmed: false, ignored: false, learn: true }
      }
      setResult(res)
      setReviews(init)
      setProgress(null)
      // サムネイルは後から順に作る
      for (const ev of res.events) {
        if (ac.signal.aborted) break
        const thumb = await thumbnailAt(v, ev.peak)
        setReviews((r) => ({ ...r, [ev.id]: { ...r[ev.id], thumb } }))
      }
      v.currentTime = range[0]
    } catch (e) {
      setProgress(null)
      if (e instanceof AbortError) toast('解析を中止しました', 'info')
      else setError(e instanceof Error ? e.message : '解析に失敗しました')
    }
  }

  const seek = (t: number) => {
    const v = videoRef.current
    if (v) v.currentTime = t
  }
  const playSegment = (ev: DetectedEvent) => {
    const v = videoRef.current
    if (!v) return
    setSelected(ev.id)
    stopAtRef.current = ev.end + 0.15
    v.currentTime = Math.max(0, ev.start - 0.15)
    v.play()
  }
  const onTime = () => {
    const v = videoRef.current!
    setCurrent(v.currentTime)
    if (stopAtRef.current !== null && v.currentTime >= stopAtRef.current) {
      v.pause()
      stopAtRef.current = null
    }
  }

  const setReview = (id: string, p: Partial<Review>) => setReviews((r) => ({ ...r, [id]: { ...r[id], ...p } }))
  const events = result ? [...result.events].sort((a, b) => a.start - b.start) : []
  const active = events.filter((e) => !reviews[e.id]?.ignored)
  const unconfirmedAi = active.filter((e) => !reviews[e.id]?.confirmed && reviews[e.id]?.choice).length
  const unknown = active.filter((e) => !reviews[e.id]?.choice).length

  const toRoute = (): RouteStep[] =>
    active.map((ev) => {
      const r = reviews[ev.id]
      const m = r.choice ? moveMap.get(r.choice) : undefined
      const conf = r.confirmed ? 1 : ev.candidates.find((c) => c.moveId === r.choice)?.confidence ?? 0
      if (!m)
        return { id: uid(), label: '不明な動作', category: 'unknown', note: `${fmt(ev.start)}〜${fmt(ev.end)}`, ai: { confidence: 0, start: ev.start, end: ev.end } }
      return {
        id: uid(),
        moveId: m.id,
        label: m.name,
        category: m.category,
        note: r.confirmed ? undefined : `AI 推定・未確認（${Math.round(conf * 100)}%）`,
        ai: { confidence: conf, start: ev.start, end: ev.end },
      }
    })

  const convert = () => {
    // ユーザーが確定した区間だけを学習データにする
    let learned = 0
    for (const ev of active) {
      const r = reviews[ev.id]
      if (r.confirmed && r.choice && r.learn && ev.feature) {
        addTemplate({ characterId: ch.id, moveId: r.choice, label: moveMap.get(r.choice)?.name ?? r.choice, feature: ev.feature })
        learned++
      }
    }
    if (learned) toast(`${learned} 件を学習データに保存しました`, 'info')
    setDraft({ characterId: ch.id, route: toRoute() })
    navigate(`/c/${ch.id}/new`)
  }

  const addManual = () => {
    if (!result) return
    const ev = manualEvent(current, result.frames)
    setResult({ ...result, events: [...result.events, ev] })
    setReviews((r) => ({ ...r, [ev.id]: { choice: null, confirmed: false, ignored: false, learn: true } }))
    setSelected(ev.id)
    videoRef.current && thumbnailAt(videoRef.current, ev.peak).then((thumb) => setReview(ev.id, { thumb }))
  }

  const pickMove = (m: MoveDef) => {
    if (!picking) return
    setReview(picking, { choice: m.id, confirmed: true })
    setPicking(null)
  }

  return (
    <div className="space-y-4">
      <Header ch={ch} />

      <details className="panel group p-4 text-sm" open={!result}>
        <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold">
          <Icon name="ai" className="size-4 text-c-unique" />
          この機能で今できること・できないこと
          <Icon name="down" className="ml-auto size-4 text-ink-3 transition group-open:rotate-180" />
        </summary>
        <div className="mt-3 space-y-3 text-ink-2">
          <p>
            映像から<strong className="text-ink">「動作が起きた区間」を検出</strong>し、区間ごとに技を選んでコンボルートに変換します。
            <strong className="text-ink">今の解析は技名を自動で判定できません。</strong>
            検出した区間は最初「不明な動作」になり、あなたが技を選びます。選んだ結果は学習データとして保存され、次回から似た動作に候補（信頼度つき）が出ます（実験的）。
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {[...SEGMENTERS, ...CLASSIFIERS].map((a) => (
              <li key={a.id} className="flex items-start gap-2 rounded-md border border-line bg-panel-2 px-2.5 py-1.5">
                <span
                  className={`mt-0.5 shrink-0 rounded px-1.5 text-[10px] font-bold ${
                    a.status === 'available' ? 'bg-c-drive/20 text-c-drive' : a.status === 'experimental' ? 'bg-c-super/20 text-c-super' : 'bg-line-2 text-ink-3'
                  }`}
                >
                  {a.status === 'available' ? '利用可' : a.status === 'experimental' ? '実験的' : '未実装'}
                </span>
                <span>
                  <span className="font-semibold text-ink">{a.name}</span>
                  <span className="block text-xs text-ink-3">{a.description}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-3">
            映像はこのブラウザ内だけで処理され、どこにも送信されません。カメラの移動・ヒットエフェクト・暗転演出でも「動作」として検出されることがあります。
          </p>
        </div>
      </details>

      {/* 入力 */}
      {!src && (
        <div
          className="panel flex flex-col items-center gap-4 border-dashed px-6 py-12 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            onFile(e.dataTransfer.files[0])
          }}
        >
          <Icon name="video" className="size-10 text-ink-3" />
          <p className="text-ink-2">録画した動画ファイルをドロップ、または選択してください（MP4 / WebM など）</p>
          <div className="flex flex-wrap justify-center gap-2">
            <label className="btn btn-primary cursor-pointer">
              <Icon name="upload" />
              動画ファイルを選択
              <input type="file" accept="video/*" className="hidden" data-testid="video-input" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {canCaptureScreen() &&
              (recording ? (
                <button className="btn btn-danger animate-pulse" onClick={stopCapture}>
                  ● 録画停止
                </button>
              ) : (
                <button className="btn" onClick={capture}>
                  <Icon name="screen" />
                  画面をキャプチャして録画
                </button>
              ))}
          </div>
          {!canCaptureScreen() && <p className="text-xs text-ink-3">この端末のブラウザは画面キャプチャに対応していません（動画ファイルは使えます）。</p>}
        </div>
      )}

      {src && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <div className="panel overflow-hidden">
              <video
                ref={videoRef}
                src={src.url}
                className="aspect-video w-full bg-black"
                controls
                playsInline
                muted
                onLoadedMetadata={onLoaded}
                onTimeUpdate={onTime}
                onSeeked={onTime}
                onError={() => setError('この動画は再生できません（ブラウザが対応していない形式の可能性があります）')}
                data-testid="video"
              />
              <div className="flex items-center gap-2 border-t border-line px-3 py-2 text-xs text-ink-3">
                <span className="truncate">{src.name}</span>
                <span className="ml-auto font-mono">
                  {fmt(current)} / {fmt(duration)}
                </span>
                <button className="btn btn-sm btn-ghost" onClick={() => setSrc(null)}>
                  別の動画
                </button>
              </div>
            </div>
            {result && <EnergyChart result={result} current={current} onSeek={seek} selected={selected} />}
          </div>

          <aside className="panel h-fit space-y-4 p-4">
            <div>
              <span className="label">解析範囲（最大 {MAX_RANGE} 秒）</span>
              <div className="grid grid-cols-2 gap-2">
                {[0, 1].map((i) => (
                  <div key={i}>
                    <input
                      className="input font-mono"
                      type="number"
                      step={0.1}
                      min={0}
                      max={duration}
                      value={range[i].toFixed(1)}
                      aria-label={i ? '終了' : '開始'}
                      onChange={(e) => {
                        const r = [...range] as [number, number]
                        r[i] = Math.max(0, Math.min(duration, Number(e.target.value)))
                        setRange(r)
                      }}
                    />
                    <button
                      className="mt-1 text-xs text-ink-3 hover:text-ink"
                      onClick={() => {
                        const r = [...range] as [number, number]
                        r[i] = current
                        setRange(r)
                      }}
                    >
                      現在位置を{i ? '終了' : '開始'}に
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="label">解析エリア</span>
              <select className="input" value={roiId} onChange={(e) => setRoiId(e.target.value)}>
                {ROI_PRESETS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="label">細かさ</span>
                <select className="input" value={fps} onChange={(e) => setFps(Number(e.target.value))}>
                  <option value={5}>5 fps（速い）</option>
                  <option value={10}>10 fps</option>
                  <option value={20}>20 fps（精密）</option>
                </select>
              </label>
              <label className="block">
                <span className="label">感度 {Math.round(sensitivity * 100)}</span>
                <input type="range" min={0} max={1} step={0.05} value={sensitivity} onChange={(e) => setSensitivity(Number(e.target.value))} className="mt-3 w-full accent-[var(--color-accent)]" aria-label="感度" />
              </label>
            </div>
            {progress ? (
              <div className="space-y-2" role="status">
                <div className="flex justify-between text-xs text-ink-2">
                  <span>{progress.stage}…</span>
                  <span>{Math.round(progress.p * 100)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-line-2">
                  <div className="h-full bg-accent transition-all" style={{ width: `${progress.p * 100}%` }} />
                </div>
                <button className="btn btn-sm w-full" onClick={() => abortRef.current?.abort()}>
                  中止
                </button>
              </div>
            ) : (
              <button className="btn btn-primary w-full" onClick={analyze} disabled={!duration || range[1] - range[0] < 0.3 || range[1] - range[0] > MAX_RANGE + 0.01} data-testid="analyze">
                <Icon name="play" />
                {result ? '再解析' : '解析する'}
              </button>
            )}
            {range[1] - range[0] > MAX_RANGE + 0.01 && <p className="text-xs text-red-300">解析範囲を {MAX_RANGE} 秒以内にしてください。</p>}
            {error && <p className="rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-200">{error}</p>}
            <div className="border-t border-line pt-3 text-xs text-ink-3">
              {ch.name} の学習データ: {tplCount} 件
              {tplCount > 0 && (
                <button className="ml-2 underline hover:text-ink" onClick={() => confirm('このキャラの学習データを消去しますか？') && clearTemplates(ch.id)}>
                  消去
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* 結果 */}
      {result && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">認識結果</h2>
            <span className="text-sm text-ink-3" data-testid="event-count">
              {events.length} 区間を検出
            </span>
            <button className="btn btn-sm ml-auto" onClick={addManual} title="検出されなかった動作を、動画の現在位置に追加します">
              <Icon name="plus" className="size-3.5" />
              現在位置に区間を追加（{fmt(current)}）
            </button>
          </div>
          {events.length === 0 && (
            <p className="panel p-4 text-sm text-ink-2">動作を検出できませんでした。感度を上げるか、解析エリアを「画面全体」にして再解析してください。</p>
          )}
          <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {events.map((ev, i) => {
              const r = reviews[ev.id]
              if (!r) return null
              const chosen = r.choice ? moveMap.get(r.choice) : undefined
              const chosenConf = ev.candidates.find((c) => c.moveId === r.choice)?.confidence
              return (
                <li
                  key={ev.id}
                  className={`panel flex gap-3 p-3 ${r.ignored ? 'opacity-40' : ''} ${selected === ev.id ? 'border-accent' : ''}`}
                  data-testid="ai-event"
                  onClick={() => setSelected(ev.id)}
                >
                  <button className="relative aspect-video w-28 shrink-0 overflow-hidden rounded bg-black" onClick={() => playSegment(ev)} aria-label={`区間 ${i + 1} を再生`}>
                    {r.thumb && <img src={r.thumb} alt="" className="size-full object-cover" />}
                    <Icon name="play" className="absolute inset-0 m-auto size-6 text-white/80 drop-shadow" filled />
                    <span className="absolute bottom-0 left-0 bg-black/70 px-1 font-mono text-[10px]">#{i + 1}</span>
                  </button>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-ink-3">
                      <span className="font-mono">
                        {fmt(ev.start)}〜{fmt(ev.end)}
                      </span>
                      {ev.strength === 0 && <span className="chip">手動追加</span>}
                      <label className="ml-auto flex items-center gap-1">
                        <input type="checkbox" checked={r.ignored} onChange={(e) => setReview(ev.id, { ignored: e.target.checked })} />
                        除外
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {chosen ? (
                        <span className={`${chosen.category ? `cat-${chosen.category}` : ''} step step-text`}>{moveLabel(chosen, notation)}</span>
                      ) : (
                        <span className="cat-unknown step step-text border-dashed" data-testid="unknown">
                          不明な動作
                        </span>
                      )}
                      {chosen && !r.confirmed && <span className="text-[11px] text-c-super">AI 推定 {Math.round((chosenConf ?? 0) * 100)}%・未確認</span>}
                      {r.confirmed && <span className="text-[11px] text-c-drive">✓ 確定</span>}
                    </div>
                    {ev.candidates.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {ev.candidates.map((c) => (
                          <button
                            key={c.moveId}
                            className={`chip ${r.choice === c.moveId ? 'chip-on' : ''}`}
                            onClick={() => setReview(ev.id, { choice: c.moveId, confirmed: true })}
                            title="この候補で確定"
                          >
                            {c.label}
                            <span className="relative h-1.5 w-8 overflow-hidden rounded bg-line-2">
                              <span className="absolute inset-y-0 left-0 bg-c-unique" style={{ width: `${c.confidence * 100}%` }} />
                            </span>
                            {Math.round(c.confidence * 100)}%
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      <button className="btn btn-sm" onClick={() => setPicking(ev.id)} data-testid="pick-move">
                        技を選ぶ
                      </button>
                      {chosen && !r.confirmed && (
                        <button className="btn btn-sm" onClick={() => setReview(ev.id, { confirmed: true })}>
                          この推定で確定
                        </button>
                      )}
                      {r.choice && (
                        <button className="btn btn-sm btn-ghost" onClick={() => setReview(ev.id, { choice: null, confirmed: false })}>
                          不明に戻す
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>

          {events.length > 0 && (
            <div className="panel sticky bottom-16 z-10 space-y-3 p-4 sm:bottom-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-ink-2">変換後のルート</span>
                {unknown > 0 && <span className="chip border-c-unknown/50 text-c-unknown">不明な動作 {unknown}</span>}
                {unconfirmedAi > 0 && <span className="chip border-c-super/50 text-c-super">未確認の AI 推定 {unconfirmedAi}</span>}
              </div>
              <RouteView route={toRoute()} moves={moves} compact />
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-ink-3">エディタで「キャンセル」などの繋ぎを追加し、不明な動作を差し替えてから保存してください。</p>
                <button className="btn btn-primary ml-auto" onClick={convert} disabled={!active.length} data-testid="convert">
                  コンボルートに変換してエディタで開く
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <Modal open={!!picking} onClose={() => setPicking(null)} title="この区間の技を選ぶ" wide>
        <MovePalette moves={moves} onPick={pickMove} onText={() => toast('AI 認識結果には技リストの技を選んでください。直接入力はエディタで行えます', 'info')} />
        {picking && reviews[picking] && (
          <label className="mt-3 flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={reviews[picking].learn} onChange={(e) => setReview(picking, { learn: e.target.checked })} />
            この区間を学習データとして保存する（変換時）
          </label>
        )}
      </Modal>
    </div>
  )
}

function Header({ ch }: { ch?: ReturnType<typeof useCharacter> }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {ch && (
        <Link to={`/c/${ch.id}`} className="btn btn-ghost btn-sm" aria-label="戻る">
          <Icon name="left" />
        </Link>
      )}
      {ch && <Avatar ch={ch} size="size-10" />}
      <div>
        <p className="font-display text-xs font-bold tracking-[0.3em] text-c-unique">AI MOTION RECOGNITION · BETA</p>
        <h1 className="text-xl font-bold">AI 動作認識{ch && <span className="ml-2 text-ink-2">— {ch.name}</span>}</h1>
      </div>
    </div>
  )
}
