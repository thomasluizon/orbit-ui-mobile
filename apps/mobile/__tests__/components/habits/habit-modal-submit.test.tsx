import React from 'react'
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { ActivityIndicator } from 'react-native'
import { __setFocusImpl } from '@/test-mocks/react-native'

const mutation = vi.hoisted(() => vi.fn())
const showError = vi.hoisted(() => vi.fn())
const habit = createMockHabit({ title: 'Walk every day' })

vi.mock('@/hooks/use-habits', () => ({
  useCreateHabit: () => useMutation({ mutationFn: mutation }),
  useCreateSubHabit: () => useMutation({ mutationFn: mutation }),
  useUpdateHabit: () => useMutation({ mutationFn: mutation }),
  useHabitDetail: () => ({ data: null, isPending: false, error: null }),
}))
vi.mock('@/hooks/use-habit-suggestion', () => ({
  useHabitSuggestion: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))
vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => true,
  useProfile: () => ({ profile: { hasProAccess: true, uses24HourClock: true, timeZone: 'UTC' } }),
}))
vi.mock('@/hooks/use-config', () => ({
  useConfig: () => ({ config: { features: { 'habits.subHabits': { enabled: true, planRequirement: 'Pro' } } } }),
}))
vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({ tags: [] }),
  useCreateTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useAssignTags: () => ({ isPending: false, mutateAsync: vi.fn().mockResolvedValue(undefined) }),
}))
vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError, showSuccess: vi.fn(), showInfo: vi.fn() }),
}))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/components/habits/habit-checklist', () => ({ HabitChecklist: () => null }))
vi.mock('@/components/habits/checklist-templates', () => ({ ChecklistTemplates: () => null }))
vi.mock('@/components/habits/goal-linking-field', () => ({ GoalLinkingField: () => null }))
vi.mock('@/components/habits/habit-form-fields/reminder-section', () => ({ ReminderSection: () => null }))
vi.mock('@/components/habits/habit-form-fields/scheduled-reminder-section', () => ({ ScheduledReminderSection: () => null }))
vi.mock('@/components/habits/habit-form-fields/slip-alert-section', () => ({ SlipAlertSection: () => null }))
vi.mock('@/components/ui/time-field', () => ({ TimeField: () => null }))
vi.mock('@/components/ui/date-field', () => ({ DateField: () => null }))
const { act, create } = require('react-test-renderer') as typeof import('react-test-renderer')

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

async function renderSheet(mode: 'create' | 'edit') {
  const onClose = vi.fn()
  let tree!: ReactTestRenderer
  await act(() => { tree = create(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
    {mode === 'create'
      ? <CreateHabitModal open onClose={onClose} />
      : <EditHabitModal open onClose={onClose} habit={habit} />}
  </QueryClientProvider>); return Promise.resolve() })
  const label = mode === 'create' ? 'habits.createHabit' : 'common.save'
  return { onClose, tree, title: tree.root.findAll((node) => (node.type as unknown) === 'TextInput' && node.props.accessibilityLabel === 'habits.form.describe')[0]!, submit: tree.root.findAll((node) => (node.type as unknown) === 'Pressable').find((node) => node.findAll((child) => (child.type as unknown) === 'Text').some((text) => text.props.children === label))! }
}

async function changeTitle(title: ReactTestInstance, value: string) {
  await act(() => {
    (title.props.onChangeText as (value: string) => void)(value)
    return Promise.resolve()
  })
}

async function pressSubmit(submit: ReactTestInstance) {
  await act(() => {
    if (!submit.props.disabled) (submit.props.onPress as (() => void) | undefined)?.()
    return Promise.resolve()
  })
}

function buttonState(button: ReactTestInstance) {
  return button.props.accessibilityState as { disabled: boolean; busy: boolean }
}

async function settleMutation() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
}

describe.each(['create', 'edit'] as const)('habit %s submit', (mode) => {
  beforeEach(() => { vi.resetAllMocks(); __setFocusImpl(() => {}) })

  it.each(['', '   '])('focuses an invalid title and shows its inline error after submit (%j)', async (value) => {
    const focus = vi.fn()
    __setFocusImpl(focus)
    const { title, submit, tree } = await renderSheet(mode)
    await changeTitle(title, value)
    expect(buttonState(submit).disabled).toBe(false)
    await pressSubmit(submit)
    expect(focus).toHaveBeenCalledWith(expect.objectContaining({ accessibilityLabel: 'habits.form.describe' }))
    expect(tree.root.findAll((node) => node.props.accessibilityRole === 'alert')[0]!.props.children).toBe('habits.form.titleRequired')
    expect(title.props.accessibilityHint).toBe('habits.form.titleRequired')
    expect(mutation).not.toHaveBeenCalled()
  })

  it('keeps its label and shows a spinner only while the request runs', async () => {
    let finish!: () => void
    mutation.mockImplementation(() => new Promise((resolve) => { finish = () => resolve(habit) }))
    const { title, submit, onClose, tree } = await renderSheet(mode)
    await changeTitle(title, 'Walk every day')
    await pressSubmit(submit)
    await settleMutation()
    expect(buttonState(submit).busy).toBe(true)
    expect(buttonState(submit).disabled).toBe(true)
    expect(submit.findAll((node) => (node.type as unknown) === 'Text').some((node) => node.props.children === (mode === 'create' ? 'habits.createHabit' : 'common.save'))).toBe(true)
    expect(tree.root.findAll((node) => node.type === ActivityIndicator)[0]).toBeTruthy()
    await pressSubmit(submit)
    expect(mutation).toHaveBeenCalledTimes(1)
    await act(() => Promise.resolve(finish()))
    await settleMutation()
    expect(buttonState(submit).disabled).toBe(false)
    expect(buttonState(submit).busy).toBe(false)
    expect(onClose).toHaveBeenCalled()
  })

  it('allows retry after the request fails', async () => {
    mutation.mockRejectedValue(new Error('offline'))
    const { title, submit, onClose } = await renderSheet(mode)
    await changeTitle(title, 'Walk every day')
    await pressSubmit(submit)
    await settleMutation()
    expect(showError).toHaveBeenCalled()
    await settleMutation()
    expect(buttonState(submit).disabled).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
    mutation.mockResolvedValue(habit)
    await pressSubmit(submit)
    await settleMutation()
    expect(onClose).toHaveBeenCalled()
  })
})