import type { StateHook } from './state-adapter'

interface RingSweepAdapters {
  useState: StateHook
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) => void
  requestFrame: (callback: () => void) => number
  cancelFrame: (handle: number) => void
}

/**
 * One ring sweep for a value that changed since the person last saw it. The ring first draws `from`, then, two
 * frames later, the current value, so the ring's own stroke transition sweeps it once. A null `from` (no change,
 * or reduced motion) draws the current value at once.
 */
export function createUseRingSweep({ useState, useEffect, requestFrame, cancelFrame }: RingSweepAdapters) {
  return function useRingSweep(value: number, from: number | null): number {
    const [start, setStart] = useState<number | null>(from)
    const sweeping = start !== null
    useEffect(() => {
      if (!sweeping) return
      let second = 0
      const first = requestFrame(() => { second = requestFrame(() => setStart(null)) })
      return () => { cancelFrame(first); cancelFrame(second) }
    }, [sweeping])
    return start ?? value
  }
}
