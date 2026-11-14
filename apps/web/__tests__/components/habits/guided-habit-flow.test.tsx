import { useEffect, type ReactNode } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { GuidedHabitFlow, type GuidedHabitFields } from '@/components/habits/guided/guided-habit-flow'
import { useHabitForm } from '@/hooks/use-habit-form'
import { useTagSelection } from '@/hooks/use-tag-selection'

const state = vi.hoisted(() => ({
  locale: 'pt-BR' as 'en' | 'pt-BR', read: vi.fn(), helpers: null as unknown, online: true, pro: true, reducedMotion: false,
  goalToggle: vi.fn(), messagesUsed: 0,
}))

function lookup(messages: Record<string, unknown>, key: string): string {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages)
  return typeof value === 'string' ? value : key
}

vi.mock('next-intl', () => ({
  useLocale: () => state.locale,
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    lookup(state.locale === 'en' ? en : ptBR, key).replaceAll(/\{(\w+)\}/g, (_match, name: string) => `${values?.[name] ?? ''}`),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { timeZone: 'UTC', uses24HourClock: true, weekStartDay: 0, aiMessagesUsed: state.messagesUsed, aiMessagesLimit: 5 } }),
  useHasProAccess: () => state.pro,
}))
vi.mock('@/hooks/use-habit-phrase-read', () => ({ useHabitPhraseRead: () => ({ mutateAsync: state.read, isPending: false }) }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: state.online }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() }) }))
vi.mock('@/hooks/use-reminder-permission', () => ({ useReminderPermission: (_enabled: boolean, onToggle: () => void) => ({ toggleReminder: onToggle, showNotice: true }) }))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: vi.fn() }))
vi.mock('@/components/habits/checklist-templates', () => ({ ChecklistTemplates: ({ onLoad }: { onLoad: (items: { text: string; isChecked: boolean }[]) => void }) => <button type="button" onClick={() => onLoad([{ text: 'Separar roupa', isChecked: false }])}>use-template</button> }))
vi.mock('@/components/habits/goal-linking-field', () => ({ GoalLinkingField: ({ onToggleGoal }: { onToggleGoal: (id: string) => void }) => <button type="button" onClick={() => onToggleGoal('goal-1')}>link-goal</button> }))
vi.mock('@/components/habits/habit-form-fields/habit-tags-field', () => ({ HabitTagsField: ({ tags }: { tags: { toggleTag: (id: string) => void } }) => <button type="button" onClick={() => tags.toggleTag('tag-1')}>pick-tag</button> }))

const submit = vi.fn()
const close = vi.fn()
const helpers = () => state.helpers as ReturnType<typeof useHabitForm>

interface HarnessProps { mode?: 'create' | 'edit'; saveError?: string | null; lockedGeneral?: boolean | null; initial?: Record<string, unknown>; parentField?: ReactNode; subHabits?: boolean }

function Harness({ mode = 'create', saveError = null, lockedGeneral = null, initial = {}, parentField, subHabits = true }: Readonly<HarnessProps>) {
  const formHelpers = useHabitForm({ initialData: { dueDate: '', ...initial } })
  const tags = useTagSelection()
  useEffect(() => { state.helpers = formHelpers })
  const fields: GuidedHabitFields = {
    tags, selectedGoalIds: [], atGoalLimit: false, onToggleGoal: state.goalToggle, reminderTimes: [0, 15], onReminderTimesChange: vi.fn(),
    parentField, children: subHabits ? () => <p>sub-habit-editor</p> : undefined,
  }
  return (
    <GuidedHabitFlow mode={mode} formHelpers={formHelpers} fields={fields} lockedGeneral={lockedGeneral} fromConversation={false} pending={false}
      saveError={saveError} createLabel="Criar tarefa" onSubmit={submit} onClose={close} />
  )
}

const messages = () => (state.locale === 'en' ? en : ptBR).habits.flow
const progress = () => screen.getByRole('list', { name: /^(Passo|Step) \d/ }).getAttribute('aria-label')
const heading = () => screen.getByRole('heading', { level: 1 })
async function type(label: string, text: string) {
  await act(async () => { fireEvent.change(screen.getByLabelText(label), { target: { value: text } }) })
}
async function press(name: string | RegExp) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}
async function phrase(text: string) {
  await type(messages().what.label, text)
  await press(messages().continue)
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
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: state.reducedMotion && query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {} }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe.each([
  ['pt-BR', false], ['en', false], ['pt-BR', true], ['en', true],
] as const)('the guided create flow in %s, reduced motion %s', (locale, reducedMotion) => {
  beforeEach(() => { state.locale = locale; state.reducedMotion = reducedMotion })

  it('asks the question in the words of the person and names the progress', () => {
    render(<Harness />)
    expect(heading()).toHaveTextContent(messages().what.question)
    expect(progress()).toMatch(/^(Passo|Step) 1 (de|of) \d$/)
  })

  it('scenario 1: answers a task with a date, a time and a reminder and creates once', async () => {
    render(<Harness />)
    await phrase(locale === 'en' ? 'call John' : 'ligar para o João')
    expect(heading()).toHaveTextContent(messages().when.question)
    await press(messages().when.tomorrow)
    await press('08:00')
    await press(messages().reminder.yes)
    expect(heading()).toHaveTextContent(messages().confirm.question)
    expect(helpers().form.getValues()).toMatchObject({ itemType: 'task', dueDate: '2026-11-14', dueTime: '08:00', reminderEnabled: true })
    await press('Criar tarefa')
    expect(submit).toHaveBeenCalledWith({ stepCount: 5, usedAiRead: false })
  })

  it('scenario 2: keeps an undated task in General when the answer is no date', async () => {
    render(<Harness />)
    await phrase(locale === 'en' ? 'tidy the garage' : 'arrumar a garagem')
    await press(messages().when.noDate)
    expect(helpers().isGeneral).toBe(true)
    expect(helpers().form.getValues('dueDate')).toBe('')
    expect(heading()).toHaveTextContent(messages().confirm.question)
  })

  it('scenario 3: reaches the reminder and then the summary from one phrase that holds the repeat and the time', async () => {
    render(<Harness />)
    await phrase(locale === 'en' ? 'take my pills every day at 8' : 'tomar remédio todo dia às 8')
    expect(heading().textContent).toContain(messages().reminder.question.split('{')[0]!.trim())
    expect(progress()).toMatch(/^(Passo|Step) 2 (de|of) 3$/)
    await press(messages().reminder.yes)
    expect(heading()).toHaveTextContent(messages().confirm.question)
    expect(state.read).not.toHaveBeenCalled()
  })

  it('scenario 4: sets a count habit in the repeat step and corrects it with the stepper', async () => {
    render(<Harness />)
    await phrase(locale === 'en' ? 'gym 3 times a week' : 'academia 3 vezes por semana')
    await press(messages().time.none)
    await press(new RegExp(`^${messages().summary.when}`))
    expect(heading()).toHaveTextContent(messages().repeat.question)
    expect(screen.getByRole('button', { name: messages().repeat.timesIn })).toHaveAttribute('aria-pressed', 'true')
    const before = helpers().form.getValues('frequencyQuantity') ?? 0
    await press(locale === 'en' ? en.habits.form.moreOften : ptBR.habits.form.moreOften)
    expect(helpers().form.getValues('frequencyQuantity')).toBe(before + 1)
  })

  it('scenario 6: reads a day in the words of the person, keeps unreadable words open and refuses a past day', async () => {
    render(<Harness />)
    await phrase(locale === 'en' ? 'call the bank' : 'ligar para o banco')
    await type(messages().when.freeLabel, 'quando der vontade')
    await press(messages().continue)
    expect(screen.getByText(messages().when.unresolved)).toBeInTheDocument()
    await type(messages().when.freeLabel, '2026-11-01')
    await press(messages().continue)
    expect(screen.getByText(messages().when.past)).toBeInTheDocument()
    expect(heading()).toHaveTextContent(messages().when.question)
    await type(messages().when.freeLabel, locale === 'en' ? 'the 20th' : 'dia 20')
    await press(messages().continue)
    expect(helpers().form.getValues('dueDate')).toBe('2026-11-20')
  })

  it('scenario 7: skips the date question under a General parent and shows the lock on the summary', async () => {
    render(<Harness lockedGeneral initial={{ isGeneral: true, itemType: 'task' }} />)
    await phrase(locale === 'en' ? 'pack the bag' : 'arrumar a mala')
    expect(heading()).toHaveTextContent(messages().confirm.question)
    expect(screen.queryByRole('button', { name: new RegExp(`^${messages().summary.when}`) })).not.toBeInTheDocument()
    expect(screen.getByText(locale === 'en' ? en.common.locked : ptBR.common.locked)).toBeInTheDocument()
  })

  it('scenario 8: opens a stored undated habit with its values and never converts it', () => {
    render(<Harness mode="edit" subHabits={false} initial={{ title: 'Alongar', itemType: 'habit', isGeneral: true }} />)
    expect(screen.getByRole('button', { name: new RegExp(`^${messages().summary.type}`) })).toHaveTextContent(locale === 'en' ? en.habits.form.typeHabit : ptBR.habits.form.typeHabit)
    expect(screen.getByRole('button', { name: new RegExp(`^${messages().summary.when}`) })).toHaveTextContent(messages().summary.noDate)
    expect(helpers().form.getValues()).toMatchObject({ itemType: 'habit', isGeneral: true })
    expect(helpers().form.formState.isDirty).toBe(false)
  })

  it('scenario 11: closes from step 1 and keeps the back slot empty there', async () => {
    render(<Harness />)
    expect(screen.queryByRole('button', { name: messages().back })).not.toBeInTheDocument()
    await press(messages().close)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('scenario 12: resets the answers that an edited phrase covers and keeps the others', async () => {
    render(<Harness />)
    await phrase(locale === 'en' ? 'call John' : 'ligar para o João')
    await press(messages().when.today)
    await press(messages().back)
    await press(messages().back)
    await type(messages().what.label, locale === 'en' ? 'call John at 9' : 'ligar para o João às 9')
    await press(messages().continue)
    expect(helpers().form.getValues('dueTime')).toBe('09:00')
    expect(heading().textContent).toContain(messages().reminder.question.split('{')[0]!.trim())
  })

  it('scenario 13: keeps the summary with the server message after a failed save', async () => {
    render(<Harness saveError="Servidor indisponível" />)
    await phrase(locale === 'en' ? 'take my pills every day at 8' : 'tomar remédio todo dia às 8')
    await press(messages().reminder.no)
    expect(screen.getByRole('alert')).toHaveTextContent('Servidor indisponível')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('scenario 13: opens and focuses the step that owns a server field error', async () => {
    render(<Harness />)
    await phrase(locale === 'en' ? 'take my pills every day at 8' : 'tomar remédio todo dia às 8')
    await press(messages().reminder.no)
    await act(async () => { helpers().reportBackendErrors({ status: 400, data: { errors: { Title: ['Too long'] } } }) })
    expect(heading()).toHaveTextContent(messages().what.question)
  })

  it('scenario 14: asks the remaining questions with no error after a miss and a failed call, and reads one phrase once', async () => {
    state.read.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('offline'))
    render(<Harness />)
    await phrase(locale === 'en' ? 'water the plants' : 'regar as plantas')
    expect(heading()).toHaveTextContent(messages().when.question)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await press(messages().back)
    await press(messages().continue)
    expect(state.read).toHaveBeenCalledTimes(1)
    await press(messages().back)
    await phrase(locale === 'en' ? 'water the big plants' : 'regar as plantas grandes')
    expect(heading()).toHaveTextContent(messages().when.question)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(state.read).toHaveBeenCalledTimes(2)
  })

  it('scenario 14: skips the steps the free read answered, marks them proposed, and keeps a deliberate task on a later read', async () => {
    state.read.mockResolvedValue({ read: true, emoji: '🪴', frequencyUnit: 'Day', frequencyQuantity: 1, days: [], isFlexible: false, flexibleTarget: null, dueTime: '07:00', subHabits: [], checklistItems: [] })
    render(<Harness />)
    await phrase(locale === 'en' ? 'water the plants' : 'regar as plantas')
    expect(heading().textContent).toContain(messages().reminder.question.split('{')[0]!.trim())
    await press(messages().reminder.no)
    expect(helpers().form.getValues()).toMatchObject({ itemType: 'habit', frequencyUnit: 'Day', dueTime: '07:00' })
    expect(screen.getAllByLabelText(locale === 'en' ? en.habits.detail.proposed : ptBR.habits.detail.proposed).length).toBeGreaterThan(0)
    await press(new RegExp(`^${messages().summary.type}`))
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: new RegExp(locale === 'en' ? en.habits.form.typeTask : ptBR.habits.form.typeTask) })) })
    await press(new RegExp(`^${messages().summary.title}`))
    await press(messages().continue)
    expect(helpers().form.getValues('itemType')).toBe('task')
    expect(helpers().form.getValues('frequencyUnit') ?? null).toBeNull()
  })

  it('scenario 14: proposes the emoji of the free read and marks a used read', async () => {
    state.read.mockResolvedValue({ read: true, emoji: '🪴', frequencyUnit: null, frequencyQuantity: null, days: [], isFlexible: false, flexibleTarget: null, dueTime: null, subHabits: [], checklistItems: [] })
    render(<Harness />)
    await phrase(locale === 'en' ? 'water the plants' : 'regar as plantas')
    expect(helpers().form.getValues('emoji')).toBe('🪴')
    await press(messages().when.noDate)
    await press('Criar tarefa')
    expect(submit).toHaveBeenCalledWith({ stepCount: 3, usedAiRead: true })
  })

  it('scenario 15: reads on the device offline, names the state, and calls no reader', async () => {
    state.online = false
    render(<Harness />)
    expect(screen.getByText(messages().orbit.offline)).toBeInTheDocument()
    await phrase(locale === 'en' ? 'water the plants' : 'regar as plantas')
    expect(state.read).not.toHaveBeenCalled()
    expect(heading()).toHaveTextContent(messages().when.question)
    expect(document.querySelector('[data-question-flow]')).toHaveAttribute('data-orbit-state', 'parado')
  })

  it('scenario 16: creates at the message limit with no upsell and no capacity notice', async () => {
    state.messagesUsed = 5
    render(<Harness />)
    await phrase(locale === 'en' ? 'water the plants' : 'regar as plantas')
    await press(messages().when.noDate)
    expect(document.body.textContent).not.toMatch(/Pro|upgrade|limite|limit/i)
    await press('Criar tarefa')
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('scenario 19: advances one step on a double press of an option and submits once per press', async () => {
    render(<Harness />)
    await phrase(locale === 'en' ? 'call John' : 'ligar para o João')
    const today = screen.getByRole('button', { name: messages().when.today })
    await act(async () => { today.click(); today.click() })
    expect(heading()).toHaveTextContent(messages().time.question)
  })

  it('shows the hint and focuses the phrase field on an empty submit', async () => {
    render(<Harness />)
    await press(messages().continue)
    expect(screen.getByText(messages().what.hint)).toBeInTheDocument()
    expect(screen.getByLabelText(messages().what.label)).toHaveFocus()
    expect(heading()).toHaveTextContent(messages().what.question)
  })

  it('moves focus to the question after a step change and describes it with the Orbit line', async () => {
    render(<Harness />)
    await phrase(locale === 'en' ? 'call John' : 'ligar para o João')
    expect(heading()).toHaveFocus()
    expect(heading()).toHaveAccessibleDescription(messages().when.line)
  })
})

describe.each(['pt-BR', 'en'] as const)('the detail questions in %s', (locale) => {
  beforeEach(() => { state.locale = locale; state.reducedMotion = false })

  async function toSummary() {
    render(<Harness />)
    await phrase(locale === 'en' ? 'run every day at 7' : 'correr todo dia às 7')
    await press(messages().reminder.no)
  }
  async function openOptional(question: string) {
    await press(messages().more)
    await press(new RegExp(question))
    expect(heading()).toHaveTextContent(question)
  }

  it('scenario 17: lists every optional question as a question with its answer', async () => {
    await toSummary()
    await press(messages().more)
    const list = screen.getByRole('list', { name: messages().more })
    for (const id of ['description', 'checklist', 'subHabits', 'avoid', 'tags', 'goals', 'endDate'] as const) {
      expect(within(list).getByRole('button', { name: new RegExp(messages().optional[id].replace('?', '\\?')) })).toBeInTheDocument()
    }
  })

  it('scenario 17: writes the description and returns to the list', async () => {
    await toSummary()
    await openOptional(messages().optional.description)
    await type(messages().optional.description, 'Antes do café')
    await press(messages().continue)
    expect(helpers().form.getValues('description')).toBe('Antes do café')
    expect(heading()).toHaveTextContent(messages().more)
  })

  it('scenario 17: loads a checklist template inside the steps question', async () => {
    await toSummary()
    await openOptional(messages().optional.checklist)
    await press('use-template')
    expect(helpers().form.getValues('checklistItems')).toEqual([{ text: 'Separar roupa', isChecked: false }])
  })

  it('scenario 17: hosts the sub-item editor, the tag picker and the goal link', async () => {
    await toSummary()
    await openOptional(messages().optional.subHabits)
    expect(screen.getByText('sub-habit-editor')).toBeInTheDocument()
    await press(messages().continue)
    await press(new RegExp(messages().optional.tags.replace('?', '\\?')))
    await press('pick-tag')
    await press(messages().continue)
    await press(new RegExp(messages().optional.goals.replace('?', '\\?')))
    await press('link-goal')
    expect(state.goalToggle).toHaveBeenCalledWith('goal-1')
  })

  it.each([true, false])('scenario 17: asks for the slip alert after a habit to avoid, with Pro %s', async (pro) => {
    state.pro = pro
    await toSummary()
    await openOptional(messages().optional.avoid)
    await press(messages().optional.yes)
    expect(helpers().form.getValues('isBadHabit')).toBe(true)
    expect(heading()).toHaveTextContent(messages().optional.slipAlert)
    if (pro) {
      await act(async () => { fireEvent.click(screen.getByRole('switch')) })
      expect(helpers().form.getValues('slipAlertEnabled')).toBe(true)
    } else {
      expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    }
    await press(messages().continue)
    expect(heading()).toHaveTextContent(messages().more)
  })

  it('scenario 17: adds and removes an end date', async () => {
    await toSummary()
    await openOptional(messages().optional.endDate)
    await act(async () => { helpers().form.setValue('endDate', '2026-12-31', { shouldDirty: true }) })
    await press(messages().optional.removeEndDate)
    expect(helpers().form.getValues('endDate')).toBe('')
    await press(messages().optional.none)
    expect(heading()).toHaveTextContent(messages().more)
  })

  it('scenario 17: shows the parent question in edit only', async () => {
    render(<Harness mode="edit" parentField={<p>parent-picker</p>} subHabits={false} initial={{ title: 'Correr', itemType: 'habit', frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-11-13' }} />)
    await press(messages().more)
    await press(new RegExp(messages().optional.parent.replace('?', '\\?')))
    expect(screen.getByText('parent-picker')).toBeInTheDocument()
  })

  it('scenario 18: opens the reminder kinds from the reminder value with the permission notice and each editor', async () => {
    await toSummary()
    await press(new RegExp(`^${messages().summary.reminder}`))
    expect(heading()).toHaveTextContent(messages().reminderKind.question)
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: locale === 'en' ? en.habits.form.reminder : ptBR.habits.form.reminder })) })
    expect(helpers().form.getValues('reminderEnabled')).toBe(true)
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: new RegExp(locale === 'en' ? en.habits.form.repeatEvery : ptBR.habits.form.repeatEvery) })) })
    expect(helpers().form.getValues('repeatReminder')).toMatchObject({ intervalMinutes: 30 })
  })

  it('opens the end time question from the length value and refuses an end before the start', async () => {
    await toSummary()
    await press(new RegExp(`^${messages().summary.duration}`))
    expect(heading()).toHaveTextContent(messages().duration.question)
    await act(async () => { helpers().form.setValue('dueEndTime', '06:00', { shouldDirty: true }) })
    await press(messages().continue)
    expect(heading()).toHaveTextContent(messages().duration.question)
    await press(messages().duration.none)
    expect(helpers().form.getValues('dueEndTime')).toBe('')
    expect(heading()).toHaveTextContent(messages().confirm.question)
  })
})

describe.each(['pt-BR', 'en'] as const)('the monthly repeat and the conversation draft in %s', (locale) => {
  beforeEach(() => { state.locale = locale; state.reducedMotion = false })

  it('scenario 5: picks days 1 and 15 of the month and notes the short months for day 31', async () => {
    render(<Harness mode="edit" subHabits={false} initial={{ title: 'Pagar contas', itemType: 'habit', frequencyUnit: 'Month', frequencyQuantity: 1, isFlexible: false, dueDate: '2026-11-13', monthDays: [] }} />)
    await press(new RegExp(`^${messages().summary.when}`))
    expect(heading()).toHaveTextContent(messages().repeat.question)
    const days = within(screen.getByRole('group', { name: (locale === 'en' ? en : ptBR).habits.form.monthDaysQuestion }))
    await act(async () => { fireEvent.click(days.getByRole('button', { name: '1' })) })
    await act(async () => { fireEvent.click(days.getByRole('button', { name: '15' })) })
    expect(helpers().form.getValues('monthDays')).toEqual(expect.arrayContaining([1, 15]))
    await act(async () => { fireEvent.click(days.getByRole('button', { name: '31' })) })
    expect(screen.getByText((locale === 'en' ? en : ptBR).habits.form.monthDaysShortMonth)).toBeInTheDocument()
  })

  it('scenario 10: opens a conversation draft on the summary with the notice', () => {
    render(<GuidedFromConversation />)
    expect(heading()).toHaveTextContent(messages().confirm.question)
    expect(heading()).toHaveAccessibleDescription(messages().orbit.fromConversation)
  })
})

function GuidedFromConversation() {
  const formHelpers = useHabitForm({ initialData: { title: 'Ler 10 páginas', itemType: 'habit', frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-11-13' } })
  const tags = useTagSelection()
  return <GuidedHabitFlow mode="edit" formHelpers={formHelpers} lockedGeneral={null} fromConversation pending={false} saveError={null} createLabel="Salvar" onSubmit={submit} onClose={close}
    fields={{ tags, selectedGoalIds: [], atGoalLimit: false, onToggleGoal: vi.fn(), reminderTimes: [], onReminderTimesChange: vi.fn() }} />
}

describe('the guided edit flow', () => {
  beforeEach(() => { state.locale = 'pt-BR'; state.reducedMotion = false })

  it('scenario 9 and 10: opens on the summary with the stored values and leaves an unchanged edit clean', () => {
    render(<Harness mode="edit" subHabits={false} initial={{ title: 'Correr', itemType: 'habit', frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-11-13', dueTime: '07:00' }} />)
    expect(heading()).toHaveTextContent(ptBR.habits.flow.confirm.question)
    expect(screen.getByRole('button', { name: /Hora/ })).toHaveTextContent('07:00')
    expect(helpers().form.formState.isDirty).toBe(false)
    expect(state.read).not.toHaveBeenCalled()
  })

  it('scenario 9: changes the time only and returns to the summary', async () => {
    render(<Harness mode="edit" subHabits={false} initial={{ title: 'Correr', itemType: 'habit', frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-11-13', dueTime: '07:00' }} />)
    await press(/Hora/)
    await press('20:00')
    expect(heading()).toHaveTextContent(ptBR.habits.flow.confirm.question)
    expect(helpers().form.getValues()).toMatchObject({ title: 'Correr', frequencyUnit: 'Day', dueDate: '2026-11-13', dueTime: '20:00' })
  })

  it('renames in edit with no read of the new words', async () => {
    render(<Harness mode="edit" subHabits={false} initial={{ title: 'Correr', itemType: 'habit', frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-11-13' }} />)
    await press(new RegExp(ptBR.habits.flow.summary.title))
    await type(ptBR.habits.flow.what.label, 'Correr às 9')
    await press(ptBR.habits.flow.continue)
    expect(helpers().form.getValues()).toMatchObject({ title: 'Correr às 9', dueTime: '' })
    expect(heading()).toHaveTextContent(ptBR.habits.flow.confirm.question)
    expect(state.read).not.toHaveBeenCalled()
  })
})
