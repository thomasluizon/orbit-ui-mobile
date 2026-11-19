import type { StateHook } from './state-adapter'

interface LoadingAdapters {
  useState: StateHook
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) => void
}

/** A region that mounts while its data is pending shows loading on the first frame. A later request, or a key change after the previous key settled, waits 300 ms. A skeleton that already shows stays while a new key is pending. */
export function createUseDelayedLoading({ useState, useEffect }: LoadingAdapters) {
  return function useDelayedLoading(busy: boolean, key: string): boolean {
    const [loading, setLoading] = useState({ busy, key, visible: busy })
    const changed = loading.busy !== busy || loading.key !== key
    const carried = busy && loading.busy && loading.visible
    if (changed) setLoading({ busy, key, visible: carried })
    useEffect(() => {
      if (!busy) return
      const timer = setTimeout(() => setLoading({ busy, key, visible: true }), 300)
      return () => clearTimeout(timer)
    }, [busy, key])
    return busy && (changed ? carried : loading.visible)
  }
}
