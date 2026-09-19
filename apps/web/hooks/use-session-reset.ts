'use client'

import {
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
 * Drops account-scoped state the moment the tab moves to another account. The app shell never
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

/**
 * A `useState` that returns to its initial value the moment the tab moves to another account.
 *
 * Every call site this replaces was the same three lines: the state, a reset that listed it, and a
 * `useResetOnAccountChange` holding them together. Nine rounds of `#1019` each closed one surface
 * and left the next one open, because the reset is a second thing to remember and the state is the
 * first. Here the state IS the reset, so a surface that adopts this hook cannot forget it.
 *
 * The initial value is re-read at the account change rather than captured at mount, so a lazy
 * initializer that reads a module-level grant returns the NEXT account's answer, not the previous
 * account's: React reads a function handed to the setter as an updater, and an initializer takes no
 * argument, so the same value runs the same way at the mount and at the reset. Pass a function
 * wherever the initial value is a fresh object, for the reason React already documents: an eagerly
 * built one is shared between the mount and every later reset.
 */
export function useAccountScopedState<S>(
  initialState: S | (() => S),
): [S, Dispatch<SetStateAction<S>>] {
  const [value, setValue] = useState(initialState)
  const latestInitialState = useRef(initialState)

  useEffect(() => {
    latestInitialState.current = initialState
  })

  useResetOnAccountChange(() => setValue(latestInitialState.current))

  return [value, setValue]
}
