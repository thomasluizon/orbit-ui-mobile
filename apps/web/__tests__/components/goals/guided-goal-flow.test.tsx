import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { buildGoalCreationRequest, createGoalDraft } from '@orbit/shared/hooks'
import { CreateGoalSheet } from '@/components/goals/create-goal-sheet'
import { EditGoalModal } from '@/components/goals/edit-goal-modal'

const mocks = vi.hoisted(() => ({
  guided: true,
  create: vi.fn(),
  update: vi.fn(),
  completed: vi.fn(),
  timeZone: 'UTC' as string | undefined,
  habits: { data: { habitsById: new Map<string, ReturnType<typeof createMockHabit>>() }, isLoading: false, isError: false, refetch: vi.fn() },
}))

vi.mock('@/hooks/use-flag', () => ({ useFlag: () => mocks.guided }))
vi.mock('@/hooks/use-goals', () => ({
  useCreateGoal: () => ({ mutateAsync: mocks.create, isPending: false }),
  useUpdateGoal: () => ({ mutateAsync: mocks.update, isPending: false }),
}))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabits: () => mocks.habits }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: mocks.timeZone } }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/lib/posthog', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/posthog')>(), captureGuidedFlowCompleted: mocks.completed, captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/components/ui/sheet', async () => await import('@/__tests__/support/sheet-double'))
vi.mock('@/components/ui/date-field', () => ({
  DateField: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) =>
    <input aria-label={label} type="date" value={value} onChange={(event) => onChange(event.target.value)} />,
}))
vi.mock('@/components/habits/create-habit-modal', () => ({
  CreateHabitModal: ({ onOpenChange }: { onOpenChange: (open: boolean) => void }) => <button type="button" onClick={() => onOpenChange(false)}>Finish habit creation</button>,
}))

type Locale = 'en' | 'pt-BR'
const messages = (locale: Locale) => (locale === 'en' ? en : ptBR)

function renderWith(locale: Locale, element: React.ReactElement) {
  return render(<NextIntlClientProvider locale={locale} messages={messages(locale)} timeZone="UTC">{element}</NextIntlClientProvider>)
}

const heading = () => screen.getByRole('heading', { level: 1 })
const progress = () => screen.getByRole('list').getAttribute('aria-label')
async function press(name: string | RegExp) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}
async function type(label: string, value: string) {
  await act(async () => { fireEvent.change(screen.getByLabelText(label), { target: { value } }) })
}
async function submitField(label: string) {
  await act(async () => { fireEvent.keyDown(screen.getByLabelText(label), { key: 'Enter' }) })
}
const resultDialog = () => document.querySelector('[data-result-dialog]')

function addHabits(count: number) {
  for (let index = 1; index <= count; index += 1) {
    const habit = createMockHabit({ id: `h${index}`, title: `Habit ${index}` })
    mocks.habits.data.habitsById.set(habit.id, habit)
  }
}

beforeEach(() => {
  mocks.guided = true
  mocks.create.mockReset().mockResolvedValue({ id: 'goal-new' })
  mocks.update.mockReset().mockResolvedValue(undefined)
  mocks.completed.mockReset()
  mocks.timeZone = 'UTC'
  mocks.habits.data.habitsById.clear()
  mocks.habits.isLoading = false
  mocks.habits.isError = false
  mocks.habits.refetch.mockReset()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('the guided goal create flow', () => {
  it('creates a standard goal through every step and closes with the result dialog', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'))
    addHabits(2)
    const onCreated = vi.fn()
    const onOpenGoal = vi.fn()
    const onClose = vi.fn()
    renderWith('pt-BR', <CreateGoalSheet open onClose={onClose} onCreated={onCreated} onOpenGoal={onOpenGoal} />)
    expect(heading()).toHaveTextContent('O que você quer alcançar?')
    expect(progress()).toBe('Passo 1 de 6')
    await type('O que você quer alcançar?', 'Ler 12 livros')
    await press('Continuar')
    expect(heading()).toHaveTextContent('Como você quer acompanhar?')
    await press('Progresso')
    expect(heading()).toHaveTextContent('Quanto?')
    await type('Quanto?', '12')
    await type('De quê?', 'livros')
    await press('Continuar')
    expect(heading()).toHaveTextContent('Até quando?')
    await press('Fim do ano')
    expect(heading()).toHaveTextContent('Quais hábitos contam para essa meta?')
    await press('Habit 1')
    await press('Continuar')
    expect(heading()).toHaveTextContent('É isso?')
    await press('Criar meta')
    const draft = { ...createGoalDraft(), description: 'Ler 12 livros', targetValue: '12', unit: 'livros', deadline: '2026-12-31', habitIds: ['h1'] }
    expect(mocks.create).toHaveBeenCalledWith(buildGoalCreationRequest(draft))
    expect(onCreated).toHaveBeenCalledWith('goal-new', ['h1'])
    expect(mocks.completed).toHaveBeenCalledWith('goal_create', 6, false)
    expect(resultDialog()).toHaveAttribute('data-orbit-state', 'feliz')
    expect(screen.getByText('A meta "Ler 12 livros" vai até 31 de dezembro de 2026.')).toBeInTheDocument()
    await press('Ver a meta')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onOpenGoal).toHaveBeenCalledWith('goal-new')
  })

  it('creates a streak goal with no deadline and no linked habit, with the request of the current sheet', async () => {
    renderWith('en', <CreateGoalSheet open onClose={vi.fn()} />)
    await type('What do you want to reach?', 'Gym days')
    await press('Continue')
    await press('Streak')
    expect(heading()).toHaveTextContent('How many days in a row?')
    await type('How many days in a row?', '30')
    await press('Continue')
    await press('No deadline')
    await press('Continue')
    await press('Create goal')
    const draft = { ...createGoalDraft(), goalType: 'Streak' as const, description: 'Gym days', targetValue: '30', unit: en.goals.form.streakUnit, deadline: '' }
    expect(mocks.create).toHaveBeenCalledWith(buildGoalCreationRequest(draft))
    expect(mocks.create.mock.calls[0]![0]).not.toHaveProperty('deadline')
    expect(screen.getByText('The goal "Gym days" is set with no deadline.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
  })

  it('skips the habits for a goal that starts from a habit and shows that habit on the summary', async () => {
    renderWith('en', <CreateGoalSheet open onClose={vi.fn()} initialHabitIds={['habit-read']} fromHabit={{ title: 'Read' }} />)
    expect(progress()).toBe('Step 1 of 5')
    await type('What do you want to reach?', 'Read 12 books')
    await press('Continue')
    await press('Progress')
    await type('How much?', '12')
    await type('Of what?', 'books')
    await press('Continue')
    await press('End of the month')
    expect(heading()).toHaveTextContent('Is this right?')
    expect(screen.getByText('Read')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Linked habits/ })).not.toBeInTheDocument()
    await press('Create goal')
    expect(mocks.create.mock.calls[0]![0]).toMatchObject({ habitIds: ['habit-read'], title: 'Read 12 books', targetValue: 12, unit: 'books', type: 'Standard' })
  })

  it('resolves the end of the month and the end of the year in the account time zone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-01T02:00:00Z'))
    mocks.timeZone = 'America/Sao_Paulo'
    renderWith('pt-BR', <CreateGoalSheet open onClose={vi.fn()} initialHabitIds={['h1']} />)
    await type('O que você quer alcançar?', 'Correr')
    await press('Continuar')
    await press('Progresso')
    await type('Quanto?', '50')
    await type('De quê?', 'km')
    await press('Continuar')
    await press('Fim do mês')
    await press(/^Até quando/)
    expect(screen.getByRole('button', { name: 'Fim do mês' })).toHaveAttribute('aria-pressed', 'true')
    await press('Fim do ano')
    await press('Criar meta')
    expect(mocks.create.mock.calls[0]![0]).toMatchObject({ deadline: '2026-12-31' })
  })

  it('reads typed words, refuses a past date and takes the date picker', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'))
    renderWith('en', <CreateGoalSheet open onClose={vi.fn()} initialHabitIds={['h1']} />)
    await type('What do you want to reach?', 'Run')
    await press('Continue')
    await press('Progress')
    await type('How much?', '5')
    await type('Of what?', 'km')
    await press('Continue')
    await type('Or say it in your words', 'whenever')
    await submitField('Or say it in your words')
    expect(screen.getByText(en.habits.flow.when.unresolved)).toBeInTheDocument()
    await type('Or say it in your words', '2020-01-01')
    await submitField('Or say it in your words')
    expect(screen.getByText(en.goals.form.deadlineInPast)).toBeInTheDocument()
    expect(heading()).toHaveTextContent('By when?')
    await type('Or say it in your words', '2026-12-20')
    await submitField('Or say it in your words')
    expect(heading()).toHaveTextContent('Is this right?')
    await press(/^By when/)
    await type('Pick on the calendar', '2027-01-15')
    expect(heading()).toHaveTextContent('Is this right?')
    await press('Create goal')
    expect(mocks.create.mock.calls[0]![0]).toMatchObject({ deadline: '2027-01-15' })
    expect(screen.getByText(/The goal "Run" runs until January 15, 2027\./)).toBeInTheDocument()
  })

  it('keeps the step with the hint of the current form on an empty answer', async () => {
    renderWith('pt-BR', <CreateGoalSheet open onClose={vi.fn()} />)
    await press('Continuar')
    expect(screen.getByText(ptBR.goals.form.titleRequired)).toBeInTheDocument()
    expect(heading()).toHaveTextContent('O que você quer alcançar?')
    await type('O que você quer alcançar?', 'Ler')
    await press('Continuar')
    await press('Progresso')
    await type('Quanto?', '0')
    await press('Continuar')
    expect(screen.getByText(ptBR.goals.form.targetValueRequired)).toBeInTheDocument()
    expect(heading()).toHaveTextContent('Quanto?')
  })

  it('goes back with every answer kept', async () => {
    renderWith('en', <CreateGoalSheet open onClose={vi.fn()} />)
    await type('What do you want to reach?', 'Read more')
    await press('Continue')
    await press('Back')
    expect(heading()).toHaveTextContent('What do you want to reach?')
    expect(screen.getByLabelText('What do you want to reach?')).toHaveValue('Read more')
  })

  it('opens a value of the summary and returns to the summary', async () => {
    renderWith('en', <CreateGoalSheet open onClose={vi.fn()} initialHabitIds={['h1']} />)
    await type('What do you want to reach?', 'Run')
    await press('Continue')
    await press('Progress')
    await type('How much?', '5')
    await type('Of what?', 'km')
    await press('Continue')
    await press('No deadline')
    await press(/^Your goal/)
    expect(heading()).toHaveTextContent('What do you want to reach?')
    await type('What do you want to reach?', 'Run far')
    await press('Continue')
    expect(heading()).toHaveTextContent('Is this right?')
    expect(screen.getByText('Run far')).toBeInTheDocument()
  })

  it('keeps the summary open with the server message after a failed save, with no result dialog', async () => {
    mocks.create.mockRejectedValue(new Error('Server down'))
    renderWith('en', <CreateGoalSheet open onClose={vi.fn()} initialHabitIds={['h1']} />)
    await type('What do you want to reach?', 'Run')
    await press('Continue')
    await press('Progress')
    await type('How much?', '5')
    await type('Of what?', 'km')
    await press('Continue')
    await press('No deadline')
    await press('Create goal')
    expect(heading()).toHaveTextContent('Is this right?')
    expect(screen.getByRole('alert')).toHaveTextContent(en.goals.form.createError)
    expect(resultDialog()).toBeNull()
  })

  it('asks before it drops a draft and closes a clean flow at once', async () => {
    const onClose = vi.fn()
    const view = renderWith('en', <CreateGoalSheet open onClose={onClose} />)
    await press('Close')
    expect(onClose).toHaveBeenCalledTimes(1)
    view.unmount()
    renderWith('en', <CreateGoalSheet open onClose={onClose} />)
    await type('What do you want to reach?', 'Run')
    await press('Close')
    expect(screen.getByRole('button', { name: en.common.discardChangesAction })).toBeInTheDocument()
    expect(onClose).toHaveBeenCalledTimes(1)
    await press(en.common.discardChangesAction)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('starts a fresh flow from the result dialog', async () => {
    renderWith('en', <CreateGoalSheet open onClose={vi.fn()} initialHabitIds={['h1']} />)
    await type('What do you want to reach?', 'Run')
    await press('Continue')
    await press('Progress')
    await type('How much?', '5')
    await type('Of what?', 'km')
    await press('Continue')
    await press('No deadline')
    await press('Create goal')
    await press('Create another')
    expect(heading()).toHaveTextContent('What do you want to reach?')
    expect(screen.getByLabelText('What do you want to reach?')).toHaveValue('')
  })
})

describe('the Which habits step', () => {
  async function reachHabits(locale: Locale = 'en') {
    renderWith(locale, <CreateGoalSheet open onClose={vi.fn()} />)
    await type(messages(locale).goals.form.title, 'Run')
    await press(messages(locale).habits.flow.continue)
    await press(messages(locale).goals.form.typeStandard)
    await type(messages(locale).goals.form.targetValueQuestion, '5')
    await type(messages(locale).goals.form.unitQuestion, 'km')
    await press(messages(locale).habits.flow.continue)
    await press(messages(locale).goals.flow.deadline.none)
  }

  it('shows four habits as quick options and searches the rest, with a miss', async () => {
    addHabits(6)
    await reachHabits()
    const options = within(screen.getByRole('group', { name: 'Which habits count toward this goal?' })).getAllByRole('button')
    expect(options.map((option) => option.textContent)).toEqual(['Habit 1', 'Habit 2', 'Habit 3', 'Habit 4'])
    await type('Search habits', 'Habit 6')
    await press('Habit 6')
    await type('Search habits', 'nothing like it')
    expect(screen.getByText(en.habits.moveParent.noSearchResults)).toBeInTheDocument()
    await press('Continue')
    await press('Create goal')
    expect(mocks.create.mock.calls[0]![0]).toMatchObject({ habitIds: ['h6'] })
  })

  it('dims the other habits at the limit of twenty and says why', async () => {
    addHabits(24)
    renderWith('en', <CreateGoalSheet open onClose={vi.fn()} initialHabitIds={[]} />)
    await type('What do you want to reach?', 'Run')
    await press('Continue')
    await press('Progress')
    await type('How much?', '5')
    await type('Of what?', 'km')
    await press('Continue')
    await press('No deadline')
    for (let index = 1; index <= 20; index += 1) {
      await type('Search habits', `Habit ${index}`)
      await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: `Habit ${index}` }).at(-1)!) })
    }
    await type('Search habits', 'Habit 24')
    expect(screen.getAllByRole('button', { name: 'Habit 24' }).at(-1)).toBeDisabled()
    expect(screen.getByText('20 habits is the limit for one goal.')).toBeInTheDocument()
  })

  it('shows a skeleton while the habits load and a retry after an error', async () => {
    mocks.habits.isLoading = true
    const view = renderWith('en', <CreateGoalSheet open onClose={vi.fn()} />)
    await reachHabitsFromRender()
    expect(screen.getByRole('progressbar', { name: en.common.loading })).toBeInTheDocument()
    view.unmount()
    mocks.habits.isLoading = false
    mocks.habits.isError = true
    await reachHabits()
    await press(en.common.retry)
    expect(mocks.habits.refetch).toHaveBeenCalledTimes(1)
  })

  async function reachHabitsFromRender() {
    await type('What do you want to reach?', 'Run')
    await press('Continue')
    await press('Progress')
    await type('How much?', '5')
    await type('Of what?', 'km')
    await press('Continue')
    await press('No deadline')
  }

  it('creates a habit from the step when the person has none', async () => {
    await reachHabits('pt-BR')
    expect(screen.getByText(ptBR.goals.form.habitsInvitation)).toBeInTheDocument()
    await press(ptBR.habits.createHabit)
    await press('Finish habit creation')
    expect(heading()).toHaveTextContent('Quais hábitos contam para essa meta?')
  })
})

describe('the guided goal edit flow', () => {
  const goal = { id: 'g1', title: 'Run 100km', targetValue: 100, unit: 'km', deadline: '2026-12-31', type: 'Standard' }

  it('opens on the summary with the stored values and saves one change with the request of the current modal', async () => {
    const onOpenChange = vi.fn()
    renderWith('en', <EditGoalModal open onOpenChange={onOpenChange} goal={goal} />)
    expect(heading()).toHaveTextContent('Is this right?')
    expect(screen.getByRole('button', { name: /Your goal/ })).toHaveTextContent('Run 100km')
    expect(screen.getByRole('button', { name: /How much/ })).toHaveTextContent('100 km')
    expect(screen.getByText('Progress')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Tracking/ })).not.toBeInTheDocument()
    await press(/^By when/)
    await press('No deadline')
    expect(heading()).toHaveTextContent('Is this right?')
    await press('Save')
    expect(mocks.update).toHaveBeenCalledWith({ goalId: 'g1', data: { title: 'Run 100km', targetValue: 100, unit: 'km', deadline: null } })
    expect(mocks.completed).toHaveBeenCalledWith('goal_edit', 1, false)
    expect(screen.getByText('The goal "Run 100km" is saved with no deadline.')).toBeInTheDocument()
    await press('View the goal')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes an unchanged edit with no discard prompt', async () => {
    const onOpenChange = vi.fn()
    renderWith('pt-BR', <EditGoalModal open onOpenChange={onOpenChange} goal={goal} />)
    await press(/^Até quando/)
    await press('Voltar')
    await press('Fechar')
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.queryByRole('button', { name: ptBR.common.discardChangesAction })).not.toBeInTheDocument()
  })

  it('asks before it drops a changed edit', async () => {
    const onOpenChange = vi.fn()
    renderWith('en', <EditGoalModal open onOpenChange={onOpenChange} goal={goal} />)
    await press(/^How much/)
    await type('How much?', '120')
    await press('Continue')
    await press('Close')
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: en.common.discardChangesAction })).toBeInTheDocument()
  })

  it('keeps the summary with the server message after a failed save', async () => {
    mocks.update.mockRejectedValue(new Error('down'))
    renderWith('en', <EditGoalModal open onOpenChange={vi.fn()} goal={goal} />)
    await press(/^How much/)
    await type('How much?', '120')
    await press('Continue')
    await press('Save')
    expect(screen.getByRole('alert')).toHaveTextContent(en.goals.errors.update)
    expect(resultDialog()).toBeNull()
  })
})

describe('with the flag off', () => {
  it('renders the current create sheet and the current edit modal', () => {
    mocks.guided = false
    const create = renderWith('en', <CreateGoalSheet open onClose={vi.fn()} />)
    expect(screen.getByText(en.goals.form.habitsExplainer)).toBeInTheDocument()
    expect(document.querySelector('[data-question-flow]')).toBeNull()
    create.unmount()
    renderWith('en', <EditGoalModal open onOpenChange={vi.fn()} goal={{ id: 'g1', title: 'Run', targetValue: 5, unit: 'km', deadline: null }} />)
    expect(screen.getByDisplayValue('Run')).toBeInTheDocument()
    expect(document.querySelector('[data-question-flow]')).toBeNull()
  })
})
