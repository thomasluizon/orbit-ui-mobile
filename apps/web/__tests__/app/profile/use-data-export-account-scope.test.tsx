import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ exportUserData: vi.fn() }))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/lib/actions/profile', () => ({
  exportUserData: () => mocks.exportUserData(),
}))

import { useDataExport } from '@/app/(app)/profile/_components/use-data-export'
import { holdAccount, recoverSameAccount, replaceAccountWith } from '@/__tests__/support/account-change'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  mocks.exportUserData.mockReset().mockResolvedValue({})
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:orbit')
  globalThis.URL.revokeObjectURL = vi.fn()
  holdAccount('user-1')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('drops the export notice when another account replaces the tab', async () => {
  const { result } = renderHook(() => useDataExport())
  await act(async () => {
    await result.current.exportData()
  })
  await waitFor(() => expect(result.current.exportDone).toBe(true))

  await replaceAccountWith('user-2')

  expect(result.current.exportDone).toBe(false)
})

it('keeps the export notice when the same account recovers from a rejected refresh', async () => {
  const { result } = renderHook(() => useDataExport())
  await act(async () => {
    await result.current.exportData()
  })
  await waitFor(() => expect(result.current.exportDone).toBe(true))

  await recoverSameAccount('user-1')

  expect(result.current.exportDone).toBe(true)
})
