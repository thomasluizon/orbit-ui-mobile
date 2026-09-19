import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { GamificationProfile } from '@orbit/shared/types/gamification'
import { createMockGamificationProfile } from '@orbit/shared/__tests__/factories'
import { useGamificationProfile } from '@/hooks/use-gamification'
import {
  holdAccount,
  recoverSameAccount,
  replaceAccountWith,
} from '@/__tests__/support/account-change'

const mocks = vi.hoisted(() => ({ useQuery: vi.fn() }))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: mocks.useQuery,
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

function serveProfile(profile: GamificationProfile | null): void {
  mocks.useQuery.mockReturnValue({ data: profile, isLoading: false, isError: false })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  serveProfile(createMockGamificationProfile({ level: 4 }))
  holdAccount('user-1')
})

afterEach(() => {
  cleanup()
  mocks.useQuery.mockReset()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

/** Account A reaches level 5 and taps through the celebration, which records the acknowledgement. */
function acknowledgeLevelFive(rendered: ReturnType<typeof renderHook<ReturnType<typeof useGamificationProfile>, void>>) {
  act(() => serveProfile(createMockGamificationProfile({ level: 5 })))
  rendered.rerender()
  expect(rendered.result.current.leveledUp).toBe(true)
  act(() => rendered.result.current.clearLevelUp())
  rendered.rerender()
  expect(rendered.result.current.leveledUp).toBe(false)
}

it('celebrates the next account reaching a level the previous account acknowledged', async () => {
  const rendered = renderHook(() => useGamificationProfile())
  acknowledgeLevelFive(rendered)

  await replaceAccountWith('user-2')
  act(() => serveProfile(null))
  rendered.rerender()
  act(() => serveProfile(createMockGamificationProfile({ level: 4 })))
  rendered.rerender()
  act(() => serveProfile(createMockGamificationProfile({ level: 5 })))
  rendered.rerender()

  expect(rendered.result.current.leveledUp).toBe(true)
})

it('keeps the acknowledgement when the same account recovers from a rejected refresh', async () => {
  const rendered = renderHook(() => useGamificationProfile())
  acknowledgeLevelFive(rendered)

  await recoverSameAccount('user-1')
  rendered.rerender()

  expect(rendered.result.current.leveledUp).toBe(false)
})
