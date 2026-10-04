import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react'
import React from 'react'
import { createTranslator } from 'next-intl'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { launchChrome, closeChrome } from '@/__tests__/support/chromium'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockHabit, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { formatAPIDate, formatAPIDateInTimeZone } from '@orbit/shared/utils'
import { useAppToastStore } from '@/stores/app-toast-store'
import { Toast } from '@/components/ui/toast'
import { habitScheduleItemSchema, skipHabitRequestSchema } from '@orbit/shared/types/habit'
import type { HabitScheduleItem, NormalizedHabit } from '@orbit/shared/types/habit'
import type { HabitVisibilityOptions } from '@orbit/shared/utils/habit-visibility'

const PINNED_TEST_TIME = new Date('2026-09-12T09:00:00.000Z')
vi.setSystemTime(PINNED_TEST_TIME)
beforeEach(() => vi.setSystemTime(PINNED_TEST_TIME))
afterEach(() => vi.useRealTimers())

const TODAY = formatAPIDate(new Date())
const YESTERDAY = formatAPIDate(new Date(Date.now() - 24 * 60 * 60 * 1000))
const TOMORROW = formatAPIDate(new Date(Date.now() + 24 * 60 * 60 * 1000))
const dragLocale = vi.hoisted(() => ({ portuguese: false }))
const accountDate = vi.hoisted(() => ({ timeZone: undefined as string | undefined }))
const accountHabitCount = vi.hoisted(() => ({ count: 0, isLoaded: true }))

const skipFlow = vi.hoisted(() => ({
  active: false,
  items: [] as HabitScheduleItem[],
  original: [] as HabitScheduleItem[],
  mutate: vi.fn(),
}))

vi.mock('@/lib/server-fetch', () => ({ serverAuthMutate: skipFlow.mutate }))
vi.mock('@/lib/api-fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-fetch')>()),
  fetchJson: async () => ({ items: skipFlow.items, totalCount: skipFlow.items.length, totalPages: 1, page: 1, pageSize: 200 }),
}))

function SkipToastHost() {
  const current = useAppToastStore((state) => state.currentToast)
  if (!current) return null
  const toast = current.toast
  return (toast.kind === 'neutral' || toast.kind === 'lost') && toast.actionLabel
    ? <Toast {...toast} onAction={useAppToastStore.getState().triggerAction} />
    : <Toast {...toast} />
}

vi.mock('@/hooks/use-habit-queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-habit-queries')>()),
  useHabitCountLoaded: () => accountHabitCount,
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { timeZone: accountDate.timeZone } }),
}))
vi.mock('@/app/(app)/today-provider', () => ({
  useToday: (timeZone?: string) => timeZone === undefined
    ? formatAPIDate(new Date())
    : formatAPIDateInTimeZone(new Date(), timeZone),
}))


const mockHabitsData = {
  habitsById: new Map<string, NormalizedHabit>(),
  childrenByParent: new Map<string, string[]>(),
  topLevelHabits: [] as NormalizedHabit[],
  totalCount: 0,
}
const logHabitMutateAsync = vi.fn()
const habitListRefetch = vi.fn()
const skipHabitMutateAsync = vi.fn()
const deleteHabitMutateAsync = vi.fn()
const duplicateHabitMutateAsync = vi.fn()
const toggleSelectionSpy = vi.fn()
const drillRefreshCurrent = vi.fn()
const drillInto = vi.fn()
const routerPush = vi.fn()
const getDrillChildrenMock = vi.fn(() => [])
let mockHabitsDataUpdatedAt = 1
let useActualHabitVisibility = false
const mockDrillState = {
  drillStack: [] as string[],
  currentParentId: null as string | null,
  currentParent: null as NormalizedHabit | null,
  drillChildren: [] as NormalizedHabit[],
  completedCount: 0,
  hasUnfilteredChildren: false,
  canRevealCompletedChildren: false,
  drillInto,
  drillBack: vi.fn(),
  drillReset: vi.fn(),
  drillLoading: false,
  drillError: null as unknown,
  refreshCurrent: drillRefreshCurrent,
  getDrillChildren: getDrillChildrenMock,
}
let capturedDrillOptions: HabitVisibilityOptions | undefined

vi.mock('next-intl', async (importOriginal) => {
  const { default: messages } = await import('@orbit/shared/i18n/en.json')
  return {
  ...(await importOriginal<typeof import('next-intl')>()),
  useTranslations: () => {
    if (dragLocale.portuguese) return createTranslator({ locale: 'pt-BR', messages: ptBR })
    const t = (key: string, params?: Record<string, unknown>) => {
      if (key === 'habits.deleteListConfirmMessage') {
        return messages.habits.deleteListConfirmMessage
          .replaceAll('{name}', String(params?.name))
          .replaceAll('{count}', String(params?.count))
      }
      if (params && Object.keys(params).length > 0) {
        return `${key}(${JSON.stringify(params)})`
      }
      return key
    }
    return t
  },
  useLocale: () => dragLocale.portuguese ? 'pt-BR' : 'en',
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))

vi.mock('@/hooks/use-habits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-habits')>()
  return ({
  ...actual,
  useHabits: (...args: Parameters<typeof actual.useHabits>) => skipFlow.active ? actual.useHabits(...args) : ({
    data: mockHabitsData,
    isLoading: false,
    error: null,
    dataUpdatedAt: mockHabitsDataUpdatedAt,
    refetch: habitListRefetch,
    getChildren: (parentId: string) => {
      const childIds = mockHabitsData.childrenByParent.get(parentId) ?? []
      return childIds
        .map((id) => mockHabitsData.habitsById.get(id))
        .filter(Boolean) as NormalizedHabit[]
    },
  }),
  useLogHabit: () => ({ mutateAsync: logHabitMutateAsync, mutate: vi.fn(), isPending: false }),
  useSkipHabit: () => skipFlow.active ? actual.useSkipHabit() : ({ mutateAsync: skipHabitMutateAsync, isPending: false }),
  useDeleteHabit: () => ({ mutateAsync: deleteHabitMutateAsync, isPending: false }),
  useDuplicateHabit: () => ({ mutateAsync: duplicateHabitMutateAsync, isPending: false }),
  useReorderHabits: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMoveHabitParent: () => ({ mutateAsync: vi.fn(), isPending: false }),
})
})

vi.mock('@/hooks/use-habit-visibility', async () => {
  const { createHabitVisibilityHelpers } = await import('@orbit/shared/utils/habit-visibility')

  return {
    useHabitVisibility: (options: HabitVisibilityOptions) => {
      const helpers = createHabitVisibilityHelpers(options)

      return {
        ...helpers,
        hasVisibleContent: useActualHabitVisibility
          ? helpers.hasVisibleContent
          : () => true,
        isRelevantToday: () => true,
        isDueOnSelectedDate: () => true,
      }
    },
  }
})

vi.mock('@/hooks/use-drill-navigation', () => ({
  useDrillNavigation: (_byId: unknown, _updated: unknown, options: HabitVisibilityOptions) => {
    capturedDrillOptions = options
    return mockDrillState
  },
}))

vi.mock('@/hooks/use-config', () => ({
  useConfig: () => ({
    config: { limits: { maxHabitDepth: 5 } },
  }),
}))

vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({
    displayTime: (time: string) => time,
    currentFormat: '24h' as const,
    toggleFormat: vi.fn(),
  }),
}))

vi.mock('@/stores/ui-store', () => ({
  setUIAccountScope: vi.fn(),
  useUIStore: () => null,
}))

vi.mock('@orbit/shared/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/utils')>()

  return {
    ...actual,
    formatAPIDate: (date?: Date) => {
      const d = date ?? new Date()
      return d.toISOString().split('T')[0]
    },
  }
})

const rowImplementation = vi.hoisted(() => ({ actual: false }))
vi.mock('@/components/habits/habit-row', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/habits/habit-row')>()
  const StubHabitRow = ({
    habit,
    childProgress,
    state,
    selectMode,
    structuralColumn,
    selected,
    canLog,
    completionReadOnly,
    actions,
  }: {
    habit: NormalizedHabit
    childProgress?: { done: number; total: number }
    state?: string
    selectMode?: boolean
    structuralColumn?: boolean
    selected?: boolean
    canLog?: boolean
    completionReadOnly?: boolean
    actions?: {
      onLog?: () => void
      onUnlog?: () => void
      onSkip?: () => void
      onDelete?: () => void
      onEdit?: () => void
      onDuplicate?: () => void
      onDetail?: () => void
      onAddSubHabit?: () => void
      onToggleSelection?: () => void
    }
  }) => (
    <div
      data-testid={`habit-card-${habit.id}`}
      data-select-mode={selectMode ? 'yes' : 'no'}
      data-structural-column={structuralColumn ? 'yes' : 'no'}
      data-selected={selected ? 'yes' : 'no'}
      data-state={state}
      data-can-log={canLog ? 'yes' : 'no'}
      data-read-only={completionReadOnly ? 'yes' : 'no'}
      data-has-skip={actions?.onSkip ? 'yes' : 'no'}
    >
      <span>{habit.title}</span>
      <span data-testid={`habit-progress-${habit.id}`}>
        {childProgress?.done ?? 0}/{childProgress?.total ?? 0}
      </span>
      <span data-testid={`recent-${habit.id}`}>
        {state === 'done' ? 'yes' : 'no'}
      </span>
      <button data-testid={`log-${habit.id}`} onClick={actions?.onLog}>
        log
      </button>
      <button data-testid={`unlog-${habit.id}`} onClick={actions?.onUnlog}>
        unlog
      </button>
      <button data-testid={`delete-${habit.id}`} onClick={actions?.onDelete}>
        delete
      </button>
      <button data-testid={`skip-${habit.id}`} onClick={actions?.onSkip}>
        skip
      </button>
      <button data-testid={`edit-${habit.id}`} onClick={actions?.onEdit}>
        edit
      </button>
      <button data-testid={`duplicate-${habit.id}`} onClick={actions?.onDuplicate}>
        duplicate
      </button>
      <button data-testid={`detail-${habit.id}`} onClick={actions?.onDetail}>
        detail
      </button>
      <button data-testid={`add-sub-${habit.id}`} onClick={actions?.onAddSubHabit}>
        add sub-habit
      </button>
      {selectMode && (
        <button
          data-testid={`select-${habit.id}`}
          onClick={actions?.onToggleSelection}
        >
          select
        </button>
      )}
    </div>
  )
  return {
    ...actual,
    HabitRow: (props: React.ComponentProps<typeof actual.HabitRow>) =>
      rowImplementation.actual
        ? React.createElement(actual.HabitRow, props)
        : React.createElement(StubHabitRow, props),
  }
})

vi.mock('@/components/habits/create-habit-modal', () => ({
  CreateHabitModal: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="Create habit" /> : null,
}))

vi.mock('@/components/habits/reschedule-sheet', () => ({
  RescheduleSheet: () => null,
}))

vi.mock('@/components/habits/edit-habit-modal', () => ({
  EditHabitModal: ({
    open,
    habit,
    onSaved,
    lockedGeneral,
  }: {
    open: boolean
    habit?: NormalizedHabit | null
    onSaved?: () => void | Promise<void>
    lockedGeneral?: boolean | null
  }) =>
    open ? (
      <>
        <button data-testid="edit-habit-modal-save" onClick={() => void onSaved?.()}>save</button>
        <span data-testid="edit-habit-modal-title">{habit?.title ?? ''}</span>
        <span data-testid="edit-habit-modal-locked-general">{String(lockedGeneral)}</span>
      </>
    ) : null,
}))

vi.mock('@/components/habits/log-habit-modal', () => ({
  LogHabitModal: () => null,
}))


vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()

  return {
    ...actual,
    useSensor: actual.useSensor,
    useSensors: (...sensors: Parameters<typeof actual.useSensors>) => {
      const registered = actual.useSensors(...sensors)
      return dragLocale.portuguese ? registered : []
    },
  }
})

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => null,
    },
  },
}))

import { HabitList, type HabitListHandle } from '@/components/habits/habit-list'
import { sheetTestControls } from '@/__tests__/support/sheet-double'
import {
  holdAccount,
  recoverSameAccount,
  replaceAccountWith,
} from '@/__tests__/support/account-change'


function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const result = render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )

  return {
    ...result,
    rerenderWithProviders(nextUi: React.ReactElement) {
      result.rerender(
        <QueryClientProvider client={queryClient}>{nextUi}</QueryClientProvider>,
      )
    },
  }
}

function createHabitListTree(queryClient: QueryClient) {
  return (
    <QueryClientProvider client={queryClient}>
      <HabitList filters={defaultFilters} />
    </QueryClientProvider>
  )
}

function getSortableDescriptions(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[aria-roledescription="dragAndDrop.roleDescription"]'),
  ).map((row) => row.getAttribute('aria-describedby') ?? '')
}

async function confirmVisibleSheet(title: string, confirmLabel: string) {
  const confirmation = await screen.findByRole('dialog', { name: title })
  await act(async () => {
    fireEvent.click(within(confirmation).getByRole('button', { name: confirmLabel }))
  })
}

async function confirmRowSkip(habitId: string) {
  fireEvent.click(screen.getByTestId(`skip-${habitId}`))
  await act(async () => { await Promise.resolve() })
}

const defaultFilters = {
  dateFrom: '2025-01-01',
  dateTo: '2025-01-01',
  includeOverdue: true,
}


describe('HabitList', () => {
  function renderPortugueseDragList() {
    dragLocale.portuguese = true
    const habit = createMockHabit({ title: 'Ler um livro', scheduledDates: [TODAY] })
    mockHabitsData.habitsById = new Map([[habit.id, habit]])
    mockHabitsData.topLevelHabits = [habit]
    return renderWithProviders(<HabitList view="today" filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }} />)
  }

  it('localizes the habit drag instructions in Portuguese', () => {
    const { container } = renderPortugueseDragList()
    const sortable = container.querySelector('[aria-roledescription]')!
    const instructions = document.getElementById(sortable.getAttribute('aria-describedby')!)!
    expect(instructions).toHaveTextContent('barra de espaço')
    expect(instructions).not.toHaveTextContent('To pick up')
  })

  it('localizes each sortable habit role in Portuguese', () => {
    const { container } = renderPortugueseDragList()
    const sortables = container.querySelectorAll('[aria-roledescription]')
    expect(sortables).toHaveLength(1)
    for (const sortable of sortables) expect(sortable).toHaveAttribute('aria-roledescription', 'item reordenável')
  })

  it('names the habit in a Portuguese keyboard drag announcement', async () => {
    const { container } = renderPortugueseDragList()
    const sortable = container.querySelector<HTMLElement>('[aria-roledescription]')!
    sortable.focus()
    fireEvent.keyDown(sortable, { key: ' ', code: 'Space' })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Ler um livro selecionado para mover.'))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Movimento de Ler um livro cancelado.'))
  })

  it('centres Hoje rows in 68px panels with a contrasting parent track in both modes', async () => {
    rowImplementation.actual = true
    const parent = createMockHabit({ id: 'parent', title: 'Parent', hasSubHabits: true, scheduledDates: [TODAY] })
    const child = createMockHabit({ id: 'child', title: 'Child', parentId: parent.id, scheduledDates: [TODAY] })
    const single = createMockHabit({ id: 'single', title: 'Single', scheduledDates: [TODAY] })
    for (const habit of [parent, child, single]) mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent, single]
    const { container } = renderWithProviders(<HabitList view="today" filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }} />)
    fireEvent.click(screen.getByRole('button', { name: 'common.collapse' }))
    const cssPath = resolve(process.cwd(), 'app/globals.css')
    const stylesheet = await postcss([tailwind()]).process(readFileSync(cssPath, 'utf8'), { from: cssPath })
    const launch = launchChrome()
    try {
      const browser = await launch
      for (const mode of ['dark', 'light'] as const) {
        const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([name, value]) => `${name}:${value};`).join('')
        const page = await browser.newPage()
        await page.setContent(`<html class="${mode}"><style>${stylesheet.css}:root{${variables}}</style><body style="background:var(--bg)">${container.innerHTML}</body></html>`)
        const panels = await page.locator('.habit-panel').evaluateAll((elements) => elements.map((panel) => {
          const row = panel.querySelector('[data-testid="habit-row"]')!
          const well = row.querySelector('[data-habit-row-body] > span')!
          const bounds = panel.getBoundingClientRect()
          const wellBounds = well.getBoundingClientRect()
          const track = row.querySelector('circle')
          return {
            height: bounds.height,
            top: wellBounds.top - bounds.top,
            bottom: bounds.bottom - wellBounds.bottom,
            track: track ? getComputedStyle(track).stroke : null,
            card: getComputedStyle(panel).backgroundColor,
            canvas: getComputedStyle(document.body).backgroundColor,
          }
        }))
        expect(panels).toHaveLength(2)
        expect(panels[0]?.track).toBe(mode === 'dark' ? 'rgb(122, 122, 125)' : 'rgb(127, 127, 131)')
        for (const panel of panels) {
          expect(panel.height).toBe(68)
          expect(panel.top).toBeCloseTo(panel.bottom, 1)
          if (panel.track) expect(contrastOnSurface(panel.track, [panel.canvas, panel.card])).toBeGreaterThanOrEqual(3)
        }
        await page.close()
      }
    } finally {
      await closeChrome(launch)
    }
  }, 45_000)

  it('shows only the time on timed rows and no routine meta on untimed rows', () => {
    rowImplementation.actual = true
    const habits = [
      createMockHabit({ id: 'timed', title: 'Timed', dueTime: '21:00', scheduledDates: [TODAY] }),
      createMockHabit({ id: 'untimed', title: 'Untimed', scheduledDates: [TODAY],
        checklistItems: [{ text: 'One', isChecked: true }] }),
    ]
    for (const habit of habits) mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.topLevelHabits = habits
    renderWithProviders(<HabitList view="today" filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }} />)
    const [timed, untimed] = screen.getAllByTestId('habit-row')
    expect(timed).toHaveTextContent(/21:00|9:00/)
    expect(timed).not.toHaveTextContent('habits.frequency')
    expect(untimed).not.toHaveTextContent(/habits.frequency|1\/1/)
  })

  it('shows the derived child count instead of a parent schedule or checklist', () => {
    rowImplementation.actual = true
    const parent = createMockHabit({ id: 'parent', title: 'Parent', hasSubHabits: true,
      dueTime: '21:00', scheduledDates: [TODAY] })
    const children = [false, true].map((isCompleted, index) => createMockHabit({
      id: `child-${index}`, title: `Child ${index}`, parentId: parent.id, isCompleted, scheduledDates: [TODAY],
    }))
    for (const habit of [parent, ...children]) mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.childrenByParent.set(parent.id, children.map((child) => child.id))
    mockHabitsData.topLevelHabits = [parent]
    renderWithProviders(<HabitList view="today" filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }} />)
    const row = screen.getAllByTestId('habit-row')[0]!
    expect(row).toHaveTextContent('habits.rowProgress({"done":1,"total":2})')
    expect(row).not.toHaveTextContent(/21:00|9:00|habits.frequency/)
  })

  it.each([
    { label: 'ordinary', isOverdue: false, isBadHabit: false, isCompleted: false, isLoggedInRange: false,
      words: [] },
    { label: 'overdue', isOverdue: true, isBadHabit: false, isCompleted: false, isLoggedInRange: false,
      words: ['habits.overdue'] },
    { label: 'completed slip', isOverdue: false, isBadHabit: true, isCompleted: true, isLoggedInRange: false,
      words: ['habits.statusDot.bad'] },
    { label: 'recorded slip', isOverdue: true, isBadHabit: true, isCompleted: false, isLoggedInRange: true,
      words: ['habits.overdue', 'habits.statusDot.bad'] },
    { label: 'unrecorded bad habit', isOverdue: false, isBadHabit: true, isCompleted: false, isLoggedInRange: false,
      words: [] },
    { label: 'completed overdue habit', isOverdue: true, isBadHabit: false, isCompleted: true, isLoggedInRange: false,
      words: [] },
  ])('preserves parent progress and applicable state words for $label', ({ label, words, ...flags }) => {
    rowImplementation.actual = true
    const parent = createMockHabit({ id: 'parent', title: label, hasSubHabits: true,
      dueTime: '21:00', scheduledDates: [TODAY], ...flags })
    const children = [false, true].map((isCompleted, index) => createMockHabit({
      id: `child-${index}`, title: `Child ${index}`, parentId: parent.id, isCompleted, scheduledDates: [TODAY],
    }))
    for (const habit of [parent, ...children]) mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.childrenByParent.set(parent.id, children.map((child) => child.id))
    mockHabitsData.topLevelHabits = [parent]
    renderWithProviders(<HabitList view="today" showCompleted
      filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }} />)
    const row = screen.getAllByTestId('habit-row')[0]!
    const progress = within(row).getByText(/habits\.rowProgress/)
    expect(progress).toHaveTextContent(['habits.rowProgress({"done":1,"total":2})', ...words].join('·'))
    for (const word of ['habits.overdue', 'habits.statusDot.bad']) {
      if (!words.includes(word)) expect(progress).not.toHaveTextContent(word)
    }
    expect(progress).not.toHaveTextContent(/21:00|9:00|habits.frequency/)
    const body = row.querySelector<HTMLButtonElement>('[data-habit-row-body]')!
    const bodyName = [label, ['habits.rowProgress({"done":1,"total":2})', ...words].join('·')].join('')
    expect(within(row).getByRole('button', {
      name: (name) => name.replaceAll(' ', '') === bodyName.replaceAll(' ', ''),
    })).toBe(body)
    const state = flags.isBadHabit ? 'bad' : flags.isCompleted ? 'done' : flags.isOverdue ? 'overdue' : 'empty'
    expect(within(row).getByRole('button', {
      name: `habits.statusDot.${state}, habits.${state === 'done' ? 'actions.unlog' : 'logHabit'}: ${label}, 1/2`,
    })).toBeEnabled()
    expect(within(row).getByRole('button', { name: 'habits.actions.more' })).toBeEnabled()
  })

  it('explains an offline sub-habit request beside the parent row', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    try {
      const habit = createMockHabit({ id: 'offline-parent', title: 'Parent', scheduledDates: [TODAY] })
      mockHabitsData.habitsById.set(habit.id, habit)
      mockHabitsData.topLevelHabits = [habit]
      mockHabitsData.totalCount = 1
      renderWithProviders(<HabitList view="today" selectedDate={new Date(`${TODAY}T12:00:00`)} filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }} />)
      fireEvent.click(screen.getByTestId('add-sub-offline-parent'))
      expect(screen.getByText('offline.create.reason')).toBeVisible()
      expect(screen.queryByRole('dialog', { name: 'Create habit' })).toBeNull()
    } finally {
      Reflect.deleteProperty(navigator, 'onLine')
    }
  })
  beforeEach(() => {
    dragLocale.portuguese = false
    skipFlow.active = false
    useAppToastStore.setState({ currentToast: null, queue: [] })
    rowImplementation.actual = false
    accountDate.timeZone = undefined
    capturedDrillOptions = undefined
    vi.clearAllMocks()
    sheetTestControls.defer(false)
    mockHabitsDataUpdatedAt = 1
    useActualHabitVisibility = false
    drillRefreshCurrent.mockReset()
    drillInto.mockReset()
    getDrillChildrenMock.mockReset()
    getDrillChildrenMock.mockReturnValue([])
    mockDrillState.drillStack = []
    mockDrillState.currentParentId = null
    mockDrillState.currentParent = null
    mockDrillState.drillChildren = []
    mockDrillState.completedCount = 0
    mockDrillState.hasUnfilteredChildren = false
    mockDrillState.canRevealCompletedChildren = false
    mockDrillState.drillLoading = false
    mockDrillState.drillError = null
    skipHabitMutateAsync.mockReset()
    skipHabitMutateAsync.mockResolvedValue(undefined)
    deleteHabitMutateAsync.mockReset()
    duplicateHabitMutateAsync.mockReset()
    toggleSelectionSpy.mockReset()
    habitListRefetch.mockReset()
    habitListRefetch.mockResolvedValue(undefined)
    logHabitMutateAsync.mockReset()
    logHabitMutateAsync.mockImplementation(async ({ habitId }: { habitId: string }) => {
      const habit = mockHabitsData.habitsById.get(habitId)
      if (!habit) return
      mockHabitsData.habitsById.set(habitId, {
        ...habit,
        isCompleted: true,
      })
    })
    mockHabitsData.habitsById.clear()
    mockHabitsData.childrenByParent.clear()
    mockHabitsData.topLevelHabits = []
    mockHabitsData.totalCount = 0
    accountHabitCount.count = 0
    accountHabitCount.isLoaded = true
  })

  it.each([false, true])('links disclosure panels through keyboard expansion without changing selection (select mode: %s)', async (selectMode) => {
    rowImplementation.actual = true
    const user = userEvent.setup()
    const parent = createMockHabit({ scheduledDates: [TODAY], id: 'parent', title: 'Parent', hasSubHabits: true })
    const child = createMockHabit({ scheduledDates: [TODAY], id: 'child', title: 'Child', parentId: parent.id })
    const secondParent = createMockHabit({ scheduledDates: [TODAY], id: 'second-parent', title: 'Second parent', hasSubHabits: true })
    const secondChild = createMockHabit({ scheduledDates: [TODAY], id: 'second-child', title: 'Second child', parentId: secondParent.id })
    for (const habit of [parent, child, secondParent, secondChild]) mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.childrenByParent.set(secondParent.id, [secondChild.id])
    mockHabitsData.topLevelHabits = [parent, secondParent]
    const selected = new Set([parent.id])
    renderWithProviders(<HabitList filters={defaultFilters} isSelectMode={selectMode}
      selectedHabitIds={selected} onToggleSelection={toggleSelectionSpy} />)

    const parentRow = screen.getAllByTestId('habit-row').find((row) => row.dataset.habitTitle === parent.title)!
    const disclosure = within(parentRow).getByRole('button', { name: 'common.collapse' })
    expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    expect(disclosure).toHaveAttribute('aria-controls')
    const panelId = disclosure.getAttribute('aria-controls')!
    const childPanel = document.getElementById(panelId)!
    expect(childPanel).toBeVisible()
    expect(within(childPanel).getByText(child.title)).toBeInTheDocument()
    expect(within(childPanel).queryByText(secondChild.title)).toBeNull()
    expect(within(childPanel).queryByText(parent.title)).toBeNull()
    const secondRow = screen.getAllByTestId('habit-row').find((row) => row.dataset.habitTitle === secondParent.title)!
    const secondPanelId = within(secondRow).getByRole('button', { name: 'common.collapse' }).getAttribute('aria-controls')!
    expect(secondPanelId).not.toBe(panelId)
    expect(within(document.getElementById(secondPanelId)!).getByText(secondChild.title)).toBeInTheDocument()

    disclosure.focus()
    await user.keyboard('{Enter}')
    expect(disclosure).toHaveFocus()
    expect(disclosure).toHaveAccessibleName('common.expand')
    expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    expect(disclosure).toHaveAttribute('aria-controls', panelId)
    expect(screen.queryByText(child.title)).toBeNull()
    expect(document.getElementById(panelId)).not.toBeVisible()
    expect(screen.getByText(secondChild.title)).toBeInTheDocument()

    await user.keyboard(' ')
    expect(disclosure).toHaveFocus()
    expect(disclosure).toHaveAccessibleName('common.collapse')
    expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    expect(disclosure).toHaveAttribute('aria-controls', panelId)
    expect(within(document.getElementById(panelId)!).getByText(child.title)).toBeInTheDocument()
    expect(toggleSelectionSpy).not.toHaveBeenCalled()
    expect(selected).toEqual(new Set([parent.id]))
    if (selectMode) expect(within(parentRow).getByRole('button', { name: parent.title, pressed: true })).toBeInTheDocument()
  })

  it('gives nested parents and repeated lists distinct child panel relationships', () => {
    rowImplementation.actual = true
    const parent = createMockHabit({ scheduledDates: [TODAY], id: 'parent', title: 'Parent', hasSubHabits: true })
    const child = createMockHabit({ scheduledDates: [TODAY], id: 'child', title: 'Child', parentId: parent.id, hasSubHabits: true })
    const grandchild = createMockHabit({ scheduledDates: [TODAY], id: 'grandchild', title: 'Grandchild', parentId: child.id })
    for (const habit of [parent, child, grandchild]) mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.childrenByParent.set(child.id, [grandchild.id])
    mockHabitsData.topLevelHabits = [parent]
    renderWithProviders(<><HabitList filters={defaultFilters} /><HabitList filters={defaultFilters} /></>)

    const disclosures = screen.getAllByRole('button', { name: 'common.collapse' })
    expect(disclosures).toHaveLength(4)
    const panelIds = disclosures.map((button) => {
      expect(button).toHaveAttribute('aria-controls')
      const panelId = button.getAttribute('aria-controls')!
      const panel = document.getElementById(panelId)!
      expect(within(panel).getByText(grandchild.title)).toBeInTheDocument()
      return panelId
    })
    expect(new Set(panelIds).size).toBe(4)
  })

  it('renders without crashing with no habits', () => {
    renderWithProviders(
      <HabitList filters={defaultFilters} />,
    )
    expect(screen.getByText('habits.emptyState')).toBeDefined()
    expect(screen.getByText('habits.noHabitsBody')).toBeDefined()
  })

  it('shows a one-day habit row without an internal type label', () => {
    rowImplementation.actual = true
    const habit = createMockHabit({
      id: 'one-day', title: 'Pay bill', frequencyUnit: null, frequencyQuantity: null,
      dueDate: TODAY, scheduledDates: [TODAY], dueTime: '08:00',
    })
    mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.topLevelHabits = [habit]
    renderWithProviders(<HabitList view="today" selectedDate={new Date(`${TODAY}T12:00:00`)} filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }} />)
    const row = screen.getByTestId('habit-row')
    expect(row).toHaveTextContent('Pay bill')
    expect(row).toHaveTextContent(/8:00/)
    expect(row).not.toHaveTextContent('habits.oneTimeTask')
  })

  it('shows a plain day line instead of first run on an empty future day with account habits', () => {
    accountHabitCount.count = 3
    renderWithProviders(
      <HabitList filters={defaultFilters} selectedDate={new Date(`${TOMORROW}T09:00:00Z`)} />,
    )
    expect(screen.getByText('habits.nothingOpen')).toBeInTheDocument()
    expect(screen.queryByText('habits.emptyState')).not.toBeInTheDocument()
    expect(screen.queryByText('habits.askAstra')).not.toBeInTheDocument()
  })

  it('shows the plain line when nothing is due today', () => {
    accountHabitCount.count = 3
    renderWithProviders(<HabitList filters={defaultFilters} />)
    expect(screen.getByText('habits.nothingOpen')).toBeInTheDocument()
    expect(screen.queryByText('habits.emptyState')).not.toBeInTheDocument()
  })

  it('keeps the plain line visible if the account count cannot load', () => {
    accountHabitCount.isLoaded = false
    renderWithProviders(<HabitList filters={defaultFilters} />)
    expect(screen.getByText('habits.nothingOpen')).toBeInTheDocument()
    expect(screen.queryByText('habits.emptyState')).not.toBeInTheDocument()
  })

  it('keeps first-run actions on another day when the account has no habits', () => {
    renderWithProviders(<HabitList filters={defaultFilters} selectedDate={new Date(`${TOMORROW}T09:00:00Z`)} onCreate={vi.fn()} />)
    expect(screen.getByText('habits.emptyState')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'habits.askAstra' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'habits.createManually' })).toBeInTheDocument()
  })

  it('uses the plain line on a past day with every due habit logged', () => {
    useActualHabitVisibility = true
    accountHabitCount.count = 1
    const due = createMockHabit({ id: 'past-due', scheduledDates: [YESTERDAY], isLoggedInRange: true })
    mockHabitsData.habitsById.set(due.id, due)
    mockHabitsData.topLevelHabits = [due]
    renderWithProviders(<HabitList filters={defaultFilters} selectedDate={new Date(`${YESTERDAY}T09:00:00Z`)} />)
    expect(screen.getByText('habits.nothingOpen')).toBeInTheDocument()
    expect(screen.queryByText('habits.allDoneToday')).not.toBeInTheDocument()
  })

  it('does not carry recent completion feedback into another selected date', () => {
    const habit = createMockHabit({ id: 'dated-child', scheduledDates: [YESTERDAY, TODAY] })
    mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.topLevelHabits = [habit]
    const ref = React.createRef<HabitListHandle>()
    const renderList = (date: string) => (
      <HabitList ref={ref} filters={defaultFilters} selectedDate={new Date(`${date}T09:00:00Z`)} />
    )
    const rendered = renderWithProviders(renderList(YESTERDAY))

    act(() => { ref.current?.markRecentlyCompleted(habit.id) })
    expect(capturedDrillOptions?.recentlyCompletedIds.has(habit.id)).toBe(true)
    rendered.rerenderWithProviders(renderList(TODAY))
    expect(capturedDrillOptions?.recentlyCompletedIds.has(habit.id)).toBe(false)
    act(() => { ref.current?.markRecentlyCompleted(habit.id) })
    expect(capturedDrillOptions?.recentlyCompletedIds.has(habit.id)).toBe(true)
    rendered.rerenderWithProviders(renderList(YESTERDAY))
    expect(capturedDrillOptions?.recentlyCompletedIds.has(habit.id)).toBe(true)
  })

  it('keeps sortable descriptions stable through hydration', async () => {
    const habit = createMockHabit({ id: 'h-1', title: 'Exercise' })
    mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.topLevelHabits = [habit]

    const serverHtml = renderToString(
      createHabitListTree(new QueryClient()),
    )
    const container = document.createElement('div')
    container.innerHTML = serverHtml
    document.body.append(container)
    const serverDescriptions = getSortableDescriptions(container)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      const result = render(
        createHabitListTree(new QueryClient()),
        { container, hydrate: true },
      )

      await waitFor(() => {
        for (const descriptionId of getSortableDescriptions(container)) {
          expect(container.querySelector(`[id="${descriptionId}"]`)).toBeInTheDocument()
        }
      })

      expect(serverDescriptions).not.toEqual([])
      expect(getSortableDescriptions(container)).toEqual(serverDescriptions)
      expect(consoleError).not.toHaveBeenCalled()
      result.unmount()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('renders the all-done upcoming action only when it can navigate', () => {
    useActualHabitVisibility = true
    accountHabitCount.count = 1
    const due = createMockHabit({ id: 'due', scheduledDates: [TODAY], isLoggedInRange: true })
    mockHabitsData.habitsById.set(due.id, due)
    mockHabitsData.topLevelHabits = [due]
    mockHabitsData.totalCount = 1
    const onSeeUpcoming = vi.fn()
    const result = renderWithProviders(
      <HabitList filters={defaultFilters} view="today" showCompleted={false} />,
    )

    expect(screen.queryByRole('button', { name: 'habits.seeUpcoming' })).toBeNull()

    result.rerenderWithProviders(
      <HabitList
        filters={defaultFilters}
        view="today"
        showCompleted={false}
        onSeeUpcoming={onSeeUpcoming}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'habits.seeUpcoming' }))

    expect(onSeeUpcoming).toHaveBeenCalledOnce()
    const title = screen.getByText('habits.allDoneToday')
    expect(title.parentElement?.className).not.toMatch(/items-center|text-center/)
    expect(title).toHaveStyle({ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: '500' })
    expect(title.parentElement?.querySelector('[data-asset="orbit-mark"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'habits.seeUpcoming' })).toHaveAttribute('data-size', 'sm')
    expect(screen.getByRole('button', { name: 'habits.seeUpcoming' })).toHaveAttribute('data-variant', 'ghost')
  })

  it('shows all-done above an unfinished anytime habit', () => {
    useActualHabitVisibility = true
    accountHabitCount.count = 2
    const due = createMockHabit({ id: 'due', title: 'Due habit', scheduledDates: [TODAY], isLoggedInRange: true })
    const anytime = createMockHabit({ id: 'anytime', title: 'Anytime habit', isGeneral: true })
    mockHabitsData.habitsById = new Map([[due.id, due], [anytime.id, anytime]])
    mockHabitsData.topLevelHabits = [due, anytime]
    mockHabitsData.totalCount = 2

    renderWithProviders(<HabitList filters={defaultFilters} view="today" showCompleted={false} />)

    expect(screen.getByText('habits.allDoneToday')).toBeInTheDocument()
    expect(screen.getByText('Anytime habit')).toBeInTheDocument()
    expect(screen.getByText('habits.allDoneToday').compareDocumentPosition(screen.getByText('Anytime habit')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps the all-done block above completed rows when they are shown', () => {
    useActualHabitVisibility = true
    accountHabitCount.count = 1
    const due = createMockHabit({ id: 'done-due', scheduledDates: [TODAY], isLoggedInRange: true })
    mockHabitsData.habitsById.set(due.id, due)
    mockHabitsData.topLevelHabits = [due]
    renderWithProviders(<HabitList filters={defaultFilters} showCompleted />)
    expect(screen.getByText('habits.allDoneToday')).toBeInTheDocument()
    expect(screen.getByTestId('habit-card-done-due')).toBeInTheDocument()
  })

  it('shows all-done when a due row is completed without a range log flag', () => {
    useActualHabitVisibility = true
    accountHabitCount.count = 1
    const due = createMockHabit({ id: 'completed-due', scheduledDates: [TODAY], isCompleted: true, isLoggedInRange: false })
    mockHabitsData.habitsById.set(due.id, due)
    mockHabitsData.topLevelHabits = [due]
    renderWithProviders(<HabitList filters={defaultFilters} />)
    expect(screen.getByText('habits.allDoneToday')).toBeInTheDocument()
    expect(screen.queryByText('habits.nothingOpen')).not.toBeInTheDocument()
  })

  it('keeps a completed row in place for 1400 ms', () => {
    vi.useFakeTimers()
    useActualHabitVisibility = true
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const habit = createMockHabit({ id: 'h-1', title: 'Exercise' })
    mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.topLevelHabits = [habit]
    const ref = React.createRef<HabitListHandle>()
    const result = renderWithProviders(<HabitList ref={ref} filters={defaultFilters} />)

    act(() => ref.current?.markRecentlyCompleted(habit.id))

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1400)
    const completedHabit = { ...habit, isCompleted: true }
    mockHabitsData.habitsById.set(habit.id, completedHabit)
    mockHabitsData.topLevelHabits = [completedHabit]
    result.rerenderWithProviders(
      <HabitList ref={ref} filters={defaultFilters} showCompleted={false} />,
    )
    expect(screen.getByTestId('habit-card-h-1')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1400)
    })

    expect(screen.queryByTestId('habit-card-h-1')).toBeNull()
    result.unmount()
    setTimeoutSpy.mockRestore()
    vi.useRealTimers()
  })

  it('renders habit cards for each top-level habit', () => {
    const habit1 = createMockHabit({ id: 'h-1', title: 'Exercise' })
    const habit2 = createMockHabit({ id: 'h-2', title: 'Read' })

    mockHabitsData.habitsById.set('h-1', habit1)
    mockHabitsData.habitsById.set('h-2', habit2)
    mockHabitsData.topLevelHabits = [habit1, habit2]

    renderWithProviders(
      <HabitList filters={defaultFilters} />,
    )
    expect(screen.getByTestId('habit-card-h-1')).toBeDefined()
    expect(screen.getByTestId('habit-card-h-2')).toBeDefined()
    expect(screen.getByText('Exercise')).toBeDefined()
    expect(screen.getByText('Read')).toBeDefined()
  })


  it('hides one-time tasks completed before the selected day when completed items are shown', () => {
    useActualHabitVisibility = true
    const dueToday = createMockHabit({
      id: 'due-today',
      dueDate: '2026-09-15',
      scheduledDates: ['2026-09-15'],
      instances: [{ date: '2026-09-15', status: 'Pending', logId: null }],
    })
    const completedEarlier = createMockHabit({
      id: 'completed-earlier',
      frequencyUnit: null,
      isCompleted: true,
      isLoggedInRange: false,
      dueDate: '2026-08-01',
      scheduledDates: [],
      instances: [],
    })
    mockHabitsData.habitsById = new Map([
      [dueToday.id, dueToday],
      [completedEarlier.id, completedEarlier],
    ])
    mockHabitsData.topLevelHabits = [dueToday, completedEarlier]

    renderWithProviders(
      <HabitList
        filters={{ dateFrom: '2026-09-15', dateTo: '2026-09-15' }}
        selectedDate={new Date(2026, 8, 15, 12)}
        showCompleted
      />,
    )

    expect(screen.getByTestId('habit-card-due-today')).toBeDefined()
    expect(screen.queryByTestId('habit-card-completed-earlier')).toBeNull()
  })

  it('shows only selected-day completions alongside habits due that day', () => {
    useActualHabitVisibility = true
    const dueToday = createMockHabit({
      id: 'due-today',
      dueDate: '2026-09-15',
      scheduledDates: ['2026-09-15'],
      instances: [{ date: '2026-09-15', status: 'Pending', logId: null }],
    })
    const completedToday = createMockHabit({
      id: 'completed-today',
      frequencyUnit: null,
      isCompleted: true,
      isLoggedInRange: true,
      dueDate: '2026-09-15',
      scheduledDates: [],
      instances: [],
    })
    const completedEarlier = createMockHabit({
      id: 'completed-earlier',
      frequencyUnit: null,
      isCompleted: true,
      isLoggedInRange: false,
      dueDate: '2026-08-01',
      scheduledDates: [],
      instances: [],
    })
    mockHabitsData.habitsById = new Map(
      [dueToday, completedToday, completedEarlier].map((habit) => [habit.id, habit]),
    )
    mockHabitsData.topLevelHabits = [dueToday, completedToday, completedEarlier]

    renderWithProviders(
      <HabitList
        filters={{ dateFrom: '2026-09-15', dateTo: '2026-09-15' }}
        selectedDate={new Date(2026, 8, 15, 12)}
        showCompleted
      />,
    )

    expect(screen.getByTestId('habit-card-due-today')).toBeDefined()
    expect(screen.getByTestId('habit-card-completed-today')).toBeDefined()
    expect(screen.queryByTestId('habit-card-completed-earlier')).toBeNull()
  })

  it('passes selected date to habit cards', () => {
    const habit1 = createMockHabit({ id: 'h-1', title: 'Exercise' })
    mockHabitsData.habitsById.set('h-1', habit1)
    mockHabitsData.topLevelHabits = [habit1]

    const selectedDate = new Date('2025-01-15')
    renderWithProviders(
      <HabitList
        filters={defaultFilters}
        selectedDate={selectedDate}
      />,
    )
    expect(screen.getByTestId('habit-card-h-1')).toBeDefined()
  })

  it('logs a habit immediately from the card action', async () => {
    const habit = createMockHabit({ id: 'h-1', title: 'Exercise' })
    mockHabitsData.habitsById.set('h-1', habit)
    mockHabitsData.topLevelHabits = [habit]
    const selectedDate = new Date('2026-09-05T09:00:00Z')

    renderWithProviders(
      <HabitList filters={defaultFilters} selectedDate={selectedDate} />,
    )

    fireEvent.click(screen.getByTestId('log-h-1'))

    expect(logHabitMutateAsync).toHaveBeenCalledWith({
      habitId: 'h-1',
      date: '2026-09-05',
      intent: 'log',
    })
  })

  it('unlogs only the viewed historical occurrence', async () => {
    let occurrences: NormalizedHabit['instances'] = [
      { date: YESTERDAY, status: 'Completed', logId: 'log-yesterday' },
      { date: TODAY, status: 'Pending', logId: null },
    ]
    const habit = createMockHabit({
      id: 'h-1',
      title: 'Exercise',
      isCompleted: true,
      scheduledDates: [YESTERDAY, TODAY],
      instances: occurrences,
    })
    mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.topLevelHabits = [habit]
    logHabitMutateAsync.mockImplementation(async ({ date }: { date?: string }) => {
      occurrences = occurrences.map((occurrence) =>
        occurrence.date === date
          ? { ...occurrence, status: 'Pending', logId: null }
          : occurrence,
      )
    })

    renderWithProviders(
      <HabitList
        filters={defaultFilters}
        selectedDate={new Date(`${YESTERDAY}T09:00:00Z`)}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByTestId('unlog-h-1'))
    })

    expect(logHabitMutateAsync).toHaveBeenCalledWith({
      habitId: 'h-1',
      date: YESTERDAY,
      intent: 'unlog',
    })
    expect(occurrences).toContainEqual({
      date: TODAY,
      status: 'Pending',
      logId: null,
    })
  })

  it('guards only the settling habit until its refetch completes', async () => {
    const firstHabit = createMockHabit({ id: 'h-1', title: 'Exercise' })
    const secondHabit = createMockHabit({ id: 'h-2', title: 'Read' })
    mockHabitsData.habitsById.set(firstHabit.id, firstHabit)
    mockHabitsData.habitsById.set(secondHabit.id, secondHabit)
    mockHabitsData.topLevelHabits = [firstHabit, secondHabit]

    let resolveFirstMutation: (() => void) | undefined
    const firstMutation = new Promise<void>((resolve) => {
      resolveFirstMutation = resolve
    })
    let resolveFirstRefetch: (() => void) | undefined
    const firstRefetch = new Promise<void>((resolve) => {
      resolveFirstRefetch = resolve
    })
    logHabitMutateAsync.mockImplementation(({ habitId }: { habitId: string }) =>
      habitId === firstHabit.id ? firstMutation : Promise.resolve(),
    )
    habitListRefetch
      .mockReturnValueOnce(firstRefetch)
      .mockResolvedValue(undefined)

    renderWithProviders(<HabitList filters={defaultFilters} selectedDate={new Date()} />)
    fireEvent.click(screen.getByTestId('log-h-1'))

    await act(async () => {
      resolveFirstMutation?.()
      await firstMutation
    })
    expect(habitListRefetch).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('unlog-h-1'))
    expect(logHabitMutateAsync).toHaveBeenCalledTimes(1)

    await act(async () => {
      fireEvent.click(screen.getByTestId('log-h-2'))
    })
    expect(logHabitMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ habitId: 'h-2' }),
    )

    await act(async () => {
      resolveFirstRefetch?.()
      await firstRefetch
    })
  })

  it('passes an immediate completion trigger to the card while logging is pending', async () => {
    const habit = createMockHabit({ id: 'h-1', title: 'Exercise', isCompleted: false })
    mockHabitsData.habitsById.set('h-1', habit)
    mockHabitsData.topLevelHabits = [habit]

    let resolveLog: (() => void) | undefined
    const pendingLog = new Promise<void>((resolve) => {
      resolveLog = resolve
    })

    logHabitMutateAsync.mockImplementation(() => pendingLog)

    renderWithProviders(<HabitList filters={defaultFilters} />)

    fireEvent.click(screen.getByTestId('log-h-1'))

    expect(screen.getByTestId('recent-h-1').textContent).toBe('yes')

    resolveLog?.()
    await act(async () => {
      await pendingLog
    })
  })

  it('logs an incomplete parent immediately', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
    })

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]

    renderWithProviders(<HabitList filters={defaultFilters} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('log-parent'))
    })

    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'parent', intent: 'log' })
  })

  it('asks before settling the next parent after logging its final unresolved child', async () => {
    const grandparent = createMockHabit({ id: 'grandparent', title: 'Grandparent', hasSubHabits: true, scheduledDates: [TODAY], instances: [{ date: TODAY, status: 'Pending', logId: null }] })
    const child = createMockHabit({ id: 'child', title: 'Child', parentId: 'grandparent', hasSubHabits: true, scheduledDates: [TODAY] })
    const grandchild = createMockHabit({ id: 'grandchild', title: 'Grandchild', parentId: 'child', isCompleted: true, scheduledDates: [TODAY] })
    for (const habit of [grandparent, child, grandchild]) mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.childrenByParent.set(grandparent.id, [child.id])
    mockHabitsData.childrenByParent.set(child.id, [grandchild.id])
    mockHabitsData.topLevelHabits = [grandparent]
    renderWithProviders(<HabitList filters={defaultFilters} />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('log-child'))
    })
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')

    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'child', intent: 'log' })
    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'grandparent', date: TODAY, intent: 'log' })
  })

  it('asks before settling the parent when the last child is marked completed', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      isCompleted: true,
    })

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]

    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(<HabitList ref={ref} filters={defaultFilters} />)

    await act(async () => {
      ref.current?.markRecentlyCompleted('child')
      ref.current?.checkAndPromptParentLog('child')
    })
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')

    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'parent', date: TODAY, intent: 'log' })
  })

  it('does not settle the parent before the current snapshot reflects the final child completion', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const doneChild = createMockHabit({
      id: 'child-a',
      title: 'Child A',
      parentId: 'parent',
      isCompleted: true,
    })
    const justLoggedChild = createMockHabit({
      id: 'child-b',
      title: 'Child B',
      parentId: 'parent',
      isCompleted: false,
    })

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(doneChild.id, doneChild)
    mockHabitsData.habitsById.set(justLoggedChild.id, justLoggedChild)
    mockHabitsData.childrenByParent.set(parent.id, [doneChild.id, justLoggedChild.id])
    mockHabitsData.topLevelHabits = [parent]

    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(<HabitList ref={ref} filters={defaultFilters} />)

    await act(async () => {
      ref.current?.markRecentlyCompleted('child-b')
      ref.current?.checkAndPromptParentLog('child-b')
    })
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')

    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'parent', date: TODAY, intent: 'log' })
  })

  it('does not settle the parent when a refetch makes a child incomplete while confirmation is open', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      isCompleted: true,
    })
    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]
    const ref = React.createRef<HabitListHandle>()
    const renderList = () => <HabitList ref={ref} filters={defaultFilters} />
    const { rerenderWithProviders } = renderWithProviders(renderList())

    act(() => ref.current?.checkAndPromptParentLog(child.id))

    act(() => {
      mockHabitsData.habitsById.set(child.id, { ...child, isCompleted: false })
      mockHabitsDataUpdatedAt += 1
      rerenderWithProviders(renderList())
    })
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')

    expect(logHabitMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id, intent: 'log' })
    expect(skipHabitMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id })
  })

  it('does not settle a recurring parent logged elsewhere after a refetch', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      isCompleted: true,
    })
    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]
    const ref = React.createRef<HabitListHandle>()
    const renderList = () => <HabitList ref={ref} filters={defaultFilters} />
    const { rerenderWithProviders } = renderWithProviders(renderList())

    act(() => ref.current?.checkAndPromptParentLog(child.id))

    act(() => {
      mockHabitsData.habitsById.set(parent.id, {
        ...parent,
        isCompleted: false,
        isLoggedInRange: true,
      })
      mockHabitsDataUpdatedAt += 1
      rerenderWithProviders(renderList())
    })
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')

    expect(logHabitMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id, intent: 'log' })
    expect(skipHabitMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id })
  })

  it.each([
    ['one-time', null],
    ['recurring', 'Day'],
  ] as const)('does not settle a %s parent postponed while confirmation is open', async (_label, frequencyUnit) => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      dueDate: TODAY,
      frequencyUnit,
      hasSubHabits: true,
      instances: [],
      scheduledDates: [],
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      isCompleted: true,
    })
    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]
    const ref = React.createRef<HabitListHandle>()
    const renderList = () => <HabitList ref={ref} filters={defaultFilters} />
    const { rerenderWithProviders } = renderWithProviders(renderList())

    act(() => ref.current?.checkAndPromptParentLog(child.id))

    act(() => {
      mockHabitsData.habitsById.set(parent.id, { ...parent, dueDate: TOMORROW })
      mockHabitsDataUpdatedAt += 1
      rerenderWithProviders(renderList())
    })
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')

    expect(logHabitMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id, intent: 'log' })
    expect(skipHabitMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id })
  })

  it('uses the current logged and skipped mix when confirmation is accepted', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      isCompleted: true,
    })
    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]
    const ref = React.createRef<HabitListHandle>()
    const renderList = () => <HabitList ref={ref} filters={defaultFilters} />
    const { rerenderWithProviders } = renderWithProviders(renderList())

    act(() => ref.current?.checkAndPromptParentLog(child.id))

    act(() => {
      mockHabitsData.habitsById.set(child.id, {
        ...child,
        isCompleted: false,
        isFlexible: true,
        flexibleTarget: 1,
        flexibleCompleted: 1,
        isLoggedInRange: false,
      })
      mockHabitsDataUpdatedAt += 1
      rerenderWithProviders(renderList())
    })
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')

    expect(skipHabitMutateAsync).toHaveBeenCalledWith({ habitId: parent.id, date: TODAY })
    expect(logHabitMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id, intent: 'log' })
  })

  it('settles the parent exactly once for a burst of sibling completions', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const childA = createMockHabit({
      id: 'child-a',
      title: 'Child A',
      parentId: 'parent',
      isCompleted: true,
    })
    const childB = createMockHabit({
      id: 'child-b',
      title: 'Child B',
      parentId: 'parent',
      isCompleted: true,
    })
    const childC = createMockHabit({
      id: 'child-c',
      title: 'Child C',
      parentId: 'parent',
      isCompleted: true,
    })

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(childA.id, childA)
    mockHabitsData.habitsById.set(childB.id, childB)
    mockHabitsData.habitsById.set(childC.id, childC)
    mockHabitsData.childrenByParent.set(parent.id, [childA.id, childB.id, childC.id])
    mockHabitsData.topLevelHabits = [parent]

    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(<HabitList ref={ref} filters={defaultFilters} />)

    await act(async () => {
      ref.current?.checkAndPromptParentLog('child-a')
      ref.current?.checkAndPromptParentLog('child-b')
      ref.current?.checkAndPromptParentLog('child-c')
    })
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')

    expect(logHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === 'parent')).toHaveLength(1)
  })

  it('settles each bulk-resolved parent once on the viewed historical date', async () => {
    const loggedParent = createMockHabit({
      id: 'logged-parent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const skippedParent = createMockHabit({
      id: 'skipped-parent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const children = [
      createMockHabit({ id: 'log-a', parentId: loggedParent.id, scheduledDates: [YESTERDAY] }),
      createMockHabit({ id: 'log-b', parentId: loggedParent.id, scheduledDates: [YESTERDAY] }),
      createMockHabit({ id: 'skip-a', parentId: skippedParent.id, scheduledDates: [YESTERDAY] }),
      createMockHabit({ id: 'skip-b', parentId: skippedParent.id, scheduledDates: [YESTERDAY] }),
    ]
    for (const habit of [loggedParent, skippedParent, ...children]) {
      mockHabitsData.habitsById.set(habit.id, habit)
    }
    mockHabitsData.childrenByParent.set(loggedParent.id, ['log-a', 'log-b'])
    mockHabitsData.childrenByParent.set(skippedParent.id, ['skip-a', 'skip-b'])
    mockHabitsData.topLevelHabits = [loggedParent, skippedParent]
    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(
      <HabitList
        ref={ref}
        filters={defaultFilters}
        selectedDate={new Date(`${YESTERDAY}T09:00:00Z`)}
      />,
    )

    await act(async () => {
      ref.current?.settleBulkHabitResolutions([
        { habitId: 'log-a', mode: 'log' },
        { habitId: 'log-b', mode: 'log' },
      ], YESTERDAY)
      ref.current?.settleBulkHabitResolutions([
        { habitId: 'skip-a', mode: 'skip' },
        { habitId: 'skip-b', mode: 'skip' },
      ], YESTERDAY)
      await Promise.resolve()
    })

    expect(logHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === loggedParent.id))
      .toEqual([[{ habitId: loggedParent.id, date: YESTERDAY, intent: 'log' }]])
    expect(skipHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === skippedParent.id))
      .toEqual([[{ habitId: skippedParent.id, date: YESTERDAY }]])
  })

  it('settles converging bulk branches and their shared grandparent once on one date', async () => {
    const grandparent = createMockHabit({
      id: 'grandparent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const parentA = createMockHabit({
      id: 'parent-a',
      parentId: grandparent.id,
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const parentB = createMockHabit({
      id: 'parent-b',
      parentId: grandparent.id,
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const leafA = createMockHabit({
      id: 'leaf-a',
      parentId: parentA.id,
      scheduledDates: [YESTERDAY],
    })
    const leafB = createMockHabit({
      id: 'leaf-b',
      parentId: parentB.id,
      scheduledDates: [YESTERDAY],
    })
    const leaves = [leafA, leafB]
    for (const habit of [grandparent, parentA, parentB, ...leaves]) {
      mockHabitsData.habitsById.set(habit.id, habit)
    }
    mockHabitsData.childrenByParent.set(grandparent.id, [parentA.id, parentB.id])
    mockHabitsData.childrenByParent.set(parentA.id, [leafA.id])
    mockHabitsData.childrenByParent.set(parentB.id, [leafB.id])
    mockHabitsData.topLevelHabits = [grandparent]
    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(
      <HabitList
        ref={ref}
        filters={defaultFilters}
        selectedDate={new Date(`${YESTERDAY}T09:00:00Z`)}
      />,
    )

    await act(async () => {
      ref.current?.settleBulkHabitResolutions([
        { habitId: leafA.id, mode: 'log' },
        { habitId: leafB.id, mode: 'log' },
      ], YESTERDAY)
      await Promise.resolve()
      await Promise.resolve()
    })

    const hierarchyMutations = logHabitMutateAsync.mock.calls
      .map(([input]) => input)
      .filter(({ habitId }) => [parentA.id, parentB.id, grandparent.id].includes(habitId))
    expect(hierarchyMutations).toHaveLength(3)
    expect(hierarchyMutations).toEqual(expect.arrayContaining([
      { habitId: parentA.id, date: YESTERDAY, intent: 'log' },
      { habitId: parentB.id, date: YESTERDAY, intent: 'log' },
      { habitId: grandparent.id, date: YESTERDAY, intent: 'log' },
    ]))
  })

  it('does not settle a shared grandparent from a sibling that rejects after a delay', async () => {
    const grandparent = createMockHabit({
      id: 'grandparent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const parentA = createMockHabit({
      id: 'parent-a',
      parentId: grandparent.id,
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const parentB = createMockHabit({
      id: 'parent-b',
      parentId: grandparent.id,
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const leafA = createMockHabit({
      id: 'leaf-a',
      parentId: parentA.id,
      scheduledDates: [YESTERDAY],
    })
    const leafB = createMockHabit({
      id: 'leaf-b',
      parentId: parentB.id,
      scheduledDates: [YESTERDAY],
    })
    for (const habit of [grandparent, parentA, parentB, leafA, leafB]) {
      mockHabitsData.habitsById.set(habit.id, habit)
    }
    mockHabitsData.childrenByParent.set(grandparent.id, [parentA.id, parentB.id])
    mockHabitsData.childrenByParent.set(parentA.id, [leafA.id])
    mockHabitsData.childrenByParent.set(parentB.id, [leafB.id])
    mockHabitsData.topLevelHabits = [grandparent]

    let rejectParentBMutation: ((reason?: unknown) => void) | undefined
    const pendingParentBMutation = new Promise<void>((_resolve, reject) => {
      rejectParentBMutation = reject
    })
    logHabitMutateAsync.mockImplementation(({ habitId }: { habitId: string }) => (
      habitId === parentB.id ? pendingParentBMutation : Promise.resolve()
    ))
    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(
      <HabitList
        ref={ref}
        filters={defaultFilters}
        selectedDate={new Date(`${YESTERDAY}T09:00:00Z`)}
      />,
    )

    await act(async () => {
      ref.current?.settleBulkHabitResolutions([
        { habitId: leafA.id, mode: 'log' },
        { habitId: leafB.id, mode: 'log' },
      ], YESTERDAY)
      await Promise.resolve()
      rejectParentBMutation?.(new Error('rejected'))
      await Promise.allSettled([pendingParentBMutation])
      await Promise.resolve()
    })

    const hierarchyMutations = logHabitMutateAsync.mock.calls
      .map(([input]) => input)
      .filter(({ habitId }) => [parentA.id, parentB.id, grandparent.id].includes(habitId))
    expect(hierarchyMutations).toEqual([
      { habitId: parentA.id, date: YESTERDAY, intent: 'log' },
      { habitId: parentB.id, date: YESTERDAY, intent: 'log' },
    ])
  })

  it('settles a shared grandparent once after two overlapping bulk calls succeed', async () => {
    const grandparent = createMockHabit({
      id: 'grandparent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const parentA = createMockHabit({
      id: 'parent-a',
      parentId: grandparent.id,
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const parentB = createMockHabit({
      id: 'parent-b',
      parentId: grandparent.id,
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const leafA = createMockHabit({
      id: 'leaf-a',
      parentId: parentA.id,
      scheduledDates: [YESTERDAY],
    })
    const leafB = createMockHabit({
      id: 'leaf-b',
      parentId: parentB.id,
      scheduledDates: [YESTERDAY],
    })
    for (const habit of [grandparent, parentA, parentB, leafA, leafB]) {
      mockHabitsData.habitsById.set(habit.id, habit)
    }
    mockHabitsData.childrenByParent.set(grandparent.id, [parentA.id, parentB.id])
    mockHabitsData.childrenByParent.set(parentA.id, [leafA.id])
    mockHabitsData.childrenByParent.set(parentB.id, [leafB.id])
    mockHabitsData.topLevelHabits = [grandparent]

    let resolveParentA: (() => void) | undefined
    let resolveParentB: (() => void) | undefined
    const pendingParentA = new Promise<void>((resolve) => {
      resolveParentA = resolve
    })
    const pendingParentB = new Promise<void>((resolve) => {
      resolveParentB = resolve
    })
    logHabitMutateAsync.mockImplementation(({ habitId }: { habitId: string }) => {
      if (habitId === parentA.id) return pendingParentA
      if (habitId === parentB.id) return pendingParentB
      return Promise.resolve()
    })
    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(
      <HabitList
        ref={ref}
        filters={defaultFilters}
        selectedDate={new Date(`${YESTERDAY}T09:00:00Z`)}
      />,
    )

    await act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leafA.id, mode: 'log' }], YESTERDAY)
      ref.current?.settleBulkHabitResolutions([{ habitId: leafB.id, mode: 'log' }], YESTERDAY)
      await Promise.resolve()
      resolveParentA?.()
      await pendingParentA
      await Promise.resolve()
      resolveParentB?.()
      await pendingParentB
      await Promise.resolve()
    })

    const hierarchyMutations = logHabitMutateAsync.mock.calls
      .map(([input]) => input)
      .filter(({ habitId }) => [parentA.id, parentB.id, grandparent.id].includes(habitId))
    expect(hierarchyMutations).toHaveLength(3)
    expect(hierarchyMutations).toEqual(expect.arrayContaining([
      { habitId: parentA.id, date: YESTERDAY, intent: 'log' },
      { habitId: parentB.id, date: YESTERDAY, intent: 'log' },
      { habitId: grandparent.id, date: YESTERDAY, intent: 'log' },
    ]))
  })

  it('does not settle a shared grandparent when one of two overlapping bulk calls rejects', async () => {
    const grandparent = createMockHabit({
      id: 'grandparent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const parentA = createMockHabit({
      id: 'parent-a',
      parentId: grandparent.id,
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const parentB = createMockHabit({
      id: 'parent-b',
      parentId: grandparent.id,
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const leafA = createMockHabit({
      id: 'leaf-a',
      parentId: parentA.id,
      scheduledDates: [YESTERDAY],
    })
    const leafB = createMockHabit({
      id: 'leaf-b',
      parentId: parentB.id,
      scheduledDates: [YESTERDAY],
    })
    for (const habit of [grandparent, parentA, parentB, leafA, leafB]) {
      mockHabitsData.habitsById.set(habit.id, habit)
    }
    mockHabitsData.childrenByParent.set(grandparent.id, [parentA.id, parentB.id])
    mockHabitsData.childrenByParent.set(parentA.id, [leafA.id])
    mockHabitsData.childrenByParent.set(parentB.id, [leafB.id])
    mockHabitsData.topLevelHabits = [grandparent]

    let resolveParentA: (() => void) | undefined
    let rejectParentB: ((reason?: unknown) => void) | undefined
    const pendingParentA = new Promise<void>((resolve) => {
      resolveParentA = resolve
    })
    const pendingParentB = new Promise<void>((_resolve, reject) => {
      rejectParentB = reject
    })
    logHabitMutateAsync.mockImplementation(({ habitId }: { habitId: string }) => (
      habitId === parentA.id ? pendingParentA : pendingParentB
    ))
    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(
      <HabitList
        ref={ref}
        filters={defaultFilters}
        selectedDate={new Date(`${YESTERDAY}T09:00:00Z`)}
      />,
    )

    await act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leafA.id, mode: 'log' }], YESTERDAY)
      ref.current?.settleBulkHabitResolutions([{ habitId: leafB.id, mode: 'log' }], YESTERDAY)
      await Promise.resolve()
      resolveParentA?.()
      await pendingParentA
      rejectParentB?.(new Error('rejected'))
      await Promise.allSettled([pendingParentB])
      await Promise.resolve()
    })

    const hierarchyMutations = logHabitMutateAsync.mock.calls
      .map(([input]) => input)
      .filter(({ habitId }) => [parentA.id, parentB.id, grandparent.id].includes(habitId))
    expect(hierarchyMutations).toEqual([
      { habitId: parentA.id, date: YESTERDAY, intent: 'log' },
      { habitId: parentB.id, date: YESTERDAY, intent: 'log' },
    ])
  })

  it('stops a deferred settlement chain when the viewed date changes', async () => {
    const grandparent = createMockHabit({
      id: 'grandparent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const parent = createMockHabit({
      id: 'parent',
      parentId: grandparent.id,
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const leaf = createMockHabit({
      id: 'leaf',
      parentId: parent.id,
      scheduledDates: [YESTERDAY],
    })
    for (const habit of [grandparent, parent, leaf]) {
      mockHabitsData.habitsById.set(habit.id, habit)
    }
    mockHabitsData.childrenByParent.set(grandparent.id, [parent.id])
    mockHabitsData.childrenByParent.set(parent.id, [leaf.id])
    mockHabitsData.topLevelHabits = [grandparent]

    let resolveParentMutation: (() => void) | undefined
    const pendingParentMutation = new Promise<void>((resolve) => {
      resolveParentMutation = resolve
    })
    logHabitMutateAsync.mockImplementation(({ habitId }: { habitId: string }) => (
      habitId === parent.id ? pendingParentMutation : Promise.resolve()
    ))
    const ref = React.createRef<HabitListHandle>()
    const renderList = (date: string) => (
      <HabitList
        ref={ref}
        filters={defaultFilters}
        selectedDate={new Date(`${date}T09:00:00Z`)}
      />
    )
    const { rerenderWithProviders } = renderWithProviders(renderList(YESTERDAY))

    await act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leaf.id, mode: 'log' }], YESTERDAY)
      await Promise.resolve()
    })
    rerenderWithProviders(renderList(TODAY))
    await act(async () => {
      resolveParentMutation?.()
      await pendingParentMutation
      await Promise.resolve()
    })

    expect(logHabitMutateAsync.mock.calls.map(([input]) => input)).toEqual([
      { habitId: parent.id, date: YESTERDAY, intent: 'log' },
    ])
  })

  it.each(['log', 'skip'] as const)(
    'does not apply a delayed bulk %s result to the newly viewed date',
    async (mode) => {
    const parent = createMockHabit({
      id: 'parent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY, TODAY],
      instances: [
        { date: YESTERDAY, status: 'Pending', logId: null },
        { date: TODAY, status: 'Pending', logId: null },
      ],
    })
    const child = createMockHabit({
      id: 'child',
      parentId: parent.id,
      scheduledDates: [YESTERDAY, TODAY],
    })
    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]
    const ref = React.createRef<HabitListHandle>()
    const renderList = (date: string) => (
      <HabitList ref={ref} filters={defaultFilters} selectedDate={new Date(`${date}T09:00:00Z`)} />
    )
    const { rerenderWithProviders } = renderWithProviders(renderList(YESTERDAY))
    rerenderWithProviders(renderList(TODAY))

    act(() => {
      ref.current?.settleBulkHabitResolutions([{ habitId: child.id, mode }], YESTERDAY)
    })

    expect(screen.getByTestId(`habit-card-${child.id}`)).toHaveAttribute('data-state', 'empty')
    expect(capturedDrillOptions?.recentlyCompletedIds.has(child.id)).toBe(false)
    expect(logHabitMutateAsync).not.toHaveBeenCalled()
    expect(skipHabitMutateAsync).not.toHaveBeenCalled()
    rerenderWithProviders(renderList(YESTERDAY))
    expect(screen.getByTestId(`habit-card-${child.id}`)).toHaveAttribute('data-state', 'done')
    expect(capturedDrillOptions?.recentlyCompletedIds.has(child.id)).toBe(true)
  })

  it('rejects a delayed bulk result after the new date handle commits before passive effects', () => {
    const parent = createMockHabit({
      id: 'parent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY, TODAY],
      instances: [
        { date: YESTERDAY, status: 'Pending', logId: null },
        { date: TODAY, status: 'Pending', logId: null },
      ],
    })
    const child = createMockHabit({
      id: 'child',
      parentId: parent.id,
      scheduledDates: [YESTERDAY, TODAY],
    })
    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]

    const ref = React.createRef<HabitListHandle>()
    function ResolveInLayout({ date }: { date: string }) {
      React.useLayoutEffect(() => {
        if (date === TODAY) {
          ref.current?.settleBulkHabitResolutions([{ habitId: child.id, mode: 'log' }], YESTERDAY)
        }
      }, [date])
      return null
    }
    const renderList = (date: string) => (
      <>
        <HabitList ref={ref} filters={defaultFilters} selectedDate={new Date(`${date}T09:00:00Z`)} />
        <ResolveInLayout date={date} />
      </>
    )
    const { rerenderWithProviders } = renderWithProviders(renderList(YESTERDAY))
    rerenderWithProviders(renderList(TODAY))

    expect(logHabitMutateAsync).not.toHaveBeenCalled()
    expect(skipHabitMutateAsync).not.toHaveBeenCalled()
    expect(capturedDrillOptions?.recentlyCompletedIds.has(parent.id)).toBe(false)
    expect(capturedDrillOptions?.recentlyCompletedIds.has(child.id)).toBe(false)
  })

  it('keeps the current parent guard when an earlier date settlement rejects', async () => {
    vi.useFakeTimers()
    const parent = createMockHabit({
      id: 'parent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY, TODAY],
      instances: [
        { date: YESTERDAY, status: 'Pending', logId: null },
        { date: TODAY, status: 'Pending', logId: null },
      ],
    })
    const leaf = createMockHabit({
      id: 'leaf',
      parentId: parent.id,
      scheduledDates: [YESTERDAY, TODAY],
    })
    for (const habit of [parent, leaf]) {
      mockHabitsData.habitsById.set(habit.id, habit)
    }
    mockHabitsData.childrenByParent.set(parent.id, [leaf.id])
    mockHabitsData.topLevelHabits = [parent]

    let rejectEarlierParent: ((reason?: unknown) => void) | undefined
    let resolveCurrentParent: (() => void) | undefined
    const earlierParentMutation = new Promise<void>((_resolve, reject) => {
      rejectEarlierParent = reject
    })
    const currentParentMutation = new Promise<void>((resolve) => {
      resolveCurrentParent = resolve
    })
    logHabitMutateAsync.mockImplementation((input: { habitId: string; date: string }) => {
      if (input.habitId !== parent.id) return Promise.resolve()
      return input.date === YESTERDAY ? earlierParentMutation : currentParentMutation
    })
    const ref = React.createRef<HabitListHandle>()
    const renderList = (date: string) => (
      <HabitList
        ref={ref}
        filters={defaultFilters}
        selectedDate={new Date(`${date}T09:00:00Z`)}
      />
    )
    const renderResult = renderWithProviders(renderList(YESTERDAY))

    await act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leaf.id, mode: 'log' }], YESTERDAY)
      await Promise.resolve()
    })
    renderResult.rerenderWithProviders(renderList(TODAY))
    await act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leaf.id, mode: 'log' }], TODAY)
      await Promise.resolve()
    })
    const currentOperationTimerCount = vi.getTimerCount()
    await act(async () => {
      rejectEarlierParent?.(new Error('rejected'))
      await Promise.allSettled([earlierParentMutation])
    })

    expect(screen.getByTestId(`habit-card-${parent.id}`)).toHaveAttribute('data-state', 'done')
    expect(vi.getTimerCount()).toBe(currentOperationTimerCount)

    await act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leaf.id, mode: 'log' }], TODAY)
      await Promise.resolve()
    })

    expect(logHabitMutateAsync.mock.calls
      .map(([input]) => input)
      .filter(({ habitId }) => habitId === parent.id))
      .toEqual([
        { habitId: parent.id, date: YESTERDAY, intent: 'log' },
        { habitId: parent.id, date: TODAY, intent: 'log' },
      ])

    await act(async () => {
      resolveCurrentParent?.()
      await currentParentMutation
      await Promise.resolve()
    })
    renderResult.unmount()
    vi.useRealTimers()
  })

  it('clears the current parent guard after its settlement rejects', async () => {
    vi.useFakeTimers()
    const parent = createMockHabit({
      id: 'parent',
      hasSubHabits: true,
      scheduledDates: [TODAY],
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const leaf = createMockHabit({
      id: 'leaf',
      parentId: parent.id,
      scheduledDates: [TODAY],
    })
    for (const habit of [parent, leaf]) {
      mockHabitsData.habitsById.set(habit.id, habit)
    }
    mockHabitsData.childrenByParent.set(parent.id, [leaf.id])
    mockHabitsData.topLevelHabits = [parent]

    let rejectParent: ((reason?: unknown) => void) | undefined
    const rejectedParentMutation = new Promise<void>((_resolve, reject) => {
      rejectParent = reject
    })
    logHabitMutateAsync
      .mockImplementationOnce(() => rejectedParentMutation)
      .mockResolvedValue(undefined)
    const ref = React.createRef<HabitListHandle>()
    const renderResult = renderWithProviders(
      <HabitList
        ref={ref}
        filters={defaultFilters}
        selectedDate={new Date(`${TODAY}T09:00:00Z`)}
      />,
    )

    await act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leaf.id, mode: 'log' }], TODAY)
      await Promise.resolve()
    })
    const activeOperationTimerCount = vi.getTimerCount()
    await act(async () => {
      rejectParent?.(new Error('rejected'))
      await Promise.allSettled([rejectedParentMutation])
    })

    expect(screen.getByTestId(`habit-card-${parent.id}`)).toHaveAttribute('data-state', 'empty')
    expect(vi.getTimerCount()).toBe(activeOperationTimerCount - 1)

    await act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leaf.id, mode: 'log' }], TODAY)
      await Promise.resolve()
    })

    expect(logHabitMutateAsync.mock.calls
      .map(([input]) => input)
      .filter(({ habitId }) => habitId === parent.id))
      .toEqual([
        { habitId: parent.id, date: TODAY, intent: 'log' },
        { habitId: parent.id, date: TODAY, intent: 'log' },
      ])
    expect(screen.getByTestId(`habit-card-${parent.id}`)).toHaveAttribute('data-state', 'done')
    renderResult.unmount()
    vi.useRealTimers()
  })

  it('does not reuse a confirmed resolution after the viewed date changes', async () => {
    const parent = createMockHabit({
      id: 'parent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY, TODAY],
      instances: [
        { date: YESTERDAY, status: 'Pending', logId: null },
        { date: TODAY, status: 'Pending', logId: null },
      ],
    })
    const leafA = createMockHabit({
      id: 'leaf-a',
      parentId: parent.id,
      scheduledDates: [YESTERDAY, TODAY],
    })
    const leafB = createMockHabit({
      id: 'leaf-b',
      parentId: parent.id,
      scheduledDates: [YESTERDAY, TODAY],
    })
    for (const habit of [parent, leafA, leafB]) {
      mockHabitsData.habitsById.set(habit.id, habit)
    }
    mockHabitsData.childrenByParent.set(parent.id, [leafA.id, leafB.id])
    mockHabitsData.topLevelHabits = [parent]
    const ref = React.createRef<HabitListHandle>()
    const renderList = (date: string) => (
      <HabitList
        ref={ref}
        filters={defaultFilters}
        selectedDate={new Date(`${date}T09:00:00Z`)}
      />
    )
    const { rerenderWithProviders } = renderWithProviders(renderList(YESTERDAY))

    await act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leafA.id, mode: 'log' }], YESTERDAY)
      await Promise.resolve()
    })
    rerenderWithProviders(renderList(TODAY))
    await act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: leafB.id, mode: 'log' }], TODAY)
      await Promise.resolve()
    })

    expect(logHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)
    expect(skipHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)
  })

  it('does not settle a parent from a rejected sibling in a mixed bulk log', async () => {
    const parent = createMockHabit({
      id: 'parent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const acceptedChild = createMockHabit({
      id: 'child-accepted',
      parentId: parent.id,
      isCompleted: true,
    })
    const rejectedChild = createMockHabit({
      id: 'child-rejected',
      parentId: parent.id,
      isCompleted: false,
    })
    for (const habit of [parent, acceptedChild, rejectedChild]) {
      mockHabitsData.habitsById.set(habit.id, habit)
    }
    mockHabitsData.childrenByParent.set(parent.id, [acceptedChild.id, rejectedChild.id])
    mockHabitsData.topLevelHabits = [parent]
    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(<HabitList ref={ref} filters={defaultFilters} />)

    await act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: acceptedChild.id, mode: 'log' }], TODAY)
      await Promise.resolve()
    })

    expect(logHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)
    expect(skipHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)

    await act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: rejectedChild.id, mode: 'skip' }], TODAY)
      await Promise.resolve()
    })

    expect(logHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toEqual([[{ habitId: parent.id, date: TODAY, intent: 'log' }]])
  })

  it('does not treat a rejected sibling as logged in a mixed bulk skip', async () => {
    const parent = createMockHabit({
      id: 'parent',
      hasSubHabits: true,
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const acceptedChild = createMockHabit({
      id: 'child-accepted',
      parentId: parent.id,
      isCompleted: true,
    })
    const rejectedChild = createMockHabit({
      id: 'child-rejected',
      parentId: parent.id,
      isCompleted: false,
    })
    for (const habit of [parent, acceptedChild, rejectedChild]) {
      mockHabitsData.habitsById.set(habit.id, habit)
    }
    mockHabitsData.childrenByParent.set(parent.id, [acceptedChild.id, rejectedChild.id])
    mockHabitsData.topLevelHabits = [parent]
    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(<HabitList ref={ref} filters={defaultFilters} />)

    await act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: acceptedChild.id, mode: 'skip' }], TODAY)
      await Promise.resolve()
    })

    expect(logHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)
    expect(skipHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)

    await act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: rejectedChild.id, mode: 'skip' }], TODAY)
      await Promise.resolve()
    })

    expect(logHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toHaveLength(0)
    expect(skipHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === parent.id))
      .toEqual([[{ habitId: parent.id, date: TODAY }]])
  })

  it('does not settle a parent when a delayed child result arrives after account midnight', async () => {
    accountDate.timeZone = 'Pacific/Honolulu'
    vi.setSystemTime(new Date('2026-09-20T09:59:00Z'))
    const parent = createMockHabit({ id: 'parent', hasSubHabits: true, instances: [{ date: TODAY, status: 'Pending', logId: null }] })
    const acceptedChild = createMockHabit({ id: 'accepted', parentId: parent.id, isCompleted: true })
    const rejectedChild = createMockHabit({ id: 'rejected', parentId: parent.id, isCompleted: false })
    for (const habit of [parent, acceptedChild, rejectedChild]) mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.childrenByParent.set(parent.id, [acceptedChild.id, rejectedChild.id])
    mockHabitsData.topLevelHabits = [parent]
    const ref = React.createRef<HabitListHandle>()
    renderWithProviders(<HabitList ref={ref} filters={defaultFilters} selectedDate={new Date(`${TODAY}T00:00:00`)} />)

    await act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: acceptedChild.id, mode: 'skip' }], TODAY)
      await Promise.resolve()
    })
    expect(skipHabitMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id, date: TODAY })

    vi.setSystemTime(new Date('2026-09-20T10:01:00Z'))
    await act(async () => {
      ref.current?.settleBulkHabitResolutions([{ habitId: rejectedChild.id, mode: 'skip' }], TODAY)
      await Promise.resolve()
    })
    expect(skipHabitMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id, date: TODAY })
  })

  it('does not confirm a parent after its account-day window closes', async () => {
    accountDate.timeZone = 'Pacific/Honolulu'
    vi.setSystemTime(new Date('2026-09-20T09:59:00Z'))
    const parent = createMockHabit({ id: 'parent', hasSubHabits: true, instances: [{ date: TODAY, status: 'Pending', logId: null }] })
    const child = createMockHabit({ id: 'child', parentId: parent.id, isCompleted: true })
    for (const habit of [parent, child]) mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]
    const ref = React.createRef<HabitListHandle>()
    renderWithProviders(<HabitList ref={ref} filters={defaultFilters} selectedDate={new Date(`${TODAY}T00:00:00`)} />)
    await act(async () => ref.current?.checkAndPromptParentLog(child.id))

    vi.setSystemTime(new Date('2026-09-20T10:01:00Z'))
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')
    expect(logHabitMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id, date: TODAY, intent: 'log' })
  })

  it('deduplicates parent settlement through refetches until progress becomes incomplete', async () => {
    const parent = createMockHabit({ id: 'parent', title: 'Parent', hasSubHabits: true, instances: [{ date: TODAY, status: 'Pending', logId: null }] })
    const child = createMockHabit({ id: 'child', title: 'Child', parentId: 'parent', isCompleted: true })
    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]
    const ref = React.createRef<HabitListHandle>()
    const renderList = () => <HabitList ref={ref} filters={defaultFilters} />
    const { rerenderWithProviders } = renderWithProviders(renderList())
    const refetch = (isCompleted = true) => {
      mockHabitsData.habitsById.set(child.id, { ...child, isCompleted })
      mockHabitsData.habitsById.set(parent.id, { ...parent, isCompleted: false })
      mockHabitsDataUpdatedAt += 1
      rerenderWithProviders(renderList())
    }
    await act(async () => ref.current?.checkAndPromptParentLog('child'))
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')
    refetch()
    await act(async () => ref.current?.checkAndPromptParentLog('child'))
    expect(logHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === 'parent')).toHaveLength(1)
    refetch(false)
    refetch()
    await act(async () => ref.current?.checkAndPromptParentLog('child'))
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')
    expect(logHabitMutateAsync.mock.calls.filter(([input]) => input.habitId === 'parent')).toHaveLength(2)
  })

  it('settles an overdue parent when the last child is marked completed', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      isOverdue: true,
      scheduledDates: [],
      instances: [],
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      isCompleted: true,
    })

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]

    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(<HabitList ref={ref} filters={defaultFilters} />)

    await act(async () => {
      ref.current?.markRecentlyCompleted('child')
      ref.current?.checkAndPromptParentLog('child')
    })
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')

    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'parent', date: TODAY, intent: 'log' })
  })

  it('does not prompt a parent that is only due in the future', () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      dueDate: TOMORROW,
      scheduledDates: [TOMORROW],
      instances: [{ date: TOMORROW, status: 'Pending', logId: null }],
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
    })

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]

    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(<HabitList ref={ref} filters={defaultFilters} />)

    act(() => {
      ref.current?.markRecentlyCompleted('child')
      ref.current?.checkAndPromptParentLog('child')
    })

    expect(screen.queryByText('habits.autoLogParentMessage({"name":"Parent"})')).toBeNull()
  })

  it('logs the final child and every ancestor on the viewed historical date', async () => {
    const grandparent = createMockHabit({
      id: 'grandparent',
      title: 'Grandparent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      parentId: 'grandparent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      scheduledDates: [YESTERDAY],
    })

    mockHabitsData.habitsById.set(grandparent.id, grandparent)
    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(grandparent.id, [parent.id])
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [grandparent]

    renderWithProviders(
      <HabitList
        filters={defaultFilters}
        selectedDate={new Date(`${YESTERDAY}T09:00:00Z`)}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByTestId('log-child'))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')

    expect(logHabitMutateAsync).toHaveBeenCalledTimes(3)
    expect(logHabitMutateAsync.mock.calls).toEqual([
      [{ habitId: 'child', date: YESTERDAY, intent: 'log' }],
      [{ habitId: 'parent', date: YESTERDAY, intent: 'log' }],
      [{ habitId: 'grandparent', date: YESTERDAY, intent: 'log' }],
    ])
  })

  it('skips the final child and every ancestor on the viewed historical date', async () => {
    const grandparent = createMockHabit({
      id: 'grandparent',
      title: 'Grandparent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      parentId: 'grandparent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      scheduledDates: [YESTERDAY],
    })

    mockHabitsData.habitsById.set(grandparent.id, grandparent)
    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(grandparent.id, [parent.id])
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [grandparent]

    renderWithProviders(
      <HabitList
        filters={defaultFilters}
        selectedDate={new Date(`${YESTERDAY}T09:00:00Z`)}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByTestId('skip-child'))
    })
    await act(async () => { await Promise.resolve() })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(skipHabitMutateAsync.mock.calls).toEqual([
      [{ habitId: 'child', date: YESTERDAY, onUndo: expect.any(Function) }],
      [{ habitId: 'parent', date: YESTERDAY }],
      [{ habitId: 'grandparent', date: YESTERDAY }],
    ])
  })

  it('does not prompt the parent while an overdue sub-habit is still unresolved', () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      scheduledDates: [TODAY],
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const loggedChild = createMockHabit({
      id: 'child-a',
      title: 'Child A',
      parentId: 'parent',
      isLoggedInRange: true,
    })
    const overdueChild = createMockHabit({
      id: 'child-b',
      title: 'Child B',
      parentId: 'parent',
      isOverdue: true,
      scheduledDates: [],
      dueDate: '2025-01-01',
    })

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(loggedChild.id, loggedChild)
    mockHabitsData.habitsById.set(overdueChild.id, overdueChild)
    mockHabitsData.childrenByParent.set(parent.id, [loggedChild.id, overdueChild.id])
    mockHabitsData.topLevelHabits = [parent]

    const ref = React.createRef<HabitListHandle>()

    renderWithProviders(<HabitList ref={ref} filters={defaultFilters} view="today" />)

    act(() => {
      ref.current?.checkAndPromptParentLog('child-a')
    })

    expect(screen.queryByText('habits.autoLogParentMessage({"name":"Parent"})')).toBeNull()
  })

  it('skips the parent immediately once every sub-habit is skipped', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      scheduledDates: [TODAY, TOMORROW],
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const childA = createMockHabit({
      id: 'child-a',
      title: 'Child A',
      parentId: 'parent',
      scheduledDates: [TODAY],
    })
    const childB = createMockHabit({
      id: 'child-b',
      title: 'Child B',
      parentId: 'parent',
      scheduledDates: [TODAY],
    })

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(childA.id, childA)
    mockHabitsData.habitsById.set(childB.id, childB)
    mockHabitsData.childrenByParent.set(parent.id, [childA.id, childB.id])
    mockHabitsData.topLevelHabits = [parent]

    renderWithProviders(<HabitList filters={defaultFilters} view="today" />)

    await confirmRowSkip('child-a')
    expect(skipHabitMutateAsync).not.toHaveBeenCalledWith({ habitId: 'parent' })

    await confirmRowSkip('child-b')
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    expect(skipHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'child-a', date: TODAY, onUndo: expect.any(Function) })
    expect(skipHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'child-b', date: TODAY, onUndo: expect.any(Function) })
    expect(skipHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'parent', date: TODAY })
    expect(screen.queryByRole('dialog', { name: 'habits.autoSkipParentTitle' })).toBeNull()
  })

  it('asks before logging a parent when the final row action is a skip', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      scheduledDates: [TODAY],
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    })
    const loggedChild = createMockHabit({
      id: 'child-logged',
      title: 'Logged child',
      parentId: parent.id,
      isCompleted: true,
      scheduledDates: [TODAY],
    })
    const skippedChild = createMockHabit({
      id: 'child-skipped',
      title: 'Skipped child',
      parentId: parent.id,
      scheduledDates: [TODAY],
    })
    for (const habit of [parent, loggedChild, skippedChild]) {
      mockHabitsData.habitsById.set(habit.id, habit)
    }
    mockHabitsData.childrenByParent.set(parent.id, [loggedChild.id, skippedChild.id])
    mockHabitsData.topLevelHabits = [parent]

    renderWithProviders(<HabitList filters={defaultFilters} view="today" />)

    await confirmRowSkip('child-skipped')

    expect(logHabitMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id, date: TODAY, intent: 'log' })
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')
    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: parent.id, date: TODAY, intent: 'log' })
  })

  it('queues confirmations when concurrent row skips complete two mixed parents', async () => {
    const parentA = createMockHabit({
      id: 'parent-a',
      title: 'Parent A',
      hasSubHabits: true,
      scheduledDates: [TODAY],
    })
    const parentB = createMockHabit({
      id: 'parent-b',
      title: 'Parent B',
      hasSubHabits: true,
      scheduledDates: [TODAY],
    })
    const children = [
      createMockHabit({
        id: 'logged-a',
        parentId: parentA.id,
        isCompleted: true,
        scheduledDates: [TODAY],
      }),
      createMockHabit({ id: 'skipped-a', parentId: parentA.id, scheduledDates: [TODAY] }),
      createMockHabit({
        id: 'logged-b',
        parentId: parentB.id,
        isCompleted: true,
        scheduledDates: [TODAY],
      }),
      createMockHabit({ id: 'skipped-b', parentId: parentB.id, scheduledDates: [TODAY] }),
    ]
    for (const habit of [parentA, parentB, ...children]) {
      mockHabitsData.habitsById.set(habit.id, habit)
    }
    mockHabitsData.childrenByParent.set(parentA.id, ['logged-a', 'skipped-a'])
    mockHabitsData.childrenByParent.set(parentB.id, ['logged-b', 'skipped-b'])
    mockHabitsData.topLevelHabits = [parentA, parentB]
    const resolveSkips: (() => void)[] = []
    skipHabitMutateAsync.mockImplementation(
      () => new Promise<void>((resolve) => resolveSkips.push(resolve)),
    )

    const rendered = renderWithProviders(<HabitList filters={defaultFilters} view="today" />)
    await confirmRowSkip('skipped-a')
    await confirmRowSkip('skipped-b')
    sheetTestControls.defer(true)
    await act(async () => {
      resolveSkips.forEach((resolve) => resolve())
      await Promise.resolve()
    })

    expect(await screen.findByText('habits.autoLogParentMessage({"name":"Parent A"})'))
      .toBeDefined()
    fireEvent.click(within(
      screen.getByRole('dialog', { name: 'habits.autoLogParentTitle' }),
    ).getByRole('button', { name: 'habits.autoLogParentConfirm' }))
    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(screen.queryByRole('dialog', { name: 'habits.autoLogParentTitle' })).toBeNull()

    await act(async () => {
      sheetTestControls.completeDismissal()
      await Promise.resolve()
    })
    expect(await screen.findByText('habits.autoLogParentMessage({"name":"Parent B"})'))
      .toBeDefined()

    mockHabitsDataUpdatedAt += 1
    rendered.rerenderWithProviders(<HabitList filters={defaultFilters} view="today" />)

    fireEvent.click(within(
      screen.getByRole('dialog', { name: 'habits.autoLogParentTitle' }),
    ).getByRole('button', { name: 'habits.autoLogParentConfirm' }))
    expect(sheetTestControls.isDismissPending).toBe(true)
    await act(async () => {
      sheetTestControls.completeDismissal()
      await Promise.resolve()
    })

    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: parentA.id, date: TODAY, intent: 'log' })
    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: parentB.id, date: TODAY, intent: 'log' })
  })

  it('keeps a cascaded grandparent confirmation actionable after stale settlement data', async () => {
    const grandparent = createMockHabit({
      id: 'grandparent',
      title: 'Grandparent',
      hasSubHabits: true,
      scheduledDates: [TODAY],
    })
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      parentId: grandparent.id,
      hasSubHabits: true,
      scheduledDates: [TODAY],
    })
    const loggedChild = createMockHabit({
      id: 'logged-child',
      parentId: parent.id,
      isCompleted: true,
      scheduledDates: [TODAY],
    })
    const skippedChild = createMockHabit({
      id: 'skipped-child',
      parentId: parent.id,
      scheduledDates: [TODAY],
    })
    for (const habit of [grandparent, parent, loggedChild, skippedChild]) {
      mockHabitsData.habitsById.set(habit.id, habit)
    }
    mockHabitsData.childrenByParent.set(grandparent.id, [parent.id])
    mockHabitsData.childrenByParent.set(parent.id, [loggedChild.id, skippedChild.id])
    mockHabitsData.topLevelHabits = [grandparent]

    let resolveParentMutation!: () => void
    const pendingParentMutation = new Promise<void>((resolve) => {
      resolveParentMutation = resolve
    })
    logHabitMutateAsync.mockImplementation(({ habitId }: { habitId: string }) => (
      habitId === parent.id ? pendingParentMutation : Promise.resolve()
    ))
    const rendered = renderWithProviders(<HabitList filters={defaultFilters} view="today" />)

    await confirmRowSkip(skippedChild.id)
    expect(await screen.findByText('habits.autoLogParentMessage({"name":"Parent"})'))
      .toBeDefined()

    fireEvent.click(within(
      screen.getByRole('dialog', { name: 'habits.autoLogParentTitle' }),
    ).getByRole('button', { name: 'habits.autoLogParentConfirm' }))
    await act(async () => {
      await Promise.resolve()
    })
    mockHabitsDataUpdatedAt += 1
    rendered.rerenderWithProviders(<HabitList filters={defaultFilters} view="today" />)

    await act(async () => {
      resolveParentMutation()
      await pendingParentMutation
      await Promise.resolve()
    })

    expect(await screen.findByText('habits.autoLogParentMessage({"name":"Grandparent"})'))
      .toBeDefined()
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')
    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: grandparent.id, date: TODAY, intent: 'log' })
  })

  it('does not settle a parent when a row skip resolves after the viewed date changes', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
      scheduledDates: [YESTERDAY, TODAY],
      instances: [{ date: YESTERDAY, status: 'Pending', logId: null }],
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: parent.id,
      scheduledDates: [YESTERDAY, TODAY],
    })
    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]
    let resolveSkip!: () => void
    skipHabitMutateAsync.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveSkip = resolve
    }))
    const renderList = (date: string) => (
      <HabitList
        filters={defaultFilters}
        selectedDate={new Date(`${date}T09:00:00Z`)}
      />
    )
    const { rerenderWithProviders } = renderWithProviders(renderList(YESTERDAY))

    act(() => {
      fireEvent.click(screen.getByTestId('skip-child'))
    })
    await act(async () => { await Promise.resolve() })
    act(() => {
      rerenderWithProviders(renderList(TODAY))
    })
    await act(async () => {
      resolveSkip()
      await Promise.resolve()
    })

    expect(skipHabitMutateAsync.mock.calls).toEqual([
      [{ habitId: child.id, date: YESTERDAY, onUndo: expect.any(Function) }],
    ])
    expect(logHabitMutateAsync).not.toHaveBeenCalledWith({ habitId: parent.id, date: YESTERDAY, intent: 'log' })
    expect(screen.queryByRole('dialog', { name: 'habits.autoLogParentTitle' })).toBeNull()
  })

  it('does not settle a parent when the account changes before a row skip continuation', async () => {
    holdAccount('account-a')
    const parent = createMockHabit({ id: 'parent', title: 'Parent', hasSubHabits: true, scheduledDates: [TODAY] })
    const child = createMockHabit({ id: 'child', title: 'Child', parentId: parent.id, scheduledDates: [TODAY] })
    for (const habit of [parent, child]) mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.childrenByParent.set(parent.id, [child.id])
    mockHabitsData.topLevelHabits = [parent]
    let resolveSkip!: () => void
    skipHabitMutateAsync.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveSkip = resolve }))
    renderWithProviders(<HabitList view="today" filters={defaultFilters} />)
    fireEvent.click(screen.getByTestId('skip-child'))
    await act(async () => {
      holdAccount('account-b')
      resolveSkip()
      await Promise.resolve()
    })
    expect(skipHabitMutateAsync).toHaveBeenCalledTimes(1)
    expect(logHabitMutateAsync).not.toHaveBeenCalled()
  })

  it('offers Show completed when filtering hides every drilled child', () => {
    const parent = createMockHabit({ id: 'parent', title: 'Parent', hasSubHabits: true })
    const onShowCompleted = vi.fn()
    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.topLevelHabits = [parent]
    mockDrillState.drillStack = ['parent']
    mockDrillState.currentParentId = 'parent'
    mockDrillState.currentParent = parent
    mockDrillState.hasUnfilteredChildren = true
    mockDrillState.canRevealCompletedChildren = true

    renderWithProviders(<HabitList filters={defaultFilters} onShowCompleted={onShowCompleted} />)

    expect(screen.queryByText('habits.noSubHabits')).not.toBeInTheDocument()
    expect(screen.getByText('habits.filterEmptySubHabits')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'habits.showCompleted' }))
    expect(onShowCompleted).toHaveBeenCalledTimes(1)
  })

  it('explains when the selected date hides every drilled child', () => {
    const parent = createMockHabit({ id: 'parent', title: 'Parent', hasSubHabits: true })
    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.topLevelHabits = [parent]
    mockDrillState.drillStack = ['parent']
    mockDrillState.currentParentId = 'parent'
    mockDrillState.currentParent = parent
    mockDrillState.hasUnfilteredChildren = true

    renderWithProviders(<HabitList filters={defaultFilters} />)

    expect(screen.getByText('habits.filterEmptySubHabits')).toBeInTheDocument()
    expect(screen.queryByText('habits.showCompleted')).not.toBeInTheDocument()
  })

  it('keeps the true empty drill message when the habit has no children', () => {
    const parent = createMockHabit({ id: 'parent', title: 'Parent' })
    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.topLevelHabits = [parent]
    mockDrillState.drillStack = ['parent']
    mockDrillState.currentParentId = 'parent'
    mockDrillState.currentParent = parent

    renderWithProviders(<HabitList filters={defaultFilters} />)

    expect(screen.getByText('habits.noSubHabits')).toBeInTheDocument()
    expect(screen.queryByText('habits.filterEmptySubHabits')).not.toBeInTheDocument()
  })

  it('stores drill edit onSaved callback without invoking refresh eagerly', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      hasSubHabits: false,
    })

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.topLevelHabits = [parent]

    mockDrillState.drillStack = ['parent']
    mockDrillState.currentParentId = 'parent'
    mockDrillState.currentParent = parent
    mockDrillState.drillChildren = [child]

    renderWithProviders(<HabitList filters={defaultFilters} />)

    expect(screen.getByTestId('habit-card-child')).toHaveAttribute('data-structural-column', 'yes')
    fireEvent.click(screen.getByTestId('edit-child'))
    expect(drillRefreshCurrent).not.toHaveBeenCalled()

    fireEvent.click(await screen.findByTestId('edit-habit-modal-save'))
    expect(drillRefreshCurrent).toHaveBeenCalledTimes(1)
  })

  it('locks the edit modal General toggle to the parent isGeneral when editing a sub-habit', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      isGeneral: true,
      hasSubHabits: true,
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      isGeneral: true,
      hasSubHabits: false,
    })

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.topLevelHabits = [parent]

    mockDrillState.drillStack = ['parent']
    mockDrillState.currentParentId = 'parent'
    mockDrillState.currentParent = parent
    mockDrillState.drillChildren = [child]

    renderWithProviders(<HabitList filters={defaultFilters} />)

    fireEvent.click(screen.getByTestId('edit-child'))
    expect(await screen.findByTestId('edit-habit-modal-locked-general')).toHaveTextContent('true')
  })

  it('locks the edit modal General toggle to an existing child isGeneral when editing a parent', async () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      isGeneral: false,
      hasSubHabits: true,
    })
    const child = createMockHabit({
      id: 'child',
      title: 'Child',
      parentId: 'parent',
      isGeneral: false,
      hasSubHabits: false,
    })

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.topLevelHabits = [parent]

    renderWithProviders(<HabitList filters={defaultFilters} />)

    fireEvent.click(screen.getByTestId('edit-parent'))
    expect(await screen.findByTestId('edit-habit-modal-locked-general')).toHaveTextContent('false')
  })

  it('retries loading drill children from the drill error state', () => {
    const parent = createMockHabit({
      id: 'parent',
      title: 'Parent',
      hasSubHabits: true,
    })

    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.topLevelHabits = [parent]

    mockDrillState.drillStack = ['parent']
    mockDrillState.currentParentId = 'parent'
    mockDrillState.currentParent = parent
    mockDrillState.drillError = 'boom'

    renderWithProviders(<HabitList filters={defaultFilters} />)

    expect(screen.getByRole('alert')).toHaveTextContent('boom')

    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(drillRefreshCurrent).toHaveBeenCalledTimes(1)
  })

  it('logs an overdue habit directly with no date', () => {
    const overdue = createMockHabit({
      id: 'overdue-1',
      title: 'Overdue task',
      isOverdue: true,
      frequencyUnit: null,
      scheduledDates: [],
    })
    mockHabitsData.habitsById.set(overdue.id, overdue)
    mockHabitsData.topLevelHabits = [overdue]

    renderWithProviders(<HabitList filters={defaultFilters} />)

    fireEvent.click(screen.getByTestId('log-overdue-1'))

    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'overdue-1', intent: 'log' })
  })

  it.each([
    ['recurring', 'Day', false],
    ['weekly flexible', 'Week', true],
    ['monthly flexible', 'Month', true],
    ['one-time', null, false],
  ] as const)('skips a %s row without a sheet and restores it through the undo endpoint', async (_kind, frequencyUnit, isFlexible) => {
    skipFlow.active = true
    useActualHabitVisibility = true
    rowImplementation.actual = true
    accountHabitCount.count = 2
    holdAccount('account-a')
    const row = habitScheduleItemSchema.parse(createMockHabitScheduleItem({
      id: '11111111-1111-4111-8111-111111111111', title: 'Walk', frequencyUnit, isFlexible,
      dueDate: TODAY, scheduledDates: [TODAY], instances: [{ date: TODAY, status: 'Pending', logId: null }],
      flexibleTarget: isFlexible ? 1 : null, flexibleCompleted: isFlexible ? 0 : null,
    }))
    skipFlow.original = [row]
    skipFlow.items = [row]
    let receipt: string | undefined
    skipFlow.mutate.mockImplementation(async (endpoint: string, options: { body?: string }) => {
      if (endpoint.endsWith('/undo')) {
        expect(endpoint).toBe(`/api/habits/${row.id}/skip/${receipt}/undo`)
        skipFlow.items = skipFlow.original
      } else {
        expect(endpoint).toBe(`/api/habits/${row.id}/skip`)
        const request = skipHabitRequestSchema.parse(JSON.parse(options.body!))
        expect(request.date).toBe(TODAY)
        receipt = request.skipId ?? undefined
        expect(receipt).toMatch(/^[0-9a-f-]{36}$/)
        skipFlow.items = []
      }
    })
    renderWithProviders(<><HabitList filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }} /><SkipToastHost /></>)
    await screen.findByText('Walk')
    fireEvent.click(screen.getByRole('button', { name: 'habits.actions.more' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'habits.actions.skip' }))
    await waitFor(() => expect(skipFlow.mutate).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(screen.queryByText('Walk')).toBeNull())
    const toast = useAppToastStore.getState().currentToast?.toast
    expect(toast).toMatchObject({ kind: 'neutral', message: frequencyUnit === null ? 'undo.habitPostponed' : 'undo.habitSkipped', actionLabel: 'undo.action' })
    fireEvent.click(screen.getByRole('button', { name: 'undo.action' }))
    await screen.findByText('Walk')
    expect(skipFlow.mutate).toHaveBeenCalledTimes(2)
  })

  it('does not log a parent after undo restores its final skipped child', async () => {
    skipFlow.active = true
    useActualHabitVisibility = true
    rowImplementation.actual = true
    accountHabitCount.count = 3
    holdAccount('account-a')
    const child = habitScheduleItemSchema.parse(createMockHabitScheduleItem({
      id: '11111111-1111-4111-8111-111111111111', title: 'Pending child',
      dueDate: TODAY, scheduledDates: [TODAY], instances: [{ date: TODAY, status: 'Pending', logId: null }],
    }))
    const loggedChild = habitScheduleItemSchema.parse(createMockHabitScheduleItem({
      id: '33333333-3333-4333-8333-333333333333', title: 'Logged child',
      dueDate: TODAY, scheduledDates: [TODAY], isCompleted: true, isLoggedInRange: true,
      instances: [{ date: TODAY, status: 'Completed', logId: 'child-log' }],
    }))
    const parent = habitScheduleItemSchema.parse(createMockHabitScheduleItem({
      id: '44444444-4444-4444-8444-444444444444', title: 'Parent', hasSubHabits: true,
      dueDate: TODAY, scheduledDates: [TODAY], children: [loggedChild, child],
      instances: [{ date: TODAY, status: 'Pending', logId: null }],
    }))
    skipFlow.items = [parent]
    skipFlow.mutate.mockImplementation(async (endpoint: string, options: { body?: string }) => {
      if (endpoint.endsWith('/undo')) {
        skipFlow.items = [parent]
      } else {
        expect(endpoint).toBe(`/api/habits/${child.id}/skip`)
        skipHabitRequestSchema.parse(JSON.parse(options.body!))
        skipFlow.items = [{ ...parent, children: [loggedChild] }]
      }
    })
    renderWithProviders(<><HabitList view="today" filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }} /><SkipToastHost /></>)
    const childRow = (await screen.findByText('Pending child')).closest('[data-testid="habit-row"]') as HTMLElement
    fireEvent.click(within(childRow).getByRole('button', { name: 'habits.actions.more' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'habits.actions.skip' }))
    await screen.findByRole('dialog', { name: 'habits.autoLogParentTitle' })
    await waitFor(() => expect(screen.queryByText('Pending child')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'undo.action' }))
    await screen.findByText('Pending child')
    expect(skipFlow.mutate).toHaveBeenCalledTimes(2)
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')
    expect(logHabitMutateAsync).not.toHaveBeenCalled()
  })

  it('skips immediately and asks before deleting a habit', async () => {
    const habit = createMockHabit({ id: 'h-1', title: 'Stretch' })
    const child = createMockHabit({ id: 'h-2', title: 'Warm up', parentId: habit.id })
    mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(habit.id, [child.id])
    mockHabitsData.topLevelHabits = [habit]

    renderWithProviders(
      <HabitList filters={defaultFilters} selectedDate={new Date(`${TODAY}T09:00:00Z`)} />,
    )

    await act(async () => {
      fireEvent.click(screen.getByTestId('skip-h-1'))
    })
    expect(skipHabitMutateAsync).toHaveBeenCalledWith({ habitId: habit.id, date: TODAY, onUndo: expect.any(Function) })
    expect(screen.queryByRole('dialog', { name: 'habits.skipConfirmTitle({\"name\":\"Stretch\"})' })).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'habits.deleteConfirmTitle' })).toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByTestId('delete-h-1'))
    })
    expect(deleteHabitMutateAsync).not.toHaveBeenCalled()

    const confirmation = await screen.findByRole('dialog', {
      name: 'habits.deleteConfirmTitle',
    })
    expect(within(confirmation).getByText(
      'Stretch and 1 item inside it leave your list. You can undo it from the message that appears.',
    )).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(within(confirmation).getByRole('button', { name: 'habits.deleteHabit' }))
    })
    expect(deleteHabitMutateAsync).toHaveBeenCalledWith('h-1')
  })

  it('starts a future-day row delete as soon as confirmation is pressed', async () => {
    rowImplementation.actual = true
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(min-width: 768px)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    const habit = createMockHabit({ id: 'future-delete', title: 'Read', scheduledDates: [TOMORROW] })
    mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.topLevelHabits = [habit]
    deleteHabitMutateAsync.mockImplementationOnce(() => {
      mockHabitsData.habitsById.delete(habit.id)
      mockHabitsData.topLevelHabits = []
      return Promise.resolve()
    })
    const futureList = <HabitList filters={{ dateFrom: TOMORROW, dateTo: TOMORROW, includeOverdue: true }}
      selectedDate={new Date(`${TOMORROW}T09:00:00Z`)} />
    const { rerenderWithProviders } = renderWithProviders(futureList)
    fireEvent.click(screen.getByRole('button', { name: 'habits.actions.more' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'habits.actions.delete' }))
    const confirmation = await screen.findByRole('dialog', { name: 'habits.deleteConfirmTitle' })
    sheetTestControls.defer(true)
    fireEvent.click(within(confirmation).getByRole('button', { name: 'habits.deleteHabit' }))

    expect(screen.queryByRole('dialog', { name: 'habits.deleteConfirmTitle' })).toBeNull()
    expect(deleteHabitMutateAsync).toHaveBeenCalledTimes(1)
    expect(deleteHabitMutateAsync).toHaveBeenCalledWith('future-delete')
    await act(async () => { await Promise.resolve() })
    rerenderWithProviders(futureList)
    expect(screen.queryByRole('button', { name: 'habits.actions.more' })).toBeNull()
    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(screen.getByTestId('sheet')).toHaveTextContent(
      'Read leaves your list. You can undo it from the message that appears.',
    )
    act(() => { sheetTestControls.completeDismissal() })
    expect(screen.queryByTestId('sheet')).toBeNull()
    expect(document.activeElement).toHaveAttribute('tabindex', '-1')
    vi.unstubAllGlobals()
  })

  it.each([
    [0, 'Read leaves your list. You can undo it from the message that appears.'],
    [1, 'Read and 1 item inside it leave your list. You can undo it from the message that appears.'],
    [3, 'Read and 3 items inside it leave your list. You can undo it from the message that appears.'],
  ])('names %i descendants in the delete confirmation', async (count, message) => {
    const habit = createMockHabit({ id: 'read', title: 'Read' })
    mockHabitsData.habitsById.set(habit.id, habit)
    const children = Array.from({ length: count }, (_, index) =>
      createMockHabit({ id: `child-${index}`, title: `Child ${index}`, parentId: habit.id }))
    for (const child of children) mockHabitsData.habitsById.set(child.id, child)
    mockHabitsData.childrenByParent.set(habit.id, children.map((child) => child.id))
    mockHabitsData.topLevelHabits = [habit]

    renderWithProviders(<HabitList filters={defaultFilters} />)
    fireEvent.click(screen.getByTestId('delete-read'))
    const confirmation = await screen.findByRole('dialog', { name: 'habits.deleteConfirmTitle' })
    expect(within(confirmation).getByText(message)).toBeInTheDocument()
    if (count === 0) expect(within(confirmation).getByText(message).textContent).not.toMatch(/0|items/)
  })

  it('shows busy delete actions while dismissal and deletion are pending', async () => {
    const habit = createMockHabit({ id: 'read', title: 'Read' })
    mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.topLevelHabits = [habit]
    deleteHabitMutateAsync.mockImplementation(() => new Promise<void>(() => {}))
    sheetTestControls.defer(true)
    renderWithProviders(<HabitList filters={defaultFilters} />)
    fireEvent.click(screen.getByTestId('delete-read'))
    const confirmation = await screen.findByRole('dialog', { name: 'habits.deleteConfirmTitle' })
    fireEvent.click(within(confirmation).getByRole('button', { name: 'habits.deleteHabit' }))

    const mountedSheet = screen.getByTestId('sheet')
    const confirmButton = within(mountedSheet).getByRole('button', { name: 'habits.deleteHabit', hidden: true })
    const cancelButton = within(mountedSheet).getByRole('button', { name: 'common.cancel', hidden: true })
    expect(confirmButton).toHaveAttribute('aria-busy', 'true')
    expect(confirmButton).toBeDisabled()
    expect(cancelButton).toBeDisabled()
    expect(deleteHabitMutateAsync).toHaveBeenCalledTimes(1)
  })

  it('skips immediately from the recurring row menu', async () => {
    rowImplementation.actual = true
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(min-width: 768px)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    const habit = createMockHabit({ id: 'row-menu', title: 'Walk', scheduledDates: [TODAY] })
    mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.topLevelHabits = [habit]
    renderWithProviders(<HabitList filters={defaultFilters} />)

    fireEvent.click(screen.getByRole('button', { name: 'habits.actions.more' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'habits.actions.skip' }))

    await waitFor(() => expect(skipHabitMutateAsync).toHaveBeenCalledWith({ habitId: habit.id, date: TODAY, onUndo: expect.any(Function) }))
    expect(screen.queryByRole('dialog')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('keeps a confirmed skip out of the done state while the list refreshes', async () => {
    const habit = createMockHabit({ id: 'skip-state', title: 'Walk', scheduledDates: [TODAY] })
    mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.topLevelHabits = [habit]
    renderWithProviders(<HabitList filters={defaultFilters} />)

    await confirmRowSkip(habit.id)
    expect(skipHabitMutateAsync).toHaveBeenCalledWith({ habitId: habit.id, date: TODAY, onUndo: expect.any(Function) })
    expect(screen.queryByTestId('recent-skip-state')).toHaveTextContent('no')
    expect(screen.queryByTestId('habit-card-skip-state')).not.toHaveAttribute('data-state', 'done')
  })

  it.each(['Week', 'Month'] as const)('skips a %s flexible habit without confirmation', async (frequencyUnit) => {
    const habit = createMockHabit({ id: 'flexible', title: 'Walk', isFlexible: true, frequencyUnit, scheduledDates: [TODAY] })
    mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.topLevelHabits = [habit]
    renderWithProviders(<HabitList filters={defaultFilters} />)
    await confirmRowSkip(habit.id)
    expect(skipHabitMutateAsync).toHaveBeenCalledWith({ habitId: habit.id, date: TODAY, onUndo: expect.any(Function) })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('asks before duplicating a habit', async () => {
    const habit = createMockHabit({ id: 'h-1', title: 'Stretch' })
    mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.topLevelHabits = [habit]
    renderWithProviders(<HabitList filters={defaultFilters} />)

    fireEvent.click(screen.getByTestId('duplicate-h-1'))
    expect(duplicateHabitMutateAsync).not.toHaveBeenCalled()

    await confirmVisibleSheet('habits.duplicateConfirmTitle', 'habits.duplicateConfirm')
    expect(duplicateHabitMutateAsync).toHaveBeenCalledWith('h-1')
  })

  it('postpones an overdue one-time habit immediately', async () => {
    const overdue = createMockHabit({
      id: 'overdue-1',
      title: 'Overdue task',
      isOverdue: true,
      frequencyUnit: null,
      scheduledDates: [],
    })
    mockHabitsData.habitsById.set(overdue.id, overdue)
    mockHabitsData.topLevelHabits = [overdue]

    renderWithProviders(<HabitList filters={defaultFilters} />)

    await act(async () => {
      fireEvent.click(screen.getByTestId('skip-overdue-1'))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(skipHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'overdue-1', date: TODAY, onUndo: expect.any(Function) })
  })

  it('renders a selectable checkbox for an overdue row in select mode', () => {
    const overdue = createMockHabit({
      id: 'overdue-1',
      title: 'Overdue task',
      isOverdue: true,
      frequencyUnit: null,
      scheduledDates: [],
    })
    mockHabitsData.habitsById.set(overdue.id, overdue)
    mockHabitsData.topLevelHabits = [overdue]

    renderWithProviders(
      <HabitList
        filters={defaultFilters}
        isSelectMode
        selectedHabitIds={new Set()}
        onToggleSelection={toggleSelectionSpy}
      />,
    )

    expect(screen.getByTestId('habit-card-overdue-1')).toHaveAttribute('data-select-mode', 'yes')
    expect(screen.getByTestId('habit-card-overdue-1')).toHaveAttribute('data-structural-column', 'yes')

    fireEvent.click(screen.getByTestId('select-overdue-1'))

    expect(toggleSelectionSpy).toHaveBeenCalledWith('overdue-1')
  })

  it('opens a repeating future habit with its selected date and withholds log actions', () => {
    const habit = createMockHabit({
      id: 'future-1',
      title: 'Future habit',
      frequencyUnit: 'Day',
      scheduledDates: [TOMORROW],
    })
    mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.topLevelHabits = [habit]

    renderWithProviders(
      <HabitList
        view="today"
        filters={{ dateFrom: TOMORROW, dateTo: TOMORROW }}
        selectedDate={new Date(`${TOMORROW}T09:00:00Z`)}
      />,
    )

    const row = screen.getByTestId('habit-card-future-1')
    expect(row).toHaveAttribute('data-read-only', 'yes')
    expect(row).toHaveAttribute('data-can-log', 'no')
    expect(row).toHaveAttribute('data-has-skip', 'no')

    fireEvent.click(screen.getByTestId('detail-future-1'))
    expect(routerPush).toHaveBeenCalledWith(`/habits/future-1?date=${TOMORROW}&from=today`)
  })

  it('blocks a completion outside the account window before sending a write', () => {
    vi.setSystemTime(new Date('2026-09-11T10:30:00Z'))
    accountDate.timeZone = 'Pacific/Kiritimati'
    const habit = createMockHabit({ id: 'account-window', title: 'Read' })
    mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.topLevelHabits = [habit]

    renderWithProviders(
      <HabitList filters={{ dateFrom: '2026-09-04', dateTo: '2026-09-04' }}
        selectedDate={new Date('2026-09-04T12:00:00Z')} />,
    )

    const row = screen.getByTestId('habit-card-account-window')
    expect(row).toHaveAttribute('data-read-only', 'yes')
    expect(row).toHaveAttribute('data-has-skip', 'no')
    fireEvent.click(screen.getByTestId('log-account-window'))
    expect(logHabitMutateAsync).not.toHaveBeenCalled()
  })
})

describe('HabitList across an account change', () => {
  const ACCOUNT_A_TITLE = 'Account A morning run'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    sheetTestControls.defer(false)
    mockHabitsData.habitsById = new Map()
    mockHabitsData.childrenByParent = new Map()
    mockHabitsData.topLevelHabits = []
    const habit = createMockHabit({ id: 'habit-a', title: ACCOUNT_A_TITLE, dueDate: TODAY })
    mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.topLevelHabits = [habit]
    holdAccount('user-1')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function openAccountAEditModal() {
    renderWithProviders(<HabitList filters={defaultFilters} />)
    fireEvent.click(screen.getByTestId('edit-habit-a'))
    expect(await screen.findByTestId('edit-habit-modal-title')).toHaveTextContent(ACCOUNT_A_TITLE)
  }

  it('takes an open edit modal off the screen when another account replaces the tab', async () => {
    await openAccountAEditModal()

    await replaceAccountWith('user-2')

    expect(screen.queryByTestId('edit-habit-modal-title')).not.toBeInTheDocument()
  })

  it('keeps the edit modal when the same account recovers from a rejected refresh', async () => {
    await openAccountAEditModal()

    await recoverSameAccount('user-1')

    expect(screen.getByTestId('edit-habit-modal-title')).toHaveTextContent(ACCOUNT_A_TITLE)
  })

  it('takes a duplicate confirmation for the previous account off the screen', async () => {
    renderWithProviders(<HabitList filters={defaultFilters} />)
    fireEvent.click(screen.getByTestId('duplicate-habit-a'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    await replaceAccountWith('user-2')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('removes a closing delete sheet immediately when the account changes', async () => {
    deleteHabitMutateAsync.mockImplementation(() => new Promise<void>(() => {}))
    renderWithProviders(<HabitList filters={defaultFilters} />)
    fireEvent.click(screen.getByTestId('delete-habit-a'))
    const confirmation = await screen.findByRole('dialog', { name: 'habits.deleteConfirmTitle' })
    sheetTestControls.defer(true)
    fireEvent.click(within(confirmation).getByRole('button', { name: 'habits.deleteHabit' }))
    expect(screen.getByTestId('sheet')).toBeInTheDocument()

    await replaceAccountWith('user-2')

    expect(screen.queryByTestId('sheet')).toBeNull()
  })
})
