import React from 'react'
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { computeHabitFutureHint } from '@orbit/shared/utils'
import { createMockHabitScheduleChild, createMockHabitScheduleItem, createMockProfile } from '@orbit/shared/__tests__/factories'
import { DEFAULT_CONFIG } from '@orbit/shared/types/config'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'
import { HabitList } from '@/components/habit-list'
import { i18n } from '@/lib/i18n'
import { createTokensV2 } from '@/lib/theme'
import { configCache } from '@/lib/config-cache'
import { __resetTestHostConfig, __setWindowDimensions } from '@/test-mocks/react-native'

vi.unmock('react-i18next')

const TODAY = '2026-09-12'
const TOMORROW = '2026-09-13'
const PINNED_TEST_TIME = new Date(`${TODAY}T09:00:00.000Z`)

const api = vi.hoisted(() => ({
  items: [] as unknown[],
  writes: [] as string[],
  queue: new Map<string, Record<string, unknown>>(),
}))

vi.mock('@/lib/api-client', () => ({ apiClient: (url: string, init?: { method?: string }) => {
  const path = url.split('?')[0]!
  if (init?.method && init.method !== 'GET') {
    api.writes.push(`${init.method} ${path}`)
    if (path !== API.habits.log('parent')) return Promise.reject(new Error(`Unexpected write: ${path}`))
    const unlog = api.writes.length > 1
    api.items = unlog ? dueTodayTree() : parentLoggedTree()
    /** Source: orbit-api `LogHabitCommand` answers a log with the new log id, and an unlog with the removed log id and no first completion. */
    return Promise.resolve(unlog
      ? { logId: 'log-parent', isFirstCompletionToday: false, previousStreak: 1, currentStreak: 0, linkedGoalUpdates: [] }
      : { logId: 'log-parent', isFirstCompletionToday: true, previousStreak: 0, currentStreak: 1, linkedGoalUpdates: [], xpEarned: 0, newAchievementIds: [] })
  }
  if (path === API.profile.get) return Promise.resolve(createMockProfile({ language: 'en', timeZone: 'UTC' }))
  if (path === API.config.get) return Promise.resolve(DEFAULT_CONFIG)
  if (path === API.habits.count) return Promise.resolve({ count: 3 })
  if (path === API.habits.list) return Promise.resolve({ items: api.items, totalCount: api.items.length, totalPages: 1, page: 1, pageSize: 200 })
  return Promise.resolve({})
} }))
vi.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: () => {},
    getAllSync: (sql: string) => sql.startsWith('PRAGMA table_info') ? [{ name: 'meta' }] : sql.startsWith('SELECT * FROM mutation_queue') ? [...api.queue.values()] : [],
    runSync: (sql: string, params: unknown[] = []) => {
      if (sql.startsWith('INSERT OR REPLACE INTO mutation_queue')) api.queue.set(String(params[0]), { id: params[0], timestamp: params[1], type: params[2], endpoint: params[3], method: params[4], payload: params[5], retries: params[6], max_retries: params[7], meta: params[8] ?? null })
      else if (sql.startsWith('DELETE FROM mutation_queue WHERE id = ?')) api.queue.delete(String(params[0]))
      else if (sql.startsWith('DELETE FROM mutation_queue')) api.queue.clear()
    },
    getFirstSync: (sql: string) => sql.startsWith('SELECT COUNT(*) as cnt') ? { cnt: api.queue.size } : null,
    withTransactionSync: (task: () => void) => task(),
  }),
}))
vi.mock('@/lib/offline-runtime', () => ({ getCurrentConnectivity: () => Promise.resolve(true) }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign((select: (state: { isAuthenticated: boolean }) => unknown) => select({ isAuthenticated: true }), {
    getState: () => ({ isAuthenticated: true, user: { userId: 'account-a' } }),
    subscribe: () => () => {},
  }),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('expo-crypto', () => ({ randomUUID: () => '22222222-2222-4222-8222-222222222222' }))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: () => null }))
vi.mock('@/components/habits/reschedule-sheet', () => ({ RescheduleSheet: () => null }))
vi.mock('@/lib/use-app-theme', () => ({ useAppTheme: () => ({ currentScheme: 'purple', currentTheme: 'dark' }) }))

const tokens = createTokensV2('purple', 'dark')

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

let tree: ReturnType<typeof TestRenderer.create> | undefined
let rowsTree: ReturnType<typeof TestRenderer.create> | undefined
let client: QueryClient

function renderList() {
  return <I18nextProvider i18n={i18n}><QueryClientProvider client={client}>
    <HabitList view="today" filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }} showCompleted onCreatePress={vi.fn()} />
  </QueryClientProvider></I18nextProvider>
}

/** The list renders its rows through `renderItem`; this mounts what it returns for every item, as the native list does. */
async function renderRows(): Promise<ReactTestInstance> {
  const list = tree!.root.findAll((node) => node.props.testID === 'habit-list')[0]!
  const items = list.props.data as unknown[]
  const renderItem = list.props.renderItem as (params: { item: unknown; index: number; drag: () => void; isActive: boolean; getIndex: () => number }) => React.ReactNode
  const element = <I18nextProvider i18n={i18n}><QueryClientProvider client={client}>
    {items.map((item, index) => <React.Fragment key={index}>{renderItem({ item, index, drag: () => {}, isActive: false, getIndex: () => index })}</React.Fragment>)}
  </QueryClientProvider></I18nextProvider>
  await act(async () => {
    if (rowsTree) rowsTree.update(element)
    else rowsTree = TestRenderer.create(element)
    await Promise.resolve()
  })
  return rowsTree!.root
}

async function settle() {
  for (let step = 0; step < 20; step += 1) await act(async () => { await vi.advanceTimersByTimeAsync(100) })
  await act(async () => { tree!.update(renderList()); await Promise.resolve() })
}

function row(root: ReactTestInstance, title: string): ReactTestInstance {
  const match = root.findAll((node) => node.props.testID === 'habit-row' && node.props.accessibilityLabel === title && typeof node.type === 'string')
  if (match.length !== 1) throw new Error(`Row ${title} is rendered ${match.length} times`)
  return match[0]!
}

function checkControl(rowNode: ReactTestInstance): ReactTestInstance {
  return rowNode.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button'
    && typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.includes(': Parent'))[0]!
}

function press(control: ReactTestInstance) {
  (control.props.onPress as () => void)()
}

function textsIn(node: ReactTestInstance): string[] {
  return node.findAll((candidate) => String(candidate.type) === 'Text')
    .map((text) => [text.props.children].flat().filter((part) => typeof part === 'string').join(''))
}

function titleColor(rowNode: ReactTestInstance, title: string): unknown {
  const text = rowNode.findAll((node) => String(node.type) === 'Text' && node.props.children === title)[0]!
  return [text.props.style].flat(Infinity).reduce((color: unknown, style) => (style as { color?: unknown } | null)?.color ?? color, undefined)
}

function visibleMeta(rowNode: ReactTestInstance): string[] {
  return rowNode.findAll((node) => node.props.testID === 'habit-row-meta' && typeof node.type === 'string').flatMap(textsIn).filter((text) => text !== '·')
}

function checkPaint(rowNode: ReactTestInstance) {
  const check = rowNode.findAll((node) => node.props.testID === 'habit-check' && typeof node.type === 'string')[0]!
  const style = Object.assign({}, ...[check.props.style].flat(Infinity)) as { backgroundColor?: string; borderWidth?: number }
  return { fill: style.backgroundColor, border: style.borderWidth, sweep: check.findAll((node) => node.props.strokeDasharray !== undefined).length }
}

async function logParentFromTodayList() {
  api.items = dueTodayTree()
  api.writes = []
  api.queue.clear()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => { tree = TestRenderer.create(renderList()); await Promise.resolve() })
  await settle()
  const before = await renderRows()
  const beforeState = {
    controlLabel: checkControl(row(before, 'Parent')).props.accessibilityLabel as string,
    controlDisabled: (checkControl(row(before, 'Parent')).props.accessibilityState as { disabled?: boolean } | undefined)?.disabled === true,
    meta: visibleMeta(row(before, 'Parent')),
    titleColor: titleColor(row(before, 'Parent'), 'Parent'),
    check: checkPaint(row(before, 'Parent')),
  }
  await act(async () => { press(checkControl(row(before, 'Parent'))); await Promise.resolve() })
  await settle()
  await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
  await settle()
  return { beforeState, after: await renderRows() }
}

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: false })
  vi.setSystemTime(PINNED_TEST_TIME)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  __setWindowDimensions({ width: 412, height: 915, scale: 2.625, fontScale: 1 })
  configCache.setAccount('account-a')
  await i18n.changeLanguage('en')
})

afterEach(async () => {
  await act(async () => { rowsTree?.unmount(); tree?.unmount(); await Promise.resolve() })
  rowsTree = undefined
  tree = undefined
  client.clear()
  configCache.setAccount(null)
  __resetTestHostConfig()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('logs only the parent: the control is enabled and one log goes to the API', async () => {
  const { beforeState, after } = await logParentFromTodayList()
  expect({ disabled: beforeState.controlDisabled, label: beforeState.controlLabel })
    .toEqual({ disabled: false, label: 'Not done, Log Habit: Parent, 0/2' })
  expect(api.writes).toEqual([`POST ${API.habits.log('parent')}`])
  expect(checkControl(row(after, 'Parent')).props.accessibilityLabel).toBe('Done, Mark incomplete: Parent, 0/2')
})

it('leaves the sub-habits unlogged with their own empty checks', async () => {
  const { after } = await logParentFromTodayList()
  expect(api.writes.filter((write) => write.includes('child-') || write.includes('bulk'))).toEqual([])
  expect(['Child A', 'Child B'].map((title) => checkPaint(row(after, title)).fill)).toEqual(['transparent', 'transparent'])
})

it('shows the next due label once, as the last visible metadata token of the logged parent', async () => {
  const { after } = await logParentFromTodayList()
  const nextDueLabel = computeHabitFutureHint({ dueDate: TOMORROW }, TODAY, (key: string, params?: Record<string, string | number | Date>) => String(i18n.t(key, params)), 'en')
  expect({ nextDueLabel, meta: visibleMeta(row(after, 'Parent')) })
    .toEqual({ nextDueLabel: 'due tomorrow', meta: ['Habit', '0 of 2', 'due tomorrow'] })
  const body = row(after, 'Parent').findAll((node) => node.props.delayLongPress === 500 && typeof node.type === 'string')[0]!
  expect(`${String(body.props.accessibilityLabel)} ${String(body.props.accessibilityHint)}`.split('due tomorrow')).toHaveLength(2)
})

it('shows the done disc and the dimmed title on the logged parent, and keeps the child count', async () => {
  const { beforeState, after } = await logParentFromTodayList()
  expect(beforeState).toMatchObject({ meta: ['Habit', '0 of 2'], titleColor: tokens.fg1, check: { fill: 'transparent', border: 1 } })
  expect({ titleColor: titleColor(row(after, 'Parent'), 'Parent'), check: checkPaint(row(after, 'Parent')) })
    .toEqual({ titleColor: tokens.fg3, check: { fill: tokens.fg1, border: 0, sweep: 0 } })
  expect(['Child A', 'Child B'].map((title) => titleColor(row(after, title), title))).toEqual([tokens.fg2, tokens.fg2])
})

it('restores the full parent row when the log is removed', async () => {
  const { beforeState, after } = await logParentFromTodayList()
  await act(async () => { press(checkControl(row(after, 'Parent'))); await Promise.resolve() })
  await settle()
  const restored = await renderRows()
  expect(api.writes).toEqual([`POST ${API.habits.log('parent')}`, `POST ${API.habits.log('parent')}`])
  expect({
    meta: visibleMeta(row(restored, 'Parent')),
    titleColor: titleColor(row(restored, 'Parent'), 'Parent'),
    check: checkPaint(row(restored, 'Parent')),
  }).toEqual({ meta: beforeState.meta, titleColor: beforeState.titleColor, check: beforeState.check })
})
