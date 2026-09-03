import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TodayPageClient } from '@/app/(app)/today-page-client'

const mocks = vi.hoisted(() => ({
  animate: vi.fn((_value: unknown, _target: number) => ({ stop: vi.fn() })),
  reducedMotion: false,
  motionSets: [] as number[],
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
vi.mock('motion/react', async () => {
  const React = await import('react')
  return {
    animate: mocks.animate,
    m: { div: ({ children, ...props }: { children?: React.ReactNode }) => <div {...props}>{children}</div> },
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

    mocks.view.nav.dateStr = '2026-08-30'
    page.rerender(<TodayPageClient initialToday="2026-08-29" initialHabits={null} />)

    expect(mocks.motionSets).toEqual([8, 0.9])
    expect(mocks.animate.mock.calls.map(([, target]) => target)).toEqual([0, 1])

    mocks.view.nav.dateStr = '2026-08-31'
    page.rerender(<TodayPageClient initialToday="2026-08-29" initialHabits={null} />)

    expect(mocks.motionSets).toEqual([8, 0.9])
    expect(mocks.animate).toHaveBeenCalledTimes(4)
  })

  it('settles an active transition when reduced motion is enabled without changing the date', () => {
    const page = render(<TodayPageClient initialToday="2026-08-29" initialHabits={null} />)
    mocks.view.nav.dateStr = '2026-08-28'

    page.rerender(<TodayPageClient initialToday="2026-08-29" initialHabits={null} />)
    expect(mocks.motionSets).toEqual([-8, 0.9])

    mocks.reducedMotion = true
    mocks.motionSets.length = 0
    mocks.animate.mockClear()
    page.rerender(<TodayPageClient initialToday="2026-08-29" initialHabits={null} />)

    expect(mocks.motionSets).toEqual([1, 0])
    expect(mocks.animate).not.toHaveBeenCalled()
  })
})
