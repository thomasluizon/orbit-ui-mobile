import React from 'react'
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { verificationValidationResponses } from '@orbit/shared/test-support/validation-fixtures'
import { HabitFormFields } from '@/components/habits/habit-form-fields'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { EditHabitModal } from '@/components/habits/edit-habit-modal'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'
import { makeHabitDetail } from '@orbit/shared/test-support/habit-detail-fixtures'
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer'
import { createQueuedAck } from '@/lib/offline-mutations'
import { ActivityIndicator } from 'react-native'
import { advanceAccountGeneration } from '@/lib/session-epoch'
import { __setFocusImpl } from '@/test-mocks/react-native'
import type { HabitSetupSuggestion } from '@orbit/shared/types/habit'

const mutation = vi.hoisted(() => vi.fn())
const suggestionMutation = vi.hoisted(() => vi.fn())
const completion = vi.hoisted(() => vi.fn())
const detailRefetch = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const tagManagement = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), delete: vi.fn(), assign: vi.fn() }))
const showError = vi.hoisted(() => vi.fn())
const showInfo = vi.hoisted(() => vi.fn())
const habit = createMockHabit({ title: 'Walk every day' })
const detailHabit = { ...makeHabitDetail(), title: 'Read', children: [], isGeneral: true, frequencyUnit: null, tags: [], linkedGoals: [], slipAlertEnabled: false, checklistItems: [{ text: 'Pack a bag', isChecked: true }, { text: 'Read a chapter', isChecked: false }] }
vi.mock('@/hooks/use-habit-queries', () => ({
  useHabitDetail: () => ({ data: detailHabit, isLoading: false, isError: false, refetch: vi.fn() }),
  useHabitLogs: () => ({ data: [] }),
  useHabitMetrics: () => ({ data: undefined, isLoading: false, isError: false }),
  useHabits: () => ({ data: { habitsById: new Map(), topLevelHabits: [] }, isLoading: false, isError: false }),
}))
vi.mock('@/hooks/use-reschedule-suggestion', () => ({ useRescheduleSuggestion: () => ({ suggestion: null, error: null }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))


vi.mock('@/hooks/use-habits', () => ({
  useLogHabit: () => ({ mutateAsync: completion }),
  useUpdateChecklist: () => ({ mutateAsync: completion }),
  useDeleteHabit: () => ({ mutateAsync: completion }),
  useCreateHabit: () => useMutation({ mutationFn: mutation }),
  useCreateSubHabit: () => useMutation({ mutationFn: mutation }),
  useUpdateHabit: () => useMutation({ mutationFn: mutation }),
  useHabitDetail: () => ({ data: null, isPending: false, error: null, refetch: detailRefetch }),
}))
vi.mock('@/hooks/use-date-interpretation', () => ({ useDateInterpretation: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/hooks/use-habit-suggestion', () => ({
  useHabitSuggestion: () => ({ isPending: false, mutateAsync: suggestionMutation }),
}))
vi.mock('@/hooks/use-profile', () => ({
  useHasProAccess: () => true,
  useProfile: () => ({ profile: { hasProAccess: true, uses24HourClock: true, timeZone: 'UTC', weekStartDay: 1, language: 'en' } }),
}))
vi.mock('@/hooks/use-config', () => ({
  useConfig: () => ({ config: { features: { 'sub_habits': { enabled: true, planRequirement: 'Pro' } } } }),
}))
vi.mock('@/hooks/use-tags', () => ({ useSuggestTags: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useTags: () => ({ tags: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Reading', color: '#C4530F' }] }),
  useCreateTag: () => ({ isPending: false, mutateAsync: tagManagement.create }),
  useUpdateTag: () => ({ isPending: false, mutateAsync: tagManagement.update }),
  useDeleteTag: () => ({ isPending: false, mutateAsync: tagManagement.delete }),
  useAssignTags: () => ({ isPending: false, mutateAsync: tagManagement.assign }),
}))
vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError, showSuccess: vi.fn(), showInfo }),
}))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.unmock('@/components/ui/date-field')
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn().mockResolvedValue([]) }))
vi.mock('@/hooks/use-reminder-permission', () => ({ useReminderPermission: (_enabled: boolean, toggleReminder: () => void) => ({ toggleReminder, showNotice: false, openSettings: vi.fn() }) }))
vi.mock('@/hooks/use-checklist-templates', () => ({ useChecklistTemplates: () => ({ data: [] }), useCreateChecklistTemplate: () => ({ mutate: vi.fn(), isPending: false }), useDeleteChecklistTemplate: () => ({ mutate: vi.fn(), isPending: false }) }))
const { act, create } = require('react-test-renderer') as typeof import('react-test-renderer')

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }))

vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('expo-router', () => ({ useIsFocused: () => true, useRouter: () => ({ push: vi.fn() }) }))

async function renderSheet(mode: 'create' | 'edit', selectedHabit = habit) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  let tree!: ReactTestRenderer
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const element = (open: boolean) => <QueryClientProvider client={client}>
    {mode === 'create'
      ? <CreateHabitModal open={open} onClose={onClose} initialTitle={habit.title} />
      : <EditHabitModal open={open} onClose={onClose} habit={selectedHabit} onSaved={onSaved} />}
  </QueryClientProvider>
  await act(() => { tree = create(element(true)); return Promise.resolve() })
  if (mode === 'create') await act(() => {
    const choice = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === 'habits.form.typeHabit')[0]!
    ;(choice.props.onPress as () => void)()
    return Promise.resolve()
  })
  const label = mode === 'create' ? 'habits.createHabit' : 'common.save'
  const changeHabit = async (next: typeof selectedHabit) => {
    selectedHabit = next
    await act(() => { tree.update(element(true)); return Promise.resolve() })
  }
  return { onSaved, onClose, tree, changeHabit, setOpen: async (open: boolean) => { await act(() => { tree.update(element(open)); return Promise.resolve() }) }, title: tree.root.findAll((node) => (node.type as unknown) === 'TextInput' && node.props.accessibilityLabel === 'habits.form.describe')[0]!, submit: tree.root.findAll((node) => (node.type as unknown) === 'Pressable').find((node) => node.findAll((child) => (child.type as unknown) === 'Text').some((text) => text.props.children === label))! }
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


  it('discards backend errors and focus requests when a persistent owner opens a matching draft', async () => {
    const messages = verificationValidationResponses.en.errors.Code
    mutation.mockRejectedValue({ errors: { Title: [...messages] } })
    const { title, submit, tree, setOpen } = await renderSheet(mode)
    await changeTitle(title, habit.title)
    await pressSubmit(submit)
    await settleMutation()
    expect(title.props.accessibilityHint).toBe(messages.join('\n'))
    const form = () => tree.root.findAll((node) => node.type === HabitFormFields)[0]!.props.formHelpers as import('@/hooks/use-habit-form').HabitFormHelpers
    expect(form().backendFocusRequest).toBeGreaterThan(0)
    await setOpen(false)
    await setOpen(true)
    const nextTitle = tree.root.findAll((node) => String(node.type) === 'TextInput' && node.props.accessibilityLabel === 'habits.form.describe')[0]!
    expect(nextTitle.props.value).toBe(habit.title)
    expect(nextTitle.props.accessibilityHint).toBeUndefined()
    expect(form().backendFocusRequest).toBe(0)
    expect(form().backendFocusField).toBeUndefined()
    await act(() => { tree.update(<></>); return Promise.resolve() })
  })

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
    const { title, submit, onClose, tree } = await renderSheet(mode)
    await changeTitle(title, 'Walk every day')
    await pressSubmit(submit)
    await settleMutation()
    if (mode === 'edit') expect(tree.root.findAll((node) => String(node.type) === 'Text' && node.props.children === 'habits.form.saveUncertain')).toHaveLength(1)
    else expect(showError).toHaveBeenCalled()
    await settleMutation()
    expect(buttonState(submit).disabled).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
    mutation.mockResolvedValue(habit)
    await pressSubmit(submit)
    await settleMutation()
    expect(onClose).toHaveBeenCalled()
  })
})

describe('habit edit start date', () => {
  beforeEach(() => { vi.resetAllMocks() })

  it.each([
    ['2026-01-01', '2026-01-01'],
    ['2026-08-20', '2026-08-20'],
    ['2026-08-28', '2026-08-28'],
    [undefined, '2026-08-29'],
  ])('shows the API start date %s with legacy timestamp compatibility', async (startDate, expected) => {
    const selectedHabit = { ...habit, startDate, createdAtUtc: '2026-08-29T00:30:00Z' }
    const { tree } = await renderSheet('edit', selectedHabit)
    const form = tree.root.findAll((node) => node.type === HabitFormFields)[0]!.props.formHelpers as import('@/hooks/use-habit-form').HabitFormHelpers
    expect(form.form.getValues('dueDate')).toBe(expected)
    await act(() => { tree.update(<></>); return Promise.resolve() })
  })
})

describe('controlled full editor checklist', () => {
  const editedHabit = createMockHabit({ isGeneral: true, frequencyUnit: null, checklistItems: [{ text: 'Pack a bag', isChecked: true }, { text: 'Read a chapter', isChecked: false }] })
  beforeEach(() => { vi.resetAllMocks() })
  function press(tree: ReactTestRenderer, label: string, index = 0) {
    const control = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === label)[index]!
    void act(() => { (control.props.onPress as () => void)() })
  }
  function inputs(tree: ReactTestRenderer) {
    return tree.root.findAll((node) => String(node.type) === 'TextInput' && node.props.accessibilityLabel === 'habits.form.checklistItemLabel')
  }
  it.each(['habit', 'account'] as const)('isolates a replacement %s draft from an older pending result', async (replacement) => {
    let finish!: () => void
    mutation.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
    const { tree, submit, onClose, onSaved, changeHabit } = await renderSheet('edit', editedHabit)
    await pressSubmit(submit)
    await settleMutation()
    if (replacement === 'habit') await changeHabit(createMockHabit({ id: '22222222-2222-4222-8222-222222222222', isGeneral: true, frequencyUnit: null }))
    else await act(() => { advanceAccountGeneration(); return Promise.resolve() })
    const nextTitle = tree.root.findAll((node) => String(node.type) === 'TextInput' && node.props.accessibilityLabel === 'habits.form.describe')[0]!
    await changeTitle(nextTitle, 'Replacement draft')
    await act(() => { finish(); return Promise.resolve() })
    await settleMutation()
    expect(nextTitle.props.value).toBe('Replacement draft')
    expect(nextTitle.props.editable).toBe(true)
    expect(onClose).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(mutation).toHaveBeenCalledOnce()
    void act(() => tree.update(<></>))
  })
  it('disables the real dated form inputs and draft actions together', async () => {
    let finish!: () => void
    mutation.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
    const { tree, submit } = await renderSheet('edit', createMockHabit({ checklistItems: editedHabit.checklistItems, frequencyUnit: 'Week', frequencyQuantity: 3, isFlexible: true, dueTime: '08:00', dueEndTime: '09:00' }))
    const form = tree.root.findAll((node) => node.type === HabitFormFields)[0]!
    const textHosts = form.findAll((node) => String(node.type) === 'TextInput')
    expect(textHosts.map((node) => node.props.accessibilityLabel)).toEqual(expect.arrayContaining(['habits.form.describe', 'habits.form.datePhrase', 'habits.form.frequency', 'habits.form.exactTime', 'habits.form.dueEndTime', 'habits.form.checklistItemLabel', 'habits.form.description']))
    await pressSubmit(submit)
    await settleMutation()
    expect(mutation).toHaveBeenCalledOnce()
    for (const host of textHosts) {
      expect(host.props.editable, String(host.props.accessibilityLabel)).toBe(false)
      expect(host.props.accessibilityState, String(host.props.accessibilityLabel)).toMatchObject({ disabled: true })
    }
    const actions = form.findAll((node) => String(node.type) === 'Pressable' && Boolean(node.props.accessibilityRole))
    expect(actions.length).toBeGreaterThan(20)
    for (const control of actions) expect(control.props.disabled, String(control.props.accessibilityLabel)).toBe(true)
    await act(() => { finish(); return Promise.resolve() })
    await settleMutation()
    void act(() => tree.update(<></>))
  })
  it.each(['confirmed', 'queued', 'rejected', 'uncertain'] as const)('keeps local and form text together across an already-delivered callback probe and %s completion', async (outcome) => {
    let finish!: (value: unknown) => void
    let reject!: (error: unknown) => void
    mutation.mockImplementation(() => new Promise((resolve, rejectRequest) => { finish = resolve; reject = rejectRequest }))
    const { tree, title, submit, onClose, onSaved } = await renderSheet('edit', editedHabit)
    const description = tree.root.findAll((node) => String(node.type) === 'TextInput' && node.props.accessibilityLabel === 'habits.form.description')[0]!
    const checklist = inputs(tree)[0]!
    const hosts = [title, description, checklist]
    const values = ['Submitted title', 'Submitted description', 'Submitted item']
    for (const [index, host] of hosts.entries()) await changeTitle(host, values[index]!)
    const deliveredCallbacks = hosts.map((host) => host.props.onChangeText as (value: string) => void)
    await pressSubmit(submit)
    await settleMutation()
    void act(() => { for (const callback of deliveredCallbacks) callback('Already delivered after snapshot') })
    const helpers = tree.root.findAll((node) => node.type === HabitFormFields)[0]!.props.formHelpers as import('@/hooks/use-habit-form').HabitFormHelpers
    expect(hosts.map((host) => host.props.value)).toEqual(values)
    expect(helpers.form.getValues()).toMatchObject({ title: values[0], description: values[1], checklistItems: [{ text: values[2], isChecked: true }, { text: 'Read a chapter', isChecked: false }] })
    await act(async () => {
      if (outcome === 'rejected') reject({ status: 403 })
      else if (outcome === 'uncertain') reject(new Error('timeout'))
      else finish(outcome === 'queued' ? createQueuedAck('synthetic-pending-update') : undefined)
      await Promise.resolve()
    })
    await settleMutation()
    expect(mutation).toHaveBeenCalledOnce()
    expect(completion).not.toHaveBeenCalled()
    expect(tagManagement.assign).not.toHaveBeenCalled()
    if (outcome === 'confirmed' || outcome === 'queued') {
      expect(onClose).toHaveBeenCalledOnce()
      expect(onSaved).toHaveBeenCalledTimes(outcome === 'confirmed' ? 1 : 0)
      if (outcome === 'queued') expect(showInfo).toHaveBeenCalledWith('habits.form.waitingToSync')
    } else {
      expect(onClose).not.toHaveBeenCalled()
      expect(onSaved).not.toHaveBeenCalled()
      expect(hosts.map((host) => host.props.value)).toEqual(values)
      for (const host of hosts) expect(host.props.editable).toBe(true)
      expect(detailRefetch).toHaveBeenCalledTimes(outcome === 'uncertain' ? 1 : 0)
      if (outcome === 'uncertain') expect(tree.root.findAll((node) => String(node.type) === 'Text' && node.props.children === 'habits.form.saveUncertain')).not.toHaveLength(0)
      await changeTitle(checklist, 'Explicit retry item')
      mutation.mockResolvedValueOnce(undefined)
      await pressSubmit(submit)
      await settleMutation()
      expect(mutation).toHaveBeenCalledTimes(2)
      expect(mutation.mock.calls[1]![0].data.checklistItems[0].text).toBe('Explicit retry item')
      expect(onSaved).toHaveBeenCalledOnce()
    }
    void act(() => tree.update(<></>))
  })
  it.each(['onSuggestSetup', 'onSuggestEmoji'] as const)('retires an already-started %s result at the submitted draft boundary', async (action) => {
    let finishSave!: () => void
    let finishSuggestion!: (response: HabitSetupSuggestion) => void
    mutation.mockImplementation(() => new Promise<void>((resolve) => { finishSave = resolve }))
    suggestionMutation.mockImplementation(() => new Promise<HabitSetupSuggestion>((resolve) => { finishSuggestion = resolve }))
    const { tree, submit } = await renderSheet('edit', editedHabit)
    let proposal!: Promise<unknown>
    void act(() => { proposal = (tree.root.findAll((node) => node.type === HabitFormFields)[0]!.props[action] as () => Promise<unknown>)() })
    expect(suggestionMutation).toHaveBeenCalledOnce()
    await pressSubmit(submit)
    await settleMutation()
    const emojiControl = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === (action === 'onSuggestEmoji' ? 'habits.form.emojiSuggesting' : 'habits.form.emojiSuggest'))[0]!
    expect(emojiControl.props.disabled).toBe(true)
    const helpers = tree.root.findAll((node) => node.type === HabitFormFields)[0]!.props.formHelpers as import('@/hooks/use-habit-form').HabitFormHelpers
    const submitted = helpers.form.getValues()
    await act(async () => {
      finishSuggestion({ emoji: '🏊', frequencyUnit: 'Week', frequencyQuantity: 2, days: [], isFlexible: true, flexibleTarget: 2, dueTime: '07:00', subHabits: [], checklistItems: ['Delayed checklist'] })
      await proposal
    })
    expect(helpers.form.getValues()).toEqual(submitted)
    expect(mutation).toHaveBeenCalledOnce()
    await act(() => { finishSave(); return Promise.resolve() })
    await settleMutation()
    void act(() => tree.update(<></>))
  })
  it.each(['title', 'description', 'checklist'] as const)('freezes the actual %s host while the submitted snapshot is pending', async (field) => {
    let finish!: () => void
    mutation.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
    const { tree, title, submit, onClose, onSaved } = await renderSheet('edit', editedHabit)
    const description = tree.root.findAll((node) => String(node.type) === 'TextInput' && node.props.accessibilityLabel === 'habits.form.description')[0]!
    const checklist = inputs(tree)[0]!
    const hosts = { title, description, checklist }
    await changeTitle(title, 'Ready to save')
    await changeTitle(description, 'Keep this description')
    void act(() => {
      (checklist.props.onFocus as () => void)()
      ;(checklist.props.onChangeText as (value: string) => void)('Pack the latest bag')
    })
    expect(mutation).not.toHaveBeenCalled()
    expect(completion).not.toHaveBeenCalled()
    for (const write of Object.values(tagManagement)) expect(write).not.toHaveBeenCalled()
    await pressSubmit(submit)
    await settleMutation()
    expect(mutation).toHaveBeenCalledOnce()
    expect(mutation.mock.calls[0]![0].data).toMatchObject({ title: 'Ready to save', description: 'Keep this description', checklistItems: [{ text: 'Pack the latest bag', isChecked: true }, { text: 'Read a chapter', isChecked: false }] })
    expect(buttonState(submit)).toMatchObject({ busy: true, disabled: true })
    expect(submit.findAll((node) => String(node.type) === 'Text').some((node) => node.props.children === 'common.save')).toBe(true)
    const host = hosts[field]
    expect(host.props.editable).toBe(false)
    expect(host.props.accessibilityState).toMatchObject({ disabled: true })
    await pressSubmit(submit)
    expect(mutation).toHaveBeenCalledOnce()
    const dismiss = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === 'attempt-dismiss')[0]!
    void act(() => (dismiss.props.onPress as () => void)())
    expect(onClose).not.toHaveBeenCalled()
    await act(() => { finish(); return Promise.resolve() })
    await settleMutation()
    expect(onClose).toHaveBeenCalledOnce()
    expect(onSaved).toHaveBeenCalledOnce()
    void act(() => tree.update(<></>))
  })
  it('keeps focused text and checked state together through local moves and one Save', async () => {
    mutation.mockResolvedValue(undefined)
    const { tree, submit } = await renderSheet('edit', editedHabit)
    const first = inputs(tree)[0]!
    void act(() => { (first.props.onFocus as (event: unknown) => void)({}); (first.props.onChangeText as (value: string) => void)('Pack a blue bag') })
    press(tree, 'habits.form.moveChecklistItemDown')
    expect(inputs(tree)[1]).toBe(first)
    expect(inputs(tree)[1]!.props.value).toBe('Pack a blue bag')
    expect(mutation).not.toHaveBeenCalled()
    await pressSubmit(submit)
    await settleMutation()
    expect(mutation).toHaveBeenCalledOnce()
    expect(mutation.mock.calls[0]![0].data).toMatchObject({ description: '', goalIds: [], tagIds: [], checklistItems: [{ text: 'Read a chapter', isChecked: false }, { text: 'Pack a blue bag', isChecked: true }] })
    void act(() => tree.update(<></>))
  })
  it('stages structural clear until Save and discards through Cancel', async () => {
    const { tree, onClose } = await renderSheet('edit', editedHabit)
    press(tree, 'habits.form.duplicateChecklistItem')
    press(tree, 'habits.form.removeChecklistItem', 1)
    const clear = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.findAll((child) => String(child.type) === 'Text' && child.props.children === 'habits.form.clearChecklist').length > 0)[0]!
    void act(() => (clear.props.onPress as () => void)())
    expect(mutation).not.toHaveBeenCalled()
    const cancel = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.findAll((child) => String(child.type) === 'Text' && child.props.children === 'common.cancel').length > 0)[0]!
    void act(() => (cancel.props.onPress as () => void)())
    const discard = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.findAll((child) => String(child.type) === 'Text' && child.props.children === 'common.discardChangesAction').length > 0)[0]!
    void act(() => (discard.props.onPress as () => void)())
    await settleMutation()
    expect(onClose).toHaveBeenCalledOnce()
    expect(mutation).not.toHaveBeenCalled()
    void act(() => tree.update(<></>))
  })
})

vi.mock('@/app/(tabs)/use-today-date', () => ({ useCurrentDate: () => '2026-08-29' }))
vi.mock('@/components/shell/flow-shell', () => ({ FlowShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }))

it('opens the real full editor from detail and stages checked-state structure before its single Save', async () => {
  mutation.mockReset().mockResolvedValue(undefined)
  completion.mockReset()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  let tree!: ReactTestRenderer
  await act(() => { tree = create(<QueryClientProvider client={client}><HabitDetailScreen habitId="habit-1" /></QueryClientProvider>); return Promise.resolve() })
  const pencil = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === 'habits.editHabit')[0]!
  await act(() => { (pencil.props.onPress as () => void)(); return Promise.resolve() })
  const items = tree.root.findAll((node) => String(node.type) === 'TextInput' && node.props.accessibilityLabel === 'habits.form.checklistItemLabel')
  void act(() => (items[0]!.props.onChangeText as (value: string) => void)('Pack a blue bag'))
  const remove = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityLabel === 'habits.form.removeChecklistItem')[1]!
  void act(() => (remove.props.onPress as () => void)())
  expect(mutation).not.toHaveBeenCalled()
  expect(completion).not.toHaveBeenCalled()
  const save = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.findAll((child) => String(child.type) === 'Text' && child.props.children === 'common.save').length > 0)[0]!
  await pressSubmit(save)
  await settleMutation()
  expect(mutation).toHaveBeenCalledOnce()
  expect(mutation.mock.calls[0]![0].data.checklistItems).toEqual([{ text: 'Pack a blue bag', isChecked: true }])
  expect(completion).not.toHaveBeenCalled()
  void act(() => tree.update(<></>))
})

it('selects an existing tag locally and commits its association only with the habit Save', async () => {
  mutation.mockReset().mockResolvedValue(undefined)
  const { tree, submit } = await renderSheet('edit', createMockHabit({ isGeneral: true, frequencyUnit: null }))
  const tagRow = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.findAll((child) => String(child.type) === 'Text' && child.props.children === 'habits.form.tags').length > 0)[0]!
  void act(() => (tagRow.props.onPress as () => void)())
  const selected = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.findAll((child) => String(child.type) === 'Text' && child.props.children === 'Reading').length > 0)[0]!
  void act(() => (selected.props.onPress as () => void)())
  expect(mutation).not.toHaveBeenCalled()
  for (const write of Object.values(tagManagement)) expect(write).not.toHaveBeenCalled()
  await pressSubmit(submit)
  await settleMutation()
  expect(mutation).toHaveBeenCalledOnce()
  expect(mutation.mock.calls[0]![0].data.tagIds).toEqual(['11111111-1111-4111-8111-111111111111'])
  for (const write of Object.values(tagManagement)) expect(write).not.toHaveBeenCalled()
  void act(() => tree.update(<></>))
})

it('retains an uncertain submitted draft and requests real readback without claiming saved', async () => {
  mutation.mockReset().mockRejectedValue(new Error('timeout'))
  detailRefetch.mockClear()
  const { tree, title, submit, onClose, onSaved } = await renderSheet('edit')
  await changeTitle(title, 'Keep this draft')
  await pressSubmit(submit)
  await settleMutation()
  expect(detailRefetch).toHaveBeenCalledOnce()
  expect(title.props.value).toBe('Keep this draft')
  expect(onClose).not.toHaveBeenCalled()
  expect(onSaved).not.toHaveBeenCalled()
  expect(buttonState(submit).disabled).toBe(false)
  void act(() => tree.update(<></>))
})


it('distinguishes accepted queued work from the confirmed-save callback', async () => {
  mutation.mockReset().mockResolvedValue(createQueuedAck('synthetic-update'))
  showInfo.mockClear()
  const { tree, submit, onSaved, onClose } = await renderSheet('edit')
  await pressSubmit(submit)
  await settleMutation()
  expect(mutation).toHaveBeenCalledOnce()
  expect(showInfo).toHaveBeenCalledWith('habits.form.waitingToSync')
  expect(onClose).toHaveBeenCalledOnce()
  expect(onSaved).not.toHaveBeenCalled()
  void act(() => tree.update(<></>))
})
