import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import en from '@orbit/shared/i18n/en.json'
import { API } from '@orbit/shared/api'
import { habitKeys, profileKeys } from '@orbit/shared/query'
import { computeHabitFutureHint } from '@orbit/shared/utils'
import { createMockHabitScheduleChild, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'

const TODAY = '2026-09-12'
const TOMORROW = '2026-09-13'
const PINNED_TEST_TIME = new Date(`${TODAY}T09:00:00.000Z`)
vi.setSystemTime(PINNED_TEST_TIME)

const api = vi.hoisted(() => ({
  items: [] as unknown[],
  writes: [] as string[],
  listReads: 0,
  unexpectedReads: [] as string[],
  onWrite: (_path: string): unknown => null,
}))

vi.mock('@/lib/server-fetch', () => ({
  serverAuthMutate: async (path: string, init: { method?: string }) => {
    api.writes.push(`${init.method} ${path}`)
    return api.onWrite(path)
  },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))

import { HabitList } from '@/components/habits/habit-list'
import { TodayProvider } from '@/app/(app)/today-provider'
import { profileFixture } from '@/test-support/hermetic/mock-api/fixtures/profile'

const profile = { ...profileFixture, language: 'en', timeZone: 'UTC' }

function child(id: string, title: string) {
  return createMockHabitScheduleChild({ id, title, dueDate: TODAY, scheduledDates: [TODAY],
    instances: [{ date: TODAY, status: 'Pending', logId: null }] })
}

/** A daily parent that is due today, with two daily sub-habits that are due today. Nothing has a log. */
function dueTodayTree(): HabitScheduleItem[] {
  return [createMockHabitScheduleItem({
    id: 'parent', title: 'Parent', dueDate: TODAY, scheduledDates: [TODAY], hasSubHabits: true,
    instances: [{ date: TODAY, status: 'Pending', logId: null }],
    children: [child('child-a', 'Child A'), child('child-b', 'Child B')],
  })]
}

/**
 * The same tree after the API accepts the parent log. Source: orbit-api `Habit.Log` advances a
 * recurring habit to its next due date and keeps `IsCompleted` false, `MapToScheduleItem` sets
 * `isLoggedInRange` from the log, and no code path logs the children.
 */
function parentLoggedTree(): HabitScheduleItem[] {
  const [parent] = dueTodayTree()
  return [{ ...parent!, isCompleted: false, isLoggedInRange: true, dueDate: TOMORROW,
    instances: [{ date: TODAY, status: 'Completed', logId: 'log-parent' }] }]
}

function row(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-testid="habit-row"][data-habit-id="${id}"]`)
  if (!element) throw new Error(`Row ${id} is not rendered`)
  return element
}

function title(id: string): HTMLElement {
  return row(id).querySelector<HTMLElement>('[data-habit-row-title-block] > :first-child')!
}

function check(id: string): HTMLElement {
  return row(id).querySelector<HTMLElement>('[data-habit-check]')!
}

function visibleMetaTokens(id: string): string[] {
  return [...row(id).querySelectorAll<HTMLElement>('[data-habit-row-meta] [data-habit-row-meta-token]')]
    .map((token) => token.textContent!.replace(/·$/, ''))
}

function checkControl(id: string): HTMLButtonElement {
  return row(id).querySelector<HTMLButtonElement>('[data-habit-row-control="check"]')!
}

/** Everything a sighted person sees on the row: hidden text, names for assistive technology and state attributes are removed. */
function visiblePresentation(id: string): string {
  const copy = row(id).cloneNode(true) as HTMLElement
  copy.querySelectorAll('.sr-only').forEach((node) => node.remove())
  for (const node of [copy, ...copy.querySelectorAll<HTMLElement>('*')]) {
    for (const name of node.getAttributeNames()) {
      if (name.startsWith('aria-') || name === 'id' || name === 'title' || name === 'data-status') node.removeAttribute(name)
    }
  }
  return copy.outerHTML
}

async function logParentFromTodayList() {
  api.items = dueTodayTree()
  api.writes = []
  api.listReads = 0
  api.unexpectedReads = []
  api.onWrite = (path) => {
    if (path !== API.habits.log('parent')) throw new Error(`Unexpected write: ${path}`)
    const unlog = api.writes.length > 1
    api.items = unlog ? dueTodayTree() : parentLoggedTree()
    /** Source: orbit-api `LogHabitCommand.HandleUnlogAsync` answers with the removed log id, no first completion and no XP. */
    return unlog
      ? { logId: 'log-parent', isFirstCompletionToday: false, previousStreak: 1, currentStreak: 0, linkedGoalUpdates: [] }
      : { logId: 'log-parent', isFirstCompletionToday: true, previousStreak: 0, currentStreak: 1,
        linkedGoalUpdates: [], xpEarned: 0, newAchievementIds: [] }
  }
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const path = input instanceof Request ? input.url : input.toString()
    const pathname = new URL(path, 'http://orbit.test').pathname
    if (pathname === API.habits.list) {
      api.listReads += 1
      return Response.json({ items: api.items, totalCount: api.items.length, totalPages: 1, page: 1, pageSize: 200 })
    }
    if (pathname === API.profile.get) return Response.json(profile)
    api.unexpectedReads.push(pathname)
    return Response.json({})
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(profileKeys.detail(), profile)
  client.setQueryData(habitKeys.count(), 3)
  render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
    <QueryClientProvider client={client}><TodayProvider>
      <HabitList view="today" filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }} />
    </TodayProvider></QueryClientProvider>
  </NextIntlClientProvider>)
  await waitFor(() => expect(document.querySelectorAll('[data-testid="habit-row"]').length).toBe(3))

  const before = {
    parentStatus: row('parent').dataset.status,
    parentControlDisabled: checkControl('parent').disabled || checkControl('parent').getAttribute('aria-disabled') === 'true',
    parentControlLabel: checkControl('parent').getAttribute('aria-label'),
    presentation: visiblePresentation('parent'),
  }
  const listReadsBeforeLog = api.listReads
  fireEvent.click(checkControl('parent'))
  await waitFor(() => expect(api.writes.length).toBeGreaterThan(0))
  await waitFor(() => expect(api.listReads).toBeGreaterThan(listReadsBeforeLog))
  await waitFor(() => expect(row('parent').dataset.status).toBe('done'))
  /** The row keeps a short "recently completed" state after a log; wait until only the server state is left. */
  await new Promise((resolve) => setTimeout(resolve, 2000))
  return { before, client }
}

beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('logs only the parent: the control is enabled and one log goes to the API', async () => {
  const { before } = await logParentFromTodayList()
  expect({ disabled: before.parentControlDisabled, label: before.parentControlLabel })
    .toEqual({ disabled: false, label: 'Not done, Log Habit: Parent, 0/2' })
  expect(api.writes).toEqual([`POST ${API.habits.log('parent')}`])
  expect({ status: row('parent').dataset.status, label: checkControl('parent').getAttribute('aria-label') })
    .toEqual({ status: 'done', label: 'Done, Mark incomplete: Parent, 0/2' })
})

it('leaves the sub-habits unlogged with their own empty checks', async () => {
  await logParentFromTodayList()
  expect(api.writes.filter((write) => write.includes('child-') || write.includes('bulk'))).toEqual([])
  expect([row('child-a').dataset.status, row('child-b').dataset.status]).toEqual(['empty', 'empty'])
})

it('shows the next due label once, as the last visible metadata token of the logged parent', async () => {
  await logParentFromTodayList()
  const nextDueLabel = computeHabitFutureHint({ dueDate: TOMORROW }, TODAY, createTranslator({ locale: 'en', messages: en }) as never, 'en')
  const labelNodes = [...row('parent').querySelectorAll<HTMLElement>('*')]
    .filter((node) => node.children.length === 0 && node.textContent === nextDueLabel)
  expect({
    nextDueLabel,
    visibleLabelNodes: labelNodes.filter((node) => node.closest('.sr-only') === null && node.closest('[data-habit-row-meta]') !== null).length,
    hiddenLabelNodes: labelNodes.filter((node) => node.closest('.sr-only') !== null).length,
    lastVisibleToken: visibleMetaTokens('parent').at(-1),
  }).toEqual({ nextDueLabel: 'due tomorrow', visibleLabelNodes: 1, hiddenLabelNodes: 0, lastVisibleToken: 'due tomorrow' })
})

it('shows the done disc and the dimmed title on the logged parent, and keeps the child count', async () => {
  const { before } = await logParentFromTodayList()
  expect({
    visiblePresentationChangedAfterLog: visiblePresentation('parent') !== before.presentation,
    checkFill: check('parent').style.background,
    sweep: check('parent').querySelector('path[stroke-dasharray]'),
    titleColor: title('parent').style.color,
    titleOpacity: title('parent').style.opacity,
    childCount: visibleMetaTokens('parent').includes('0 of 2'),
  }).toEqual({
    visiblePresentationChangedAfterLog: true,
    checkFill: 'var(--fg-1)',
    sweep: null,
    titleColor: 'var(--habit-row-meta-color)',
    titleOpacity: '',
    childCount: true,
  })
  expect([title('child-a').style.color, title('child-b').style.color]).toEqual(['var(--fg-2)', 'var(--fg-2)'])
})

it('restores the full parent row when the log is removed, with no dialog', async () => {
  const { before } = await logParentFromTodayList()
  fireEvent.click(checkControl('parent'))
  await waitFor(() => expect(api.writes).toEqual([`POST ${API.habits.log('parent')}`, `POST ${API.habits.log('parent')}`]))
  await waitFor(() => expect(row('parent').dataset.status).toBe('empty'))
  await waitFor(() => expect(visiblePresentation('parent')).toBe(before.presentation))
  expect(document.querySelector('[role="dialog"], [role="alertdialog"]')).toBeNull()
})
