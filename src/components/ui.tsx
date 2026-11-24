import { useEffect, type ReactNode } from 'react'
import { create } from 'zustand'
import type { CharacterDef } from '../types'
import { Icon } from './Icon'

/* ---------- Toast ---------- */
interface ToastState {
  items: { id: number; text: string; kind: 'ok' | 'err' | 'info' }[]
  push: (text: string, kind?: 'ok' | 'err' | 'info') => void
}
export const useToast = create<ToastState>((set) => ({
  items: [],
  push: (text, kind = 'ok') => {
    const id = Date.now() + Math.random()
    set((s) => ({ items: [...s.items, { id, text, kind }] }))
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), 2600)
  },
}))
export const toast = (text: string, kind?: 'ok' | 'err' | 'info') => useToast.getState().push(text, kind)

export function Toaster() {
  const items = useToast((s) => s.items)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-lg border px-4 py-2 text-sm shadow-xl backdrop-blur ${
            t.kind === 'err'
              ? 'border-red-500/50 bg-red-950/90 text-red-100'
              : t.kind === 'info'
                ? 'border-line-2 bg-panel-2/95 text-ink'
                : 'border-c-drive/50 bg-[#0d2a22]/95 text-[#c9fbe9]'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}

/* ---------- Modal ---------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={`panel max-h-[90vh] w-full overflow-y-auto rounded-b-none p-5 shadow-2xl sm:rounded-xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="閉じる">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ---------- Stars / difficulty ---------- */
export function Stars({ value, onChange, size = 'size-4' }: { value: number; onChange?: (v: number) => void; size?: string }) {
  return (
    <div className="inline-flex items-center gap-0.5" role={onChange ? 'radiogroup' : undefined} aria-label="難易度">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= value
        const star = <Icon name="star" filled={on} className={`${size} ${on ? 'text-c-super' : 'text-ink-3/60'}`} />
        return onChange ? (
          <button key={n} type="button" role="radio" aria-checked={n === value} aria-label={`難易度${n}`} className="p-0.5" onClick={() => onChange(n)}>
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        )
      })}
    </div>
  )
}

/* ---------- Gauge ---------- */
export function GaugeBar({ value, max, kind }: { value: number; max: number; kind: 'sa' | 'drive' }) {
  const color = kind === 'sa' ? 'bg-c-super' : 'bg-c-drive'
  return (
    <div className="flex items-center gap-0.5" title={`${kind === 'sa' ? 'SA' : 'ドライブ'} ${value}`}>
      {Array.from({ length: max }, (_, i) => {
        const fill = Math.max(0, Math.min(1, value - i))
        return (
          <div key={i} className="relative h-2 w-3 overflow-hidden rounded-[2px] bg-line-2 -skew-x-12">
            <div className={`absolute inset-y-0 left-0 ${color}`} style={{ width: `${fill * 100}%` }} />
          </div>
        )
      })}
    </div>
  )
}

/* ---------- Character avatar ---------- */
export function Avatar({ ch, size = 'size-12', className = '' }: { ch: CharacterDef; size?: string; className?: string }) {
  if (ch.image)
    return <img src={ch.image} alt={ch.name} className={`${size} ${className} rounded-lg object-cover`} loading="lazy" />
  const initials = ch.nameEn.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || ch.name.slice(0, 1)
  return (
    <div
      className={`${size} ${className} font-display relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg font-bold tracking-wider text-white`}
      style={{ background: `linear-gradient(135deg, ${ch.color}, #111 140%)` }}
      aria-hidden="true"
    >
      <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{initials}</span>
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
      <p className="font-semibold text-ink-2">{title}</p>
      {children}
    </div>
  )
}
