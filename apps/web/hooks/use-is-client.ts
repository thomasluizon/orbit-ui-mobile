'use client'

import { useSyncExternalStore } from 'react'

function noopSubscribe() {
  return () => {}
}

function getSnapshot() {
  return true
}

function getServerSnapshot() {
  return false
}

/**
 * Returns true after client hydration, false during SSR.
 *
 * Use this instead of the legacy `const [mounted, setMounted] = useState(false);
 * useEffect(() => setMounted(true), [])` pattern, which trips
 * react-hooks/set-state-in-effect.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, getSnapshot, getServerSnapshot)
}
