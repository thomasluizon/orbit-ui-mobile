import { QueryClient, QueryObserver, onlineManager } from '@tanstack/react-query'
import { goalKeys } from '@orbit/shared/query'
import { MAX_GOAL_PROGRESS_NOTE_LENGTH } from '@orbit/shared/validation'
import { personalText } from '@/__tests__/support/personal-text'
import { buildComposerChips } from '@orbit/shared/chat'
import { createMockGoal, createMockProfile } from '@orbit/shared/__tests__/factories'
import type { GoalDetailWithMetrics } from '@orbit/shared/types/goal'
import { updateGoalProgressDetail } from '@orbit/shared/utils'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, renderHook, screen, fireEvent, waitFor } from '@testing-library/react'
import { useGoalProgressEntry } from '@/hooks/use-goal-progress-entry'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { useAppToastStore } from '@/stores/app-toast-store'

const nextIntl = vi.hoisted(() => ({ locale: 'en' }))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`
    return key
  },
  useLocale: () => nextIntl.locale,
}))

vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}))

const listGoal = createMockGoal({ id: '1', title: 'Read 12 books', currentValue: 3, targetValue: 12, unit: 'books', progressPercentage: 25 })

let detailGoal: GoalDetailWithMetrics['goal'] = { ...listGoal, progressHistory: [] }
let habitAdherence: GoalDetailWithMetrics['metrics']['habitAdherence'] = []
let forecastMetrics: Pick<GoalDetailWithMetrics['metrics'], 'velocityPerDay' | 'projectedCompletionDate' | 'daysToDeadline' | 'trackingStatus'> = { velocityPerDay: 0, projectedCompletionDate: null, daysToDeadline: null, trackingStatus: 'no_deadline' }
let detailLoading = false
let detailLoadError = false
let detailAvailable = true
let listAvailable = true
const refetchDetail = vi.fn()
const updateStatusMutateAsync = vi.fn()
const updateProgressMutateAsync = vi.fn()
const deleteMutateAsync = vi.fn()

vi.mock('@/hooks/use-goals', () => ({
  useGoals: () => ({
    data: listAvailable ? {
      allGoals: [listGoal],
      goalsById: new Map([['1', listGoal]]),
    } : undefined,
  }),
  useGoalDetail: (id: string | null) => ({
    data: id && detailAvailable ? { goal: detailGoal, metrics: { progressPercentage: detailGoal.progressPercentage, ...forecastMetrics, habitAdherence } } : null,
    isLoading: detailLoading,
    isError: detailLoadError,
    refetch: refetchDetail,
  }),
  useUpdateGoalProgress: () => ({ mutateAsync: updateProgressMutateAsync, isPending: false, error: null }),
  useUpdateGoalStatus: () => ({
    mutateAsync: updateStatusMutateAsync,
    isPending: false,
    error: null,
  }),
  useDeleteGoal: () => ({ mutateAsync: deleteMutateAsync, isPending: false, error: null }),
}))

const guidedFlag = vi.hoisted(() => ({ on: false, router: { push: vi.fn() } }))
vi.mock('next/navigation', () => ({ useRouter: () => guidedFlag.router }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: createMockProfile({ timeZone: 'UTC' }) }) }))

vi.mock('@/components/goals/edit-goal-modal', () => ({
  EditGoalModal: () => null,
}))

import { GoalDetailDrawer } from '@/components/goals/goal-detail-drawer'

describe('GoalDetailDrawer', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    detailGoal = { ...listGoal, progressHistory: [] }
    habitAdherence = []
    forecastMetrics = { velocityPerDay: 0, projectedCompletionDate: null, daysToDeadline: null, trackingStatus: 'no_deadline' }
    detailLoading = false
    detailLoadError = false
    detailAvailable = true
    listAvailable = true
    refetchDetail.mockClear()
    updateStatusMutateAsync.mockClear()
    updateProgressMutateAsync.mockClear()
    nextIntl.locale = 'en'
    deleteMutateAsync.mockClear()
    useAppToastStore.setState({ currentToast: null, queue: [] })
    useChatStore.setState({ draft: '', draftHydrated: true, contextualSuggestion: null })
    useUIStore.setState({ orbitConversationOpen: false })
  })


  it.each(['Standard', 'Streak'] as const)('shows the producer forecast for a %s goal', (type) => {
    detailGoal = { ...listGoal, type, isProgressDerived: true, deadline: '2025-01-20', linkedHabits: [{ id: 'habit-read', title: 'Read nightly' }], progressHistory: [] }
    forecastMetrics = { velocityPerDay: 0.5, daysToDeadline: 13, projectedCompletionDate: '2025-01-25', trackingStatus: 'on_track' }
    habitAdherence = [{ habitId: 'habit-read', habitTitle: 'Read nightly', weeklyCompletionRate: 75, monthlyCompletionRate: 80, currentStreak: 3 }]
    render(<GoalDetailDrawer inline open onOpenChange={vi.fn()} goalId="1" />)

    expect(screen.getByText('goals.metrics.daysToDeadline').nextElementSibling).toHaveTextContent('13')
    expect(screen.getByText('goals.metrics.velocity').nextElementSibling).toHaveTextContent('goals.metrics.dailyPace:{"value":"0.5","unit":"books"}')
    expect(screen.getByText('goals.metrics.projectedCompletion').nextElementSibling).toHaveTextContent('Jan 25, 2025')
    expect(screen.getByText('goals.metrics.weeklyAdherence:{"percent":"75"}')).toBeInTheDocument()
  })

  it('keeps no-deadline and no-data forecasts explicit', () => {
    detailGoal = { ...listGoal, currentValue: 0, progressPercentage: 0, progressHistory: [] }
    render(<GoalDetailDrawer inline open onOpenChange={vi.fn()} goalId="1" />)
    expect(screen.getByText('goals.metrics.daysToDeadline').nextElementSibling).toHaveTextContent('goals.metrics.noDeadline')
    expect(screen.getByText('goals.metrics.velocity').nextElementSibling).toHaveTextContent('goals.metrics.noData')
    expect(screen.getByText('goals.metrics.projectedCompletion').nextElementSibling).toHaveTextContent('goals.metrics.noData')
    expect(screen.queryByText(/goals.metrics.weeklyAdherence/)).not.toBeInTheDocument()
  })

  it.each([0, -3])('preserves %s deadline days instead of treating them as missing', (daysToDeadline) => {
    detailGoal = { ...listGoal, deadline: daysToDeadline === 0 ? '2025-01-07' : '2025-01-04', progressHistory: [] }
    forecastMetrics = { velocityPerDay: 0.5, projectedCompletionDate: '2025-01-25', daysToDeadline, trackingStatus: daysToDeadline === 0 ? 'at_risk' : 'behind' }
    render(<GoalDetailDrawer inline open onOpenChange={vi.fn()} goalId="1" />)
    expect(screen.getByText('goals.metrics.daysToDeadline').nextElementSibling).toHaveTextContent(String(daysToDeadline))
  })

  it('shows loading and recovers the forecast through the existing retry', () => {
    detailAvailable = false
    detailLoading = true
    const view = render(<GoalDetailDrawer inline open onOpenChange={vi.fn()} goalId="1" />)
    expect(screen.getByRole('progressbar', { name: 'goals.metrics.title' })).toBeInTheDocument()
    expect(screen.queryByText('goals.metrics.velocity')).not.toBeInTheDocument()
    detailLoading = false
    detailLoadError = true
    view.rerender(<GoalDetailDrawer inline open onOpenChange={vi.fn()} goalId="1" />)
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(refetchDetail).toHaveBeenCalledOnce()
    expect(screen.queryByText('goals.metrics.title')).not.toBeInTheDocument()
    detailAvailable = true
    detailLoadError = false
    view.rerender(<GoalDetailDrawer inline open onOpenChange={vi.fn()} goalId="1" />)
    expect(screen.getByText('goals.metrics.velocity')).toBeInTheDocument()
  })

  it.each([
    { status: 'Active', isProgressDerived: true },
    { status: 'Completed', isProgressDerived: false },
    { status: 'Abandoned', isProgressDerived: false },
  ] as const)('blocks manual progress deep links for $status derived=$isProgressDerived', (state) => {
    detailGoal = { ...detailGoal, ...state }
    render(<GoalDetailDrawer inline open initialAction="progress" onOpenChange={vi.fn()} goalId="1" />)
    expect(screen.queryByLabelText('goals.form.progressQuestion')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'common.save' })).not.toBeInTheDocument()
    expect(updateProgressMutateAsync).not.toHaveBeenCalled()
  })

  it('retains the inline progress trigger while the editor is open', async () => {
    render(<GoalDetailDrawer inline open onOpenChange={vi.fn()} goalId="1" />)
    const trigger = screen.getByRole('button', { name: 'goals.updateProgress' })
    trigger.focus()
    fireEvent.click(trigger)
    expect(trigger).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'goals.updateProgress' })).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('keeps the synchronous submission guard locked after success', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const refresh = vi.fn(() => new Promise<void>(() => undefined))
    const { result } = renderHook(() => useGoalProgressEntry(3, 12, save, refresh))
    const submit = result.current.submit
    await act(async () => { expect(await submit()).toBe(true) })
    await act(async () => { expect(await submit()).toBe(false) })
    expect(save).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalledOnce()
    expect(result.current.busy).toBe(true)
  })

  it.each([
    { status: 'Active', isProgressDerived: true },
    { status: 'Completed', isProgressDerived: false },
    { status: 'Abandoned', isProgressDerived: false },
  ] as const)('hides manual entry for $status derived=$isProgressDerived', (state) => {
    detailGoal = { ...detailGoal, ...state }
    render(<GoalDetailDrawer inline open onOpenChange={vi.fn()} goalId="1" />)
    expect(screen.queryByRole('button', { name: 'goals.updateProgress' })).not.toBeInTheDocument()
  })

  it('keeps a dirty manual draft when cancellation is declined', () => {
    render(<GoalDetailDrawer inline open onOpenChange={vi.fn()} goalId="1" />)
    fireEvent.click(screen.getByRole('button', { name: 'goals.updateProgress' }))
    fireEvent.change(screen.getByLabelText('goals.form.progressNoteQuestion'), { target: { value: 'Draft note' } })
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    expect(screen.getByText('common.discardChangesTitle')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'common.keepEditing' }))
    expect(screen.getByLabelText('goals.form.progressNoteQuestion')).toHaveValue('Draft note')
    expect(updateProgressMutateAsync).not.toHaveBeenCalled()
  })

  it('opens the conversation with the selected goal while retaining inline detail for return', () => {
    const onOpenChange = vi.fn()
    detailGoal = { ...detailGoal, title: 'Synced goal' }
    render(<GoalDetailDrawer inline open onOpenChange={onOpenChange} goalId="1" />)
    const orbitAction = screen.getByRole('button', { name: 'goals.detail.askOrbitEyebrow: goals.detail.askOrbitDefault' })
    expect(orbitAction).toHaveTextContent('goals.detail.askOrbitEyebrow')
    fireEvent.click(orbitAction)
    expect(useChatStore.getState().draft).toBe('goals.detail.askOrbitSeedDefault:{"title":"Synced goal"}')
    expect(useUIStore.getState().orbitConversationOpen).toBe(true)
    expect(onOpenChange).not.toHaveBeenCalled()
    act(() => useUIStore.getState().setOrbitConversationOpen(false))
    expect(screen.getByRole('heading', { name: 'Synced goal' })).toBeTruthy()
  })

  it('keeps an existing draft and offers the goal request as a suggestion', () => {
    useChatStore.setState({ draft: 'My unfinished message' })
    render(<GoalDetailDrawer inline open onOpenChange={vi.fn()} goalId="1" />)
    const orbitAction = screen.getByRole('button', { name: 'goals.detail.askOrbitEyebrow: goals.detail.askOrbitDefault' })
    expect(orbitAction).toHaveTextContent('goals.detail.askOrbitEyebrow')
    fireEvent.click(orbitAction)
    expect(useChatStore.getState().draft).toBe('My unfinished message')
    expect(useChatStore.getState().contextualSuggestion).toEqual({
      id: 'goal-detail:1', label: 'nav.orbit',
      prompt: 'goals.detail.askOrbitSeedDefault:{"title":"Read 12 books"}',
    })
    const chips = buildComposerChips({
      surface: 'progress', status: 'success', habits: [], totalHabitCount: 0,
      profile: createMockProfile(), contextualSuggestion: useChatStore.getState().contextualSuggestion,
    })
    expect(chips[0]?.id).toBe('goal-detail:1')
    expect(chips[0]?.prompt).toBe('goals.detail.askOrbitSeedDefault:{"title":"Read 12 books"}')
  })

  it('disables the goal request until the saved draft is hydrated', () => {
    useChatStore.setState({ draftHydrated: false })
    render(<GoalDetailDrawer inline open onOpenChange={vi.fn()} goalId="1" />)
    const action = screen.getByRole('button', { name: 'goals.detail.askOrbitEyebrow: goals.detail.askOrbitDefault' })
    expect(action).toBeDisabled()
    fireEvent.click(action)
    expect(useUIStore.getState().orbitConversationOpen).toBe(false)
    expect(useChatStore.getState().draft).toBe('')
    act(() => useChatStore.setState({ draftHydrated: true }))
    expect(action).toBeEnabled()
  })

  it('offers the cached goal on detail error and no request for an unavailable goal', () => {
    detailLoadError = true
    detailAvailable = false
    const view = render(<GoalDetailDrawer inline open onOpenChange={vi.fn()} goalId="1" />)
    const orbitAction = screen.getByRole('button', { name: 'goals.detail.askOrbitEyebrow: goals.detail.askOrbitDefault' })
    expect(orbitAction).toHaveTextContent('goals.detail.askOrbitEyebrow')
    fireEvent.click(orbitAction)
    expect(useChatStore.getState().draft).toContain('Read 12 books')
    expect(screen.getByText('goals.detail.loadError')).toBeTruthy()
    view.rerender(<GoalDetailDrawer inline open onOpenChange={vi.fn()} goalId="missing" />)
    expect(screen.queryByRole('button', { name: 'goals.detail.askOrbitEyebrow: goals.detail.askOrbitDefault' })).toBeNull()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <GoalDetailDrawer open={false} onOpenChange={vi.fn()} goalId="1" />,
    )
    expect(container.innerHTML).toBe('')
  })
  it('uses the inline goal title as its only page heading', () => {
    render(<GoalDetailDrawer inline open onOpenChange={vi.fn()} goalId="1" />)
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Read 12 books')
    expect(headings[0]).toHaveAttribute('tabindex', '-1')
  })
  it('titles the goal sheet with the goal in the words of the person when the guided flows are on, shows that title once, and keeps the route name on the inline bar', () => {
    guidedFlag.on = true
    try {
      const sheet = render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)
      expect(screen.getByRole('dialog', { name: 'Read 12 books' })).toBeInTheDocument()
      expect(screen.queryByRole('dialog', { name: 'progressScreen.sections.goals' })).toBeNull()
      const shownTitles = screen.getAllByText(personalText('Read 12 books')).filter((element) => !element.closest('.sr-only'))
      expect(shownTitles, 'the body heading is the one goal title the person sees').toHaveLength(1)
      expect(shownTitles[0]!.closest('h1')).not.toBeNull()
      sheet.unmount()
      const inlineWithGoal = render(<GoalDetailDrawer inline open onOpenChange={vi.fn()} goalId="1" />)
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Read 12 books')
      expect(screen.getByText('progressScreen.sections.goals').closest('header'), 'the inline bar keeps the route name').not.toBeNull()
      inlineWithGoal.unmount()
      detailAvailable = false
      render(<GoalDetailDrawer inline open onOpenChange={vi.fn()} goalId="missing" />)
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('progressScreen.sections.goals')
    } finally {
      guidedFlag.on = false
      detailAvailable = true
    }
  })
  it('shows the route name as the guided goal sheet title when a refresh drops the goal while the sheet is open', () => {
    guidedFlag.on = true
    try {
      const view = render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)
      expect(screen.getByRole('dialog', { name: 'Read 12 books' })).toBeInTheDocument()
      detailAvailable = false
      listAvailable = false
      view.rerender(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)
      const dialog = screen.getByRole('dialog', { name: 'progressScreen.sections.goals' })
      expect(dialog.querySelector('.orbit-sheet-title'), 'the header shows a title while the body has no goal heading').toHaveTextContent('progressScreen.sections.goals')
    } finally {
      guidedFlag.on = false
    }
  })
  it('keeps one fallback heading while an inline goal has no data', () => {
    detailAvailable = false
    const view = render(<GoalDetailDrawer inline open onOpenChange={vi.fn()} goalId="missing" />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('progressScreen.sections.goals')
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    detailAvailable = true
    view.rerender(<GoalDetailDrawer inline open onOpenChange={vi.fn()} goalId="1" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Read 12 books' })).toHaveFocus()
  })

  it.each([
    {
      locale: 'en',
      messages: en,
      manual: 'Update progress. Reaching the target completes the goal.',
      updated: 'Progress updated to 4 of 12 books.',
      open: 'This goal reached its target but is still open. Complete it when you are ready.',
    },
    {
      locale: 'pt-BR',
      messages: ptBR,
      manual: 'Atualize o progresso. Ao bater a meta, ela é concluída.',
      updated: 'Progresso atualizado para 4 de 12 livros.',
      open: 'Você bateu esta meta, mas ela continua ativa. Conclua quando quiser.',
    },
  ])('keeps manual completion copy truthful in $locale', async ({ locale, messages, manual, updated, open }) => {
    const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl')
    const translate = createTranslator({ locale, messages })

    expect(translate('goals.detail.manualProgress')).toBe(manual)
    expect(translate('goals.detail.progressUpdated', { current: 4, target: 12, unit: locale === 'en' ? 'books' : 'livros' })).toBe(updated)
    expect(translate('goals.detail.completeWhy')).toBe(open)
  })

  it('retargets the already-mounted detail ring when progress changes', async () => {
    const { rerender } = render(
      <GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />,
    )
    const ring = screen.getByRole('progressbar')
    const sweep = ring.querySelector('circle:last-child')
    await waitFor(() => expect(sweep).toHaveClass('transition-[stroke-dashoffset]'))

    detailGoal = { ...detailGoal, currentValue: 6, progressPercentage: 50 }
    rerender(<GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />)

    expect(screen.getByRole('progressbar')).toBe(ring)
    expect(ring).toHaveAttribute('aria-valuenow', '50')
    expect(ring.querySelector('circle:last-child')).toBe(sweep)
    expect(sweep).toHaveClass('transition-[stroke-dashoffset]')
  })

  it('keeps the linked habits section visible at count zero', () => {
    render(<GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />)

    expect(screen.getByText('goals.linkedHabits')).toBeInTheDocument()
    expect(screen.getByText('goals.noLinkedHabits')).toBeInTheDocument()
  })

  it('opens each linked habit with its own adherence value', () => {
    detailGoal = {
      ...listGoal,
      linkedHabits: [
        { id: 'habit-read', title: 'Read every night' },
        { id: 'habit-stretch', title: 'Stretch' },
      ],
      progressHistory: [],
    }
    habitAdherence = [
      { habitId: 'habit-stretch', habitTitle: 'Stretch', weeklyCompletionRate: 75, monthlyCompletionRate: 80, currentStreak: 4 },
      { habitId: 'habit-read', habitTitle: 'Read every night', weeklyCompletionRate: 90, monthlyCompletionRate: 85, currentStreak: 12 },
    ]

    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)

    const readRow = screen.getByRole('link', { name: 'Read every night, goals.metrics.weeklyAdherence:{"percent":"90"}, goals.detail.linkedHabitStreak:{"count":12}' })
    const stretchRow = screen.getByRole('link', { name: 'Stretch, goals.metrics.weeklyAdherence:{"percent":"75"}, goals.detail.linkedHabitStreak:{"count":4}' })
    expect(readRow.parentElement).toHaveTextContent('goals.detail.linkedHabitStreak:{"count":12}')
    expect(stretchRow.parentElement).toHaveTextContent('goals.detail.linkedHabitStreak:{"count":4}')
    expect(readRow).toHaveAttribute('href', '/habits/habit-read')
    expect(stretchRow).toHaveAttribute('href', '/habits/habit-stretch')
  })

  it('passes linked habit link activations to its modal owner', () => {
    detailGoal = {
      ...listGoal,
      linkedHabits: [{ id: 'habit-read', title: 'Read every night' }],
      progressHistory: [],
    }
    const onLinkedHabitNavigate = vi.fn()

    render(
      <GoalDetailDrawer
        open
        onOpenChange={vi.fn()}
        onLinkedHabitNavigate={onLinkedHabitNavigate}
        goalId="1"
      />,
    )

    fireEvent.click(screen.getByRole('link', { name: 'Read every night' }))

    expect(onLinkedHabitNavigate).toHaveBeenCalledOnce()
    expect(onLinkedHabitNavigate.mock.calls[0]?.[0]).toBe('habit-read')
  })

  it('keeps inline linked habit navigation native without closing the detail', () => {
    detailGoal = {
      ...listGoal,
      linkedHabits: [{ id: 'habit-read', title: 'Read every night' }],
      progressHistory: [],
    }
    const onOpenChange = vi.fn()

    render(<GoalDetailDrawer inline open onOpenChange={onOpenChange} goalId="1" />)

    expect(screen.getByRole('link', { name: 'Read every night' })).toHaveAttribute('href', '/habits/habit-read')
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('composes footer actions from canonical ListRow controls', () => {
    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)

    for (const label of ['goals.detail.edit', 'goals.detail.markAbandoned', 'goals.detail.delete']) {
      expect(screen.getByRole('button', { name: label })).toHaveClass('orbit-list-row-body')
    }
  })



  it('does not offer or submit manual progress for a derived goal', () => {
    detailGoal = {
      ...listGoal,
      isProgressDerived: true,
      progressHistory: [],
    }

    render(
      <GoalDetailDrawer
        open={true}
        onOpenChange={vi.fn()}
        goalId="1"
        initialAction="progress"
      />,
    )

    expect(
      screen.queryByRole('button', { name: 'goals.updateProgress' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'common.save' }),
    ).not.toBeInTheDocument()
    expect(updateProgressMutateAsync).not.toHaveBeenCalled()
  })

  it('offers a retry action when the detail fetch fails', () => {
    detailLoadError = true
    render(
      <GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />,
    )
    expect(document.body.textContent).toContain('goals.detail.loadError')
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(refetchDetail).toHaveBeenCalledTimes(1)
  })

  it('abandons an active goal from the action footer', () => {
    render(<GoalDetailDrawer open={true} onOpenChange={vi.fn()} goalId="1" />)

    fireEvent.click(screen.getByRole('button', { name: 'goals.detail.markAbandoned' }))

    expect(updateStatusMutateAsync).toHaveBeenCalledWith({
      goalId: '1',
      data: { status: 'Abandoned' },
      goalName: 'Read 12 books',
    })
  })






  it.each(['Standard', 'Streak'] as const)('stage 5 names derived progress for %s and hides steppers', (type) => {
    detailGoal = { ...listGoal, type, isProgressDerived: true, linkedHabits: [{ id: 'h1', title: 'Read nightly' }], progressHistory: [] }
    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)
    expect(document.body.textContent).toContain('goals.detail.derived')
    const label = 'goals.detail.increase'
    expect(screen.queryByRole('button', { name: label })).toBeFalsy()
    expect(updateProgressMutateAsync).not.toHaveBeenCalled()
  })

  it.each([false, undefined])('stage 5 steps manual progress when derived is %s', (isProgressDerived) => {
    detailGoal = { ...listGoal, type: 'Streak', isProgressDerived, progressHistory: [] }
    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)
    expect(document.body.textContent).toContain('goals.detail.manualProgress')
    const label = 'goals.detail.increase'
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(updateProgressMutateAsync).toHaveBeenCalledWith({
      goalId: '1',
      data: { currentValue: 4 },
      goalName: listGoal.title,
      goalCount: listGoal.targetValue,
      goalUnit: listGoal.unit,
    })
  })

  it('announces one successful progress update with the resulting value', async () => {
    nextIntl.locale = 'pt-BR'
    detailGoal = { ...listGoal, currentValue: 0.23456, targetValue: 2.34567, progressPercentage: 10, progressHistory: [] }
    updateProgressMutateAsync.mockResolvedValueOnce(undefined)
    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)

    fireEvent.click(screen.getByRole('button', { name: 'goals.detail.increase' }))

    await waitFor(() => expect(screen.getByText('goals.detail.progressUpdated:{"current":"1,23456","target":"2,34567","unit":"books"}')).toHaveTextContent(
      'goals.detail.progressUpdated:{"current":"1,23456","target":"2,34567","unit":"books"}',
    ))
    expect(screen.getAllByRole('status').filter((region) => region.textContent)).toHaveLength(1)
  })

  it('stage 5 completes a target-reached derived goal with a neutral action and explanation', () => {
    detailGoal = { ...listGoal, currentValue: 12, progressPercentage: 100, isProgressDerived: true, progressHistory: [] }
    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)
    expect(document.body.textContent).toContain('goals.detail.completeWhy')
    const label = 'goals.detail.markCompleted'
    const complete = screen.queryByRole('button', { name: label })
    expect(complete).toBeTruthy()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'goals.progressPercentage:{"pct":100}' })).toHaveAttribute('data-status', 'done')
    expect(screen.getByRole('img', { name: 'goals.progressPercentage:{"pct":100}' })).toHaveStyle({ width: '44px', height: '44px' })
    expect(complete).toHaveAttribute("data-variant", "secondary")
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(updateStatusMutateAsync).toHaveBeenCalledWith({
      goalId: '1',
      data: { status: 'Completed' },
      goalName: listGoal.title,
      goalCount: listGoal.targetValue,
      goalUnit: listGoal.unit,
    })
    expect(updateStatusMutateAsync).toHaveBeenCalledTimes(1)
  })

  it('stage 5 keeps unfinished goal progress at 60px', () => {
    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)

    expect(screen.getByRole('progressbar')).toHaveAttribute('width', '60')
    expect(screen.getByRole('progressbar')).toHaveAttribute('height', '60')
  })

  it('stage 5 completes a target-reached manual goal with one neutral action and explanation', () => {
    detailGoal = { ...listGoal, currentValue: 12, progressPercentage: 100, isProgressDerived: false, progressHistory: [] }
    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)

    const completions = screen.queryAllByRole('button', { name: 'goals.detail.markCompleted' })
    expect(completions).toHaveLength(1)
    const complete = screen.getByRole('button', { name: 'goals.detail.markCompleted' })
    expect(complete).toHaveAttribute('data-variant', 'secondary')
    expect(document.body.textContent).toContain('goals.detail.manualProgress')
    expect(document.body.textContent).toContain('goals.detail.completeWhy')
    fireEvent.click(complete)
    expect(updateStatusMutateAsync).toHaveBeenCalledWith({
      goalId: '1',
      data: { status: 'Completed' },
      goalName: listGoal.title,
      goalCount: listGoal.targetValue,
      goalUnit: listGoal.unit,
    })
    expect(updateStatusMutateAsync).toHaveBeenCalledTimes(1)
  })

  it.each([
    { name: 'manual below target', status: 'Active', progressPercentage: 92, isProgressDerived: false },
    { name: 'derived below target', status: 'Active', progressPercentage: 92, isProgressDerived: true },
    { name: 'completed', status: 'Completed', progressPercentage: 100, isProgressDerived: false },
    { name: 'abandoned', status: 'Abandoned', progressPercentage: 100, isProgressDerived: false },
  ] as const)('stage 5 hides completion for $name goals', ({ status, progressPercentage, isProgressDerived }) => {
    detailGoal = { ...listGoal, status, progressPercentage, isProgressDerived, progressHistory: [] }
    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)

    expect(screen.queryByRole('button', { name: 'goals.detail.markCompleted' })).not.toBeInTheDocument()
  })

  it.each(['Active', 'Completed'] as const)('stage 5 never reopens a %s goal', (status) => {
    detailGoal = { ...listGoal, status, progressHistory: [] }
    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)
    const label = 'goals.detail.reactivate'
    expect(screen.queryByRole('button', { name: label })).toBeFalsy()
    expect(document.body.textContent).not.toContain('goals.detail.markCompleted')
  })

  it('stage 5 removes the figure and ring from an abandoned goal', () => {
    detailGoal = { ...listGoal, status: 'Abandoned', progressHistory: [] }
    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)
    expect(document.body.textContent).not.toContain('"current":3')
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
    const label = 'goals.detail.reactivate'
    expect(screen.queryByRole('button', { name: label })).toBeTruthy()
  })

  it('stage 5 shows capacity and the newest three history rows before expanding', () => {
    detailGoal = { ...listGoal, linkedHabits: Array.from({ length: 20 }, (_, index) => ({ id: String(index), title: `Habit ${index}` })), progressHistory: [4, 3, 2, 1].map(value => ({ createdAtUtc: `2026-09-0${value}T00:00:00Z`, previousValue: value - 1, value, note: `entry-${value}` })) }
    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)
    const content = document.body.textContent
    expect(content).toContain('goals.detail.linkedLimit')
    expect(content.indexOf('goals.linkedHabits')).toBeLessThan(content.indexOf('goals.detail.linkedLimit'))
    expect(document.body.textContent).toContain('entry-4')
    expect(document.body.textContent).not.toContain('entry-1')
    let label = 'goals.detail.showAllHistory:{"count":4}'
    const showAllButton = screen.getByRole('button', { name: label })
    const historyId = showAllButton.getAttribute('aria-controls')
    expect(historyId).toBeTruthy()
    expect(document.getElementById(historyId!)?.tagName).toBe('UL')
    fireEvent.click(showAllButton)
    expect(document.body.textContent).toContain('entry-1')
    label = 'goals.detail.showLessHistory'
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(document.body.textContent).not.toContain('entry-1')
  })

  it('stage 5 renders localized history dates, signed deltas, and current over target in three columns', () => {
    detailGoal = {
      ...listGoal,
      targetValue: 0.0002,
      progressHistory: [
        { createdAtUtc: '2026-09-04T12:34:00Z', previousValue: 0, value: 0.0001, note: 'positive' },
        { createdAtUtc: '2026-09-03T12:34:00Z', previousValue: 0.0002, value: 0.0001, note: 'negative' },
        { createdAtUtc: '2026-09-02T12:34:00Z', previousValue: 0.0001, value: 0.0001, note: 'zero' },
      ],
    }

    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)

    expect(screen.getByText('+0.0001')).toBeInTheDocument()
    expect(screen.getByText('-0.0001')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getAllByText('0.0001 / 0.0002')).toHaveLength(3)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(document.querySelectorAll('[data-history-date]')).toHaveLength(3)
    for (const date of document.querySelectorAll('[data-history-date]')) {
      expect(date.textContent).not.toMatch(/\d:\d/)
    }
  })

  it('rounds decimal history deltas without exposing floating-point noise', () => {
    detailGoal = {
      ...listGoal,
      targetValue: 1.2,
      progressHistory: [
        { createdAtUtc: '2026-09-04T12:34:00Z', previousValue: 0.2, value: 0.3, note: null },
        { createdAtUtc: '2026-09-03T12:34:00Z', previousValue: 1.1, value: 1.2, note: null },
      ],
    }

    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)

    expect(screen.getAllByText('+0.1')).toHaveLength(2)
  })

  it('stage 5 names the goal in deletion confirmation before any write', () => {
    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)
    const label = 'goals.detail.delete'
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(document.body.textContent).toContain('goals.detail.deleteNamed:{"title":"Read 12 books"}')
    expect(deleteMutateAsync).not.toHaveBeenCalled()
  })

  it('sends one delete write for the confirmed goal and keeps the drawer for the result', async () => {
    const onOpenChange = vi.fn()
    deleteMutateAsync.mockResolvedValueOnce(undefined)
    render(<GoalDetailDrawer open onOpenChange={onOpenChange} goalId="1" />)
    fireEvent.click(screen.getByRole('button', { name: 'goals.detail.delete' }))
    expect(deleteMutateAsync).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: 'goals.detail.delete' }).at(-1)!)
    await waitFor(() => expect(deleteMutateAsync).toHaveBeenCalledExactlyOnceWith('1'))
  })

  it('keeps the drawer open and states the failure when a confirmed deletion fails', async () => {
    deleteMutateAsync.mockRejectedValueOnce(new Error('Delete failed'))
    const onOpenChange = vi.fn()
    render(<GoalDetailDrawer open onOpenChange={onOpenChange} goalId="1" />)
    fireEvent.click(screen.getByRole('button', { name: 'goals.detail.delete' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'goals.detail.delete' }).at(-1)!)
    await waitFor(() => expect(JSON.stringify(useAppToastStore.getState())).toContain('goals.errors.delete'))
    expect(deleteMutateAsync).toHaveBeenCalledExactlyOnceWith('1')
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveAttribute('data-open')
  })

  it('opens an accepted progress deep link after the goal finishes loading', () => {
    detailAvailable = false
    listAvailable = false
    const view = render(<GoalDetailDrawer inline open initialAction="progress" onOpenChange={vi.fn()} goalId="1" />)
    expect(screen.queryAllByLabelText('goals.form.progressQuestion')).toHaveLength(0)
    detailAvailable = true
    view.rerender(<GoalDetailDrawer inline open initialAction="progress" onOpenChange={vi.fn()} goalId="1" />)
    expect(screen.getAllByLabelText('goals.form.progressQuestion').find((node) => node.tagName === 'INPUT')).toHaveValue('3')
  })

  it('stage 5 bounds the stepper and blocks duplicate pending writes', async () => {
    detailGoal = { ...listGoal, currentValue: 0, progressPercentage: 0, progressHistory: [] }
    let resolve: () => void = () => {}
    updateProgressMutateAsync.mockImplementationOnce(() => new Promise<void>(done => { resolve = done }))
    render(<GoalDetailDrawer open onOpenChange={vi.fn()} goalId="1" />)
    expect(screen.getByRole('button', { name: 'goals.detail.decrease' })).toBeDisabled()
    const increase = screen.getByRole('button', { name: 'goals.detail.increase' })
    fireEvent.click(increase)
    fireEvent.click(increase)
    expect(updateProgressMutateAsync).toHaveBeenCalledTimes(1)
    expect(increase).toBeDisabled()
    resolve()
    await waitFor(() => expect(increase).not.toBeDisabled())
  })

  it('stage 5 focuses inline detail and restores the opening control on back', async () => {
    function Host() {
      const [open, setOpen] = React.useState(false)
      return <><button onClick={() => setOpen(true)}>Open goal</button>{open ? <GoalDetailDrawer inline open onOpenChange={setOpen} goalId="1" /> : null}</>
    }
    render(<Host />)
    const trigger = screen.getByRole('button', { name: 'Open goal' })
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole('heading', { level: 1, name: 'Read 12 books' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'common.back' }))
    await waitFor(() => expect(trigger).toHaveFocus())
  })

})
