import { useEffect, useRef, useSyncExternalStore } from 'react'
import { getSessionEpoch, subscribeToSessionEpoch } from '@/lib/session-epoch'

/**
 * Drops account-scoped state the moment the device moves to another session. The root layout never
 * unmounts, so a hook keeps its own state across an account change and no store reset can reach it.
 * The caller passes the reset it owns; the callback may be rebuilt on every render, because the
 * latest one is read at the moment the session changes rather than captured in a dependency.
 */
export function useResetOnSessionChange(reset: () => void): void {
  const sessionEpoch = useSyncExternalStore(
    subscribeToSessionEpoch,
    getSessionEpoch,
    getSessionEpoch,
  )
  const latestReset = useRef(reset)
  const resetSessionEpoch = useRef(sessionEpoch)

  useEffect(() => {
    latestReset.current = reset
  })

  useEffect(() => {
    if (resetSessionEpoch.current === sessionEpoch) return
    resetSessionEpoch.current = sessionEpoch
    latestReset.current()
  }, [sessionEpoch])
}
