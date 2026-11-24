import { useMemo } from 'react'
import type { MoveDef, RouteStep } from '../types'
import { CATEGORY_META } from '../data'
import { stepLabel } from '../lib/route'
import { useStore } from '../store/useStore'

/** 読み取り専用のコンボルート表示（矢印でつなぐ） */
export function RouteView({ route, moves, compact }: { route: RouteStep[]; moves: MoveDef[]; compact?: boolean }) {
  const notation = useStore((s) => s.notation)
  const map = useMemo(() => new Map(moves.map((m) => [m.id, m])), [moves])
  if (!route.length) return <span className="text-sm text-ink-3">ルート未入力</span>
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
      {route.map((s, i) => {
        const isConn = s.category === 'connector'
        return (
          <li key={s.id} className="flex items-center gap-1">
            {i > 0 && <span className="text-xs text-ink-3" aria-hidden="true">›</span>}
            <span
              className={`${CATEGORY_META[s.category].className} ${
                isConn ? 'px-1 text-xs text-ink-3 italic' : `step step-text ${compact ? 'px-1.5 py-0.5 text-xs' : ''}`
              } ${s.category === 'unknown' ? 'border-dashed' : ''}`}
              title={s.note || undefined}
            >
              {stepLabel(s, map, notation)}
              {s.note && !compact && <sup className="ml-0.5 text-ink-3">*</sup>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
