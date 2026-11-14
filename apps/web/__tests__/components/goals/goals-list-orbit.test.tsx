import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import type { Goal } from '@orbit/shared/types/goal'
import { GOAL_SEEN_PROGRESS_STORAGE_KEY } from '@orbit/shared/utils/goal-seen-progress'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { accountStorageKey } from '@/lib/account-storage-key'

const mocks = vi.hoisted(() => ({
  guided: true,
  reducedMotion: false,
  goals: { data: { allGoals: [] as Goal[] } as { allGoals: Goal[] } | undefined, isError: false, isLoading: false, refetch: vi.fn() },
  reorder: vi.fn(),
  openedGoal: null as string | null,
}))

vi.mock('next/navigation', () => ({ usePathname: () => '/progress/goals', useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('@/hooks/use-flag', () => ({ useFlag: () => mocks.guided }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsDesktop: () => false, useIsWideDesktop: () => false }))
vi.mock('@/hooks/use-goals', () => ({
  useCreateGoal: vi.fn(),
  useGoals: () => mocks.goals,
  useReorderGoals: () => ({ isError: false, isPending: false, mutate: mocks.reorder }),
}))
vi.mock('@/components/goals/goal-detail-drawer', () => ({
  GoalDetailDrawer: ({ goalId }: { goalId: string }) => { mocks.openedGoal = goalId; return <div data-testid="goal-detail">{goalId}</div> },
}))
vi.mock('@/components/goals/create-goal-sheet', () => ({ CreateGoalSheet: () => <div data-testid="create-goal" /> }))

import { ProgressContent } from '@/app/(app)/progress/_components/progress-content'

const read = createMockGoal({ id: 'read', title: 'Read 12 books', currentValue: 6, targetValue: 12, unit: 'books', progressPercentage: 50 })
const run = createMockGoal({ id: 'run', title: 'Run 100 km', currentValue: 25, targetValue: 100, unit: 'km', progressPercentage: 25 })

function stubMedia() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? mocks.reducedMotion : false,
    media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(),
  }))
}

function renderGoals(locale: 'en' | 'pt-BR' = 'en') {
  return render(<NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ptBR}><ProgressContent screen="goals" /></NextIntlClientProvider>)
}

const ring = (title: string) => within(screen.getByRole('button', { name: (name) => name.startsWith(title) })).getByRole('progressbar')
const seenKey = () => accountStorageKey(GOAL_SEEN_PROGRESS_STORAGE_KEY)
async function nextFrames() {
  await act(async () => { await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))) })
}

describe('goals list on the Orbit logic', () => {
  beforeEach(() => {
    mocks.guided = true
    mocks.reducedMotion = false
    mocks.goals = { data: { allGoals: [read, run] }, isError: false, isLoading: false, refetch: vi.fn() }
    mocks.reorder.mockClear()
    mocks.openedGoal = null
    localStorage.clear()
    stubMedia()
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it.each(['en', 'pt-BR'] as const)('shows Orbit at rest, the title and one action in the empty state in %s', (locale) => {
    mocks.goals = { data: { allGoals: [] }, isError: false, isLoading: false, refetch: vi.fn() }
    const view = renderGoals(locale)
    const catalog = locale === 'en' ? en : ptBR
    const empty = view.container.querySelector('[data-empty-state]')!
    const orbit = empty.querySelector('[data-asset="orbit-mascot"]')
    expect(orbit).toHaveAttribute('data-orbit-state', 'parado')
    expect(orbit).toHaveAttribute('width', '96')
    expect(within(empty as HTMLElement).getByText(catalog.progressScreen.goals.empty)).toBeInTheDocument()
    expect(within(empty as HTMLElement).getAllByRole('button')).toHaveLength(1)
    fireEvent.click(within(empty as HTMLElement).getByRole('button', { name: catalog.progressScreen.goals.createAction }))
    expect(screen.getByTestId('create-goal')).toBeInTheDocument()
  })

  it('sweeps the ring once from the value of the last visit and stores what it shows now', async () => {
    localStorage.setItem(seenKey(), JSON.stringify({ read: 25, run: 25 }))
    renderGoals()
    expect(ring('Read 12 books')).toHaveAttribute('aria-valuenow', '25')
    expect(ring('Read 12 books').parentElement).toHaveAttribute('data-ring-sweep', 'sweeping')
    expect(ring('Run 100 km').parentElement, 'a goal with no change is still').toHaveAttribute('data-ring-sweep', 'rest')
    await nextFrames()
    expect(ring('Read 12 books')).toHaveAttribute('aria-valuenow', '50')
    expect(ring('Read 12 books').parentElement).toHaveAttribute('data-ring-sweep', 'rest')
    expect(JSON.parse(localStorage.getItem(seenKey())!)).toEqual({ read: 50, run: 25 })
  })

  it('does not sweep on a first visit', () => {
    renderGoals()
    expect(ring('Read 12 books')).toHaveAttribute('aria-valuenow', '50')
    expect(ring('Read 12 books').parentElement).toHaveAttribute('data-ring-sweep', 'rest')
  })

  it('draws the final ring at once under reduced motion and still records the visit', () => {
    mocks.reducedMotion = true
    localStorage.setItem(seenKey(), JSON.stringify({ read: 25 }))
    renderGoals()
    expect(ring('Read 12 books')).toHaveAttribute('aria-valuenow', '50')
    expect(ring('Read 12 books').parentElement).toHaveAttribute('data-ring-sweep', 'rest')
    expect(JSON.parse(localStorage.getItem(seenKey())!)).toEqual({ read: 50, run: 25 })
  })

  it('keeps the current list with the flag off: no sweep and nothing stored', () => {
    mocks.guided = false
    localStorage.setItem(seenKey(), JSON.stringify({ read: 25 }))
    renderGoals()
    expect(ring('Read 12 books')).toHaveAttribute('aria-valuenow', '50')
    expect(JSON.parse(localStorage.getItem(seenKey())!)).toEqual({ read: 25 })
  })

  it('keeps the filter with its empty text, the create action, the keyboard reorder and the open press', () => {
    renderGoals()
    fireEvent.keyDown(screen.getByRole('button', { name: (name) => name.startsWith('Read 12 books') }), { key: 'ArrowDown', altKey: true })
    expect(mocks.reorder).toHaveBeenCalledWith([{ id: 'run', position: 0 }, { id: 'read', position: 1 }], expect.anything())
    expect(screen.getByRole('button', { name: en.goals.create })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: (name) => name.startsWith('Run 100 km') }))
    expect(mocks.openedGoal).toBe('run')
  })

  it('shows the filter-empty text when no goal matches the view, and clears it', async () => {
    mocks.goals = { data: { allGoals: [createMockGoal({ id: 'done', title: 'Done goal', status: 'Completed', progressPercentage: 100 })] }, isError: false, isLoading: false, refetch: vi.fn() }
    renderGoals()
    fireEvent.click(screen.getByRole('button', { name: `${en.progressScreen.goals.filter}: ${en.progressScreen.goals.all}` }))
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: en.progressScreen.goals.abandoned }))
    expect(screen.getByText(en.progressScreen.goals.filterEmpty)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: en.progressScreen.goals.clearFilter }))
    expect(screen.queryByText(en.progressScreen.goals.filterEmpty)).not.toBeInTheDocument()
  })

  it('shows the loading skeleton and the error with retry', () => {
    mocks.goals = { data: undefined, isError: false, isLoading: true, refetch: vi.fn() }
    const loading = renderGoals()
    expect(screen.getByRole('progressbar', { name: en.progressScreen.loading })).toHaveAttribute('aria-busy', 'true')
    loading.unmount()
    const refetch = vi.fn()
    mocks.goals = { data: undefined, isError: true, isLoading: false, refetch }
    renderGoals()
    fireEvent.click(screen.getByRole('button', { name: en.progressScreen.retry }))
    expect(refetch).toHaveBeenCalled()
  })
})
