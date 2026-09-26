'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { getAccountGeneration, subscribeToAccountGeneration } from '@/lib/session-epoch'

/** Reads how many accounts this tab has held, and re-renders on the next one. State that must
 * outlive a render but not an account reads this instead of resetting itself in an effect. */
export function useAccountGeneration(): number {
  return useSyncExternalStore(
    subscribeToAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  )
}

/**
 * Drops account-scoped state the moment the tab moves to another account. The app shell
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

/** Reset local state when the tab changes accounts, including state a caller may forget to clear. */
export function useAccountScopedState<S>(
  initialState: S | (() => S),
): [S, Dispatch<SetStateAction<S>>] {
  const accountGeneration = useAccountGeneration()
  const [value, setValue] = useState(initialState)
  const [valueAccountGeneration, setValueAccountGeneration] = useState(accountGeneration)

  if (valueAccountGeneration !== accountGeneration) {
    setValueAccountGeneration(accountGeneration)
    setValue(initialState)
  }

  const setAccountValue = useCallback<Dispatch<SetStateAction<S>>>((nextValue) => {
    if (getAccountGeneration() !== accountGeneration) return
    setValue(nextValue)
  }, [accountGeneration])

  return [value, setAccountValue]
}
