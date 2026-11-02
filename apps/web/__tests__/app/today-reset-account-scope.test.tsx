import { act, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { habitKeys } from '@orbit/shared/query'
import { TodayPageClient } from '@/app/(app)/today-page-client'
import type { TodayInitialHabits } from '@/app/(app)/today-initial-data'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'
import { useUIStore } from '@/stores/ui-store'

const boundary = vi.hoisted(() => ({ seed: vi.fn() }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-profile', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-profile')>(),
  useProfile: () => ({ profile: createMockProfile() }),
}))
vi.mock('@/app/(app)/use-today-page', () => ({ useTodayPage: (_today: string, initialHabits: TodayInitialHabits | null) => {
  boundary.seed(initialHabits)
  return { nav: { today: '2026-09-12', dateStr: '2026-09-12' }, data: { hasFetched: true } }
} }))
vi.mock('@/app/(app)/today-page-view', () => ({ TodayHeaderRegion: () => null, TodayHabitsPanel: () => null, TodayOverlays: () => null }))
vi.mock('@/components/today/setup-checklist-card', () => ({ SetupChecklistCard: () => null }))
vi.mock('@/components/today/today-astra', () => ({ TodayAstra: () => null }))

it('keeps the server preload fenced after an account change and a Hoje reset', async () => {
  vi.stubGlobal('fetch', vi.fn())
  holdAccount('account-one')
  const initialHabits = { queryKey: habitKeys.list({}), items: [], totalCount: 0 }
  const rendered = render(<TodayPageClient initialToday="2026-09-12" initialHabits={initialHabits} />)
  try {
    expect(boundary.seed).toHaveBeenLastCalledWith(initialHabits)
    await replaceAccountWith('account-two')
    await act(async () => { useUIStore.getState().resetToday() })
    expect(boundary.seed).toHaveBeenLastCalledWith(null)
  } finally {
    rendered.unmount()
    vi.unstubAllGlobals()
  }
})
