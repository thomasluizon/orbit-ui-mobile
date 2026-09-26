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
 * Drops account-scoped state the moment the device moves to another account. The root layout
 * never unmounts, so a hook keeps its own state across an account change and no store reset
 * can reach it.
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
