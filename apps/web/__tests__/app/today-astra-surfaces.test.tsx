import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TodayPageClient } from '@/app/(app)/today-page-client'

const mocks = vi.hoisted(() => ({
  view: {
    isSelectMode: false,
    showCreateModal: false,
    listSurfaceOpen: false,
    data: {
      habitsById: new Map([['habit-1', { id: 'habit-1' }]]),
      isFetching: false,
      showLoadError: false,
      habitsCount: 1,
    },
    nav: { today: '2026-08-29', dateStr: '2026-08-29' },
  },
}))

vi.mock('@/app/(app)/use-today-page', () => ({ useTodayPage: () => mocks.view }))
vi.mock('@/app/(app)/today-page-view', () => ({
  TodayHeaderRegion: () => null,
  TodayHabitsPanel: () => null,
  TodayOverlays: () => null,
}))
vi.mock('@/components/today/today-astra', () => ({
  TodayAstra: ({ suppressed }: { suppressed: boolean }) => (
    <div data-testid="today-astra" data-suppressed={suppressed ? 'true' : 'false'} />
  ),
}))

describe('web Today Astra owned surfaces', () => {
  beforeEach(() => {
    mocks.view.isSelectMode = false
    mocks.view.showCreateModal = false
    mocks.view.listSurfaceOpen = false
    mocks.view.data.isFetching = false
    mocks.view.data.showLoadError = false
    mocks.view.data.habitsCount = 1
  })

  it('stands down while the create surface is open', () => {
    const page = render(<TodayPageClient initialToday="2026-08-29" initialHabits={null} />)
    expect(screen.getByTestId('today-astra')).toHaveAttribute('data-suppressed', 'false')

    mocks.view.showCreateModal = true
    page.rerender(<TodayPageClient initialToday="2026-08-29" initialHabits={null} />)

    expect(screen.getByTestId('today-astra')).toHaveAttribute('data-suppressed', 'true')
  })
})
