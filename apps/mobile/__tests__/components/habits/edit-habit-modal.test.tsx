import { habitSuggestionDraftFixture } from '@orbit/shared/test-support/chat-fixtures'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import type { HabitSetupSuggestion } from '@orbit/shared/types/habit'
import type { HabitFormProposal } from '@orbit/shared/utils'

import { EditHabitModal } from '@/components/habits/edit-habit-modal'
import { sheetTestControls } from '@/__tests__/support/sheet-double'
import { expectSmallSheetActions, sheetSlotButtons } from '@/__tests__/support/sheet-slots'

const TestRenderer = require('react-test-renderer')

function TestEditor(props: React.ComponentProps<typeof EditHabitModal>) {
  const [client] = React.useState(() => new QueryClient())
  return <QueryClientProvider client={client}><EditHabitModal {...props} /></QueryClientProvider>
}

const useWatchMock = vi.fn()
const mockFormReset = vi.fn()
const mockFormResetField = vi.fn()
const mockValidateAll = vi.fn()
const mockSuggestMutateAsync = vi.fn()
const mockSetValue = vi.fn()
const mockGetValues = vi.fn((..._args: unknown[]): unknown => ({}))
const mockSetFlexible = vi.fn()
const mockShowError = vi.fn()
const mockShowSuccess = vi.fn()
const mockShowInfo = vi.fn()
const mockUpdateMutateAsync = vi.hoisted(() => vi.fn())
const mockBuildUpdateHabitRequest = vi.hoisted(() => vi.fn((...args: unknown[]): Record<string, unknown> => ({ goalIds: args[4] })))
const mockAssignTagsMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockPush = vi.hoisted(() => vi.fn())

let mockHabitDetailResult: {
  data: unknown
  isPending: boolean
  error: unknown
} = { data: null, isPending: false, error: null }

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
}))

vi.mock('@/components/ui/sheet', async () =>
  await import('@/__tests__/support/sheet-double'),
)

vi.mock('react-hook-form', () => ({
  useWatch: (args: { name: string }) => useWatchMock(args),
}))

vi.mock('@/hooks/use-habit-queries', () => ({ useHabits: () => ({ data: undefined, isSuccess: false, isFetching: false, isError: false }) }))
vi.mock('@/hooks/use-config', async () => { const { DEFAULT_CONFIG } = await import('@orbit/shared/types/config'); return { useConfig: () => ({ config: DEFAULT_CONFIG }) } })

vi.mock('@/hooks/use-habits', () => ({
  useUpdateHabit: () => ({
    mutateAsync: mockUpdateMutateAsync,
    isPending: false,
  }),
  useHabitDetail: () => ({ ...mockHabitDetailResult, refetch: vi.fn().mockResolvedValue(undefined) }),
}))

vi.mock('@/hooks/use-tags', () => ({
  useAssignTags: () => ({
    mutateAsync: mockAssignTagsMutateAsync,
    isPending: false,
  }),
}))

vi.mock('@/hooks/use-habit-suggestion', () => ({
  useHabitSuggestion: () => ({ mutateAsync: mockSuggestMutateAsync, isPending: false }),
}))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({
    showError: mockShowError,
    showSuccess: mockShowSuccess,
    showInfo: mockShowInfo,
  }),
}))

vi.mock('@/hooks/use-dismiss-guard', () => ({
  useDismissGuard: () => ({
    canDismiss: true,
    showDiscardDialog: false,
    requestDismiss: vi.fn(),
    confirmDismiss: vi.fn(),
    cancelDismiss: vi.fn(),
  }),
}))

vi.mock('@/hooks/use-habit-form', () => ({
  useHabitForm: () => ({
    resetModeDrafts: vi.fn(),
    chooseItemType: vi.fn(),
    validationFocusRequest: 0,
    registerDateValidation: () => () => {},
    form: {
      control: {},
      reset: mockFormReset,
      resetField: mockFormResetField,
      getValues: (field?: string) => {
        if (field === 'itemType') return 'habit'
        const values = mockGetValues(field)
        if (field && values && typeof values === 'object' && !Array.isArray(values)) return (values as Record<string, unknown>)[field]
        return values
      },
      trigger: vi.fn().mockResolvedValue(true),
      getFieldState: () => ({ invalid: false, isDirty: false, isTouched: false, isValidating: false, error: undefined }),
      setValue: mockSetValue,
      formState: { isDirty: false, dirtyFields: {} },
    },
    isOneTime: false,
    isGeneral: false,
    isFlexible: false,
    isRecurring: true,
    showDayPicker: false,
    showEndDate: false,
    daysList: [],
    frequencyUnits: [],
    setOneTime: vi.fn(),
    setRecurring: vi.fn(),
    setFlexible: mockSetFlexible,
    setGeneral: vi.fn(),
    toggleDay: vi.fn(),
    validateAll: mockValidateAll,
    clearBackendErrors: vi.fn(),
    reportBackendErrors: vi.fn().mockReturnValue(false),
  }),
}))

vi.mock('@/hooks/use-tag-selection', () => ({
  useTagSelection: () => ({
    selectedTagIds: [],
    resetTags: vi.fn(),
  }),
}))

vi.mock('@/components/habits/habit-form-fields', () => ({
  HabitFormFields: (props: { children?: React.ReactNode }) =>
    React.createElement('HabitFormFields', props, props.children),
}))

vi.mock('@/components/ui/pill-button', () => ({
  PillButton: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) =>
    React.createElement('PillButton', props, children),
}))

vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: () => null,
}))

vi.mock('@/lib/habit-request-builders', () => ({
  buildUpdateHabitRequest: mockBuildUpdateHabitRequest,
}))

function findSaveButton(tree: {
  root: { findAll: (predicate: (node: any) => boolean) => any[] }
}) {
  return tree.root
    .findAll((node: any) => node.type === 'PillButton')
    .find((node: any) => node.props.children === 'common.save')
}

function findFieldsWrapper(tree: {
  root: { findAll: (predicate: (node: any) => boolean) => any[] }
}) {
  return tree.root.findAll(
    (node: any) => typeof node.props?.pointerEvents === 'string',
  )[0]
}

async function renderModal(relationshipFieldsLoaded = true, onClose = vi.fn()) {
  const habit = createMockHabit({ id: 'h-1', title: 'Exercise' })
  let tree: any
  await TestRenderer.act(() => {
    tree = TestRenderer.create(
      <TestEditor open onClose={onClose} habit={habit} relationshipFieldsLoaded={relationshipFieldsLoaded} />,
    )
  })
  return tree
}

describe('EditHabitModal (mobile)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHabitDetailResult = { data: null, isPending: false, error: null }
    mockValidateAll.mockReturnValue(null)
    mockGetValues.mockImplementation((..._args: unknown[]): unknown => ({
      title: 'Exercise',
      description: '',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      days: [],
      isBadHabit: false,
      isGeneral: false,
      isFlexible: false,
      dueDate: '2025-01-01',
      dueTime: '',
      dueEndTime: '',
      endDate: '',
      reminderEnabled: false,
      scheduledReminders: [],
      slipAlertEnabled: false,
      checklistItems: [],
    }))
    mockUpdateMutateAsync.mockResolvedValue({})
    useWatchMock.mockImplementation(({ name }: { name: string }) =>
      name === 'title' ? 'Exercise' : undefined,
    )
  })

  afterEach(() => {
    sheetTestControls.defer(false)
  })

  const findFormFields = (tree: {
    root: { findAll: (predicate: (node: any) => boolean) => any[] }
  }) => tree.root.findAll((node: any) => node.type === 'HabitFormFields')[0]

  it('prefills an existing habit with the suggestion while retaining its identity', async () => {
    const habit = createMockHabit({ id: 'h-1', title: 'Exercise' })
    let tree: ReturnType<typeof TestRenderer.create>
    await TestRenderer.act(() => { tree = TestRenderer.create(<TestEditor open onClose={vi.fn()} habit={habit} initialSuggestion={{ ...habitSuggestionDraftFixture, existingHabitId: habit.id }} />) })
    expect(mockFormReset).toHaveBeenCalledWith(expect.objectContaining({ title: 'Read', itemType: 'habit', dueTime: '22:00', dueEndTime: '22:15' }))
    await TestRenderer.act(() => tree.unmount())
  })

  it('routes to upgrade only after the sheet dismisses', async () => {
    const onClose = vi.fn()
    sheetTestControls.defer(true)
    const tree = await renderModal(true, onClose)

    TestRenderer.act(() => {
      findFormFields(tree).props.onUpgrade()
    })

    expect(sheetTestControls.isDismissPending).toBe(true)
    expect(onClose).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()

    TestRenderer.act(() => {
      sheetTestControls.completeDismissal()
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith('/upgrade')
    expect(mockPush).toHaveBeenCalledTimes(1)
  })

  it('pins Cancel and Save in the sheet footer, never in the scrolling body', async () => {
    const tree = await renderModal()

    expect(sheetSlotButtons(tree.root, 'SheetActions')).toEqual(['common.cancel', 'common.save'])
    expectSmallSheetActions(tree.root)
    expect(sheetSlotButtons(tree.root, 'SheetBody')).toEqual([])
  })

  it('blocks the fields and disables save while the habit detail is loading', async () => {
    mockHabitDetailResult = { data: null, isPending: true, error: null }
    const tree = await renderModal()

    const wrapper = findFieldsWrapper(tree)
    expect(wrapper.props.pointerEvents).toBe('none')
    expect(findSaveButton(tree)?.props.disabled).toBe(true)
  })

  it('enables the fields and save once the habit detail has loaded', async () => {
    const tree = await renderModal()

    const wrapper = findFieldsWrapper(tree)
    expect(wrapper.props.pointerEvents).toBe('auto')
    expect(findSaveButton(tree)?.props.disabled).toBe(false)
  })

  it.each([
    ['2026-08-28', '2026-08-28'],
    [undefined, '2026-08-29T00:30:00Z'],
  ])('passes API start date %s to the edit form with legacy timestamp compatibility', async (startDate, expected) => {
    const habit = createMockHabit({ startDate, createdAtUtc: '2026-08-29T00:30:00Z' })
    let tree!: import('react-test-renderer').ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(<TestEditor open onClose={vi.fn()} habit={habit} />)
    })

    expect(findFormFields(tree).props.startDate).toBe(expected)
    await TestRenderer.act(() => tree.update(<></>))
  })

  it('saves tags in the single ordinary update', async () => {
    const tree = await renderModal()
    await TestRenderer.act(async () => { await findSaveButton(tree)?.props.onClick() })
    expect(mockUpdateMutateAsync.mock.calls[0]![0].data.tagIds).toEqual([])
    expect(mockAssignTagsMutateAsync).not.toHaveBeenCalled()
  })

  it('sends the goal list from the explicit goal action', async () => {
    const tree = await renderModal()

    await TestRenderer.act(() => {
      findFormFields(tree).props.onToggleGoal('goal-1')
    })
    await TestRenderer.act(async () => {
      await findSaveButton(tree)?.props.onClick()
    })

    expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
      habitId: 'h-1',
      data: { goalIds: ['goal-1'], tagIds: [] },
    })
  })

  it('omits relationship writes when an unrelated field is saved before authority loads', async () => {
    mockBuildUpdateHabitRequest.mockReturnValueOnce({
      title: 'Exercise daily',
      goalIds: [],
      slipAlertEnabled: false,
    })
    const tree = await renderModal(false)

    await TestRenderer.act(async () => {
      await findSaveButton(tree)?.props.onClick()
    })

    expect(mockUpdateMutateAsync.mock.calls[0]![0].data).toEqual({ title: 'Exercise daily' })
    expect(mockAssignTagsMutateAsync).not.toHaveBeenCalled()
  })

  it('replays a pre-authority goal action onto authoritative goals', async () => {
    const initialHabit = createMockHabit({ id: 'h-1', title: 'Exercise', linkedGoals: [] })
    let tree: any
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <TestEditor
          open
          onClose={vi.fn()}
          habit={initialHabit}
          relationshipFieldsLoaded={false}
        />,
      )
    })
    await TestRenderer.act(() => {
      findFormFields(tree).props.onToggleGoal('goal-2')
    })
    await TestRenderer.act(() => {
      tree.update(
        <TestEditor
          open
          onClose={vi.fn()}
          habit={createMockHabit({
            id: 'h-1',
            title: 'Exercise',
            linkedGoals: [{ id: 'goal-1', title: 'Feel better' }],
          })}
          relationshipFieldsLoaded
        />,
      )
    })
    expect(findFormFields(tree).props.selectedGoalIds).toEqual(['goal-1', 'goal-2'])
    await TestRenderer.act(async () => {
      await findSaveButton(tree)?.props.onClick()
    })

    expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
      habitId: 'h-1',
      data: { goalIds: ['goal-1', 'goal-2'], tagIds: [] },
    })
  })

  it('resets the form from the habit when it opens', async () => {
    await renderModal()
    expect(mockFormReset).toHaveBeenCalled()
  })

  it.each(['', '   '])('does not request an emoji for an empty title %j', async (title) => {
    mockGetValues.mockImplementation((field: unknown) => field === 'title' ? title : undefined)
    const tree = await renderModal()
    mockSetValue.mockClear()
    await TestRenderer.act(async () => { await tree.root.findAll((node: { type: unknown }) => node.type === 'HabitFormFields')[0]!.props.onSuggestEmoji!() })
    expect(mockSuggestMutateAsync).not.toHaveBeenCalled()
    expect(mockSetValue).not.toHaveBeenCalled()
  })

  it.each([
    [new Error('offline'), 'habits.form.aiSuggestError'],
    [{ data: { errorCode: 'PAY_GATE' } }, 'habits.form.aiSuggestLimitReached'],
  ])('reports an emoji request failure and preserves the draft', async (failure, message) => {
    mockGetValues.mockImplementation((field: unknown) => field === 'title' ? 'Swim' : undefined)
    mockSuggestMutateAsync.mockRejectedValue(failure)
    const tree = await renderModal()
    mockSetValue.mockClear()
    await TestRenderer.act(async () => { await tree.root.findAll((node: { type: unknown }) => node.type === 'HabitFormFields')[0]!.props.onSuggestEmoji!() })
    expect(mockShowError).toHaveBeenCalledWith(message)
    expect(mockSetValue).not.toHaveBeenCalled()
  })

  it.each(['🏊', null])('requests only an emoji and preserves every other entered habit field: %s', async (emoji) => {
    mockGetValues.mockImplementation((field?: unknown) => {
      if (field === 'title') return 'Swim'
      if (field === 'checklistItems') return []
      if (field === 'frequencyUnit') return 'Week'
      if (field === 'frequencyQuantity') return 1
      if (field === 'days') return []
      return {}
    })
    mockSuggestMutateAsync.mockResolvedValue({
      emoji,
      frequencyUnit: 'Week',
      frequencyQuantity: 1,
      days: [],
      isFlexible: true,
      flexibleTarget: 3,
      dueTime: '07:00',
      subHabits: [],
      checklistItems: ['Towel', 'Goggles'],
    })

    const tree = await renderModal()
    mockSetValue.mockClear()
    mockSetFlexible.mockClear()

    await TestRenderer.act(async () => {
      await findFormFields(tree).props.onSuggestEmoji()
    })

    expect(mockSetValue.mock.calls).toEqual(emoji ? [['emoji', emoji, { shouldDirty: true }]] : [])
    expect(mockSetFlexible).not.toHaveBeenCalled()
  })

  it('applies emoji, schedule, and a checklist from an AI suggestion in edit mode', async () => {
    mockGetValues.mockImplementation((field?: unknown) => {
      if (field === 'title') return 'Swim'
      if (field === 'checklistItems') return []
      if (field === 'frequencyUnit') return 'Week'
      if (field === 'frequencyQuantity') return 1
      if (field === 'days') return []
      return {}
    })
    mockSuggestMutateAsync.mockResolvedValue({
      emoji: '🏊',
      frequencyUnit: 'Week',
      frequencyQuantity: 1,
      days: [],
      isFlexible: true,
      flexibleTarget: 3,
      dueTime: '07:00',
      subHabits: [],
      checklistItems: ['Towel', 'Goggles'],
    })

    const tree = await renderModal()
    mockSetValue.mockClear()
    mockSetFlexible.mockClear()

    await TestRenderer.act(async () => {
      await findFormFields(tree).props.onSuggestSetup()
    })

    expect(mockSetFlexible).toHaveBeenCalled()
    expect(mockSetValue).toHaveBeenCalledWith('emoji', '🏊', { shouldDirty: true })
    expect(mockSetValue).toHaveBeenCalledWith('dueTime', '07:00', {
      shouldDirty: true,
    })
    expect(mockSetValue).toHaveBeenCalledWith(
      'checklistItems',
      [
        { text: 'Towel', isChecked: false },
        { text: 'Goggles', isChecked: false },
      ],
      { shouldDirty: true },
    )
    expect(mockShowSuccess).toHaveBeenCalledWith('habits.form.aiSuggestApplied')
  })

  it('ignores a pending emoji suggestion after the title changes', async () => {
    let title = 'Swim'
    let resolveSuggestion!: (suggestion: HabitSetupSuggestion) => void
    mockGetValues.mockImplementation((field?: unknown) => {
      if (field === 'title') return title
      if (field === 'checklistItems') return []
      return undefined
    })
    mockSuggestMutateAsync.mockImplementation(() => new Promise<HabitSetupSuggestion>((resolve) => {
      resolveSuggestion = resolve
    }))

    const tree = await renderModal()
    const formFields = findFormFields(tree)
    let proposalPromise!: Promise<HabitFormProposal | null>
    TestRenderer.act(() => {
      proposalPromise = formFields.props.onSuggestEmoji()
    })
    expect(mockSuggestMutateAsync).toHaveBeenCalledOnce()
    mockSetValue.mockClear()
    mockSetFlexible.mockClear()

    title = 'Cycle'
    TestRenderer.act(() => formFields.props.onSuggestionContextChange())

    let proposal: HabitFormProposal | null | undefined
    await TestRenderer.act(async () => {
      resolveSuggestion({
        emoji: '🏊',
        frequencyUnit: 'Week',
        frequencyQuantity: 2,
        days: [],
        isFlexible: true,
        flexibleTarget: 2,
        dueTime: '07:00',
        subHabits: [],
        checklistItems: ['Old checklist'],
      })
      proposal = await proposalPromise
    })

    expect(proposal).toBeNull()
    expect(mockSetFlexible).not.toHaveBeenCalled()
    expect(mockSetValue).not.toHaveBeenCalled()
    expect(mockShowSuccess).not.toHaveBeenCalled()
    expect(mockShowInfo).not.toHaveBeenCalled()
  })

  it('ignores a pending Astra suggestion after the title changes', async () => {
    let title = 'Swim'
    let resolveSuggestion!: (suggestion: HabitSetupSuggestion) => void
    mockGetValues.mockImplementation((field?: unknown) => {
      if (field === 'title') return title
      if (field === 'checklistItems') return []
      return undefined
    })
    mockSuggestMutateAsync.mockImplementation(() => new Promise<HabitSetupSuggestion>((resolve) => {
      resolveSuggestion = resolve
    }))

    const tree = await renderModal()
    const formFields = findFormFields(tree)
    let proposalPromise!: Promise<HabitFormProposal | null>
    TestRenderer.act(() => {
      proposalPromise = formFields.props.onSuggestSetup()
    })
    expect(mockSuggestMutateAsync).toHaveBeenCalledOnce()
    mockSetValue.mockClear()
    mockSetFlexible.mockClear()

    title = 'Cycle'
    TestRenderer.act(() => formFields.props.onSuggestionContextChange())

    let proposal: HabitFormProposal | null | undefined
    await TestRenderer.act(async () => {
      resolveSuggestion({
        emoji: '🏊',
        frequencyUnit: 'Week',
        frequencyQuantity: 2,
        days: [],
        isFlexible: true,
        flexibleTarget: 2,
        dueTime: '07:00',
        subHabits: [],
        checklistItems: ['Old checklist'],
      })
      proposal = await proposalPromise
    })

    expect(proposal).toBeNull()
    expect(mockSetFlexible).not.toHaveBeenCalled()
    expect(mockSetValue).not.toHaveBeenCalled()
    expect(mockShowSuccess).not.toHaveBeenCalled()
    expect(mockShowInfo).not.toHaveBeenCalled()
  })

  it('shows the empty toast when the AI suggestion applies nothing', async () => {
    mockGetValues.mockImplementation((field?: unknown) => {
      if (field === 'title') return 'Swim'
      if (field === 'checklistItems') return []
      if (field === 'frequencyUnit') return 'Week'
      if (field === 'frequencyQuantity') return 1
      if (field === 'days') return []
      return {}
    })
    mockSuggestMutateAsync.mockResolvedValue({
      emoji: null,
      frequencyUnit: 'Week',
      frequencyQuantity: 1,
      days: [],
      isFlexible: false,
      flexibleTarget: null,
      dueTime: null,
      subHabits: [],
      checklistItems: [],
    })

    const tree = await renderModal()

    await TestRenderer.act(async () => {
      await findFormFields(tree).props.onSuggestSetup()
    })

    expect(mockShowInfo).toHaveBeenCalledWith('habits.form.aiSuggestEmpty')
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })

  it('shows the limit-reached toast when the suggestion hits the pay gate', async () => {
    mockGetValues.mockImplementation((field?: unknown) =>
      field === 'title' ? 'Swim' : {},
    )
    mockSuggestMutateAsync.mockRejectedValue({ data: { errorCode: 'PAY_GATE' } })

    const tree = await renderModal()

    await TestRenderer.act(async () => {
      await findFormFields(tree).props.onSuggestSetup()
    })

    expect(mockShowError).toHaveBeenCalledWith('habits.form.aiSuggestLimitReached')
  })

  it('applies a recurring cadence with weekdays from an AI suggestion in edit mode', async () => {
    mockGetValues.mockImplementation((field?: unknown) => {
      if (field === 'title') return 'Walk'
      if (field === 'checklistItems') return []
      return {}
    })
    mockSuggestMutateAsync.mockResolvedValue({
      emoji: '🚶',
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      days: ['Monday', 'Wednesday'],
      isFlexible: false,
      flexibleTarget: null,
      dueTime: '08:00',
      subHabits: [],
      checklistItems: [],
    })

    const tree = await renderModal()
    mockSetValue.mockClear()

    await TestRenderer.act(async () => {
      await findFormFields(tree).props.onSuggestSetup()
    })

    expect(mockSetValue).toHaveBeenCalledWith('days', ['Monday', 'Wednesday'], {
      shouldDirty: true,
    })
    expect(mockSetValue).toHaveBeenCalledWith('dueTime', '08:00', {
      shouldDirty: true,
    })
    expect(mockShowSuccess).toHaveBeenCalledWith('habits.form.aiSuggestApplied')
  })

it('ignores the result of a Save after its habit draft has been replaced', async () => {
  let finish!: () => void
  mockUpdateMutateAsync.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
  const onSaved = vi.fn()
  const onClose = vi.fn()
  const first = createMockHabit({ id: 'first', frequencyUnit: 'Day' })
  let tree!: import('react-test-renderer').ReactTestRenderer
  await TestRenderer.act(() => { tree = TestRenderer.create(<TestEditor open habit={first} onClose={onClose} onSaved={onSaved} />) })
  await TestRenderer.act(async () => { findSaveButton(tree)?.props.onClick(); await Promise.resolve() })
  expect(finish).toBeDefined()
  await TestRenderer.act(() => tree.update(<TestEditor open habit={{ ...first, id: 'second' }} onClose={onClose} onSaved={onSaved} />))
  await TestRenderer.act(() => { finish() })
  expect(onClose).not.toHaveBeenCalled()
  expect(onSaved).not.toHaveBeenCalled()
  await TestRenderer.act(() => tree.update(<></>))
})

})
