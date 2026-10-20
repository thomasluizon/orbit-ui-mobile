import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useDismissGuard } from '@/hooks/use-dismiss-guard'
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

it('drops the discard question when another account replaces the tab', async () => {
  const onDismiss = vi.fn()
  const { result } = renderHook(() => useDismissGuard({ isDirty: true, onDismiss }))
  act(() => result.current.requestDismiss())
  expect(result.current.showDiscardDialog).toBe(true)

  await replaceAccountWith('user-2')

  expect(result.current.showDiscardDialog).toBe(false)
  expect(onDismiss).not.toHaveBeenCalled()
})

it('keeps the discard question when the same account recovers from a rejected refresh', async () => {
  const onDismiss = vi.fn()
  const { result } = renderHook(() => useDismissGuard({ isDirty: true, onDismiss }))
  act(() => result.current.requestDismiss())

  await recoverSameAccount('user-1')

  expect(result.current.showDiscardDialog).toBe(true)
})
