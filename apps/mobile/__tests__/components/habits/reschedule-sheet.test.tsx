import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit, createMockRescheduleSuggestion } from '@orbit/shared/__tests__/factories'
import type { RescheduleSuggestion } from '@orbit/shared/types/habit'
import { RescheduleSheet } from '@/components/habits/reschedule-sheet'

const TestRenderer = require('react-test-renderer')

const mockPush = vi.fn()
const mockUpdateMutateAsync = vi.fn()
const mockShowError = vi.fn()
const mockRefetch = vi.fn()
let mockProfile: { hasProAccess: boolean; language: string }
let mockReschedule: {
  suggestion: RescheduleSuggestion | null
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

vi.mock('lucide-react-native', () => {
  const ReactLib = require('react')
  return {
    Sparkles: (props: Record<string, unknown>) => ReactLib.createElement('Sparkles', props),
    CalendarClock: (props: Record<string, unknown>) => ReactLib.createElement('CalendarClock', props),
  }
})

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: mockProfile }) }))
vi.mock('@/hooks/use-time-format', () => ({
  useTimeFormat: () => ({ displayTime: (value: string) => value }),
}))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: mockShowError }) }))
vi.mock('@/hooks/use-habits', () => ({
  useUpdateHabit: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: false }),
}))
vi.mock('@/hooks/use-reschedule-suggestion', () => ({
  useRescheduleSuggestion: () => mockReschedule,
}))

const overdueHabit = createMockHabit({ id: 'habit-1', title: 'Run', isOverdue: true })

interface TestNode {
  type: unknown
  props: Record<string, unknown>
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
  beforeEach(() => {
    vi.clearAllMocks()
    mockProfile = { hasProAccess: true, language: 'en' }
    mockReschedule = { suggestion: null, isLoading: false, error: null, refetch: mockRefetch }
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

  it('shows the upgrade prompt for free users and routes to /upgrade only after the sheet dismisses', () => {
    mockProfile = { hasProAccess: false, language: 'en' }
    const onOpenChange = vi.fn()

    const tree = render(<RescheduleSheet open onOpenChange={onOpenChange} habit={overdueHabit} />)

    expect(hasText(tree.root, 'habits.reschedule.freePrompt')).toBe(true)
    TestRenderer.act(() => {
      pressButton(tree.root, 'habits.reschedule.upgrade')
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(mockPush).not.toHaveBeenCalled()

    TestRenderer.act(() => {
      tree.update(
        <RescheduleSheet open={false} onOpenChange={onOpenChange} habit={overdueHabit} />,
      )
    })

    expect(mockPush).toHaveBeenCalledWith('/upgrade')
    expect(mockPush).toHaveBeenCalledTimes(1)
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
  })
})
