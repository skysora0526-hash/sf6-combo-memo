import type { AnalysisResult } from './types'

/** 動き量のグラフ。検出区間を塗り、クリックでその時刻へ移動 */
export function EnergyChart({ result, current, onSeek, selected }: { result: AnalysisResult; current: number; onSeek: (t: number) => void; selected?: string | null }) {
  const W = 1000
  const H = 120
  const pts = result.energy
  if (pts.length < 2) return null
  const t0 = pts[0].t
  const t1 = pts.at(-1)!.t
  const maxV = Math.max(result.threshold * 1.6, ...pts.map((p) => p.v), 1e-4)
  const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * W
  const y = (v: number) => H - 6 - (v / maxV) * (H - 14)
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('')
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-28 w-full cursor-crosshair rounded-lg border border-line bg-[#0d0f14]"
      preserveAspectRatio="none"
      onClick={(e) => {
        const r = (e.currentTarget as SVGElement).getBoundingClientRect()
        onSeek(t0 + ((e.clientX - r.left) / r.width) * (t1 - t0))
      }}
      role="img"
      aria-label="動きの量のグラフ"
    >
      {result.events.map((ev) => (
        <rect
          key={ev.id}
          x={x(ev.start)}
          width={Math.max(2, x(ev.end) - x(ev.start))}
          y={0}
          height={H}
          fill={ev.id === selected ? 'rgb(255 45 120 / 0.35)' : 'rgb(255 159 67 / 0.18)'}
        />
      ))}
      <line x1={0} x2={W} y1={y(result.threshold)} y2={y(result.threshold)} stroke="#6b7282" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke="#27e3a0" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <line x1={x(current)} x2={x(current)} y1={0} y2={H} stroke="#ff2d78" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
