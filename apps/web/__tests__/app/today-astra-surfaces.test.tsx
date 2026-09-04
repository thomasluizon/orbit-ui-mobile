import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TodayPageClient } from '@/app/(app)/today-page-client'

const mocks = vi.hoisted(() => ({
  animate: vi.fn(
    (_value: unknown, _target: number, _transition?: { duration?: number }) => ({
      stop: vi.fn(),
    }),
  ),
  reducedMotion: false,
  motionSets: [] as number[],
  view: {
    isSelectMode: false,
    showCreateModal: false,
    listSurfaceOpen: false,
    data: {
      habitsById: new Map([['habit-1', { id: 'habit-1' }]]),
      filters: {},
      isFetching: false,
      isRefetching: false,
      showLoadError: false,
      habitsCount: 1,
    },
    habitListRef: { current: null },
    nav: {
      today: '2026-08-29',
      dateStr: '2026-08-29',
      selectedDate: new Date('2026-08-29T00:00:00'),
      goToNextDay: vi.fn(),
      dateNav: { nextDisabled: false },
    },
    selectedHabitIds: new Set<string>(),
    selection: { handleToggleSelection: vi.fn() },
    setHabitListAllCollapsed: vi.fn(),
    setListSurfaceOpen: vi.fn(),
    setShowCreateModal: vi.fn(),
    showCompleted: false,
    toggleSelectMode: vi.fn(),
  },
}))

vi.mock('@/app/(app)/use-today-page', () => ({ useTodayPage: () => mocks.view }))
vi.mock('@/app/(app)/today-page-view', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/(app)/today-page-view')>()),
  TodayHeaderRegion: () => null,
  TodayOverlays: () => null,
}))
vi.mock('@/components/habits/habit-list', () => ({
  HabitList: () => <div data-testid="today-habit-list" />,
}))
vi.mock('@/components/today/today-astra', () => ({
  TodayAstra: ({ suppressed }: { suppressed: boolean }) => (
    <div data-testid="today-astra" data-suppressed={suppressed ? 'true' : 'false'} />
  ),
}))
vi.mock('motion/react', async () => {
  const React = await import('react')
  const MotionDiv = ({
    children,
    style: _style,
    ...props
  }: {
    children?: React.ReactNode
    style?: unknown
    [key: string]: unknown
  }) => <div {...props}>{children}</div>

  return {
    animate: mocks.animate,
    m: { div: MotionDiv },
    motion: { div: MotionDiv },
    useMotionValue: (initial: number) => {
      return React.useMemo(() => {
        let value = initial
        return {
          get: () => value,
          set: (next: number) => {
            value = next
            mocks.motionSets.push(next)
          },
        }
      }, [initial])
    },
    useReducedMotion: () => mocks.reducedMotion,
  }
})

describe('web Today Astra owned surfaces', () => {
  beforeEach(() => {
    mocks.view.isSelectMode = false
    mocks.view.showCreateModal = false
    mocks.view.listSurfaceOpen = false
    mocks.view.data.isFetching = false
    mocks.view.data.isRefetching = false
    mocks.view.data.showLoadError = false
    mocks.view.data.habitsCount = 1
    mocks.view.nav.dateStr = '2026-08-29'
    mocks.animate.mockClear()
    mocks.reducedMotion = false
    mocks.motionSets.length = 0
  })

  it('stands down while the create surface is open', () => {
    const page = render(<TodayPageClient initialToday="2026-08-29" initialHabits={null} />)
    expect(screen.getByTestId('today-astra')).toHaveAttribute('data-suppressed', 'false')

    mocks.view.showCreateModal = true
    page.rerender(<TodayPageClient initialToday="2026-08-29" initialHabits={null} />)

    expect(screen.getByTestId('today-astra')).toHaveAttribute('data-suppressed', 'true')
  })

  it('retargets the full day block from its live value when the date changes quickly', () => {
    const page = render(<TodayPageClient initialToday="2026-08-29" initialHabits={null} />)
    mocks.animate.mockClear()

    mocks.view.nav.dateStr = '2026-08-30'
    page.rerender(<TodayPageClient initialToday="2026-08-29" initialHabits={null} />)

    expect(mocks.motionSets).toEqual([8, 0.9])
    expect(mocks.animate.mock.calls.map(([, target]) => target)).toEqual([0, 1])

    mocks.view.nav.dateStr = '2026-08-31'
    page.rerender(<TodayPageClient initialToday="2026-08-29" initialHabits={null} />)

    expect(mocks.motionSets).toEqual([8, 0.9])
    expect(mocks.animate).toHaveBeenCalledTimes(4)
  })

  it('renders the real panel with one day owner and an independent refetch channel', () => {
    const page = render(<TodayPageClient initialToday="2026-08-29" initialHabits={null} />)
    const dayOwner = page.container.querySelector('[data-today-day-transition]')
    const refetchChannel = screen.getByTestId('today-refetch-motion')

    expect(dayOwner).toContainElement(refetchChannel)
    expect(refetchChannel).toContainElement(screen.getByTestId('today-habit-list'))
    expect(screen.queryByTestId('today-day-motion')).not.toBeInTheDocument()

    mocks.animate.mockClear()
    mocks.motionSets.length = 0
    mocks.view.data.isRefetching = true
    page.rerender(<TodayPageClient initialToday="2026-08-29" initialHabits={null} />)

    expect(mocks.animate.mock.calls.map(([, target]) => target)).toEqual([0.8, 4])
    expect(mocks.motionSets).toEqual([])
  })

  it('settles an active transition when reduced motion is enabled without changing the date', () => {
    const page = render(<TodayPageClient initialToday="2026-08-29" initialHabits={null} />)
    mocks.animate.mockClear()
    mocks.view.nav.dateStr = '2026-08-28'

    page.rerender(<TodayPageClient initialToday="2026-08-29" initialHabits={null} />)
    expect(mocks.motionSets).toEqual([-8, 0.9])

    mocks.reducedMotion = true
    mocks.motionSets.length = 0
    mocks.animate.mockClear()
    page.rerender(<TodayPageClient initialToday="2026-08-29" initialHabits={null} />)

    expect(mocks.motionSets).toEqual([1, 0])
    expect(mocks.animate.mock.calls.map(([, target, transition]) => ({
      target,
      duration: transition?.duration,
    }))).toEqual([
      { target: 1, duration: 0.07 },
      { target: 0, duration: 0.07 },
    ])
  })
})
