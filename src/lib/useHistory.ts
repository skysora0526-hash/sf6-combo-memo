import { useCallback, useRef, useState } from 'react'

/** Undo / Redo 付きの state */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState(initial)
  const past = useRef<T[]>([])
  const future = useRef<T[]>([])
  const [, force] = useState(0)

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setState((prev) => {
      const value = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      if (value === prev) return prev
      past.current = [...past.current.slice(-99), prev]
      future.current = []
      return value
    })
    force((n) => n + 1)
  }, [])

  const reset = useCallback((value: T) => {
    past.current = []
    future.current = []
    setState(value)
  }, [])

  const undo = useCallback(() => {
    setState((cur) => {
      const prev = past.current.at(-1)
      if (prev === undefined) return cur
      past.current = past.current.slice(0, -1)
      future.current = [cur, ...future.current]
      return prev
    })
    force((n) => n + 1)
  }, [])

  const redo = useCallback(() => {
    setState((cur) => {
      const next = future.current[0]
      if (next === undefined) return cur
      future.current = future.current.slice(1)
      past.current = [...past.current, cur]
      return next
    })
    force((n) => n + 1)
  }, [])

  return { state, set, reset, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 }
}
