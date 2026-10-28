import type { StateHook } from './state-adapter'

interface ConversationCrossfadeSnapshotAdapters {
  useState: StateHook
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) => void
}

export type ConversationCrossfadeSnapshotHook = <Children>(changeKey: string, children: Children, durationMs: number) => {
  key: string
  previous: Children | null
}

export function createUseConversationCrossfadeSnapshot({ useState, useEffect }: ConversationCrossfadeSnapshotAdapters): ConversationCrossfadeSnapshotHook {
  return function useConversationCrossfadeSnapshot<Children>(changeKey: string, children: Children, durationMs: number) {
    const [snapshot, setSnapshot] = useState({ key: changeKey, children, previous: null as Children | null })
    if (snapshot.key !== changeKey) setSnapshot({ key: changeKey, children, previous: durationMs > 0 ? snapshot.children : null })
    else if (snapshot.children !== children || (durationMs === 0 && snapshot.previous !== null)) {
      setSnapshot({ ...snapshot, children, previous: durationMs > 0 ? snapshot.previous : null })
    }
    useEffect(() => {
      if (snapshot.previous === null || durationMs === 0) return
      const timer = setTimeout(() => setSnapshot(current => ({ ...current, previous: null })), durationMs)
      return () => clearTimeout(timer)
    }, [snapshot.key, snapshot.previous, durationMs])
    return { key: snapshot.key, previous: durationMs > 0 ? snapshot.previous : null }
  }
}
