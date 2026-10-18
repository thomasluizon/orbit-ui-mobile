import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useTodayPage } from '@/app/(app)/use-today-page'
import { useUIStore } from '@/stores/ui-store'

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  pinnedDateStr: '2026-04-01' as string | null,
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: navigation.replace }) }))
vi.mock('@/app/(app)/use-today-navigation', () => ({ useTodayNavigation: () => ({
  pinnedDateStr: navigation.pinnedDateStr,
  dateStr: navigation.pinnedDateStr ?? '2026-04-08',
  today: '2026-04-08',
  isTodaySelected: !navigation.pinnedDateStr,
}) }))
vi.mock('@/app/(app)/use-today-habits-data', () => ({ useTodayHabitsData: () => ({ habitsCount: 0, hasFetched: true }) }))
vi.mock('@/app/(app)/use-today-selection', () => ({ useTodaySelection: () => ({}) }))
vi.mock('@/hooks/use-overlay-escape', () => ({ useOverlayEscape: () => {} }))
vi.mock('@/hooks/use-session-reset', () => ({ useAccountGeneration: () => 0 }))

beforeEach(() => {
  navigation.pinnedDateStr = '2026-04-01'
  navigation.replace.mockReset()
  useUIStore.setState({ activeView: 'today', isSelectMode: false, showCreateModal: false })
})

it.each(['all', 'general'] as const)('removes the stale date before %s reload or creation return', (view) => {
  const first = renderHook(() => useTodayPage('2026-04-08', null))
  act(() => first.result.current.changeView(view))
  expect(navigation.replace).toHaveBeenCalledWith('/')
  expect(useUIStore.getState().activeView).toBe(view)
  first.unmount()
  navigation.pinnedDateStr = null
  const returned = renderHook(() => useTodayPage('2026-04-08', null))
  expect(returned.result.current.activeView).toBe(view)
  navigation.pinnedDateStr = '2026-04-02'
  returned.rerender()
  expect(returned.result.current.activeView).toBe('today')
})
