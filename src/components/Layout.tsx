import { NavLink, Outlet, ScrollRestoration } from 'react-router-dom'
import { useStore } from '../store/useStore'
import type { Notation } from '../types'
import { Toaster } from './ui'
import { Icon } from './Icon'
import { STUDIO_ENABLED } from '../studio/flag'

const NAV = [
  { to: '/', label: 'キャラ選択', icon: 'grid', end: true },
  { to: '/combos', label: '全コンボ', icon: 'list' },
  { to: '/ai', label: 'AI 認識', icon: 'ai' },
  { to: '/data', label: 'データ', icon: 'gear' },
  ...(STUDIO_ENABLED ? [{ to: '/studio', label: '学習スタジオ', icon: 'edit' }] : []),
]

export function Layout() {
  const notation = useStore((s) => s.notation)
  const setNotation = useStore((s) => s.setNotation)
  return (
    <div className="min-h-screen pb-20 sm:pb-8">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <NavLink to="/" className="flex items-center gap-2">
            <span className="font-display flex h-7 items-center bg-accent px-2 text-sm font-bold tracking-widest text-white [clip-path:polygon(8%_0,100%_0,92%_100%,0_100%)]">
              SF6
            </span>
            <span className="font-display text-lg font-bold tracking-[0.2em] text-ink">COMBO MEMO</span>
          </NavLink>
          <nav className="ml-4 hidden gap-1 sm:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition ${isActive ? 'bg-panel-2 text-ink' : 'text-ink-2 hover:text-ink'}`
                }
              >
                <Icon name={n.icon} className="size-4" />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <label className="ml-auto flex items-center gap-2 text-xs text-ink-3">
            <span className="hidden md:inline">技の表記</span>
            <select className="input w-auto py-1 text-xs" value={notation} onChange={(e) => setNotation(e.target.value as Notation)} aria-label="技の表記">
              <option value="short">略称（中足）</option>
              <option value="name">正式名（屈中K）</option>
              <option value="numpad">テンキー（2MK）</option>
            </select>
          </label>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">
        <Outlet />
      </main>

      {/* スマホ用ボトムナビ */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid auto-cols-fr grid-flow-col border-t border-line bg-bg/95 backdrop-blur sm:hidden">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'text-accent-2' : 'text-ink-3'}`}
          >
            <Icon name={n.icon} className="size-5" />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <Toaster />
      <ScrollRestoration />
    </div>
  )
}
