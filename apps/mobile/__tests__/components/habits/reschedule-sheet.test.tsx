import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit, createMockRescheduleSuggestion } from '@orbit/shared/__tests__/factories'
import type { RescheduleSuggestion } from '@orbit/shared/types/habit'
import { RescheduleSheet } from '@/components/habits/reschedule-sheet'
import { sheetTestControls } from '@/__tests__/support/sheet-double'
import { __setWindowDimensions } from '../../../test-mocks/react-native'
import { createTokensV2 } from '@/lib/theme'

const TestRenderer = require('react-test-renderer')

const mockPush = vi.fn()
const mockUpdateMutateAsync = vi.fn()
const mockShowError = vi.fn()
const mockRefetch = vi.fn()
let mockProfile: { hasProAccess: boolean; language: string }
let mockToday = '2026-08-17'
let mockUpdateIsPending = false
let mockReschedule: {
  suggestion: RescheduleSuggestion | null
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mockProfile }) }))
vi.mock('@/app/(tabs)/use-today-date', () => ({ useCurrentDate: () => mockToday }))
vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({ displayTime: (value: string) => value }),
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: mockShowError }) }))
vi.mock('@/hooks/use-habits', () => ({
  useUpdateHabit: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: mockUpdateIsPending }),
}))
vi.mock('@/hooks/use-reschedule-suggestion', () => ({
  useRescheduleSuggestion: () => mockReschedule,
}))

const overdueHabit = createMockHabit({ id: 'habit-1', title: 'Run', isOverdue: true })

interface TestNode {
  type: unknown
  props: Record<string, unknown>
  parent?: TestNode
  findAll: (predicate: (node: TestNode) => boolean) => TestNode[]
}

function render(ui: React.ReactElement) {
  let tree: { root: TestNode; update: (nextUi: React.ReactElement) => void }
  TestRenderer.act(() => {
    tree = TestRenderer.create(ui)
  })
  return tree!
}

function hasText(root: TestNode, value: string) {
  return root.findAll((node) => node.type === 'Text' && node.props.children === value).length > 0
}

function pressButton(root: TestNode, label: string) {
  const node = root.findAll(
    (candidate) =>
      candidate.type === 'Pressable' &&
      (candidate.props.accessibilityLabel === label ||
        candidate.findAll((c) => c.type === 'Text' && c.props.children === label).length > 0),
  )[0]
  if (!node) throw new Error(`Button not found: ${label}`)
  const onPress = node.props.onPress
  if (typeof onPress !== 'function') throw new Error(`Button missing onPress: ${label}`)
  onPress()
}

describe('RescheduleSheet (mobile)', () => {
  it.each(['free', 'error', 'accept'] as const)('renders small actions in the %s sheet footer', (state) => {
    if (state === 'free') mockProfile = { hasProAccess: false, language: 'en' }
    if (state === 'error') mockReschedule.error = new Error('unavailable')
    const tree = render(<RescheduleSheet open onOpenChange={vi.fn()} habit={overdueHabit} />)
    const actions = tree.root.findAll((node) => node.type === 'SheetActions')[0]!
    expect(actions).toBeDefined()
    expect(actions.findAll((node) => node.type === 'Pressable' && typeof node.props.testID === 'string').map((node) => node.props.testID)).toEqual(['button-ghost-sm', 'button-primary-sm'])
  })
  it.each(['free', 'error'] as const)('dismisses the %s footer without applying or navigating', (state) => {
    if (state === 'free') mockProfile = { hasProAccess: false, language: 'en' }
    if (state === 'error') mockReschedule.error = new Error('unavailable')
    const onOpenChange = vi.fn()
    const tree = render(<RescheduleSheet open onOpenChange={onOpenChange} habit={overdueHabit} />)
    TestRenderer.act(() => pressButton(tree.root, 'habits.reschedule.dismiss'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(mockUpdateMutateAsync).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })
  beforeEach(() => {
    vi.clearAllMocks()
    mockProfile = { hasProAccess: true, language: 'en' }
    mockToday = '2026-08-17'
    mockUpdateIsPending = false
    mockReschedule = { suggestion: null, isLoading: false, error: null, refetch: mockRefetch }
    __setWindowDimensions({ width: 390, height: 892, scale: 1, fontScale: 1 })
  })

  afterEach(() => {
    sheetTestControls.defer(false)
  })

  it('accept applies the suggestion through the update path with a merged request', async () => {
    mockReschedule.suggestion = createMockRescheduleSuggestion({
      frequencyUnit: 'Week',
      frequencyQuantity: 2,
      dueDate: '2025-02-01',
      dueTime: null,
    })
    mockUpdateMutateAsync.mockResolvedValue(undefined)

    const tree = render(<RescheduleSheet open onOpenChange={vi.fn()} habit={overdueHabit} />)

    await TestRenderer.act(async () => {
      pressButton(tree.root, 'habits.reschedule.accept')
      await Promise.resolve()
    })

    expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
      habitId: 'habit-1',
      data: expect.objectContaining({
        title: 'Run',
        isBadHabit: false,
        dueDate: '2025-02-01',
        frequencyUnit: 'Week',
        frequencyQuantity: 2,
      }),
    })
  })

  it('shows only the date line for a plan without a frequency', () => {
    mockReschedule.suggestion = createMockRescheduleSuggestion({ frequencyUnit: null, frequencyQuantity: null, days: [] })
    const tree = render(<RescheduleSheet open onOpenChange={vi.fn()} habit={overdueHabit} />)
    const schedule = tree.root.findAll((node) => node.type === 'Text' && node.props.testID === 'reschedule-proposed-schedule')[0]!
    expect(schedule).toBeDefined()
    expect(tree.root.findAll((node) => node.type === 'Text' && node.props.children === 'habits.oneTimeTask')).toHaveLength(0)
    expect(schedule.parent?.findAll((node) => node.type === 'Text')).toHaveLength(1)
  })

  it('shows the upgrade prompt for free users and routes to /upgrade only after the sheet dismisses', () => {
    mockProfile = { hasProAccess: false, language: 'en' }
    const onOpenChange = vi.fn()

    sheetTestControls.defer(true)
    const tree = render(<RescheduleSheet open onOpenChange={onOpenChange} habit={overdueHabit} />)

    expect(hasText(tree.root, 'habits.reschedule.freePrompt')).toBe(true)
    TestRenderer.act(() => {
      pressButton(tree.root, 'habits.reschedule.upgrade')
    })

    /** The sheet is still presented, so neither the close nor the navigation may run yet. */
    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()

    TestRenderer.act(() => {
      sheetTestControls.completeDismissal()
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(mockPush).toHaveBeenCalledWith('/upgrade')
    expect(mockPush).toHaveBeenCalledTimes(1)
    sheetTestControls.defer(false)
  })

  it('applies the accepted suggestion, then closes only once the sheet dismisses', async () => {
    mockProfile = { hasProAccess: true, language: 'en' }
    mockReschedule.suggestion = createMockRescheduleSuggestion({
      frequencyUnit: 'Week',
      frequencyQuantity: 2,
      dueDate: '2025-02-01',
      dueTime: null,
    })
    mockUpdateMutateAsync.mockResolvedValue(undefined)
    const onOpenChange = vi.fn()
    sheetTestControls.defer(true)

    const tree = render(<RescheduleSheet open onOpenChange={onOpenChange} habit={overdueHabit} />)

    await TestRenderer.act(async () => {
      pressButton(tree.root, 'habits.reschedule.accept')
      await Promise.resolve()
    })

    expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1)
    expect(onOpenChange).not.toHaveBeenCalled()

    TestRenderer.act(() => {
      sheetTestControls.completeDismissal()
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
    sheetTestControls.defer(false)
  })

  it('dismisses a pro user through the sheet rather than unmounting it', () => {
    mockProfile = { hasProAccess: true, language: 'en' }
    mockReschedule.suggestion = createMockRescheduleSuggestion({})
    const onOpenChange = vi.fn()
    sheetTestControls.defer(true)

    const tree = render(<RescheduleSheet open onOpenChange={onOpenChange} habit={overdueHabit} />)

    TestRenderer.act(() => {
      pressButton(tree.root, 'habits.reschedule.dismiss')
    })

    expect(onOpenChange).not.toHaveBeenCalled()
    expect(sheetTestControls.isDismissPending).toBe(true)

    TestRenderer.act(() => {
      sheetTestControls.completeDismissal()
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
    sheetTestControls.defer(false)
  })

  it('shows an error with a retry that refetches', () => {
    mockReschedule.error = new Error('unavailable')

    const tree = render(<RescheduleSheet open onOpenChange={vi.fn()} habit={overdueHabit} />)

    expect(hasText(tree.root, 'habits.reschedule.error')).toBe(true)
    TestRenderer.act(() => {
      pressButton(tree.root, 'habits.reschedule.retry')
    })
    expect(mockRefetch).toHaveBeenCalled()
  })

  it('shows a schedule-card placeholder while the suggestion is loading', () => {
    mockReschedule.isLoading = true

    const tree = render(<RescheduleSheet open onOpenChange={vi.fn()} habit={overdueHabit} />)

    expect(hasText(tree.root, 'habits.reschedule.loading')).toBe(true)
    const skeletons = tree.root.findAll((node) => node.type === 'AnimatedView')
    expect(skeletons.length).toBeGreaterThanOrEqual(1)
    expect(tree.root.findAll((node) => node.type === 'View' && node.props.testID === 'skeleton-unit-habit-row')).toHaveLength(2)
    expect(tree.root.findAll((node) => node.type === 'View' && node.props.testID === 'skeleton-unit-habit-row' && node.props.accessibilityRole === 'progressbar')).toHaveLength(1)
    const actions = tree.root.findAll((node) => node.type === 'SheetActions')[0]!
    expect(actions.findAll((node) => node.type === 'Pressable' && typeof node.props.testID === 'string' && String(node.props.testID).startsWith('button-'))).toHaveLength(0)
  })

  it('keeps the title accessible without showing it and labels the proposal with Astra', () => {
    mockProfile = { hasProAccess: true, language: 'pt-BR' }
    mockReschedule.suggestion = createMockRescheduleSuggestion({ dueDate: '2026-08-20', dueTime: '07:30:00' })
    const tree = render(<RescheduleSheet open onOpenChange={vi.fn()} habit={overdueHabit} />)
    const sheet = tree.root.findAll((node) => node.type === 'Sheet')[0]!
    expect(sheet.props.accessibleTitle).toBe('habits.reschedule.title')
    expect(sheet.props.title).toBeUndefined()
    expect(hasText(tree.root, 'habits.reschedule.title')).toBe(false)
    expect(hasText(tree.root, 'habits.form.proposedByAstra')).toBe(true)
    const date = tree.root.findAll((node) => node.type === 'Text' && node.props.testID === 'reschedule-proposed-schedule')[0]!
    expect(date.props.children).toEqual(['qui., 20 de ago.', ' · 07:30:00'])
    const glyph = tree.root.findAll((node) => node.type === 'Svg' && node.props.testID === 'astra-mark')[0]!
    expect(glyph.props.color).toBe(createTokensV2().fg1)
    const name = tree.root.findAll((node) => node.type === 'Text' && node.props.children === 'Astra')[0]!
    expect(JSON.stringify(name.props.style)).not.toContain('uppercase')
  })

  it('adds the year to a proposed date outside the account year', () => {
    mockToday = '2026-12-30'
    mockReschedule.suggestion = createMockRescheduleSuggestion({ dueDate: '2027-01-05', dueTime: null })
    const tree = render(<RescheduleSheet open onOpenChange={vi.fn()} habit={overdueHabit} />)
    const date = tree.root.findAll((node) => node.type === 'Text' && node.props.testID === 'reschedule-proposed-schedule')[0]!
    expect(date.props.children).toEqual(['Tue, Jan 5, 2027', ''])
  })

  it.each([[900, 'button-primary-sm'], [1024, 'button-secondary-sm']] as const)(
    'uses the wide footer threshold at %ipx',
    (width, filledButtonId) => {
      __setWindowDimensions({ width, height: 892, scale: 1, fontScale: 1 })
      mockReschedule.suggestion = createMockRescheduleSuggestion({})
      const tree = render(<RescheduleSheet open onOpenChange={vi.fn()} habit={overdueHabit} />)
      const actions = tree.root.findAll((node) => node.type === 'SheetActions')[0]!
      expect(actions.findAll((node) => node.type === 'Pressable' && node.props.testID === filledButtonId)).toHaveLength(1)
    },
  )

  it('keeps the accept label and announces busy state while saving', () => {
    mockReschedule.suggestion = createMockRescheduleSuggestion({})
    mockUpdateMutateAsync.mockImplementation(() => new Promise(() => {}))
    const onOpenChange = vi.fn()
    const tree = render(<RescheduleSheet open onOpenChange={onOpenChange} habit={overdueHabit} />)
    TestRenderer.act(() => pressButton(tree.root, 'habits.reschedule.accept'))
    mockUpdateIsPending = true
    TestRenderer.act(() => tree.update(<RescheduleSheet open onOpenChange={onOpenChange} habit={overdueHabit} />))
    const accept = tree.root.findAll((node) => node.type === 'Pressable' && node.props.testID === 'button-primary-sm')[0]!
    expect(accept.props.accessibilityState).toEqual({ disabled: true, busy: true })
    expect(accept.findAll((node) => node.type === 'Text' && node.props.children === 'habits.reschedule.accept')).toHaveLength(1)
  })
})
