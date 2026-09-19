import { useEffect, useRef, useSyncExternalStore } from 'react'
import { getAccountGeneration, subscribeToAccountGeneration } from '@/lib/session-epoch'

/** Reads how many accounts this device has held, and re-renders on the next one. State that must
 * outlive a render but not an account reads this instead of resetting itself in an effect. */
export function useAccountGeneration(): number {
  return useSyncExternalStore(
    subscribeToAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  )
}

/**
 * Drops account-scoped state the moment the device moves to another account. The root layout never
 * unmounts, so a hook keeps its own state across an account change and no store reset can reach it.
 * The caller passes the reset it owns; the callback may be rebuilt on every render, because the
 * latest one is read at the moment the account changes rather than captured in a dependency.
 *
 * It follows the ACCOUNT rather than the session epoch, which rises on every credential change: a
 * rejected refresh that recovers as the same account would otherwise revoke a pasted image the
 * person is still looking at behind the expiry banner.
 */
export function useResetOnAccountChange(reset: () => void): void {
  const accountGeneration = useAccountGeneration()
  const latestReset = useRef(reset)
  const resetAccountGeneration = useRef(accountGeneration)

  useEffect(() => {
    latestReset.current = reset
  })

  useEffect(() => {
    if (resetAccountGeneration.current === accountGeneration) return
    resetAccountGeneration.current = accountGeneration
    latestReset.current()
  }, [accountGeneration])
}
