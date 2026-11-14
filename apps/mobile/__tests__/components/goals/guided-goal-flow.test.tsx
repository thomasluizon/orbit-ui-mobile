import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-test-renderer'
import { createMockHabit } from '@orbit/shared/__tests__/factories'
import { buildGoalCreationRequest, createGoalDraft } from '@orbit/shared/hooks'
import { createApiClientError } from '@orbit/shared/utils'
import { CreateGoalSheet } from '@/components/goals/create-goal-sheet'
import { EditGoalModal } from '@/components/goals/edit-goal-modal'
import { i18n } from '@/lib/i18n'
import { press, renderNavigation } from '../ui/navigation-render'

const mocks = vi.hoisted(() => ({
  guided: true,
  create: vi.fn(),
  update: vi.fn(),
  completed: vi.fn(),
  timeZone: 'UTC',
  habits: { data: { habitsById: new Map<string, unknown>() }, isLoading: false, isError: false, refetch: vi.fn() },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => i18n.t(key, params), i18n: { language: i18n.language } }),
}))
vi.mock('@/hooks/use-flag', () => ({ useFlag: () => mocks.guided }))
vi.mock('@/hooks/use-goals', () => ({
  useCreateGoal: () => ({ mutateAsync: mocks.create, isPending: false }),
  useUpdateGoal: () => ({ mutateAsync: mocks.update, isPending: false }),
}))
vi.mock('@/hooks/use-habit-queries', () => ({ useHabits: () => mocks.habits }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: mocks.timeZone } }) }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn() }) }))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: mocks.completed }))
vi.mock('@/components/habits/create-habit-modal', async () => {
  const { createElement } = await import('react')
  return { CreateHabitModal: ({ onClose }: { onClose: () => void }) => createElement('Pressable', { accessibilityRole: 'button', accessibilityLabel: 'Finish habit creation', onPress: onClose }) }
})

type Tree = ReturnType<typeof renderNavigation>
type Host = ReturnType<Tree['hosts']>[number]

function textOf(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  const children = (node as { props?: { children?: unknown } } | null)?.props?.children
  return children === undefined ? '' : textOf(children)
}
const headings = (tree: Tree) => tree.hosts().filter((node) => node.props.accessibilityRole === 'header').map((node) => textOf(node))
const heading = (tree: Tree) => headings(tree)[0] ?? ''
const progress = (tree: Tree) => tree.hosts().find((node) => /^(Passo|Step) \d+ (de|of) \d+$/.test(node.props.accessibilityLabel ?? ''))?.props.accessibilityLabel
const texts = (tree: Tree) => tree.hosts().filter((node) => node.type === 'Text').map((node) => textOf(node))
function nameOf(node: Host): string {
  return node.props.accessibilityLabel ?? (node.props.accessibilityRole === 'button' ? textOf(node) : '')
}
function control(tree: Tree, label: string | RegExp): Host {
  const matches = tree.hosts().filter((node) => typeof label === 'string' ? nameOf(node) === label : label.test(nameOf(node)))
  const target = matches.find((node) => node.props.onPress) ?? matches[0]
  if (!target) throw new Error(`no control named ${String(label)}`)
  return target
}
async function tap(tree: Tree, label: string | RegExp) {
  const target = control(tree, label)
  await act(async () => { press(target); await Promise.resolve() })
}
async function type(tree: Tree, label: string, text: string) {
  const input = tree.hosts().find((node) => (node.props as { onChangeText?: unknown }).onChangeText && node.props.accessibilityLabel === label)
  if (!input) throw new Error(`no field named ${label}`)
  await act(async () => { (input.props as unknown as { onChangeText: (value: string) => void }).onChangeText(text); await Promise.resolve() })
}
async function submit(tree: Tree, label: string) {
  const input = tree.hosts().find((node) => node.props.accessibilityLabel === label && (node.props as { onSubmitEditing?: unknown }).onSubmitEditing)
  await act(async () => { (input!.props as unknown as { onSubmitEditing: () => void }).onSubmitEditing(); await Promise.resolve() })
}
async function androidBack(tree: Tree) {
  const modal = tree.hosts().find((node) => node.type === 'Modal')
  await act(async () => { (modal!.props as unknown as { onRequestClose: () => void }).onRequestClose(); await Promise.resolve() })
}
const resultDialog = (tree: Tree) => tree.hosts().find((node) => node.props.testID === 'result-dialog')
const resultSentence = (tree: Tree) => (resultDialog(tree)?.props as Record<string, unknown> | undefined)?.accessibilityHint

function addHabits(count: number) {
  for (let index = 1; index <= count; index += 1) mocks.habits.data.habitsById.set(`h${index}`, createMockHabit({ id: `h${index}`, title: `Habit ${index}` }))
}

async function answerUpToDeadline(tree: Tree, copy: { title: string; continue: string; standard: string; how: string; what: string }) {
  await type(tree, copy.title, 'Run')
  await tap(tree, copy.continue)
  await tap(tree, copy.standard)
  await type(tree, copy.how, '5')
  await type(tree, copy.what, 'km')
  await tap(tree, copy.continue)
}
const EN = { title: 'What do you want to reach?', continue: 'Continue', standard: 'Progress', how: 'How much?', what: 'Of what?' }
const PT = { title: 'O que você quer alcançar?', continue: 'Continuar', standard: 'Progresso', how: 'Quanto?', what: 'De quê?' }

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
  mocks.guided = true
  mocks.create.mockReset().mockResolvedValue({ id: 'goal-new' })
  mocks.update.mockReset().mockResolvedValue(undefined)
  mocks.completed.mockReset()
  mocks.timeZone = 'UTC'
  mocks.habits.data.habitsById.clear()
  mocks.habits.isLoading = false
  mocks.habits.isError = false
  mocks.habits.refetch.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('the guided goal create flow on Android', () => {
  it('creates a standard goal through every step and closes with the result dialog', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'))
    addHabits(2)
    const onCreated = vi.fn()
    const onOpenGoal = vi.fn()
    const onClose = vi.fn()
    const tree = renderNavigation(<CreateGoalSheet open onClose={onClose} onCreated={onCreated} onOpenGoal={onOpenGoal} />)
    expect(heading(tree)).toBe('O que você quer alcançar?')
    expect(progress(tree)).toBe('Passo 1 de 6')
    await type(tree, PT.title, 'Ler 12 livros')
    await tap(tree, 'Continuar')
    expect(heading(tree)).toBe('Como você quer acompanhar?')
    await tap(tree, 'Progresso')
    await type(tree, 'Quanto?', '12')
    await type(tree, 'De quê?', 'livros')
    await tap(tree, 'Continuar')
    expect(heading(tree)).toBe('Até quando?')
    await tap(tree, 'Fim do ano')
    expect(heading(tree)).toBe('Quais hábitos contam para essa meta?')
    await tap(tree, 'Habit 1')
    await tap(tree, 'Continuar')
    expect(heading(tree)).toBe('É isso?')
    await tap(tree, 'Criar meta')
    const draft = { ...createGoalDraft(), description: 'Ler 12 livros', targetValue: '12', unit: 'livros', deadline: '2026-12-31', habitIds: ['h1'] }
    expect(mocks.create).toHaveBeenCalledWith(buildGoalCreationRequest(draft))
    expect(onCreated).toHaveBeenCalledWith('goal-new', ['h1'])
    expect(mocks.completed).toHaveBeenCalledWith('goal_create', 6, false)
    expect(resultSentence(tree)).toBe('A meta "Ler 12 livros" vai até 31 de dezembro de 2026.')
    expect(tree.hosts().some((node) => (node.props as Record<string, unknown>)['data-orbit-state'] === 'feliz')).toBe(true)
    await tap(tree, 'Ver a meta')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onOpenGoal).toHaveBeenCalledWith('goal-new')
    tree.unmount()
  })

  it('creates a streak goal with no deadline and no linked habit, with the request of the current sheet', async () => {
    await i18n.changeLanguage('en')
    const tree = renderNavigation(<CreateGoalSheet open onClose={vi.fn()} />)
    await type(tree, EN.title, 'Gym days')
    await tap(tree, 'Continue')
    await tap(tree, 'Streak')
    expect(heading(tree)).toBe('How many days in a row?')
    await type(tree, 'How many days in a row?', '30')
    await tap(tree, 'Continue')
    await tap(tree, 'No deadline')
    await tap(tree, 'Continue')
    await tap(tree, 'Create goal')
    const draft = { ...createGoalDraft(), goalType: 'Streak' as const, description: 'Gym days', targetValue: '30', unit: i18n.t('goals.form.streakUnit'), deadline: '' }
    expect(mocks.create).toHaveBeenCalledWith(buildGoalCreationRequest(draft))
    expect(resultSentence(tree)).toBe('The goal "Gym days" is set with no deadline.')
    tree.unmount()
  })

  it('skips the habits for a goal that starts from a habit and shows that habit on the summary', async () => {
    await i18n.changeLanguage('en')
    const tree = renderNavigation(<CreateGoalSheet open onClose={vi.fn()} initialHabitIds={['habit-read']} fromHabit={{ title: 'Read' }} />)
    expect(progress(tree)).toBe('Step 1 of 5')
    await answerUpToDeadline(tree, EN)
    await tap(tree, 'End of the month')
    expect(heading(tree)).toBe('Is this right?')
    expect(texts(tree)).toContain('Read')
    await tap(tree, 'Create goal')
    expect(mocks.create.mock.calls[0]![0]).toMatchObject({ habitIds: ['habit-read'], title: 'Run', type: 'Standard' })
    tree.unmount()
  })

  it('resolves the end of the month and the end of the year in the account time zone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-01T02:00:00Z'))
    mocks.timeZone = 'America/Sao_Paulo'
    const tree = renderNavigation(<CreateGoalSheet open onClose={vi.fn()} initialHabitIds={['h1']} />)
    await answerUpToDeadline(tree, PT)
    expect(control(tree, 'Sem prazo').props.accessibilityState?.selected, 'a fresh draft has not answered the deadline yet').toBe(false)
    await tap(tree, 'Fim do mês')
    await tap(tree, /^Até quando/)
    expect(control(tree, 'Fim do mês').props.accessibilityState?.selected).toBe(true)
    await tap(tree, 'Fim do ano')
    await tap(tree, 'Criar meta')
    expect(mocks.create.mock.calls[0]![0]).toMatchObject({ deadline: '2026-12-31' })
    tree.unmount()
  })

  it('reads typed words, refuses a past date and takes the date picker', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'))
    await i18n.changeLanguage('en')
    const tree = renderNavigation(<CreateGoalSheet open onClose={vi.fn()} initialHabitIds={['h1']} />)
    await answerUpToDeadline(tree, EN)
    await type(tree, 'Or say it in your words', 'whenever')
    await submit(tree, 'Or say it in your words')
    expect(texts(tree)).toContain(i18n.t('habits.flow.when.unresolved'))
    await type(tree, 'Or say it in your words', '2020-01-01')
    await submit(tree, 'Or say it in your words')
    expect(texts(tree)).toContain(i18n.t('goals.form.deadlineInPast'))
    await type(tree, 'Or say it in your words', '2026-12-20')
    await submit(tree, 'Or say it in your words')
    expect(heading(tree)).toBe('Is this right?')
    await tap(tree, /^By when/)
    const picker = tree.hosts().find((node) => node.props.testID === 'date-picker')!
    await act(async () => { (picker.props as unknown as { onChangeText: (value: string) => void }).onChangeText('2027-01-15'); await Promise.resolve() })
    expect(heading(tree)).toBe('Is this right?')
    await tap(tree, 'Create goal')
    expect(mocks.create.mock.calls[0]![0]).toMatchObject({ deadline: '2027-01-15' })
    tree.unmount()
  })

  it('keeps the step with the hint of the current form on an empty answer', async () => {
    const tree = renderNavigation(<CreateGoalSheet open onClose={vi.fn()} />)
    await tap(tree, 'Continuar')
    expect(texts(tree)).toContain(i18n.t('goals.form.titleRequired'))
    expect(heading(tree)).toBe('O que você quer alcançar?')
    tree.unmount()
  })

  it('goes back a step on Android back and keeps every answer', async () => {
    const onClose = vi.fn()
    const tree = renderNavigation(<CreateGoalSheet open onClose={onClose} />)
    await type(tree, PT.title, 'Ler mais')
    await tap(tree, 'Continuar')
    await androidBack(tree)
    expect(heading(tree)).toBe('O que você quer alcançar?')
    expect(control(tree, PT.title).props).toMatchObject({ value: 'Ler mais' })
    await androidBack(tree)
    expect(onClose).not.toHaveBeenCalled()
    expect(control(tree, i18n.t('common.discardChangesAction'))).toBeDefined()
    tree.unmount()
  })

  it('keeps the summary open with the server message after a failed save, with no result dialog', async () => {
    mocks.create.mockRejectedValue(new Error('Server down'))
    const tree = renderNavigation(<CreateGoalSheet open onClose={vi.fn()} initialHabitIds={['h1']} />)
    await answerUpToDeadline(tree, PT)
    await tap(tree, 'Sem prazo')
    await tap(tree, 'Criar meta')
    expect(heading(tree)).toBe('É isso?')
    expect(texts(tree)).toContain(i18n.t('goals.form.createError'))
    expect(resultDialog(tree)).toBeUndefined()
    tree.unmount()
  })

  it('closes a clean flow at once', async () => {
    const onClose = vi.fn()
    const tree = renderNavigation(<CreateGoalSheet open onClose={onClose} />)
    await tap(tree, 'Fechar')
    expect(onClose).toHaveBeenCalledTimes(1)
    tree.unmount()
  })
})

describe('the Which habits step on Android', () => {
  it('shows four habits as quick options, searches the rest with a miss, and dims at the limit', async () => {
    addHabits(24)
    const tree = renderNavigation(<CreateGoalSheet open onClose={vi.fn()} />)
    await answerUpToDeadline(tree, PT)
    await tap(tree, 'Sem prazo')
    const options = tree.hosts().filter((node) => node.props.testID === 'option-card').map((node) => node.props.accessibilityLabel)
    expect(options).toEqual(['Habit 1', 'Habit 2', 'Habit 3', 'Habit 4'])
    await type(tree, 'Buscar hábitos', 'nada parecido')
    expect(texts(tree)).toContain(i18n.t('habits.moveParent.noSearchResults'))
    for (let index = 1; index <= 20; index += 1) {
      await type(tree, 'Buscar hábitos', `Habit ${index}`)
      const rows = tree.hosts().filter((node) => node.props.accessibilityLabel === `Habit ${index}` && node.props.onPress && node.props.testID !== 'option-card')
      await act(async () => { press(rows.at(-1)!); await Promise.resolve() })
    }
    await type(tree, 'Buscar hábitos', 'Habit 24')
    const last = tree.hosts().filter((node) => node.props.accessibilityLabel === 'Habit 24' && node.type === 'Pressable' && node.props.testID !== 'option-card').at(-1)!
    expect(last.props.accessibilityState?.disabled).toBe(true)
    expect(texts(tree)).toContain(i18n.t('goals.detail.linkedLimit', { count: 20 }))
    tree.unmount()
  })

  it('shows a skeleton while loading, a retry after an error and a habit created from the step', async () => {
    mocks.habits.isError = true
    const tree = renderNavigation(<CreateGoalSheet open onClose={vi.fn()} />)
    await answerUpToDeadline(tree, PT)
    await tap(tree, 'Sem prazo')
    await tap(tree, i18n.t('common.retry'))
    expect(mocks.habits.refetch).toHaveBeenCalledTimes(1)
    tree.unmount()
    mocks.habits.isError = false
    const empty = renderNavigation(<CreateGoalSheet open onClose={vi.fn()} />)
    await answerUpToDeadline(empty, PT)
    await tap(empty, 'Sem prazo')
    expect(texts(empty)).toContain(i18n.t('goals.form.habitsInvitation'))
    expect(empty.hosts().filter((node) => node.props.testID === 'orbit-mascot'), 'one live Orbit in the view').toHaveLength(1)
    await tap(empty, i18n.t('habits.createHabit'))
    await tap(empty, 'Finish habit creation')
    expect(heading(empty)).toBe('Quais hábitos contam para essa meta?')
    empty.unmount()
    mocks.habits.isLoading = true
    const loading = renderNavigation(<CreateGoalSheet open onClose={vi.fn()} />)
    await answerUpToDeadline(loading, PT)
    await tap(loading, 'Sem prazo')
    expect(loading.hosts().find((node) => node.props.accessibilityLabel === i18n.t('common.loading'))).toBeDefined()
    loading.unmount()
  })
})

describe('the guided goal edit flow on Android', () => {
  const goal = { id: 'g1', title: 'Run 100km', targetValue: 100, unit: 'km', deadline: '2026-12-31', type: 'Standard' }

  it('opens on the summary with the stored values and saves one change with the request of the current modal', async () => {
    await i18n.changeLanguage('en')
    const onClose = vi.fn()
    const tree = renderNavigation(<EditGoalModal open onClose={onClose} goal={goal} />)
    expect(heading(tree)).toBe('Is this right?')
    expect(control(tree, /^Your goal, Run 100km$/)).toBeDefined()
    expect(control(tree, /^How much, 100 km$/)).toBeDefined()
    expect(tree.hosts().some((node) => /^Tracking/.test(node.props.accessibilityLabel ?? '') && node.props.onPress)).toBe(false)
    await tap(tree, /^By when/)
    await tap(tree, 'No deadline')
    await tap(tree, 'Save')
    expect(mocks.update).toHaveBeenCalledWith({ goalId: 'g1', data: { title: 'Run 100km', targetValue: 100, unit: 'km', deadline: null } })
    expect(resultSentence(tree)).toBe('The goal "Run 100km" is saved with no deadline.')
    await tap(tree, 'View the goal')
    expect(onClose).toHaveBeenCalledTimes(1)
    tree.unmount()
  })

  it('keeps an empty title in an edit and saves the title the current modal builds from the target and the unit', async () => {
    await i18n.changeLanguage('en')
    const tree = renderNavigation(<EditGoalModal open onClose={vi.fn()} goal={goal} />)
    await tap(tree, /^Your goal/)
    await type(tree, 'What do you want to reach?', '')
    await tap(tree, 'Continue')
    expect(heading(tree)).toBe('Is this right?')
    await tap(tree, 'Save')
    expect(mocks.update).toHaveBeenCalledWith({ goalId: 'g1', data: { title: '100 km', targetValue: 100, unit: 'km', deadline: '2026-12-31' } })
    tree.unmount()
  })

  it('shows the field message the server sends for a refused edit, as the current modal does', async () => {
    await i18n.changeLanguage('en')
    mocks.update.mockRejectedValue(createApiClientError(400, { errors: { Title: ['Server title failure'] } }, 'Fallback'))
    const tree = renderNavigation(<EditGoalModal open onClose={vi.fn()} goal={goal} />)
    await tap(tree, /^How much/)
    await type(tree, 'How much?', '120')
    await tap(tree, 'Continue')
    await tap(tree, 'Save')
    expect(texts(tree)).toContain('Server title failure')
    expect(resultSentence(tree)).toBeUndefined()
    tree.unmount()
  })

  it('closes an unchanged edit with no discard prompt and asks before it drops a change', async () => {
    const onClose = vi.fn()
    const tree = renderNavigation(<EditGoalModal open onClose={onClose} goal={goal} />)
    await tap(tree, 'Fechar')
    expect(onClose).toHaveBeenCalledTimes(1)
    tree.unmount()
    const changed = renderNavigation(<EditGoalModal open onClose={onClose} goal={goal} />)
    await tap(changed, /^Quanto/)
    await type(changed, 'Quanto?', '120')
    await tap(changed, 'Continuar')
    await tap(changed, 'Fechar')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(control(changed, i18n.t('common.discardChangesAction'))).toBeDefined()
    changed.unmount()
  })
})

describe('with the flag off on Android', () => {
  it('renders the current create sheet and the current edit modal', () => {
    mocks.guided = false
    const create = renderNavigation(<CreateGoalSheet open onClose={vi.fn()} />)
    expect(texts(create)).toContain(i18n.t('goals.form.habitsExplainer'))
    expect(create.hosts().find((node) => node.props.testID === 'question-flow')).toBeUndefined()
    create.unmount()
    const edit = renderNavigation(<EditGoalModal open onClose={vi.fn()} goal={{ id: 'g1', title: 'Run', targetValue: 5, unit: 'km', deadline: null }} />)
    expect(edit.hosts().find((node) => node.props.testID === 'question-flow')).toBeUndefined()
    edit.unmount()
  })
})
