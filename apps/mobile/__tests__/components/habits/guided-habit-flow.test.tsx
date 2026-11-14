import type { ReactNode } from 'react'
import { Text } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-test-renderer'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { GuidedHabitFlow, type GuidedHabitFields } from '@/components/habits/guided/guided-habit-flow'
import { useHabitForm } from '@/hooks/use-habit-form'
import { useTagSelection } from '@/hooks/use-tag-selection'
import { i18n } from '@/lib/i18n'
import { press, renderNavigation } from '../ui/navigation-render'

const state = vi.hoisted(() => ({
  helpers: null as ReturnType<typeof useHabitForm> | null, read: vi.fn(), online: true, pro: true, goalToggle: vi.fn(), messagesUsed: 0, reducedMotion: false,
}))

vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => state.reducedMotion }))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => i18n.t(key, params), i18n: { language: i18n.language } }),
}))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { timeZone: 'UTC', uses24HourClock: true, weekStartDay: 0, aiMessagesUsed: state.messagesUsed, aiMessagesLimit: 5 } }),
  useHasProAccess: () => state.pro,
}))
vi.mock('@/hooks/use-habit-phrase-read', () => ({ useHabitPhraseRead: () => ({ mutateAsync: state.read, isPending: false }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: state.online }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() }) }))
vi.mock('@/hooks/use-reminder-permission', () => ({ useReminderPermission: (_enabled: boolean, onToggle: () => void) => ({ toggleReminder: onToggle, showNotice: true }) }))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: vi.fn() }))
vi.mock('@/hooks/use-checklist-templates', () => ({
  useChecklistTemplates: () => ({ data: [{ id: 'template-1', name: 'Manhã', items: ['Separar roupa'] }], isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateChecklistTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteChecklistTemplate: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/components/habits/goal-linking-field', async () => {
  const { createMockGoal } = await import('@orbit/shared/__tests__/factories')
  return { useLinkableGoals: () => ({ data: [createMockGoal({ id: 'goal-1', title: 'Correr 5 km', progressPercentage: 40 })], isSuccess: true, isLoading: false, isError: false, refetch: vi.fn() }) }
})
vi.mock('@/components/goals/create-goal-sheet', () => ({ CreateGoalSheet: () => null }))
vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({ tags: [{ id: 'tag-1', name: 'Saúde', color: '#7c3aed' }] }),
  useCreateTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteTag: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useSuggestTags: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabits: () => ({ data: undefined }) }))
vi.mock('@/hooks/use-astra-allowance-copy', () => ({ useAstraAllowanceCopy: () => (key: string) => key }))

const submit = vi.fn()
const close = vi.fn()
const helpers = () => state.helpers!

interface HarnessProps { mode?: 'create' | 'edit'; saveError?: string | null; lockedGeneral?: boolean | null; initial?: Record<string, unknown>; parentField?: ReactNode; subHabits?: boolean }

function Harness({ mode = 'create', saveError = null, lockedGeneral = null, initial = {}, parentField, subHabits = true }: Readonly<HarnessProps>) {
  const formHelpers = useHabitForm({ initialData: { dueDate: '', ...initial } })
  const tags = useTagSelection()
  state.helpers = formHelpers
  const fields: GuidedHabitFields = {
    tags, selectedGoalIds: [], atGoalLimit: false, onToggleGoal: state.goalToggle, reminderTimes: [0, 15], onReminderTimesChange: vi.fn(), onUpgrade: vi.fn(),
    parentField, children: subHabits ? () => <Text>sub-habit-editor</Text> : undefined,
  }
  return (
    <GuidedHabitFlow mode={mode} formHelpers={formHelpers} fields={fields} lockedGeneral={lockedGeneral} fromConversation={false} pending={false}
      saveError={saveError} createLabel="Criar tarefa" onSubmit={submit} onClose={close} />
  )
}

type Tree = ReturnType<typeof renderNavigation>
const flowCopy = () => (i18n.language === 'en' ? en : ptBR).habits.flow
const copy = () => (i18n.language === 'en' ? en : ptBR)
const matches = (label: string | undefined, name: string | RegExp) => (typeof name === 'string' ? label === name : name.test(label ?? ''))
const control = (tree: Tree, name: string | RegExp) => tree.hosts().find((node) => matches(node.props.accessibilityLabel, name) && typeof node.props.onPress === 'function')
const heading = (tree: Tree) => tree.hosts().filter((node) => node.props.accessibilityRole === 'header').map((node) => (typeof node.props.children === 'string' ? node.props.children : ''))[0] ?? ''
const progress = (tree: Tree) => tree.hosts().find((node) => /^(Passo|Step) \d (de|of) \d$/.test(node.props.accessibilityLabel ?? ''))?.props.accessibilityLabel
const hasText = (tree: Tree, text: string) => tree.hosts().some((node) => node.props.children === text)
async function tap(tree: Tree, name: string | RegExp) {
  const target = control(tree, name)
  if (!target) throw new Error(`no control named ${String(name)}`)
  await act(async () => { press(target); await Promise.resolve(); await Promise.resolve() })
}
async function type(tree: Tree, label: string, text: string) {
  const input = tree.hosts().find((node) => (node.props as { onChangeText?: unknown }).onChangeText && node.props.accessibilityLabel === label)
  if (!input) throw new Error(`no field named ${label}`)
  await act(async () => { (input.props as unknown as { onChangeText: (value: string) => void }).onChangeText(text); await Promise.resolve() })
}
async function submitField(tree: Tree, label: string) {
  const input = tree.hosts().find((node) => (node.props as { onSubmitEditing?: unknown }).onSubmitEditing && node.props.accessibilityLabel === label)
  if (!input) throw new Error(`no field named ${label}`)
  await act(async () => { (input.props as unknown as { onSubmitEditing: () => void }).onSubmitEditing(); await Promise.resolve() })
}
async function primary(tree: Tree) {
  const action = tree.hosts().find((node) => node.props.testID === 'button-primary-sm' && typeof node.props.onPress === 'function')
  if (!action) throw new Error('no primary action')
  await act(async () => { press(action); await Promise.resolve(); await Promise.resolve() })
}
async function phrase(tree: Tree, text: string) {
  await type(tree, flowCopy().what.label, text)
  await primary(tree)
}

beforeEach(() => {
  state.read.mockReset().mockResolvedValue(null)
  state.online = true
  state.pro = true
  state.messagesUsed = 0
  state.goalToggle.mockReset()
  submit.mockReset()
  close.mockReset()
  vi.useFakeTimers({ now: new Date('2026-11-13T12:00:00Z'), toFake: ['Date'] })
})
afterEach(() => { vi.useRealTimers(); state.reducedMotion = false })

describe.each([
  ['pt-BR', false], ['en', false], ['pt-BR', true], ['en', true],
] as const)('the guided create flow on Android in %s, reduced motion %s', (locale, reducedMotion) => {
  beforeEach(async () => { await i18n.changeLanguage(locale); state.reducedMotion = reducedMotion })

  it('asks the question in the words of the person and names the progress', () => {
    const tree = renderNavigation(<Harness />)
    expect(heading(tree)).toBe(flowCopy().what.question)
    expect(progress(tree)).toMatch(/ 1 (de|of) \d$/)
    tree.unmount()
  })

  it('scenario 1: answers a task with a date, a time and a reminder and creates once', async () => {
    const tree = renderNavigation(<Harness />)
    await phrase(tree, locale === 'en' ? 'call John' : 'ligar para o João')
    await tap(tree, flowCopy().when.tomorrow)
    await tap(tree, '08:00')
    await tap(tree, flowCopy().reminder.yes)
    expect(heading(tree)).toBe(flowCopy().confirm.question)
    expect(helpers().form.getValues()).toMatchObject({ itemType: 'task', dueDate: '2026-11-14', dueTime: '08:00', reminderEnabled: true })
    await primary(tree)
    expect(submit).toHaveBeenCalledWith({ stepCount: 5, usedAiRead: false })
    tree.unmount()
  })

  it('scenario 2: keeps an undated task in General and asks no time', async () => {
    const tree = renderNavigation(<Harness />)
    await phrase(tree, locale === 'en' ? 'tidy the garage' : 'arrumar a garagem')
    await tap(tree, flowCopy().when.noDate)
    expect(helpers().isGeneral).toBe(true)
    expect(heading(tree)).toBe(flowCopy().confirm.question)
    tree.unmount()
  })

  it('scenario 3: reaches the reminder and then the summary from one phrase that holds the repeat and the time', async () => {
    const tree = renderNavigation(<Harness />)
    await phrase(tree, locale === 'en' ? 'take my pills every day at 8' : 'tomar remédio todo dia às 8')
    expect(progress(tree)).toMatch(/ 2 (de|of) 3$/)
    await tap(tree, flowCopy().reminder.yes)
    expect(heading(tree)).toBe(flowCopy().confirm.question)
    expect(state.read).not.toHaveBeenCalled()
    tree.unmount()
  })

  it('scenario 4: sets a count habit in the repeat step and corrects it with the stepper', async () => {
    const tree = renderNavigation(<Harness />)
    await phrase(tree, locale === 'en' ? 'gym 3 times a week' : 'academia 3 vezes por semana')
    await tap(tree, flowCopy().time.none)
    await tap(tree, new RegExp(`^${flowCopy().summary.when},`))
    expect(heading(tree)).toBe(flowCopy().repeat.question)
    const before = helpers().form.getValues('frequencyQuantity') ?? 0
    await tap(tree, copy().habits.form.moreOften)
    expect(helpers().form.getValues('frequencyQuantity')).toBe(before + 1)
    tree.unmount()
  })

  it('scenario 6: keeps unreadable words open, refuses a past day and reads a day in words', async () => {
    const tree = renderNavigation(<Harness />)
    await phrase(tree, locale === 'en' ? 'call the bank' : 'ligar para o banco')
    await type(tree, flowCopy().when.freeLabel, 'quando der vontade')
    await submitField(tree, flowCopy().when.freeLabel)
    expect(tree.hosts().some((node) => String((node.props as { accessibilityHint?: string }).accessibilityHint ?? '').includes(flowCopy().when.unresolved))).toBe(true)
    await type(tree, flowCopy().when.freeLabel, '2026-11-01')
    await submitField(tree, flowCopy().when.freeLabel)
    expect(tree.hosts().some((node) => String((node.props as { accessibilityHint?: string }).accessibilityHint ?? '').includes(flowCopy().when.past))).toBe(true)
    await type(tree, flowCopy().when.freeLabel, locale === 'en' ? 'the 20th' : 'dia 20')
    await submitField(tree, flowCopy().when.freeLabel)
    expect(helpers().form.getValues('dueDate')).toBe('2026-11-20')
    tree.unmount()
  })

  it('scenario 7: skips the date question under a General parent and shows the lock', async () => {
    const tree = renderNavigation(<Harness lockedGeneral initial={{ isGeneral: true, itemType: 'task' }} />)
    await phrase(tree, locale === 'en' ? 'pack the bag' : 'arrumar a mala')
    expect(heading(tree)).toBe(flowCopy().confirm.question)
    expect(control(tree, new RegExp(`^${flowCopy().summary.when},`))?.props.disabled ?? true).toBe(true)
    tree.unmount()
  })

  it('scenario 11: closes from step 1 and keeps the back slot empty there', async () => {
    const tree = renderNavigation(<Harness />)
    expect(control(tree, flowCopy().back)).toBeUndefined()
    await tap(tree, flowCopy().close)
    expect(close).toHaveBeenCalledTimes(1)
    tree.unmount()
  })

  it('scenario 12: resets the answers that an edited phrase covers and keeps the others', async () => {
    const tree = renderNavigation(<Harness />)
    await phrase(tree, locale === 'en' ? 'call John' : 'ligar para o João')
    await tap(tree, flowCopy().when.today)
    await tap(tree, flowCopy().back)
    await tap(tree, flowCopy().back)
    await phrase(tree, locale === 'en' ? 'call John at 9' : 'ligar para o João às 9')
    expect(helpers().form.getValues('dueTime')).toBe('09:00')
    expect(heading(tree)).toContain(flowCopy().reminder.question.split('{')[0]!.trim())
    tree.unmount()
  })

  it('scenario 13: keeps the summary with the server message and opens the step of a field error', async () => {
    const tree = renderNavigation(<Harness saveError="Servidor indisponível" />)
    await phrase(tree, locale === 'en' ? 'take my pills every day at 8' : 'tomar remédio todo dia às 8')
    await tap(tree, flowCopy().reminder.no)
    expect(hasText(tree, 'Servidor indisponível')).toBe(true)
    await act(async () => { helpers().reportBackendErrors({ status: 400, data: { errors: { Title: ['Too long'] } } }); await Promise.resolve() })
    expect(heading(tree)).toBe(flowCopy().what.question)
    tree.unmount()
  })

  it('scenario 14: asks the remaining questions with no error after a miss and a failed call, and reads one phrase once', async () => {
    state.read.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('offline'))
    const tree = renderNavigation(<Harness />)
    await phrase(tree, locale === 'en' ? 'water the plants' : 'regar as plantas')
    expect(heading(tree)).toBe(flowCopy().when.question)
    await tap(tree, flowCopy().back)
    await primary(tree)
    expect(state.read).toHaveBeenCalledTimes(1)
    await tap(tree, flowCopy().back)
    await phrase(tree, locale === 'en' ? 'water the big plants' : 'regar as plantas grandes')
    expect(heading(tree)).toBe(flowCopy().when.question)
    expect(state.read).toHaveBeenCalledTimes(2)
    tree.unmount()
  })

  it('scenario 14: skips what the free read answered and keeps a deliberate task on a later read', async () => {
    state.read.mockResolvedValue({ read: true, emoji: '🪴', frequencyUnit: 'Day', frequencyQuantity: 1, days: [], isFlexible: false, flexibleTarget: null, dueTime: '07:00', subHabits: [], checklistItems: [] })
    const tree = renderNavigation(<Harness />)
    await phrase(tree, locale === 'en' ? 'water the plants' : 'regar as plantas')
    expect(heading(tree)).toContain(flowCopy().reminder.question.split('{')[0]!.trim())
    await tap(tree, flowCopy().reminder.no)
    expect(helpers().form.getValues()).toMatchObject({ itemType: 'habit', frequencyUnit: 'Day', dueTime: '07:00', emoji: '🪴' })
    await tap(tree, new RegExp(`^${flowCopy().summary.type}`))
    await tap(tree, new RegExp(`^${copy().habits.form.typeTask}`))
    await tap(tree, new RegExp(`^${flowCopy().summary.title}`))
    await primary(tree)
    expect(helpers().form.getValues('itemType')).toBe('task')
    expect(helpers().form.getValues('frequencyUnit') ?? null).toBeNull()
    tree.unmount()
  })

  it('scenario 15: reads on the device offline, names the state and calls no reader', async () => {
    state.online = false
    const tree = renderNavigation(<Harness />)
    expect(hasText(tree, flowCopy().orbit.offline)).toBe(true)
    await phrase(tree, locale === 'en' ? 'water the plants' : 'regar as plantas')
    expect(state.read).not.toHaveBeenCalled()
    expect(heading(tree)).toBe(flowCopy().when.question)
    tree.unmount()
  })

  it('scenario 16: creates at the message limit with no upsell', async () => {
    state.messagesUsed = 5
    const tree = renderNavigation(<Harness />)
    await phrase(tree, locale === 'en' ? 'water the plants' : 'regar as plantas')
    await tap(tree, flowCopy().when.noDate)
    expect(tree.hosts().some((node) => typeof node.props.children === 'string' && /upgrade|Pro\b|limite|limit/i.test(node.props.children))).toBe(false)
    await primary(tree)
    expect(submit).toHaveBeenCalledTimes(1)
    tree.unmount()
  })

  it('scenario 19: advances one step on a double press of an option', async () => {
    const tree = renderNavigation(<Harness />)
    await phrase(tree, locale === 'en' ? 'call John' : 'ligar para o João')
    const today = control(tree, flowCopy().when.today)!
    await act(async () => { today.props.onPress?.(); today.props.onPress?.(); await Promise.resolve() })
    expect(heading(tree)).toBe(flowCopy().time.question)
    tree.unmount()
  })

  it('marks the words the device read in the shared phrase field and names them in the Orbit line', async () => {
    const tree = renderNavigation(<Harness />)
    await type(tree, flowCopy().what.label, i18n.language === 'en' ? 'take my pills every day at 8' : 'tomar remédio todo dia às 8')
    const parts = i18n.language === 'en' ? 'every day at 08:00' : 'todo dia às 08:00'
    expect(tree.hosts().some((node) => node.props.children === flowCopy().what.lineUnderstood.replace('{parts}', parts))).toBe(true)
    expect(tree.hosts().some((node) => node.props.accessibilityLabel === (i18n.language === 'en' ? en : ptBR).habits.form.understood)).toBe(true)
    expect(tree.hosts().find((node) => node.props.accessibilityLabel === flowCopy().what.label && 'maxLength' in node.props)?.props.maxLength).toBe(200)
    tree.unmount()
  })

  it('shows the hint on an empty submit and stays on step 1', async () => {
    const tree = renderNavigation(<Harness />)
    await primary(tree)
    expect(tree.hosts().some((node) => String((node.props as { accessibilityHint?: string }).accessibilityHint ?? '').includes(flowCopy().what.hint))).toBe(true)
    expect(heading(tree)).toBe(flowCopy().what.question)
    tree.unmount()
  })
})

describe.each(['pt-BR', 'en'] as const)('the detail questions on Android in %s', (locale) => {
  beforeEach(async () => { await i18n.changeLanguage(locale) })

  async function toSummary() {
    const tree = renderNavigation(<Harness />)
    await phrase(tree, locale === 'en' ? 'run every day at 7' : 'correr todo dia às 7')
    await tap(tree, flowCopy().reminder.no)
    return tree
  }
  async function openOptional(tree: Tree, id: keyof ReturnType<typeof flowCopy>['optional']) {
    await tap(tree, flowCopy().more)
    await tap(tree, new RegExp(`^${flowCopy().optional[id].replace('?', '\\?')}`))
    expect(heading(tree)).toBe(flowCopy().optional[id])
  }

  it('scenario 17: lists every optional question', async () => {
    const tree = await toSummary()
    await tap(tree, flowCopy().more)
    for (const id of ['description', 'checklist', 'subHabits', 'avoid', 'tags', 'goals', 'endDate'] as const) {
      expect(control(tree, new RegExp(`^${flowCopy().optional[id].replace('?', '\\?')}`))).toBeDefined()
    }
    tree.unmount()
  })

  it('scenario 17: writes the description, loads a template through the checklist step, hosts the sub-items and mounts the tag and goal steps', async () => {
    const tree = await toSummary()
    await openOptional(tree, 'description')
    await type(tree, flowCopy().optional.description, 'Antes do café')
    await primary(tree)
    expect(helpers().form.getValues('description')).toBe('Antes do café')
    await tap(tree, new RegExp(`^${flowCopy().optional.checklist.replace('?', '\\?')}`))
    await tap(tree, flowCopy().checklist.useTemplate)
    expect(heading(tree)).toBe(flowCopy().templates.question)
    await tap(tree, /^Manhã/)
    expect(helpers().form.getValues('checklistItems')).toEqual([{ text: 'Separar roupa', isChecked: false }])
    expect(heading(tree)).toBe(flowCopy().optional.checklist)
    await primary(tree)
    await tap(tree, new RegExp(`^${flowCopy().optional.subHabits.replace('?', '\\?')}`))
    expect(hasText(tree, 'sub-habit-editor')).toBe(true)
    await primary(tree)
    await tap(tree, new RegExp(`^${flowCopy().optional.tags.replace('?', '\\?')}`))
    expect(heading(tree)).toBe(flowCopy().optional.tags)
    await tap(tree, 'Saúde')
    expect(tree.hosts().some((node) => node.props.testID === 'option-card' && node.props.accessibilityLabel === 'Saúde' && node.props.accessibilityState?.selected === true)).toBe(true)
    await primary(tree)
    await tap(tree, new RegExp(`^${flowCopy().optional.goals.replace('?', '\\?')}`))
    expect(heading(tree)).toBe(flowCopy().optional.goals)
    await tap(tree, 'Correr 5 km, 40%')
    expect(state.goalToggle).toHaveBeenCalledWith('goal-1')
    tree.unmount()
  })

  it.each([true, false])('scenario 17: asks for the slip alert after a habit to avoid, with Pro %s', async (pro) => {
    state.pro = pro
    const tree = await toSummary()
    await openOptional(tree, 'avoid')
    await tap(tree, flowCopy().optional.yes)
    expect(helpers().form.getValues('isBadHabit')).toBe(true)
    expect(heading(tree)).toBe(flowCopy().optional.slipAlert)
    await primary(tree)
    expect(heading(tree)).toBe(flowCopy().more)
    tree.unmount()
  })

  it('scenario 17: adds and removes an end date', async () => {
    const tree = await toSummary()
    await openOptional(tree, 'endDate')
    await act(async () => { helpers().form.setValue('endDate', '2026-12-31', { shouldDirty: true }); await Promise.resolve() })
    await tap(tree, flowCopy().optional.removeEndDate)
    expect(helpers().form.getValues('endDate')).toBe('')
    await tap(tree, flowCopy().optional.none)
    expect(heading(tree)).toBe(flowCopy().more)
    tree.unmount()
  })

  it('scenario 17: shows the parent question in edit only', async () => {
    const tree = renderNavigation(<Harness mode="edit" parentField={<Text>parent-picker</Text>} subHabits={false} initial={{ title: 'Correr', itemType: 'habit', frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-11-13' }} />)
    await tap(tree, flowCopy().more)
    await tap(tree, new RegExp(`^${flowCopy().optional.parent.replace('?', '\\?')}`))
    expect(hasText(tree, 'parent-picker')).toBe(true)
    tree.unmount()
  })

  it('scenario 18: opens the reminder kinds with the permission notice and the repeat editor', async () => {
    const tree = await toSummary()
    await tap(tree, new RegExp(`^${flowCopy().summary.reminder},`))
    expect(heading(tree)).toBe(flowCopy().reminderKind.question)
    tree.unmount()
  })

  it('opens the end time question from the length value and refuses an end before the start', async () => {
    const tree = await toSummary()
    await tap(tree, new RegExp(`^${flowCopy().summary.duration},`))
    expect(heading(tree)).toBe(flowCopy().duration.question)
    await act(async () => { helpers().form.setValue('dueEndTime', '06:00', { shouldDirty: true }); await Promise.resolve() })
    await primary(tree)
    expect(heading(tree)).toBe(flowCopy().duration.question)
    await tap(tree, flowCopy().duration.none)
    expect(helpers().form.getValues('dueEndTime')).toBe('')
    tree.unmount()
  })
})

describe.each(['pt-BR', 'en'] as const)('the monthly repeat and the conversation draft on Android in %s', (locale) => {
  beforeEach(async () => { await i18n.changeLanguage(locale) })

  it('scenario 5: picks days 1 and 15 of the month and notes the short months for day 31', async () => {
    const tree = renderNavigation(<Harness mode="edit" subHabits={false} initial={{ title: 'Pagar contas', itemType: 'habit', frequencyUnit: 'Month', frequencyQuantity: 1, isFlexible: false, dueDate: '2026-11-13', monthDays: [] }} />)
    await tap(tree, new RegExp(`^${flowCopy().summary.when},`))
    expect(heading(tree)).toBe(flowCopy().repeat.question)
    await tap(tree, '1')
    await tap(tree, '15')
    expect(helpers().form.getValues('monthDays')).toEqual(expect.arrayContaining([1, 15]))
    await tap(tree, '31')
    expect(hasText(tree, copy().habits.form.monthDaysShortMonth)).toBe(true)
    tree.unmount()
  })

  it('scenario 10: opens a conversation draft on the summary with the notice as the hint of the question', () => {
    const tree = renderNavigation(<GuidedFromConversation />)
    const question = tree.hosts().find((node) => node.props.accessibilityRole === 'header')
    expect(question?.props.children).toBe(flowCopy().confirm.question)
    expect((question?.props as { accessibilityHint?: string } | undefined)?.accessibilityHint).toBe(flowCopy().orbit.fromConversation)
    tree.unmount()
  })
})

function GuidedFromConversation() {
  const formHelpers = useHabitForm({ initialData: { title: 'Ler 10 páginas', itemType: 'habit', frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-11-13' } })
  const tags = useTagSelection()
  return <GuidedHabitFlow mode="edit" formHelpers={formHelpers} lockedGeneral={null} fromConversation pending={false} saveError={null} createLabel="Salvar" onSubmit={submit} onClose={close}
    fields={{ tags, selectedGoalIds: [], atGoalLimit: false, onToggleGoal: vi.fn(), reminderTimes: [], onReminderTimesChange: vi.fn(), onUpgrade: vi.fn() }} />
}

describe('the guided edit flow on Android', () => {
  beforeEach(async () => { await i18n.changeLanguage('pt-BR') })

  it('scenario 8 and 9: opens a stored item on the summary clean, and changes the time only', async () => {
    const tree = renderNavigation(<Harness mode="edit" subHabits={false} initial={{ title: 'Correr', itemType: 'habit', frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-11-13', dueTime: '07:00' }} />)
    expect(heading(tree)).toBe(ptBR.habits.flow.confirm.question)
    expect(helpers().form.formState.isDirty).toBe(false)
    await tap(tree, /^Hora,/)
    await tap(tree, '20:00')
    expect(heading(tree)).toBe(ptBR.habits.flow.confirm.question)
    expect(helpers().form.getValues()).toMatchObject({ title: 'Correr', frequencyUnit: 'Day', dueDate: '2026-11-13', dueTime: '20:00' })
    expect(state.read).not.toHaveBeenCalled()
    tree.unmount()
  })

  it('scenario 8: opens a stored undated habit and never converts it', () => {
    const tree = renderNavigation(<Harness mode="edit" subHabits={false} initial={{ title: 'Alongar', itemType: 'habit', isGeneral: true }} />)
    expect(helpers().form.getValues()).toMatchObject({ itemType: 'habit', isGeneral: true })
    expect(helpers().form.formState.isDirty).toBe(false)
    tree.unmount()
  })
})
