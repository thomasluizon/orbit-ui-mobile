import { advanceAccountGeneration } from '@/lib/session-epoch'
import { resetAccountQueries } from '@orbit/shared/query'
import { createMoveInventoryFixture } from '@orbit/shared/__tests__/move-inventory-fixtures'
import { createHabitViewItems, createHabitViewScheduleItems, createHabitViewFixture, HABIT_VIEW_ROW_ORDER } from '@orbit/shared/__tests__/habit-view-fixtures'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { personalText } from '@/__tests__/support/personal-text'
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
import { createQueryClient } from '@/lib/query-client'
import { useThrottleStore } from '@/stores/throttle-store'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMockHabit, createMockHabitScheduleChild, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { formatAPIDate, formatAPIDateInTimeZone, normalizeHabitQueryData } from '@orbit/shared/utils'
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
const dragLocale = vi.hoisted(() => ({ portuguese: false, english: false }))
const accountDate = vi.hoisted(() => ({ timeZone: undefined as string | undefined, hasProAccess: true }))
const accountHabitCount = vi.hoisted(() => ({ count: 0, isLoaded: true }))
const setFrequencyFilters = vi.hoisted(() => vi.fn())
const moveControllerOwner = vi.hoisted(() => ({ loaded: vi.fn(), initialize: vi.fn() }))
const moveModuleLoad = vi.hoisted(() => ({
  generation: 0, hold: null as Promise<void> | null, pending: null as Promise<unknown> | null, requested: vi.fn(), ready: vi.fn(),
}))

vi.mock('next/dynamic', async () => {
  const { default: dynamic } = await import('next/dist/shared/lib/app-dynamic')
  return { default: <Props extends object,>(loader: () => Promise<React.ComponentType<Props>>) => {
    const components = new Map<number, React.ComponentType<Props>>()
    return function DeferredComponent(props: Props) {
      let Component = components.get(moveModuleLoad.generation)
      if (!Component) {
        Component = dynamic(() => {
          const pending = (async () => {
            moveModuleLoad.requested()
            if (moveModuleLoad.hold) await moveModuleLoad.hold
            const component = await loader()
            moveModuleLoad.ready()
            return component
          })()
          moveModuleLoad.pending = pending
          return pending
        })
        components.set(moveModuleLoad.generation, Component)
      }
      return <Component {...props} />
    }
  } }
})

vi.mock('@orbit/shared/hooks/move-parent-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@orbit/shared/hooks/move-parent-core')>()
  moveControllerOwner.loaded()
  return { ...actual, createMoveParentState: () => {
    moveControllerOwner.initialize()
    return actual.createMoveParentState()
  } }
})

let moveInventoryFetch: ((url: string) => Promise<unknown>) | null = null

const skipFlow = vi.hoisted(() => ({
  active: false,
  retryRead: false,
  scheduleItems: null as HabitScheduleItem[] | null,
  items: [] as HabitScheduleItem[],
  original: [] as HabitScheduleItem[],
  mutate: vi.fn(),
}))

vi.mock('@/lib/server-fetch', () => ({ serverAuthMutate: skipFlow.mutate }))
vi.mock('@/lib/api-fetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-fetch')>()
  return {
    ...actual,
    fetchJson: async (...args: Parameters<typeof actual.fetchJson>) => moveInventoryFetch ? moveInventoryFetch(String(args[0])) : skipFlow.retryRead
      ? actual.fetchJson(...args)
      : ({ items: String(args[0]).includes('dateFrom=') && skipFlow.scheduleItems ? skipFlow.scheduleItems : skipFlow.items, totalCount: skipFlow.items.length, totalPages: 1, page: 1, pageSize: 200 }),
  }
})

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
  useProfile: () => ({ profile: { timeZone: accountDate.timeZone, hasProAccess: accountDate.hasProAccess } }),
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
let moveInventoryStreams: { scheduled: ReturnType<typeof normalizeHabitQueryData>; general: ReturnType<typeof normalizeHabitQueryData> } | null = null

let moveInventoryStatus = { scheduled: 'ready', general: 'ready' }

function moveQueryResult(filters: import('@orbit/shared/types/habit').HabitsFilter) {
  const inventory = moveInventoryStreams && (Object.keys(filters).length === 0 || (Object.keys(filters).length === 1 && filters.isGeneral === true))
    ? (filters.isGeneral ? moveInventoryStreams.general : moveInventoryStreams.scheduled) : mockHabitsData
  const state = moveInventoryStreams && inventory !== mockHabitsData ? moveInventoryStatus[filters.isGeneral ? 'general' : 'scheduled'] : 'ready'
  return {
    data: inventory, isSuccess: state === 'ready', isFetching: state === 'loading', isError: state === 'error',
    getChildren: (parentId: string) => (inventory.childrenByParent.get(parentId) ?? [])
      .map((id) => inventory.habitsById.get(id)!),
  }
}

const logHabitMutateAsync = vi.fn()
const reorderHabitsMutate = vi.fn()

const habitListRefetch = vi.fn()
const skipHabitMutateAsync = vi.fn()
const deleteHabitMutateAsync = vi.fn()
const duplicateHabitMutateAsync = vi.fn()
const moveHabitParentMutateAsync = vi.fn()
const toggleSelectionSpy = vi.fn()
const drillRefreshCurrent = vi.fn()
const drillInto = vi.fn()
const routerPush = vi.fn()
const getDrillChildrenMock = vi.fn<(id: string) => NormalizedHabit[]>(() => [])
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
    if (dragLocale.english) return createTranslator({ locale: 'en', messages })
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
    ...moveQueryResult(args[0]),
    isLoading: false,
    error: null,
    dataUpdatedAt: mockHabitsDataUpdatedAt,
    refetch: habitListRefetch,

  }),
  useLogHabit: () => ({ mutateAsync: logHabitMutateAsync, mutate: vi.fn(), isPending: false }),
  useSkipHabit: () => skipFlow.active ? actual.useSkipHabit() : ({ mutateAsync: skipHabitMutateAsync, isPending: false }),
  useDeleteHabit: () => ({ mutateAsync: deleteHabitMutateAsync, isPending: false }),
  useDuplicateHabit: () => ({ mutateAsync: duplicateHabitMutateAsync, isPending: false }),
  useReorderHabits: () => ({ mutate: reorderHabitsMutate, isPending: false }),
  useMoveHabitParent: () => ({ mutateAsync: moveHabitParentMutateAsync, isPending: false }),
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
  useUIStore: Object.assign(() => null, { getState: () => ({ setFilters: setFrequencyFilters }) }),
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
      onMoveParent?: () => void
      onReschedule?: () => void
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
      data-has-reschedule={actions?.onReschedule ? 'yes' : 'no'}
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
      <button data-testid={`move-${habit.id}`} onClick={actions?.onMoveParent}>Move</button>
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
      return dragLocale.portuguese || dragLocale.english ? registered : []
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
import { SelectionTray } from '@/components/habits/selection-tray'
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
  beforeEach(() => {
    moveModuleLoad.generation++
    moveModuleLoad.hold = null
    moveModuleLoad.pending = null
    moveInventoryStatus = { scheduled: 'ready', general: 'ready' }
    moveInventoryStreams = null
    moveInventoryFetch = null
    dragLocale.portuguese = false
    dragLocale.english = false
    skipFlow.active = false
    skipFlow.retryRead = false
    skipFlow.scheduleItems = null
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

  it('initializes the Move controller only after the owning row opens it', async () => {
    Object.assign(mockHabitsData, normalizeHabitQueryData(['source', 'target'].map((id) => createMockHabitScheduleItem({ id, title: id }))))
    renderWithProviders(<HabitList filters={{ dateFrom: TODAY }} />)
    expect(moveControllerOwner.initialize).not.toHaveBeenCalled()
    expect(moveControllerOwner.loaded).not.toHaveBeenCalled()
    expect(moveModuleLoad.requested).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('move-source'))
    expect(await screen.findByRole('radio', { name: /^target/ })).toBeInTheDocument()
    expect(moveControllerOwner.initialize).toHaveBeenCalled()
    expect(moveControllerOwner.loaded).toHaveBeenCalledOnce()
    expect(moveModuleLoad.ready).toHaveBeenCalledOnce()
    expect(moveHabitParentMutateAsync).not.toHaveBeenCalled()
  })

  it.each(['close', 'account', 'unmount'] as const)('discards late Move work after %s', async (boundary) => {
    skipFlow.active = true
    const fixture = createMoveInventoryFixture(TODAY)
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => { release = resolve })
    moveInventoryFetch = async (url) => {
      if (url.includes('page=2')) await held
      return fixture.response(url)
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const rendered = render(<QueryClientProvider client={client}><HabitList filters={{ dateFrom: TODAY }} /></QueryClientProvider>)
    fireEvent.click(await screen.findByTestId('move-source'))
    expect(await screen.findByRole('progressbar', { name: 'common.loading' })).toBeInTheDocument()
    if (boundary === 'close') fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    else if (boundary === 'account') await act(async () => { advanceAccountGeneration(); await resetAccountQueries(client, 'signed-out') })
    else rendered.unmount()
    await act(async () => { release(); await held })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(moveHabitParentMutateAsync).not.toHaveBeenCalled()
    rendered.unmount()
    client.clear()
  })

  it('keeps General sources captured across filters and recovers missing or stale inventory', async () => {
    const source = createMockHabitScheduleItem({ id: 'source', title: 'source', isGeneral: true })
    Object.assign(mockHabitsData, normalizeHabitQueryData([source]))
    moveInventoryStreams = { scheduled: normalizeHabitQueryData([createMockHabitScheduleItem({ id: 'scheduled', title: 'Scheduled target' })]),
      general: normalizeHabitQueryData([source, createMockHabitScheduleItem({ id: 'general-target', title: 'General target', isGeneral: true })]) }
    const onBulkMove = vi.fn().mockResolvedValue({ results: [{ index: 0, habitId: 'source', status: 'Success' }] })
    const ref = React.createRef<HabitListHandle>()
    const list = () => <HabitList ref={ref} filters={{ dateFrom: TODAY, search: 'source' }} isSelectMode selectedHabitIds={new Set(['source'])} onBulkMove={onBulkMove} />
    const rendered = renderWithProviders(list())
    moveInventoryStatus.general = 'error'
    act(() => ref.current!.openBulkMove())
    expect(await screen.findByText('errors.fetchHabits')).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByText('habits.moveParent.noDestinations')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(habitListRefetch).toHaveBeenCalledTimes(2)
    moveInventoryStatus.general = 'ready'
    rendered.rerenderWithProviders(list())
    const target = screen.getByRole('radio', { name: /^General target/ })
    expect(target).not.toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('radio', { name: /^Scheduled target/ })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(target)
    moveInventoryStreams.general = normalizeHabitQueryData([source])
    rendered.rerenderWithProviders(list())
    expect(screen.getByRole('button', { name: 'habits.moveParent.confirm' })).toBeDisabled()
    expect(screen.getByText('errors.fetchHabits')).toBeInTheDocument()
    moveInventoryStreams.general = normalizeHabitQueryData([])
    rendered.rerenderWithProviders(list())
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    moveInventoryStreams.general = normalizeHabitQueryData([source, createMockHabitScheduleItem({ id: 'general-target', title: 'General target', isGeneral: true })])
    Object.assign(mockHabitsData, normalizeHabitQueryData([createMockHabitScheduleItem({ id: 'other-visible' })]))
    rendered.rerenderWithProviders(<HabitList ref={ref} view="general" filters={{ isGeneral: true, isCompleted: true, page: 4 }}
      isSelectMode selectedHabitIds={new Set(['other-visible'])} onBulkMove={onBulkMove} />)
    expect(screen.getByRole('radio', { name: /^General target/ })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'habits.moveParent.confirm' }))
    await waitFor(() => expect(onBulkMove).toHaveBeenCalledExactlyOnceWith(['source'], 'general-target'))
  })

  it.each(['source', 'nested-source'])('waits for both complete streams and searches the actual paginated picker for %s', async (sourceId) => {
    skipFlow.active = true
    const fixture = createMoveInventoryFixture(TODAY)
    const requests: string[] = []
    let releaseScheduled: () => void = () => {}
    let releaseGeneral: () => void = () => {}
    const heldScheduled = new Promise<void>((resolve) => { releaseScheduled = resolve })
    const heldGeneral = new Promise<void>((resolve) => { releaseGeneral = resolve })
    moveInventoryFetch = async (url) => {
      requests.push(url)
      if (url.includes('page=2')) await (url.includes('isGeneral=true') ? heldGeneral : heldScheduled)
      const response = fixture.response(url)
      return url.includes('dateFrom=') && sourceId === 'nested-source'
        ? { ...response, items: [createMockHabitScheduleItem({ id: sourceId, title: sourceId })] } : response
    }
    renderWithProviders(<HabitList filters={{ dateFrom: TODAY, dateTo: TODAY, search: 'source', isCompleted: false, frequencyUnit: 'Day', tagIds: ['tag'] }} />)
    fireEvent.click(await screen.findByTestId(`move-${sourceId}`))
    await waitFor(() => expect(requests).toHaveLength(5))
    expect(screen.getByRole('progressbar', { name: 'common.loading' })).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByText('habits.moveParent.noDestinations')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'habits.moveParent.confirm' })).toBeDisabled()
    await act(async () => { releaseScheduled(); await heldScheduled })
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    await act(async () => { releaseGeneral(); await heldGeneral })
    await screen.findByRole('radio', { name: /^Future page two/ })
    const renderedIds = [null, ...Array.from(document.querySelectorAll<HTMLElement>('[data-move-parent-id]'), (row) => row.dataset.moveParentId)]
    expect(new Set(renderedIds)).toEqual(new Set(fixture.optionIds))
    expect(screen.getAllByRole('radio')).toHaveLength(fixture.optionIds.length)
    for (const name of ['Past destination', 'Future page two', 'Finished container', 'Completed recurring', 'Ação futura'])
      expect(screen.getByRole('radio', { name: new RegExp('^' + name) })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /^Finished 1/ })).not.toBeInTheDocument()
    for (const name of sourceId === 'source' ? ['hidden-descendant', 'deep-3', 'General two'] : ['General two'])
      expect(screen.getByRole('radio', { name: new RegExp('^' + name) })).toHaveAttribute('aria-disabled', 'true')
    if (sourceId === 'nested-source') {
      expect(screen.getByRole('radio', { name: /^current-parent/ })).toHaveAttribute('aria-disabled', 'true')
      expect(screen.getByRole('radio', { name: /^current-parent/ })).toHaveAccessibleName(/habits.moveParent.currentParent/)
    }
    const search = screen.getByRole('textbox', { name: 'habits.moveParent.searchPlaceholder' })
    fireEvent.change(search, { target: { value: 'ACAO FUTURA' } })
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /^General two/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^Ação futura/ })).toBeInTheDocument()
    fireEvent.change(search, { target: { value: '' } })
    expect(screen.getAllByRole('radio')).toHaveLength(fixture.optionIds.length)
    expect(requests.filter((url) => !url.includes('dateFrom='))).toEqual(expect.arrayContaining([
      '/api/habits?pageSize=200', '/api/habits?page=2&pageSize=200',
      '/api/habits?isGeneral=true&pageSize=200', '/api/habits?isGeneral=true&page=2&pageSize=200',
    ]))
    expect(requests.filter((url) => !url.includes('dateFrom='))).toHaveLength(4)
    expect(screen.queryByTestId('habit-card-future')).not.toBeInTheDocument()
  })

  it.each(['single', 'bulk'] as const)('offers complete account destinations through the actual %s picker', async (entry) => {
    const visible = [createMockHabitScheduleItem({ id: 'source', title: 'source' })]
    Object.assign(mockHabitsData, normalizeHabitQueryData(visible))
    const scheduled = [
      createMockHabitScheduleItem({ ...visible[0], children: [createMockHabitScheduleChild({ id: 'hidden-descendant', title: 'Hidden descendant' })] }),
      createMockHabitScheduleItem({ id: 'past', title: 'Past destination', dueDate: YESTERDAY, scheduledDates: [] }),
      createMockHabitScheduleItem({ id: 'future', title: 'Future page two', dueDate: TOMORROW, scheduledDates: [] }),
    ].map((item) => habitScheduleItemSchema.parse(item))
    moveInventoryStreams = { scheduled: normalizeHabitQueryData(scheduled), general: normalizeHabitQueryData([
      habitScheduleItemSchema.parse(createMockHabitScheduleItem({ id: 'general', title: 'General destination', isGeneral: true })),
    ]) }
    const onBulkMove = vi.fn().mockResolvedValue({ results: [{ index: 0, habitId: 'source', status: 'Success' }] })
    const ref = React.createRef<HabitListHandle>()
    renderWithProviders(<HabitList ref={ref} filters={{ dateFrom: TODAY, dateTo: TODAY, search: 'source', tagIds: ['tag'], frequencyUnit: 'Day', isCompleted: false }}
      isSelectMode={entry === 'bulk'} selectedHabitIds={new Set(['source'])} onBulkMove={onBulkMove} />)
    if (entry === 'bulk') act(() => ref.current!.openBulkMove())
    else fireEvent.click(screen.getByTestId('move-source'))
    const past = await screen.findByRole('radio', { name: /^Past destination/ })
    const future = screen.getByRole('radio', { name: /^Future page two/ })
    expect(past).not.toHaveAttribute('aria-disabled', 'true')
    expect(future).not.toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('radio', { name: /^Hidden descendant/ })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('radio', { name: /^General destination/ })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(past)
    expect(past).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(future)
    fireEvent.click(screen.getByRole('button', { name: 'habits.moveParent.confirm' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    if (entry === 'bulk') expect(onBulkMove).toHaveBeenCalledExactlyOnceWith(['source'], 'future')
    else expect(moveHabitParentMutateAsync).toHaveBeenCalledExactlyOnceWith({ habitId: 'source', data: { parentId: 'future' } })
  })

  it.each([100, 101])('enforces the bulk move boundary for %s selected ids', async (count) => {
    dragLocale.english = true
    const ids = Array.from({ length: count }, (_, index) => `habit-${index}`)
    Object.assign(mockHabitsData, normalizeHabitQueryData([...ids, 'target'].map((id) => createMockHabitScheduleItem({ id, title: id }))))
    const onBulkMove = vi.fn().mockResolvedValue({ results: ids.map((habitId, index) => ({ index, habitId, status: 'Success' })) })
    const ref = React.createRef<HabitListHandle>()
    renderWithProviders(<>
      <SelectionTray selectedCount={count} allSelected onSelectAll={vi.fn()} onDeselectAll={vi.fn()}
        onBulkLog={vi.fn()} onBulkSkip={vi.fn()} onBulkMove={() => ref.current?.openBulkMove()}
        onBulkDelete={vi.fn()} onCancel={vi.fn()} />
      <HabitList ref={ref} filters={{}} isSelectMode selectedHabitIds={new Set(ids)} onBulkMove={onBulkMove} />
    </>)
    const move = screen.getByRole('button', { name: 'Move selected' })
    await act(async () => {
      fireEvent.click(move)
      await moveModuleLoad.pending
    })
    if (count === 101) {
      expect.soft(move).toHaveAttribute('aria-disabled', 'true')
      expect.soft(screen.queryByText('Select up to 100 habits to move at once.')).toBeInTheDocument()
      act(() => ref.current!.openBulkMove())
      expect.soft(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(onBulkMove).not.toHaveBeenCalled()
      return
    }
    expect(move).not.toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByRole('radio', { name: /^target/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onBulkMove).toHaveBeenCalledExactlyOnceWith(ids, 'target')
  })

  it('still moves one habit from its row menu and closes through the picker', async () => {
    Object.assign(mockHabitsData, normalizeHabitQueryData(['source', 'target'].map((id) => createMockHabitScheduleItem({ id, title: id }))))
    moveHabitParentMutateAsync.mockResolvedValue(undefined)
    renderWithProviders(<HabitList filters={{}} />)
    fireEvent.click(screen.getByTestId('move-source'))
    const target = await screen.findByRole('radio', { name: /^target/ })
    expect(screen.getByRole('radio', { name: /^source/ })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(target)
    fireEvent.click(screen.getByRole('button', { name: 'habits.moveParent.confirm' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(moveHabitParentMutateAsync).toHaveBeenCalledExactlyOnceWith({ habitId: 'source', data: { parentId: 'target' } })
  })

  it('keeps a bulk move open with its destination and retries only the failed habit', async () => {
    const child = createMockHabitScheduleChild({ id: 'b', title: 'b' })
    const items = ['a', 'c', 'target'].map((id) => createMockHabitScheduleItem({ id, title: id === 'target' ? 'Destination' : id, children: id === 'a' ? [child] : [] }))
    Object.assign(mockHabitsData, normalizeHabitQueryData(items))
    const onBulkMove = vi.fn()
      .mockResolvedValueOnce({ results: ['a', 'b', 'c'].map((habitId, index) => ({
        index, habitId, status: habitId === 'b' ? 'Failed' : 'Success', error: habitId === 'b' ? 'Move refused by server' : null,
      })) })
      .mockResolvedValueOnce({ results: [{ index: 0, habitId: 'b', status: 'Success' }] })
    const ref = React.createRef<HabitListHandle>()
    renderWithProviders(<HabitList ref={ref} filters={{}} isSelectMode selectedHabitIds={new Set(['a', 'b', 'c'])} onBulkMove={onBulkMove} />)
    act(() => ref.current!.openBulkMove())
    const target = await screen.findByRole('radio', { name: /Destination/ })
    expect(screen.queryByText('habits.moveParent.currentParent')).not.toBeInTheDocument()
    fireEvent.click(target)
    fireEvent.click(screen.getByRole('button', { name: /^habits.moveParent.confirm/ }))
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('status').textContent).toBe('habits.moveParent.errorPartial'))
    expect(onBulkMove).toHaveBeenNthCalledWith(1, ['a', 'b', 'c'], 'target')
    expect(screen.getByRole('radio', { name: /Destination/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^habits.moveParent.confirm/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onBulkMove).toHaveBeenNthCalledWith(2, ['b'], 'target')
  })

  it.each(['ready', 'error'] as const)('preserves the active Move operation across list loading and %s', async (outcome) => {
    skipFlow.active = true
    const fixture = createMoveInventoryFixture(TODAY)
    let releaseList = () => {}
    let heldList = new Promise<void>((resolve) => { releaseList = resolve })
    const changedRequests = vi.fn()
    moveInventoryFetch = async (url) => {
      if (url.includes('dateFrom=') && !url.includes(`dateFrom=${TODAY}`)) {
        changedRequests()
        await heldList
        if (outcome === 'error') throw new Error('List unavailable')
      }
      return fixture.response(url)
    }
    let releaseMove = (_result: import('@orbit/shared/types/habit').BulkMoveHabitParentResult) => {}
    const heldMove = new Promise<import('@orbit/shared/types/habit').BulkMoveHabitParentResult>((resolve) => { releaseMove = resolve })
    const onBulkMove = vi.fn().mockReturnValueOnce(heldMove)
      .mockResolvedValueOnce({ results: [{ index: 0, habitId: 'past', status: 'Success' }] })
    const ref = React.createRef<HabitListHandle>()
    const list = (date: string) => <HabitList ref={ref} filters={{ dateFrom: date }} isSelectMode
      selectedHabitIds={new Set(['source', 'past'])} onBulkMove={onBulkMove} />
    const rendered = renderWithProviders(list(TODAY))
    await screen.findByTestId('move-source')
    act(() => ref.current!.openBulkMove())
    const target = await screen.findByRole('radio', { name: /^Future page two/ })
    const search = screen.getByRole('textbox', { name: 'habits.moveParent.searchPlaceholder' })
    fireEvent.change(search, { target: { value: 'Future page' } })
    fireEvent.click(target)
    fireEvent.click(screen.getByRole('button', { name: 'habits.moveParent.confirm' }))
    expect(onBulkMove).toHaveBeenCalledExactlyOnceWith(['source', 'past'], 'future')
    rendered.rerenderWithProviders(list(TOMORROW))
    await waitFor(() => expect(changedRequests).toHaveBeenCalledOnce())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^Future page two/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('textbox', { name: 'habits.moveParent.searchPlaceholder' })).toHaveValue('Future page')
    expect(screen.getByRole('button', { name: 'habits.moveParent.confirm' })).toBeDisabled()
    await act(async () => { releaseList(); await heldList })
    if (outcome === 'error') await screen.findByText('habits.loadError')
    else await screen.findByTestId('move-source')
    fireEvent.click(screen.getByRole('button', { name: 'habits.moveParent.confirm' }))
    expect(onBulkMove).toHaveBeenCalledOnce()
    expect(moveControllerOwner.initialize).toHaveBeenCalledOnce()
    await act(async () => { releaseMove({ results: [
      { index: 0, habitId: 'source', status: 'Success' },
      { index: 1, habitId: 'past', status: 'Failed', error: 'Move refused by server' },
    ] }); await heldMove })
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent('habits.moveParent.errorPartial'))
    changedRequests.mockClear()
    heldList = new Promise<void>((resolve) => { releaseList = resolve })
    rendered.rerenderWithProviders(list(YESTERDAY))
    await waitFor(() => expect(changedRequests).toHaveBeenCalledOnce())
    expect(screen.getByRole('radio', { name: /^Future page two/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('textbox', { name: 'habits.moveParent.searchPlaceholder' })).toHaveValue('Future page')
    expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent('habits.moveParent.errorPartial')
    await act(async () => { releaseList(); await heldList })
    fireEvent.click(screen.getByRole('button', { name: 'habits.moveParent.confirm' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onBulkMove).toHaveBeenNthCalledWith(2, ['past'], 'future')
    expect(moveControllerOwner.initialize).toHaveBeenCalledOnce()
  })

  it.each(['single', 'bulk'] as const)('captures the %s source before a delayed Move import and a changed view', async (entry) => {
    const items = ['source', 'replacement', 'target'].map((id) => createMockHabitScheduleItem({ id, title: id }))
    Object.assign(mockHabitsData, normalizeHabitQueryData(items.slice(0, 1)))
    moveInventoryStreams = { scheduled: normalizeHabitQueryData(items), general: normalizeHabitQueryData([]) }
    let release = () => {}
    moveModuleLoad.hold = new Promise<void>((resolve) => { release = resolve })
    const onBulkMove = vi.fn(() => new Promise<import('@orbit/shared/types/habit').BulkMoveHabitParentResult>(() => {}))
    moveHabitParentMutateAsync.mockImplementation(() => new Promise<void>(() => {}))
    const ref = React.createRef<HabitListHandle>()
    const rendered = renderWithProviders(<HabitList ref={ref} filters={{ dateFrom: TODAY }}
      isSelectMode={entry === 'bulk'} selectedHabitIds={new Set(['source'])} onBulkMove={onBulkMove} />)
    expect(moveModuleLoad.requested).not.toHaveBeenCalled()
    if (entry === 'bulk') act(() => ref.current!.openBulkMove())
    else fireEvent.click(screen.getByTestId('move-source'))
    expect(moveModuleLoad.requested).toHaveBeenCalledOnce()
    expect(moveControllerOwner.initialize).not.toHaveBeenCalled()
    Object.assign(mockHabitsData, normalizeHabitQueryData(items.slice(1, 2)))
    rendered.rerenderWithProviders(<HabitList ref={ref} view="all" selectedDate={new Date(TOMORROW)}
      filters={{ search: 'replacement', tagIds: ['other'], page: 4 }} isSelectMode
      selectedHabitIds={new Set(['replacement'])} onBulkMove={onBulkMove} />)
    await act(async () => { release() })
    fireEvent.click(await screen.findByRole('radio', { name: /^target/ }))
    fireEvent.click(screen.getByRole('button', { name: 'habits.moveParent.confirm' }))
    if (entry === 'bulk') expect(onBulkMove).toHaveBeenCalledExactlyOnceWith(['source'], 'target')
    else expect(moveHabitParentMutateAsync).toHaveBeenCalledExactlyOnceWith({ habitId: 'source', data: { parentId: 'target' } })
    rendered.unmount()
  })

  it.each(['close', 'account', 'unmount'] as const)('cancels the delayed Move import lifetime after %s', async (boundary) => {
    Object.assign(mockHabitsData, normalizeHabitQueryData(['source', 'target'].map((id) => createMockHabitScheduleItem({ id, title: id }))))
    let release = () => {}
    moveModuleLoad.hold = new Promise<void>((resolve) => { release = resolve })
    const onSurfaceOpenChange = vi.fn()
    const rendered = renderWithProviders(<HabitList filters={{ dateFrom: TODAY }} onSurfaceOpenChange={onSurfaceOpenChange} />)
    fireEvent.click(screen.getByTestId('move-source'))
    expect(moveModuleLoad.requested).toHaveBeenCalledOnce()
    if (boundary === 'close') fireEvent.keyDown(window, { key: 'Escape' })
    else if (boundary === 'account') act(() => { advanceAccountGeneration() })
    else rendered.unmount()
    if (boundary !== 'unmount') expect(onSurfaceOpenChange).toHaveBeenLastCalledWith(false)
    await act(async () => { release() })
    await waitFor(() => expect(moveModuleLoad.ready).toHaveBeenCalledOnce())
    expect(moveControllerOwner.initialize).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(moveHabitParentMutateAsync).not.toHaveBeenCalled()
    rendered.unmount()
  })

  it('keeps a reopened Move intent when the canceled import completes', async () => {
    Object.assign(mockHabitsData, normalizeHabitQueryData(['source', 'replacement', 'target'].map((id) => createMockHabitScheduleItem({ id, title: id }))))
    let release = () => {}
    moveModuleLoad.hold = new Promise<void>((resolve) => { release = resolve })
    moveHabitParentMutateAsync.mockImplementation(() => new Promise<void>(() => {}))
    renderWithProviders(<HabitList filters={{ dateFrom: TODAY }} />)
    fireEvent.click(screen.getByTestId('move-source'))
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByTestId('move-replacement'))
    await act(async () => { release() })
    fireEvent.click(await screen.findByRole('radio', { name: /^target/ }))
    fireEvent.click(screen.getByRole('button', { name: 'habits.moveParent.confirm' }))
    expect(moveHabitParentMutateAsync).toHaveBeenCalledExactlyOnceWith({ habitId: 'replacement', data: { parentId: 'target' } })
  })

  it.each(['single', 'bulk'] as const)('rejects late %s completion after replacing the account and opening another Move', async (entry) => {
    Object.assign(mockHabitsData, normalizeHabitQueryData(['source', 'replacement', 'target'].map((id) => createMockHabitScheduleItem({ id, title: id }))))
    let rejectOld = (_error: Error) => {}
    const pending = new Promise<never>((_resolve, reject) => { rejectOld = reject })
    moveHabitParentMutateAsync.mockReturnValue(pending)
    const onBulkMove = vi.fn(() => pending)
    const ref = React.createRef<HabitListHandle>()
    const rendered = renderWithProviders(<HabitList ref={ref} filters={{}} selectedHabitIds={new Set(['source'])} onBulkMove={onBulkMove} />)
    if (entry === 'bulk') act(() => ref.current!.openBulkMove())
    else fireEvent.click(screen.getByTestId('move-source'))
    fireEvent.click(await screen.findByRole('radio', { name: /^target/ }))
    fireEvent.click(screen.getByRole('button', { name: 'habits.moveParent.confirm' }))
    expect(entry === 'bulk' ? onBulkMove : moveHabitParentMutateAsync).toHaveBeenCalledOnce()
    act(() => { advanceAccountGeneration() })
    rendered.rerenderWithProviders(<HabitList ref={ref} filters={{}} selectedHabitIds={new Set(['replacement'])} onBulkMove={onBulkMove} />)
    if (entry === 'bulk') act(() => ref.current!.openBulkMove())
    else fireEvent.click(screen.getByTestId('move-replacement'))
    const target = await screen.findByRole('radio', { name: /^target/ })
    fireEvent.click(target)
    await act(async () => { rejectOld(new Error('old account request failed')); await pending.catch(() => {}) })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(target).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'habits.moveParent.confirm' })).toBeEnabled()
    expect(within(screen.getByRole('dialog')).getByRole('status')).toBeEmptyDOMElement()
    expect(entry === 'bulk' ? onBulkMove : moveHabitParentMutateAsync).toHaveBeenCalledOnce()
  })

  it.each(['today', 'all', 'general'] as const)('offers search recovery instead of first run in %s', (view) => {
    dragLocale.english = true
    const clearSearch = vi.fn()
    renderWithProviders(<HabitList view={view} filters={{}} searchQuery="missing routine" onClearSearch={clearSearch} />)
    expect(screen.getByText('Nothing found for', { exact: false })).toHaveTextContent('missing routine')
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(clearSearch).toHaveBeenCalledOnce()
    expect(screen.queryByText('No habits yet')).not.toBeInTheDocument()
  })

  it('loads producer-shaped Todos rows with overdue logging and rescheduling available', async () => {
    skipFlow.active = true
    skipFlow.items = createHabitViewItems(TODAY, 'all')
    skipFlow.scheduleItems = createHabitViewScheduleItems(TODAY)
    useActualHabitVisibility = true
    renderWithProviders(<HabitList view="all" filters={{}} />)
    const overdue = await screen.findByTestId('habit-card-overdue')
    expect(overdue).toHaveAttribute('data-state', 'overdue')
    expect(overdue).toHaveAttribute('data-can-log', 'yes')
    expect(overdue).toHaveAttribute('data-has-reschedule', 'yes')
    expect(screen.getByTestId('habit-card-future')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByTestId('log-overdue')) })
    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: 'overdue', intent: 'log' })
  })

  it.each(['future', 'future-child'])('withholds current-day Skip from the future recurring Todos row %s', async (id) => {
    useActualHabitVisibility = true
    Object.assign(mockHabitsData, createHabitViewFixture(TODAY, 'all'))
    renderWithProviders(<HabitList view="all" filters={{}} />)
    expect(screen.getByTestId(`habit-card-${id}`)).toHaveAttribute('data-can-log', 'no')
    expect(screen.getByTestId(`habit-card-${id}`)).toHaveAttribute('data-has-skip', 'no')
    await act(async () => { fireEvent.click(screen.getByTestId(`skip-${id}`)) })
    expect(skipHabitMutateAsync).not.toHaveBeenCalled()
  })

  it.each(['parent', 'today-child', 'overdue', 'one-time'])('keeps current-day Skip or postponement available for the Todos row %s', async (id) => {
    useActualHabitVisibility = true
    Object.assign(mockHabitsData, createHabitViewFixture(TODAY, 'all'))
    const oneTime = createMockHabit({ id: 'one-time', frequencyUnit: null, dueDate: TOMORROW, scheduledDates: [] })
    mockHabitsData.habitsById.set(oneTime.id, oneTime)
    mockHabitsData.topLevelHabits.push(oneTime)
    renderWithProviders(<HabitList view="all" filters={{}} />)
    expect(screen.getByTestId(`habit-card-${id}`)).toHaveAttribute('data-has-skip', 'yes')
    await act(async () => { fireEvent.click(screen.getByTestId(`skip-${id}`)) })
    expect(skipHabitMutateAsync).toHaveBeenCalledWith({ habitId: id, date: TODAY, onUndo: expect.any(Function) })
  })

  it.each(['all', 'general'] as const)('retains row actions and selection in %s', async (view) => {
    useActualHabitVisibility = true
    Object.assign(mockHabitsData, createHabitViewFixture(TODAY, view))
    const id = view === 'all' ? 'overdue' : 'general'
    const select = vi.fn()
    renderWithProviders(<HabitList view={view} filters={{}} selectedDate={new Date('2000-01-01T12:00:00')} showCompleted isSelectMode onToggleSelection={select} />)
    await act(async () => { fireEvent.click(screen.getByTestId(`log-${id}`)) })
    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: id, intent: 'log' })
    await act(async () => { fireEvent.click(screen.getByTestId(`unlog-${id}`)) })
    expect(logHabitMutateAsync).toHaveBeenCalledWith({ habitId: id, intent: 'unlog' })
    fireEvent.click(screen.getByTestId(`select-${id}`))
    expect(select).toHaveBeenCalledWith(id)
    fireEvent.click(screen.getByTestId(`detail-${id}`))
    expect(routerPush).toHaveBeenCalledWith(`/habits/${id}?date=${TODAY}&from=today`)
    fireEvent.click(screen.getByTestId(`edit-${id}`))
    expect(await screen.findByTestId('edit-habit-modal-title')).toHaveTextContent(view === 'all' ? 'Overdue' : 'Any day')
    fireEvent.click(screen.getByTestId(`duplicate-${id}`))
    await confirmVisibleSheet('habits.duplicateConfirmTitle', 'habits.duplicateConfirm')
    expect(duplicateHabitMutateAsync).toHaveBeenCalledWith(id)
    if (view === 'all') {
      await act(async () => { fireEvent.click(screen.getByTestId(`skip-${id}`)) })
      expect(skipHabitMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ habitId: id }))
    }
    fireEvent.click(screen.getByTestId(`add-sub-${id}`))
    expect(await screen.findByRole('dialog', { name: 'Create habit' })).toBeInTheDocument()
    fireEvent.click(screen.getByTestId(`delete-${id}`))
    await confirmVisibleSheet('habits.deleteConfirmTitle', 'habits.deleteHabit')
    expect(deleteHabitMutateAsync).toHaveBeenCalledWith(id)
  })

  it.each(['today', 'all', 'general'] as const)('restores production membership and nesting in %s', (view) => {
    useActualHabitVisibility = true
    Object.assign(mockHabitsData, createHabitViewFixture(TODAY, view))
    render(<HabitList view={view} filters={view === 'general' ? { isGeneral: true } : {}} selectedDate={new Date(`${TODAY}T00:00:00`)} />)
    expect(screen.getAllByTestId(/^habit-card-/).map((row) => row.getAttribute('data-testid')?.replace('habit-card-', ''))).toEqual(HABIT_VIEW_ROW_ORDER[view])
  })

  it.each(['all', 'general'] as const)('skips offscreen family rendering in a large %s list while keeping keyboard access', async (view) => {
    useActualHabitVisibility = true
    rowImplementation.actual = true
    dragLocale.english = true
    const items = Array.from({ length: 40 }, (_, index) => createMockHabitScheduleItem({
      id: `root-${index}`, title: `Routine ${index}`, position: index, dueDate: TODAY,
      scheduledDates: [TODAY], isGeneral: view === 'general', hasSubHabits: index === 0,
      children: index === 0 ? ['first-child', 'second-child'].map((id) => createMockHabitScheduleChild({ id, title: id, dueDate: TODAY, scheduledDates: [TODAY], isGeneral: view === 'general' })) : [],
    }))
    Object.assign(mockHabitsData, normalizeHabitQueryData(items))
    const { container } = renderWithProviders(<HabitList view={view} filters={view === 'general' ? { isGeneral: true } : {}} />)
    const cssPath = resolve('app/globals.css')
    const stylesheet = await postcss([tailwind()]).process(readFileSync(cssPath, 'utf8'), { from: cssPath })
    const launch = launchChrome()
    try {
      const browser = await launch
      const page = await browser.newPage({ viewport: { width: 412, height: 600 } })
      await page.setContent(`<style>${stylesheet.css}</style>${container.innerHTML}`)
      await page.evaluate(() => new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))))
      expect(await page.locator('.habit-panel').count()).toBe(40)
      expect(await page.locator('.habit-panel').first().getByTestId('habit-row').count()).toBe(3)
      const lastTitle = page.locator('[data-habit-title="Routine 39"] [data-habit-row-body]')
      const lastRow = page.locator('[data-habit-title="Routine 39"]')
      expect(await lastRow.evaluate((element) => element.checkVisibility({ contentVisibilityAuto: true }))).toBe(false)
      await lastTitle.focus()
      expect(await lastRow.evaluate((element) => element.checkVisibility({ contentVisibilityAuto: true }))).toBe(true)
      expect(await lastTitle.evaluate((element) => element === document.activeElement)).toBe(true)
    } finally { await closeChrome(launch) }
  }, 45_000)

  it.each([
    { code: 'RATE_LIMITED', status: 429, failures: 1, retryAfter: '60', deadline: 60_000 },
    { code: 'UPSTREAM_STARTING', status: 503, failures: 2, retryAfter: '5', deadline: 15_000 },
  ])('keeps the Hoje habit list loading through $code then renders the list', async ({ code, status, failures, retryAfter, deadline }) => {
    vi.useFakeTimers()
    skipFlow.active = true
    skipFlow.retryRead = true
    const client = createQueryClient()
    const habit = createMockHabitScheduleItem({ id: 'recovered', title: 'Recovered habit', scheduledDates: [TODAY] })
    let requests = 0
    const fetchMock = vi.fn(async () => ++requests <= failures
      ? Response.json({ error: 'Unavailable', errorCode: code }, { status, headers: { 'Retry-After': retryAfter } })
      : Response.json({ items: [habit], totalCount: 1, totalPages: 1, page: 1, pageSize: 200 }))
    vi.stubGlobal('fetch', (_input: RequestInfo | URL, init?: RequestInit) => init?.mode === 'no-cors' ? Promise.resolve(new Response(null)) : fetchMock())
    useThrottleStore.getState().clear()
    const rendered = render(<QueryClientProvider client={client}><HabitList view="today" filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }} /></QueryClientProvider>)
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(deadline - 1) })
      expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0)
      expect(screen.queryByText('habits.loadError')).toBeNull()
      expect(useThrottleStore.getState().error).toBeNull()
      expect(useAppToastStore.getState().currentToast).toBeNull()
      expect(fetchMock).toHaveBeenCalledTimes(failures)
      await act(async () => { await vi.advanceTimersByTimeAsync(2) })
      expect(screen.getByText(personalText('Recovered habit'))).toBeInTheDocument()
      expect(screen.queryByText('habits.loadError')).toBeNull()
    } finally {
      rendered.unmount()
      client.clear()
      vi.unstubAllGlobals()
      vi.useRealTimers()
    }
  })

  it('shows the Hoje retry action only after upstream starting retries are exhausted', async () => {
    vi.useFakeTimers()
    skipFlow.active = true
    skipFlow.retryRead = true
    const client = createQueryClient()
    const refused = vi.fn(async () => Response.json({ error: 'Unavailable', errorCode: 'UPSTREAM_STARTING' }, { status: 503, headers: { 'Retry-After': '5' } }))
    vi.stubGlobal('fetch', (_input: RequestInfo | URL, init?: RequestInit) => init?.mode === 'no-cors' ? Promise.resolve(new Response(null)) : refused())
    const rendered = render(<QueryClientProvider client={client}><HabitList view="today" filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }} /></QueryClientProvider>)
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(124_999) })
      expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0)
      expect(screen.queryByText('habits.loadError')).toBeNull()
      await act(async () => { await vi.advanceTimersByTimeAsync(2) })
      expect(screen.getByText('habits.loadError')).toBeInTheDocument()
      const retry = screen.getByRole('button', { name: 'common.retry' })
      expect(refused).toHaveBeenCalledTimes(7)
      expect(useThrottleStore.getState().error).toBeNull()
      expect(useAppToastStore.getState().currentToast).toBeNull()
      fireEvent.click(retry)
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(refused).toHaveBeenCalledTimes(8)
      expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0)
    } finally {
      rendered.unmount()
      client.clear()
      vi.unstubAllGlobals()
      vi.useRealTimers()
    }
  })

  it.each((['today', 'all', 'general'] as const).flatMap((view) => [false, true].flatMap((drilling) => [false, true].map((selectMode) => ({ view, drilling, selectMode })))))(
    'composes type and own checklist for every list consumer in $view, drill=$drilling selection=$selectMode', ({ view, drilling, selectMode }) => {
      rowImplementation.actual = true
      const checklistItems = [{ text: 'Page', isChecked: true }, { text: 'Page', isChecked: false }]
      const parent = createMockHabit({ id: 'parent', title: 'Parent', hasSubHabits: true, scheduledDates: [TODAY], isGeneral: view === 'general', checklistItems })
      const child = createMockHabit({ ...parent, id: 'child', title: 'Child', hasSubHabits: false, parentId: parent.id })
      const branch = createMockHabit({ ...child, id: 'branch', title: 'Branch', hasSubHabits: true })
      for (const habit of [parent, child, branch]) mockHabitsData.habitsById.set(habit.id, habit)
      mockHabitsData.childrenByParent.set(parent.id, [child.id, branch.id])
      mockHabitsData.topLevelHabits = [parent]
      if (drilling) {
        mockDrillState.currentParent = parent
        mockDrillState.currentParentId = parent.id
        mockDrillState.drillStack = [parent.id]
        mockDrillState.drillChildren = [child, branch]
      }
      const { container } = renderWithProviders(<HabitList view={view} isSelectMode={selectMode} selectedHabitIds={new Set([child.id])} filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }} />)
      const rows = container.querySelectorAll('[data-testid="habit-row"]')
      expect(rows).toHaveLength(drilling ? 2 : 3)
      for (const row of rows) {
        const meta = row.querySelector('[data-habit-row-meta]')!
        expect(meta.firstElementChild?.querySelector('[data-habit-row-type]')).not.toBeNull()
        expect(meta.querySelector('[data-habit-row-checklist]')?.textContent).toBe('1/2')
        expect(row.querySelectorAll('[data-habit-row-type]')).toHaveLength(1)
      }
    },
  )
  function assertCascadeActions(container: HTMLElement, drilling: boolean, width: number, textScale: number) {
    if (drilling) return
    const disclosure = container.querySelector<HTMLButtonElement>('[data-habit-title="Branch"] [data-habit-row-control="disclosure"]')!
    if (width !== 320 || textScale === 1) {
      fireEvent.click(disclosure)
      expect(container.querySelector('[data-habit-title="Grandchild"]')).toBeNull()
      fireEvent.click(disclosure)
      expect(container.querySelector('[data-habit-title="Grandchild"]')).toBeInTheDocument()
    }
    if (width !== 320) return
    const boundaryTitle = textScale === 2 ? 'Branch' : 'Nested parent'
    const boundary = container.querySelector(`[data-habit-title="${boundaryTitle}"] [data-habit-row-control="disclosure"]`)!
    expect(boundary).not.toHaveAttribute('aria-expanded')
    expect(boundary).not.toHaveAttribute('aria-controls')
    fireEvent.click(boundary)
    expect(drillInto).toHaveBeenCalledWith(textScale === 2 ? 'branch' : 'nested-parent')
  }

  function assertCascadeGeometry(geometry: { depth: number; titleWidth: number; titleSize: number; metadataEdge: number; top: number; bottom: number; inset: number; textEdge: number; wellInset: number; targets: { left: number; right: number; width: number; height: number }[] }[], expectedDepths: number[], width: number, drilling: boolean) {
    for (const [index, row] of geometry.entries()) {
      expect(row.wellInset, `well at visible depth ${expectedDepths[index]}`).toBe(8 + 16 * expectedDepths[index]!)
      expect(row.textEdge, `text at visible depth ${expectedDepths[index]}`).toBe(84 + 16 * expectedDepths[index]!)
      expect(row.titleWidth).toBeGreaterThanOrEqual(row.titleSize)
      expect(row.metadataEdge).toBe(row.textEdge)
      if (index && !drilling) expect(row.top - geometry[index - 1]!.bottom).toBe(expectedDepths[index] === 0 ? 12 : 4)
      expect(row.inset).toBe(16)
      expect(row.textEdge).toBe(84 + 16 * row.depth)
      expect(row.wellInset).toBe(8 + 16 * row.depth)
      for (const target of row.targets) {
        expect(target.left).toBeGreaterThanOrEqual(16)
        expect(target.right).toBeLessThanOrEqual(width - 16)
        expect(target.width).toBeGreaterThanOrEqual(48)
        expect(target.height).toBeGreaterThanOrEqual(48)
      }
    }
  }

  it.each((['today', 'all', 'general'] as const).flatMap((view) => [false, true].map((drilling) => ({ view, drilling }))))(
    'keeps the list inset and content edges per depth in $view, drilling=$drilling', async ({ view, drilling }) => {
    rowImplementation.actual = true
    const parent = createMockHabit({ id: 'parent', title: 'Parent', description: '**Read** two pages before breakfast.', hasSubHabits: true, scheduledDates: [TODAY], isGeneral: view === 'general' })
    const child = createMockHabit({ id: 'child', title: 'Child', description: '**Read** two pages before breakfast.', parentId: parent.id, scheduledDates: [TODAY], isGeneral: parent.isGeneral })
    const branch = createMockHabit({ ...child, id: 'branch', title: 'Branch', hasSubHabits: true })
    const leaf = createMockHabit({ id: 'leaf', title: 'Leaf', scheduledDates: [TODAY], isGeneral: parent.isGeneral })
    const grandchild = createMockHabit({ ...child, id: 'grandchild', title: 'Grandchild', parentId: branch.id })
    const nestedParent = createMockHabit({ ...grandchild, id: 'nested-parent', title: 'Nested parent', hasSubHabits: true })
    const deeper = createMockHabit({ ...grandchild, id: 'deeper', title: 'Deeper', parentId: nestedParent.id })
    for (const habit of [parent, child, branch, grandchild, nestedParent, deeper, leaf]) mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.childrenByParent.set(parent.id, [child.id, branch.id])
    mockHabitsData.childrenByParent.set(branch.id, [grandchild.id, nestedParent.id])
    mockHabitsData.childrenByParent.set(nestedParent.id, [deeper.id])
    mockHabitsData.topLevelHabits = [parent, leaf]
    if (drilling) {
      mockDrillState.currentParent = parent
      mockDrillState.currentParentId = parent.id
      mockDrillState.drillStack = [parent.id]
      mockDrillState.drillChildren = [child, branch]
      getDrillChildrenMock.mockImplementation((id) => id === branch.id ? [createMockHabit({ ...child, id: 'grandchild', parentId: branch.id })] : [])
    }
    const cssPath = resolve(process.cwd(), 'app/globals.css')
    const stylesheet = await postcss([tailwind()]).process(readFileSync(cssPath, 'utf8'), { from: cssPath })
    const launch = launchChrome()
    try {
      const browser = await launch
      const cases = [320, 412, 1352].flatMap((width) => [1, 2].flatMap((textScale) => [false, true].flatMap((selectMode) => (['light', 'dark'] as const).flatMap((mode) => (['en', 'pt-BR'] as const).map((locale) => ({ width, textScale, selectMode, mode, locale }))))))
      for (const { width, textScale, selectMode, mode, locale } of cases) {
        const observations = new Map<Element, { callback: ResizeObserverCallback; observer: ResizeObserver }>()
        vi.stubGlobal('ResizeObserver', class implements ResizeObserver {
          constructor(private callback: ResizeObserverCallback) {}
          observe(target: Element) { observations.set(target, { callback: this.callback, observer: this }) }
          unobserve(target: Element) { observations.delete(target) }
          disconnect() {
            for (const [target, observation] of observations) if (observation.observer === this) observations.delete(target)
          }
        })
        dragLocale.english = locale === 'en'
        dragLocale.portuguese = locale === 'pt-BR'
        vi.stubGlobal('innerWidth', width)
        document.documentElement.style.fontSize = `${16 * textScale}px`
        const { container, unmount } = renderWithProviders(<HabitList view={view} isSelectMode={selectMode} selectedHabitIds={new Set([child.id])}
          filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }} />)
        const markup = container.innerHTML
        const page = await browser.newPage({ viewport: { width, height: 915 } })
        try {
          const tokens = Object.entries(resolveWebThemeVariables('orange', mode)).map(([key, value]) => `${key}:${value}`).join(';')
          await page.setContent(`<style>${stylesheet.css}:root{${tokens};font-size:${16 * textScale}px}</style><div style="max-width:740px;height:915px;overflow-y:auto;scrollbar-gutter:stable">${markup}</div>`)
          const observed = await page.locator('[data-habit-list]').evaluate((element) => new Promise<{
            contentRect: DOMRectInit; borderBoxSize: ResizeObserverSize[]; contentBoxSize: ResizeObserverSize[]; devicePixelContentBoxSize: ResizeObserverSize[]
          }>((resolve) => {
            const observer = new ResizeObserver(([entry]) => {
              const sizes = (boxes: readonly ResizeObserverSize[]) => boxes.map(({ inlineSize, blockSize }) => ({ inlineSize, blockSize }))
              resolve({ contentRect: entry!.contentRect.toJSON(), borderBoxSize: sizes(entry!.borderBoxSize), contentBoxSize: sizes(entry!.contentBoxSize), devicePixelContentBoxSize: sizes(entry!.devicePixelContentBoxSize) })
              observer.disconnect()
            })
            observer.observe(element)
          }))
          const target = container.querySelector('[data-habit-list]')!
          const observation = observations.get(target)!
          act(() => observation.callback([{ ...observed, contentRect: DOMRectReadOnly.fromRect(observed.contentRect), target }], observation.observer))
          assertCascadeActions(container, drilling, width, textScale)
          await page.setContent(`<style>${stylesheet.css}:root{${tokens};font-size:${16 * textScale}px}</style><div style="max-width:740px;height:915px;overflow-y:auto;scrollbar-gutter:stable">${container.innerHTML}</div>`)
          await loadAppFonts(page)
          const geometry = await page.locator('[data-testid="habit-row"]').evaluateAll((rows) => rows.map((row) => {
            const body = row.querySelector('[data-habit-row-body]')!
            const content = row.querySelector('[data-personal-text-content]') ?? body
            const title = (row.querySelector('[data-habit-row-heading] > div') ?? content.querySelector(':scope > div'))!
            const well = content.querySelector('[data-habit-row-heading] > span > span, :scope > span > span')!
            return {
              depth: Number(row.getAttribute('data-depth')),
              titleWidth: title.getBoundingClientRect().width,
              titleSize: Number.parseFloat(getComputedStyle(row.querySelector('[data-personal-text]')!).fontSize),
              metadataEdge: row.querySelector('[data-habit-row-type]')!.getBoundingClientRect().left,
              top: row.getBoundingClientRect().top,
              bottom: row.getBoundingClientRect().bottom,
              inset: row.getBoundingClientRect().left,
              textEdge: title.getBoundingClientRect().left,
              wellInset: well.getBoundingClientRect().left - body.getBoundingClientRect().left,
              targets: Array.from(row.querySelectorAll('button')).map((button) => {
                const bounds = button.getBoundingClientRect()
                return { left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height }
              }),
            }
          }))
          const expectedDepths = drilling ? [0, 0] : width === 320 ? textScale === 2 ? [0, 1, 1, 0] : [0, 1, 1, 2, 2, 0] : [0, 1, 1, 2, 2, 3, 0]
          expect(await page.locator('[data-habit-row-description]').allTextContents()).toEqual(Array.from({ length: expectedDepths.length - Number(!drilling) }, () => 'Read two pages before breakfast.'))
          expect(geometry).toHaveLength(expectedDepths.length)
          expect(await page.evaluate(() => window.innerWidth)).toBe(width)
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
          assertCascadeGeometry(geometry, expectedDepths, width, drilling)
        } finally { unmount(); await page.close() }
      }
    } finally {
      document.documentElement.style.removeProperty('font-size')
      vi.unstubAllGlobals()
      await closeChrome(launch)
    }
  }, 45_000)
  function renderKeyboardHabitList(language = 'pt-BR') {
    rowImplementation.actual = true
    dragLocale.portuguese = language === 'pt-BR'
    dragLocale.english = language === 'en'
    const first = createMockHabit({ id: 'first', title: 'Ler um livro', position: 0, scheduledDates: [TODAY] })
    const second = createMockHabit({ id: 'second', title: 'Caminhar', position: 1, scheduledDates: [TODAY] })
    const parent = createMockHabit({ id: 'parent', title: 'Rotina', position: 2, hasSubHabits: true, scheduledDates: [TODAY] })
    const children = [0, 1].map((position) => createMockHabit({
      id: `child-${position}`, title: `Child ${position}`, position, parentId: parent.id, scheduledDates: [TODAY],
    }))
    for (const habit of [first, second, parent, ...children]) mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.topLevelHabits = [first, second, parent]
    mockHabitsData.childrenByParent.set(parent.id, children.map((child) => child.id))
    reorderHabitsMutate.mockImplementation((_request, options) => options?.onSuccess?.())
    const filters = { dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }
    return renderWithProviders(<HabitList view="today" filters={filters} />)
  }

  it('localizes the habit keyboard instructions in Portuguese on each body', () => {
    const { container } = renderKeyboardHabitList()
    const bodies = container.querySelectorAll('[data-habit-row-body]')
    expect(bodies).toHaveLength(5)
    for (const body of bodies) {
      expect(body).toHaveAttribute('aria-roledescription', 'item reordenável')
      expect(body).toHaveAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown')
      const instructions = document.getElementById(body.getAttribute('aria-describedby')!)!
      expect(instructions).toHaveTextContent('Alt')
      expect(instructions).not.toHaveTextContent('barra de espaço')
    }
  })

  it('keeps sortable wrappers out of semantics and the tab sequence for roots and inline children', async () => {
    const user = userEvent.setup()
    const { container } = renderKeyboardHabitList()
    for (const button of within(container).getAllByRole('button')) {
      expect(button.querySelector('button, [role="button"]')).toBeNull()
    }
    const rows = screen.getAllByTestId('habit-row')
    const firstBody = rows[0]!.querySelector<HTMLButtonElement>('[data-habit-row-body]')!
    firstBody.focus()
    for (const target of [within(rows[0]!).getByRole('button', { name: /Registrar/ }),
      within(rows[0]!).getByRole('button', { name: ptBR.habits.actions.more }),
      rows[1]!.querySelector('[data-habit-row-body]')!]) {
      await user.tab()
      expect(target).toHaveFocus()
    }
    const childBody = rows[3]!.querySelector<HTMLButtonElement>('[data-habit-row-body]')!
    childBody.focus()
    await user.tab()
    expect(within(rows[3]!).getByRole('button', { name: /Registrar/ })).toHaveFocus()
    await user.tab()
    expect(within(rows[3]!).getByRole('button', { name: ptBR.habits.actions.more })).toHaveFocus()
    await user.tab()
    expect(rows[4]!.querySelector('[data-habit-row-body]')).toHaveFocus()
  })

  it.each(['{Enter}', ' '])('lets real sensors preserve ring, menu, body and disclosure activation with %s', async (key) => {
    const user = userEvent.setup()
    renderKeyboardHabitList()
    const rows = screen.getAllByTestId('habit-row')
    within(rows[0]!).getByRole('button', { name: /Registrar/ }).focus()
    await user.keyboard(key)
    expect(logHabitMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ habitId: 'first' }))
    within(rows[1]!).getByRole('button', { name: ptBR.habits.actions.more }).focus()
    await user.keyboard(key)
    expect(await screen.findByRole('menuitem', { name: ptBR.common.edit })).toBeVisible()
    await user.keyboard('{Escape}')
    rows[1]!.querySelector<HTMLButtonElement>('[data-habit-row-body]')!.focus()
    await user.keyboard(key)
    expect(routerPush).toHaveBeenCalledWith(`/habits/second?date=${TODAY}&from=today`)
    const disclosure = within(rows[2]!).getByRole('button', { name: ptBR.common.collapse })
    disclosure.focus()
    await user.keyboard(key)
    expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    expect(reorderHabitsMutate).not.toHaveBeenCalled()
  })

  it.each(['en', 'pt-BR'])('moves a sibling and repeats boundary announcements in %s after an owner render', async (language) => {
    const user = userEvent.setup()
    const { container, rerenderWithProviders } = renderKeyboardHabitList(language)
    const body = container.querySelector<HTMLButtonElement>('[data-habit-row-body]')!
    body.focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(reorderHabitsMutate).toHaveBeenCalledExactlyOnceWith({ positions: [
      { habitId: 'second', position: 0 }, { habitId: 'first', position: 1 }, { habitId: 'parent', position: 2 },
    ] }, expect.objectContaining({ onSuccess: expect.any(Function) }))
    const moved = language === 'pt-BR' ? 'Ler um livro foi movido para a posição 2 de 3' : 'Ler um livro moved to position 2 of 3'
    expect(container.querySelector('[aria-live="polite"]')).toBeInTheDocument()
    expect(container).toHaveTextContent(moved)
    const filters = { dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }
    rerenderWithProviders(<HabitList view="today" filters={filters} />)
    reorderHabitsMutate.mockClear()
    const boundary = language === 'pt-BR' ? 'Ler um livro já está na posição 1 de 3' : 'Ler um livro is already at position 1 of 3'
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(container).toHaveTextContent(boundary)
    const previousRegion = Array.from(container.querySelectorAll('[role="status"]')).find((region) => region.textContent === boundary)!
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(previousRegion).toBeEmptyDOMElement()
    expect(container).toHaveTextContent(boundary)
    expect(body).toHaveFocus()
    expect(reorderHabitsMutate).not.toHaveBeenCalled()
  })

  it.each(['en', 'pt-BR'])('retains grandchild depth through keyboard reorder and completion in %s', async (locale) => {
    rowImplementation.actual = true
    dragLocale.english = locale === 'en'
    dragLocale.portuguese = locale === 'pt-BR'
    const parent = createMockHabit({ id: 'parent', title: 'Parent', scheduledDates: [TODAY] })
    const branch = createMockHabit({ id: 'branch', title: 'Branch', parentId: parent.id, scheduledDates: [TODAY] })
    const first = createMockHabit({ id: 'first', title: 'First', parentId: branch.id, position: 0, scheduledDates: [TODAY] })
    const second = createMockHabit({ ...first, id: 'second', title: 'Second', position: 1 })
    for (const habit of [parent, branch, first, second]) mockHabitsData.habitsById.set(habit.id, habit)
    mockHabitsData.childrenByParent.set(parent.id, [branch.id])
    mockHabitsData.childrenByParent.set(branch.id, [first.id, second.id])
    mockHabitsData.topLevelHabits = [parent]
    const { container } = renderWithProviders(<HabitList view="today" filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }} showCompleted />)
    const row = container.querySelector('[data-habit-title="First"]')!
    expect(row).toHaveAttribute('data-depth', '2')
    const body = row.querySelector<HTMLButtonElement>('[data-habit-row-body]')!
    body.focus()
    fireEvent.keyDown(body, { key: 'ArrowDown', altKey: true })
    expect(reorderHabitsMutate).toHaveBeenCalledWith({ positions: [{ habitId: second.id, position: 0 }, { habitId: first.id, position: 1 }] }, expect.objectContaining({ onSuccess: expect.any(Function) }))
    await act(async () => { fireEvent.click(row.querySelector('[data-habit-row-control="check"]')!) })
    expect(logHabitMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ habitId: first.id }))
    expect(row).toHaveAttribute('data-depth', '2')
    expect(body).toHaveFocus()
  })

  function renderVisibleSiblingKeyboardList(
    surface: 'roots' | 'children',
    hiddenReason: 'another day' | 'completed' | 'search',
    storedOrder: string[],
  ) {
    rowImplementation.actual = true
    dragLocale.english = true
    useActualHabitVisibility = true
    const parent = createMockHabit({ id: 'parent', title: 'Parent', hasSubHabits: true, scheduledDates: [TODAY] })
    const siblings = storedOrder.map((id, position) => {
      const hidden = id.startsWith('hidden')
      return createMockHabit({
        id, title: id, position, parentId: surface === 'children' ? parent.id : null,
        scheduledDates: hidden && hiddenReason === 'another day' ? [TOMORROW] : [TODAY],
        isCompleted: hidden && hiddenReason === 'completed',
        searchMatches: hidden ? [] : [{ field: 'title', value: id }],
      })
    })
    for (const habit of siblings) mockHabitsData.habitsById.set(habit.id, habit)
    if (surface === 'children') {
      mockHabitsData.habitsById.set(parent.id, parent)
      mockHabitsData.topLevelHabits = [parent]
      mockHabitsData.childrenByParent.set(parent.id, storedOrder)
    } else {
      mockHabitsData.topLevelHabits = hiddenReason === 'search'
        ? siblings.filter((habit) => !habit.id.startsWith('hidden')) : siblings
    }
    reorderHabitsMutate.mockImplementation((_request, options) => options?.onSuccess?.())
    const filters = { dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }
    return renderWithProviders(<HabitList view="today" filters={filters} showCompleted={false}
      searchQuery={hiddenReason === 'search' ? 'title' : ''} />)
  }

  const hiddenSiblingCases = (['roots', 'children'] as const).flatMap((surface) =>
    (['another day', 'completed', 'search'] as const).map((hiddenReason) => ({ surface, hiddenReason })))

  it.each(hiddenSiblingCases)('moves down past a visible neighbour in $surface with $hiddenReason siblings', async ({ surface, hiddenReason }) => {
    const user = userEvent.setup()
    const { container } = renderVisibleSiblingKeyboardList(surface, hiddenReason, ['first', 'hidden-one', 'hidden-two', 'second'])
    const bodies = container.querySelectorAll<HTMLButtonElement>('[data-habit-row-body]')
    expect(bodies).toHaveLength(surface === 'roots' ? 2 : 3)
    expect(within(container).queryByText('hidden-one')).not.toBeInTheDocument()
    expect(within(container).queryByText('hidden-two')).not.toBeInTheDocument()
    bodies[surface === 'roots' ? 0 : 1]!.focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(reorderHabitsMutate).toHaveBeenCalledExactlyOnceWith({ positions: [
      { habitId: 'hidden-one', position: 0 }, { habitId: 'hidden-two', position: 1 },
      { habitId: 'second', position: 2 }, { habitId: 'first', position: 3 },
    ] }, expect.objectContaining({ onSuccess: expect.any(Function) }))
    expect(container).toHaveTextContent('first moved to position 2 of 2')
    expect(document.activeElement).toBe(bodies[surface === 'roots' ? 0 : 1])
  })

  it.each(hiddenSiblingCases)('moves up past a visible neighbour in $surface with $hiddenReason siblings', async ({ surface, hiddenReason }) => {
    const user = userEvent.setup()
    const { container } = renderVisibleSiblingKeyboardList(surface, hiddenReason, ['first', 'hidden-one', 'hidden-two', 'second'])
    const bodies = container.querySelectorAll<HTMLButtonElement>('[data-habit-row-body]')
    expect(bodies).toHaveLength(surface === 'roots' ? 2 : 3)
    bodies[bodies.length - 1]!.focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(reorderHabitsMutate).toHaveBeenCalledExactlyOnceWith({ positions: [
      { habitId: 'second', position: 0 }, { habitId: 'first', position: 1 },
      { habitId: 'hidden-one', position: 2 }, { habitId: 'hidden-two', position: 3 },
    ] }, expect.objectContaining({ onSuccess: expect.any(Function) }))
    expect(container).toHaveTextContent('second moved to position 1 of 2')
  })

  it.each(hiddenSiblingCases)('announces visible boundaries in $surface with $hiddenReason siblings', async ({ surface, hiddenReason }) => {
    const user = userEvent.setup()
    const { container } = renderVisibleSiblingKeyboardList(surface, hiddenReason, ['hidden-one', 'first', 'second', 'hidden-two'])
    const bodies = container.querySelectorAll<HTMLButtonElement>('[data-habit-row-body]')
    expect(bodies).toHaveLength(surface === 'roots' ? 2 : 3)
    bodies[surface === 'roots' ? 0 : 1]!.focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    expect(reorderHabitsMutate).not.toHaveBeenCalled()
    expect(container).toHaveTextContent('first is already at position 1 of 2')
    bodies[bodies.length - 1]!.focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(reorderHabitsMutate).not.toHaveBeenCalled()
    expect(container).toHaveTextContent('second is already at position 2 of 2')
  })

  it.each(['roots', 'children'] as const)('lands immediately after the visible neighbour in %s', async (surface) => {
    const user = userEvent.setup()
    const { container } = renderVisibleSiblingKeyboardList(surface, 'another day', ['first', 'hidden-one', 'second', 'hidden-two', 'third'])
    const bodies = container.querySelectorAll<HTMLButtonElement>('[data-habit-row-body]')
    bodies[surface === 'roots' ? 0 : 1]!.focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(reorderHabitsMutate).toHaveBeenCalledExactlyOnceWith({ positions: [
      { habitId: 'hidden-one', position: 0 }, { habitId: 'second', position: 1 },
      { habitId: 'first', position: 2 }, { habitId: 'hidden-two', position: 3 }, { habitId: 'third', position: 4 },
    ] }, expect.objectContaining({ onSuccess: expect.any(Function) }))
    expect(container).toHaveTextContent('first moved to position 2 of 3')
  })

  it('keeps Home and End navigation on row bodies', async () => {
    const user = userEvent.setup()
    const { container } = renderKeyboardHabitList()
    const bodies = container.querySelectorAll<HTMLButtonElement>('[data-habit-row-body]')
    bodies[1]!.focus()
    await user.keyboard('{End}')
    expect(bodies[4]).toHaveFocus()
    await user.keyboard('{Home}')
    expect(bodies[0]).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: ptBR.common.collapse }))
    bodies[1]!.focus()
    await user.keyboard('{End}')
    expect(bodies[2]).toHaveFocus()
  })

  it('moves inline children only among their own siblings', async () => {
    const user = userEvent.setup()
    renderKeyboardHabitList()
    const body = screen.getAllByTestId('habit-row')[3]!.querySelector<HTMLButtonElement>('[data-habit-row-body]')!
    body.focus()
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(reorderHabitsMutate).toHaveBeenCalledExactlyOnceWith({ positions: [
      { habitId: 'child-1', position: 0 }, { habitId: 'child-0', position: 1 },
    ] }, expect.objectContaining({ onSuccess: expect.any(Function) }))
    expect(screen.getByText('Child 0 foi movido para a posição 2 de 2')).toBeInTheDocument()
  })

  it.each([
    ['roots', null, false], ['roots', 0, false], ['children', null, false], ['children', 0, false],
    ['roots', null, true], ['roots', 0, true], ['children', null, true], ['children', 0, true],
  ] as const)('matches rendered %s order for tied positions %s and creation ties %s from the API producer', async (scope, position, creationTied) => {
    rowImplementation.actual = true
    dragLocale.portuguese = true
    const entries = [
      { id: 'newer', title: 'Newer', createdAtUtc: '2026-09-02T00:00:00Z', position, scheduledDates: [TODAY] },
      { id: 'latest', title: 'Latest', createdAtUtc: '2026-09-03T00:00:00Z', position, scheduledDates: [TODAY] },
      { id: 'older', title: 'Older', createdAtUtc: '2026-09-01T00:00:00Z', position, scheduledDates: [TODAY] },
    ]
    if (creationTied) {
      entries.unshift(entries.pop()!)
      for (const entry of entries) entry.createdAtUtc = '2026-09-01T00:00:00Z'
    }
    const items = scope === 'roots'
      ? entries.map((entry) => createMockHabitScheduleItem(entry))
      : [createMockHabitScheduleItem({ id: 'parent', hasSubHabits: true, scheduledDates: [TODAY],
        children: entries.map((entry) => createMockHabitScheduleChild(entry)),
      })]
    Object.assign(mockHabitsData, normalizeHabitQueryData(items.map((item) => habitScheduleItemSchema.parse(item))))
    reorderHabitsMutate.mockImplementation((_request, options) => options?.onSuccess?.())
    const { container } = renderWithProviders(<HabitList view="today" filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }} />)
    const bodies = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-habit-row-body]'))
      .filter((body) => ['Older', 'Newer', 'Latest'].some((title) => body.textContent.includes(title)))
    expect(bodies.map((body) => body.textContent)).toEqual([
      expect.stringContaining('Older'), expect.stringContaining('Newer'), expect.stringContaining('Latest'),
    ])
    bodies[0]!.focus()
    await userEvent.setup().keyboard('{Alt>}{ArrowDown}{/Alt}')
    expect(reorderHabitsMutate).toHaveBeenCalledExactlyOnceWith({ positions: [
      { habitId: 'newer', position: 0 }, { habitId: 'older', position: 1 }, { habitId: 'latest', position: 2 },
    ] }, expect.objectContaining({ onSuccess: expect.any(Function) }))
    expect(screen.getByText('Older foi movido para a posição 2 de 3')).toBeInTheDocument()
    expect(bodies[0]).toHaveFocus()
  })

  it('centres Hoje rows around their full content with a contrasting parent track in both modes', async () => {
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
          const body = row.querySelector('[data-habit-row-body]')!
          const well = row.querySelector('[data-habit-row-body] > span')!
          const bounds = panel.getBoundingClientRect()
          const wellBounds = well.getBoundingClientRect()
          const track = row.querySelector('[data-habit-check]')
          const title = row.querySelector('[data-personal-text]')!
          const type = row.querySelector('[data-habit-row-type]')!
          const meta = row.querySelector('[data-habit-row-meta]')
          const stack = [title, ...(meta ? [meta] : [])].map((node) => {
            const bounds = node.getBoundingClientRect()
            return { top: bounds.top, bottom: bounds.bottom, height: bounds.height, left: bounds.left }
          })
          const padding = getComputedStyle(body)
          const target = row.querySelector('[data-habit-row-control="check"]')!.getBoundingClientRect()
          const rowBounds = row.getBoundingClientRect()
          return {
            height: bounds.height,
            minimumHeight: Number.parseFloat(getComputedStyle(row).minHeight),
            padding: Number.parseFloat(padding.paddingTop) + Number.parseFloat(padding.paddingBottom),
            contentHeight: title.closest('[data-habit-row-title-block]')!.getBoundingClientRect().height,
            stack, type: type.textContent,
            target: { width: target.width, height: target.height, centre: target.top + target.height / 2 },
            centre: rowBounds.top + rowBounds.height / 2,
            top: wellBounds.top - bounds.top,
            bottom: bounds.bottom - wellBounds.bottom,
            track: track ? getComputedStyle(track).boxShadow.match(/rgba?\([^)]+\)/u)?.[0] : null,
            card: getComputedStyle(row).backgroundColor,
            canvas: getComputedStyle(document.body).backgroundColor,
          }
        }))
        expect(panels).toHaveLength(2)
        expect(panels[0]?.track).toBe(mode === 'dark' ? 'rgb(139, 139, 142)' : 'rgb(126, 126, 130)')
        for (const panel of panels) {
          panel.stack.forEach((line) => expect(line.left).toBeCloseTo(panel.stack[0]!.left, 1))
          panel.stack.slice(1).forEach((line, index) => expect(line.top - panel.stack[index]!.bottom).toBeCloseTo(4, 1))
          expect(panel.type).toBe('habits.form.typeHabit')
          expect(panel.contentHeight).toBeCloseTo(panel.stack.reduce((height, line) => height + line.height, 0) + 4 * (panel.stack.length - 1), 1)
          expect(panel.height).toBeCloseTo(Math.max(panel.minimumHeight, panel.contentHeight + panel.padding, panel.target.height + panel.padding), 1)
          expect(panel.target.width).toBe(48)
          expect(panel.target.height).toBeGreaterThanOrEqual(48)
          expect(Math.abs(panel.target.centre - panel.centre)).toBeLessThanOrEqual(1)
          expect(panel.top).toBeCloseTo(panel.bottom, 1)
          if (panel.track) expect(contrastOnSurface(panel.track, [panel.canvas, panel.card])).toBeGreaterThanOrEqual(3)
        }
        fireEvent.click(screen.getByRole('button', { name: 'common.expand' }))
        await page.setContent(`<html class="${mode}"><style>${stylesheet.css}:root{${variables}}</style><body style="background:var(--bg)">${container.innerHTML}</body></html>`)
        const gaps = await page.locator('[data-testid="habit-row"]').evaluateAll((rows) => {
          const bounds = rows.map((row) => row.getBoundingClientRect()).filter((row) => row.height > 0)
          return bounds.slice(1).map((row, index) => row.top - bounds[index]!.bottom)
        })
        expect(gaps).toEqual([4, 12])
        fireEvent.click(screen.getByRole('button', { name: 'common.collapse' }))
        await page.close()
      }
    } finally {
      await closeChrome(launch)
    }
  }, 45_000)

  it('keeps time and actual checklist counts without routine frequency text', () => {
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
    expect(untimed).not.toHaveTextContent('habits.frequency')
    expect(untimed).toHaveTextContent('1/1')
  })

  it('shows the derived child count instead of a parent schedule', () => {
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
      words: [], status: 'empty', action: 'logHabit' },
    { label: 'overdue', isOverdue: true, isBadHabit: false, isCompleted: false, isLoggedInRange: false,
      words: ['habits.overdue'], status: 'overdue', action: 'logHabit' },
    { label: 'completed slip', isOverdue: false, isBadHabit: true, isCompleted: true, isLoggedInRange: false,
      words: ['habits.statusDot.bad'], status: 'bad', action: 'actions.unlog' },
    { label: 'recorded slip', isOverdue: true, isBadHabit: true, isCompleted: false, isLoggedInRange: true,
      words: ['habits.overdue', 'habits.statusDot.bad'], status: 'bad', action: 'actions.unlog' },
    { label: 'unrecorded bad habit', isOverdue: false, isBadHabit: true, isCompleted: false, isLoggedInRange: false,
      words: [], status: 'empty', action: 'logHabit' },
    { label: 'completed overdue habit', isOverdue: true, isBadHabit: false, isCompleted: true, isLoggedInRange: false,
      words: [], status: 'done', action: 'actions.unlog' },
  ])('preserves parent progress and applicable state words for $label', ({ label, words, status, action, ...flags }) => {
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
    const meta = row.querySelector<HTMLElement>('[data-habit-row-meta]')!
    expect(meta).toBeInTheDocument()
    const progress = within(meta).getByText(/habits\.rowProgress/)
    expect(progress.textContent).toBe(`habits.rowProgress({"done":1,"total":2})${words.length ? '·' : ''}`)
    const labels = ['habits.form.typeHabit', 'habits.rowProgress({"done":1,"total":2})', ...words]
    const tokens = meta.querySelectorAll('[data-habit-row-meta-token]')
    expect(Array.from(tokens, (token) => token.textContent)).toEqual(labels.map((label, index) =>
      `${label}${index < labels.length - 1 ? '·' : ''}`))
    expect(progress).toBe(tokens[1])
    expect(meta.textContent).toBe(labels.join('·'))
    for (const word of ['habits.overdue', 'habits.statusDot.bad']) {
      expect(within(meta).queryAllByText(word, { exact: true })).toHaveLength(words.includes(word) ? 1 : 0)
      if (!words.includes(word)) expect(meta).not.toHaveTextContent(word)
    }
    expect(meta).not.toHaveTextContent(/21:00|9:00|habits.frequency/)
    const body = row.querySelector<HTMLButtonElement>('[data-habit-row-body]')!
    const bodyName = `${label}, habits.form.typeHabit ${['habits.rowProgress({"done":1,"total":2})', ...words].join('·')}`
    expect(within(row).getByRole('button', {
      name: bodyName,
    })).toBe(body)
    expect(within(row).getByRole('button', {
      name: `habits.statusDot.${status}, habits.${action}: ${label}, 1/2`,
    })).toBeEnabled()
    expect(within(row).getByRole('button', { name: 'habits.actions.more' })).toBeEnabled()
  })

  it('opens sub-habit creation for a free account from the habit list', async () => {
    accountDate.hasProAccess = false
    try {
      const habit = createMockHabit({ id: 'free-parent', title: 'Parent', scheduledDates: [TODAY] })
      mockHabitsData.habitsById.set(habit.id, habit)
      mockHabitsData.topLevelHabits = [habit]
      mockHabitsData.totalCount = 1
      renderWithProviders(<HabitList view="today" filters={{ dateFrom: TODAY, dateTo: TODAY, includeOverdue: true }} />)
      routerPush.mockClear()
      fireEvent.click(screen.getByTestId('add-sub-free-parent'))
      expect(await screen.findByRole('dialog', { name: 'Create habit' })).toBeVisible()
      expect(routerPush).not.toHaveBeenCalled()
    } finally { accountDate.hasProAccess = true }
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
    expect(within(childPanel).getByText(personalText(child.title))).toBeInTheDocument()
    expect(within(childPanel).queryByText(personalText(secondChild.title))).toBeNull()
    expect(within(childPanel).queryByText(personalText(parent.title))).toBeNull()
    const secondRow = screen.getAllByTestId('habit-row').find((row) => row.dataset.habitTitle === secondParent.title)!
    const secondPanelId = within(secondRow).getByRole('button', { name: 'common.collapse' }).getAttribute('aria-controls')!
    expect(secondPanelId).not.toBe(panelId)
    expect(within(document.getElementById(secondPanelId)!).getByText(personalText(secondChild.title))).toBeInTheDocument()

    disclosure.focus()
    await user.keyboard('{Enter}')
    expect(disclosure).toHaveFocus()
    expect(disclosure).toHaveAccessibleName('common.expand')
    expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    expect(disclosure).toHaveAttribute('aria-controls', panelId)
    expect(screen.queryByText(personalText(child.title))).toBeNull()
    expect(document.getElementById(panelId)).not.toBeVisible()
    expect(screen.getByText(personalText(secondChild.title))).toBeInTheDocument()

    await user.keyboard(' ')
    expect(disclosure).toHaveFocus()
    expect(disclosure).toHaveAccessibleName('common.collapse')
    expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    expect(disclosure).toHaveAttribute('aria-controls', panelId)
    expect(within(document.getElementById(panelId)!).getByText(personalText(child.title))).toBeInTheDocument()
    expect(toggleSelectionSpy).not.toHaveBeenCalled()
    expect(selected).toEqual(new Set([parent.id]))
    if (selectMode) expect(within(parentRow).getByRole('button', { name: `${parent.title}, habits.form.typeHabit`, pressed: true })).toBeInTheDocument()
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
      expect(within(panel).getByText(personalText(grandchild.title))).toBeInTheDocument()
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

  it('names an empty frequency view and offers all frequencies', () => {
    accountHabitCount.count = 3
    renderWithProviders(<HabitList filters={{ ...defaultFilters, frequencyUnit: 'Week' }} />)
    expect(screen.getByText('habits.filter.weekly')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'common.all' }))
    expect(setFrequencyFilters).toHaveBeenCalledWith({ frequencyUnit: undefined })
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
    rowImplementation.actual = true
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

  it.each((['today', 'all', 'general'] as const).flatMap((view) => [320, 412, 1352].map((width) => ({ view, width }))))(
    'hydrates an expanded recursive $view tree at $width before content measurement', async ({ view, width }) => {
    rowImplementation.actual = true
    useActualHabitVisibility = true
    const shared = { dueDate: TODAY, scheduledDates: [TODAY], isGeneral: view === 'general' }
    const greatGrandchild = createMockHabitScheduleChild({ ...shared, id: 'hydration-great-grandchild', title: 'Great grandchild' })
    const grandchild = createMockHabitScheduleChild({ ...shared, id: 'hydration-grandchild', title: 'Grandchild', hasSubHabits: true, children: [greatGrandchild] })
    const child = createMockHabitScheduleChild({ ...shared, id: 'hydration-child', title: 'Child', hasSubHabits: true, children: [grandchild] })
    const parent = createMockHabitScheduleItem({ ...shared, id: 'hydration-parent', title: 'Parent', hasSubHabits: true, children: [child] })
    Object.assign(mockHabitsData, normalizeHabitQueryData([habitScheduleItemSchema.parse(parent)]))
    const observations = new Map<Element, { callback: ResizeObserverCallback; observer: ResizeObserver }>()
    vi.stubGlobal('ResizeObserver', class implements ResizeObserver {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) { observations.set(target, { callback: this.callback, observer: this }) }
      unobserve(target: Element) { observations.delete(target) }
      disconnect() {
        for (const [target, observation] of observations) if (observation.observer === this) observations.delete(target)
      }
    })
    document.documentElement.style.fontSize = '16px'
    const createTree = () => <QueryClientProvider client={new QueryClient()}>
      <HabitList view={view} filters={view === 'general' ? { isGeneral: true } : { dateFrom: TODAY, dateTo: TODAY }} />
    </QueryClientProvider>
    const browserWindow = window
    let serverHtml: string
    vi.stubGlobal('window', undefined)
    try { serverHtml = renderToString(createTree()) } finally { vi.stubGlobal('window', browserWindow) }
    vi.stubGlobal('innerWidth', width)
    const container = document.createElement('div')
    container.innerHTML = serverHtml
    document.body.append(container)
    const rows = Array.from(container.querySelectorAll<HTMLDivElement>('[data-testid="habit-row"]'))
    expect(rows.map((row) => row.getAttribute('data-depth'))).toEqual(['0', '1', '2'])
    expect(rows[2]!.querySelector('[data-habit-row-heading]')).toHaveTextContent('Grandchild')
    const disclosures = rows.map((row) => row.querySelector('[data-habit-row-control="disclosure"]')!)
    const panelIds = disclosures.map((disclosure) => disclosure.getAttribute('aria-controls'))
    for (const [index, disclosure] of disclosures.entries()) {
      expect(disclosure).toHaveAttribute('aria-label', index === 2 ? 'habits.actions.openSubHabits' : 'common.collapse')
      expect(disclosure.getAttribute('aria-expanded')).toBe(index === 2 ? null : 'true')
      if (index < 2) expect(container.querySelector(`[id="${panelIds[index]}"]`)).toContainElement(rows[index + 1]!)
      else expect(panelIds[index]).toBeNull()
    }
    const serverDescriptions = getSortableDescriptions(container)
    const recoverable = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let unmount: (() => void) | undefined
    try {
      const rendered = render(createTree(), { container, hydrate: true, onRecoverableError: recoverable })
      unmount = rendered.unmount
      expect(recoverable).not.toHaveBeenCalled()
      expect(consoleError).not.toHaveBeenCalled()
      container.querySelectorAll('[data-testid="habit-row"]').forEach((row, index) => expect(row).toBe(rows[index]))
      expect(disclosures.map((disclosure) => disclosure.getAttribute('aria-controls'))).toEqual(panelIds)
      expect(disclosures.map((disclosure) => disclosure.getAttribute('aria-expanded'))).toEqual(['true', 'true', null])
      expect(getSortableDescriptions(container)).toEqual(serverDescriptions)
      for (const descriptionId of serverDescriptions) expect(container.querySelector(`[id="${descriptionId}"]`)).toBeInTheDocument()
      const contentWidth = width === 320 ? 284 : Math.min(width, 740) - 32
      function resize(target: Element) {
        const observation = observations.get(target)!
        const size = { inlineSize: contentWidth, blockSize: 52 }
        observation.callback([{
          target, contentRect: new DOMRectReadOnly(0, 0, contentWidth, 52),
          borderBoxSize: [size], contentBoxSize: [size], devicePixelContentBoxSize: [size],
        }], observation.observer)
      }
      await act(async () => resize(container.querySelector('[data-habit-list]')!))
      await act(async () => { for (const row of container.querySelectorAll('[data-testid="habit-row"]')) resize(row) })
      expect(Array.from(container.querySelectorAll('[data-testid="habit-row"]')).map((row) => row.getAttribute('data-depth'))).toEqual(width === 320 ? ['0', '1', '2'] : ['0', '1', '2', '3'])
      expect(disclosures[2]!.getAttribute('aria-expanded')).toBe(width === 320 ? null : 'true')
      if (width > 320) expect(container.querySelector(`[id="${disclosures[2]!.getAttribute('aria-controls')}"]`)).toHaveTextContent('Great grandchild')
      expect(Array.from(container.querySelectorAll('[data-testid="habit-row"]')).slice(0, 3)).toEqual(rows)
      expect(recoverable).not.toHaveBeenCalled()
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      unmount?.()
      container.remove()
      document.documentElement.style.removeProperty('font-size')
      vi.unstubAllGlobals()
      consoleError.mockRestore()
    }
  })

  it.each([false, true])('does not announce whole-day completion from a monthly subset, showCompleted=%s', (showCompleted) => {
    useActualHabitVisibility = true
    accountHabitCount.count = 2
    const daily = createMockHabit({ id: 'daily-pending', frequencyUnit: 'Day', scheduledDates: [TODAY] })
    const monthly = createMockHabit({ id: 'monthly-done', frequencyUnit: 'Month', scheduledDates: [TODAY], isLoggedInRange: true })
    mockHabitsData.habitsById = new Map([[daily.id, daily], [monthly.id, monthly]])
    mockHabitsData.topLevelHabits = [daily, monthly]
    const rendered = renderWithProviders(<HabitList filters={defaultFilters} showCompleted={showCompleted} />)
    expect(screen.queryByText('habits.allDoneToday')).not.toBeInTheDocument()
    mockHabitsData.habitsById = new Map([[monthly.id, monthly]])
    mockHabitsData.topLevelHabits = [monthly]
    rendered.rerenderWithProviders(<HabitList filters={{ ...defaultFilters, frequencyUnit: 'Month' }} showCompleted={showCompleted} />)
    expect(screen.queryByText('habits.allDoneHint')).not.toBeInTheDocument()
    expect(screen.queryByText('habits.allDoneToday')).not.toBeInTheDocument()
    rendered.rerenderWithProviders(<HabitList filters={defaultFilters} showCompleted={showCompleted} />)
    expect(screen.getByText('habits.allDoneToday')).toBeInTheDocument()
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

  it('shows all-done above an unfinished anytime habit with a 24 gap', async () => {
    useActualHabitVisibility = true
    accountHabitCount.count = 2
    const due = createMockHabit({ id: 'due', title: 'Due habit', scheduledDates: [TODAY], isLoggedInRange: true })
    const anytime = createMockHabit({ id: 'anytime', title: 'Anytime habit', isGeneral: true })
    mockHabitsData.habitsById = new Map([[due.id, due], [anytime.id, anytime]])
    mockHabitsData.topLevelHabits = [due, anytime]
    mockHabitsData.totalCount = 2

    const { container } = renderWithProviders(<HabitList filters={defaultFilters} view="today" showCompleted={false} />)

    expect(screen.getByText('habits.allDoneToday')).toBeInTheDocument()
    expect(screen.getByText(personalText('Anytime habit'))).toBeInTheDocument()
    expect(screen.getByText('habits.allDoneToday').compareDocumentPosition(screen.getByText(personalText('Anytime habit'))) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const cssPath = resolve('app/globals.css')
    const stylesheet = await postcss([tailwind()]).process(readFileSync(cssPath, 'utf8'), { from: cssPath })
    const launch = launchChrome()
    try {
      const browser = await launch
      const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
      await page.setContent(`<style>${stylesheet.css}</style>${container.innerHTML}`)
      const gap = await page.getByText('habits.allDoneToday', { exact: true }).evaluate((element) => {
        const banner = element.parentElement!
        const row = document.querySelector('[data-testid="habit-card-anytime"]')!
        return row.getBoundingClientRect().top - banner.getBoundingClientRect().bottom
      })
      expect(gap).toBe(24)
    } finally { await closeChrome(launch) }
  }, 45_000)

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

    expect(await screen.findByText(personalText('habits.autoLogParentMessage({"name":"Parent A"})')))
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
    expect(await screen.findByText(personalText('habits.autoLogParentMessage({"name":"Parent B"})')))
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

  it.each(['populated', 'deep', 'loading', 'empty', 'filtered-empty', 'error'])('spaces drill groups by 24 without widening rows (%s)', async (surface) => {
    const parent = createMockHabit({ id: 'parent', title: 'Parent', hasSubHabits: true })
    const children = ['first', 'second'].map((id) => createMockHabit({ id, title: id, parentId: parent.id }))
    mockHabitsData.habitsById.set(parent.id, parent)
    mockHabitsData.topLevelHabits = [parent]
    mockDrillState.currentParentId = parent.id
    mockDrillState.currentParent = parent
    mockDrillState.drillStack = surface === 'deep' ? ['root', parent.id] : [parent.id]
    mockDrillState.drillChildren = surface === 'populated' || surface === 'deep' ? children : []
    mockDrillState.drillLoading = surface === 'loading'
    mockDrillState.drillError = surface === 'error' ? 'boom' : null
    mockDrillState.hasUnfilteredChildren = surface === 'filtered-empty'
    mockDrillState.canRevealCompletedChildren = surface === 'filtered-empty'
    const { container } = renderWithProviders(<HabitList view="today" filters={defaultFilters} onShowCompleted={vi.fn()} />)
    const cssPath = resolve('app/globals.css')
    const stylesheet = await postcss([tailwind()]).process(readFileSync(cssPath, 'utf8'), { from: cssPath })
    const launch = launchChrome()
    try {
      const browser = await launch
      const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
      await page.setContent(`<style>${stylesheet.css}</style>${container.innerHTML}`)
      const control = surface === 'deep'
        ? page.getByRole('button', { name: 'habits.backToHabits' })
        : page.getByRole('button', { name: 'common.back', exact: true })
      const controlBottom = await control.evaluate((element) => element.getBoundingClientRect().bottom)
      const contentTop = await page.evaluate((surface) => {
        let content: Element
        if (surface === 'loading') content = document.querySelector('[data-variant="habit-row"]')!
        else if (surface === 'error') content = document.querySelector('[role="alert"]')!.parentElement!
        else if (surface === 'empty' || surface === 'filtered-empty') {
          content = Array.from(document.querySelectorAll('p')).find((p) => p.textContent === (surface === 'empty' ? 'habits.noSubHabits' : 'habits.filterEmptySubHabits'))!.parentElement!
        } else content = document.querySelector('[data-testid="habit-card-first"]')!
        return content.getBoundingClientRect().top
      }, surface)
      expect.soft(contentTop - controlBottom).toBe(24)
      if (surface === 'empty' || surface === 'filtered-empty') {
        const emptyMessageToAddRowGap = 0
        const message = page.getByText(surface === 'empty' ? 'habits.noSubHabits' : 'habits.filterEmptySubHabits', { exact: true })
        const messageBottom = await message.evaluate((element) => element.parentElement!.getBoundingClientRect().bottom)
        const addRowTop = await page.getByRole('button', { name: 'habits.form.addSubHabit' }).evaluate((element) => element.getBoundingClientRect().top)
        expect(addRowTop - messageBottom).toBe(emptyMessageToAddRowGap)
        if (surface === 'filtered-empty') expect(await page.getByRole('button', { name: 'habits.showCompleted' }).count()).toBe(1)
      }
      if (surface === 'populated' || surface === 'deep') {
        expect(await page.evaluate(() => {
          const first = document.querySelector('[data-testid="habit-card-first"]')!.getBoundingClientRect()
          const second = document.querySelector('[data-testid="habit-card-second"]')!.getBoundingClientRect()
          return second.top - first.bottom
        })).toBe(12)
      }
    } finally { await closeChrome(launch) }
  }, 45_000)

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
    const childRow = (await screen.findByText(personalText('Pending child'))).closest('[data-testid="habit-row"]') as HTMLElement
    fireEvent.click(within(childRow).getByRole('button', { name: 'habits.actions.more' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'habits.actions.skip' }))
    await screen.findByRole('dialog', { name: 'habits.autoLogParentTitle' })
    await waitFor(() => expect(screen.queryByText(personalText('Pending child'))).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'undo.action' }))
    await screen.findByText(personalText('Pending child'))
    expect(skipFlow.mutate).toHaveBeenCalledTimes(2)
    await confirmVisibleSheet('habits.autoLogParentTitle', 'habits.autoLogParentConfirm')
    expect(logHabitMutateAsync).not.toHaveBeenCalled()
  })

  it('skips immediately and asks before deleting a habit', async () => {
    const habit = createMockHabit({ id: 'h-1', title: 'Stretch', scheduledDates: [TODAY] })
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
    rowImplementation.actual = false
    dragLocale.english = false
    dragLocale.portuguese = false
    skipFlow.active = false
    moveModuleLoad.hold = null
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
