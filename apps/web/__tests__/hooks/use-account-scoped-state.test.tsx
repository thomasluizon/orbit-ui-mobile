import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { holdAccount, recoverSameAccount, replaceAccountWith } from '@/__tests__/support/account-change'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  holdAccount('user-1')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('returns to its initial value when another account replaces the tab', async () => {
  const { result } = renderHook(() => useAccountScopedState(''))
  act(() => result.current[1]('a half-written message'))
  expect(result.current[0]).toBe('a half-written message')

  await replaceAccountWith('user-2')

  expect(result.current[0]).toBe('')
})

it('keeps its value when the same account recovers from a rejected refresh', async () => {
  const { result } = renderHook(() => useAccountScopedState(''))
  act(() => result.current[1]('a half-written message'))

  await recoverSameAccount('user-1')

  expect(result.current[0]).toBe('a half-written message')
})

it('re-runs a lazy initializer, so a module-level grant answers for the next account', async () => {
  let grant = true
  const { result } = renderHook(() => useAccountScopedState(() => grant))
  expect(result.current[0]).toBe(true)

  grant = false
  await replaceAccountWith('user-2')

  expect(result.current[0]).toBe(false)
})

it('builds a fresh object per account rather than sharing the first one', async () => {
  const { result } = renderHook(() => useAccountScopedState(() => new Set<string>()))
  const firstAccountSet = result.current[0]
  act(() => result.current[1](new Set(['habit-1'])))

  await replaceAccountWith('user-2')

  expect(result.current[0]).not.toBe(firstAccountSet)
  expect(result.current[0].size).toBe(0)
})
