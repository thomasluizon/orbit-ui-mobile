import { useLayoutEffect, type Dispatch, type SetStateAction } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, renderHook } from '@testing-library/react'
import { useAccountGeneration, useAccountScopedState } from '@/hooks/use-session-reset'
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

it('commits no render that still carries the value of the account it left', async () => {
  const committed: Array<[number, string]> = []
  let write: Dispatch<SetStateAction<string>> = () => {}

  function Draft() {
    const accountGeneration = useAccountGeneration()
    const [value, setValue] = useAccountScopedState('')
    write = setValue
    useLayoutEffect(() => {
      committed.push([accountGeneration, value])
    })
    return null
  }

  render(<Draft />)
  act(() => write('a half-written message'))
  const generationBeforeTheChange = committed.at(-1)?.[0] ?? 0

  await replaceAccountWith('user-2')

  const rendersUnderTheNextAccount = committed.filter(
    ([accountGeneration]) => accountGeneration > generationBeforeTheChange,
  )
  expect(rendersUnderTheNextAccount.length).toBeGreaterThan(0)
  expect(rendersUnderTheNextAccount.map(([, value]) => value)).toEqual(
    rendersUnderTheNextAccount.map(() => ''),
  )
})

it('ignores a setter captured by a request from the previous account', async () => {
  const { result } = renderHook(() => useAccountScopedState(''))
  const previousAccountSetter = result.current[1]

  await replaceAccountWith('user-2')
  act(() => previousAccountSetter('old request result'))

  expect(result.current[0]).toBe('')
})
