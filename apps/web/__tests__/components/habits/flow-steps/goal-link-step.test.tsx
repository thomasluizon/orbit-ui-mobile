import { useEffect, useState } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import type { Goal } from '@orbit/shared/types/goal'
import { MAX_GOALS_PER_HABIT } from '@orbit/shared/validation'
import { toggleSelectedId } from '@orbit/shared/utils'
import { QuestionFlow } from '@/components/ui/question-flow'
import { useGoalLinkStepView } from '@/components/habits/flow-steps/goal-link-step'

const state = vi.hoisted(() => ({ locale: 'pt-BR' as 'en' | 'pt-BR', goals: [] as Goal[], selected: [] as string[], goalsQuery: 'ready' as 'ready' | 'loading' | 'error', refetch: vi.fn() }))

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  return { ...actual, useLocale: () => state.locale, useTranslations: () => actual.createTranslator({ locale: state.locale, messages: state.locale === 'en' ? en : ptBR }) }
})
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/components/habits/goal-linking-field', () => ({ useLinkableGoals: () => ({ data: state.goalsQuery === 'ready' ? state.goals : undefined, isSuccess: state.goalsQuery === 'ready', isLoading: state.goalsQuery === 'loading', isError: state.goalsQuery === 'error', refetch: state.refetch }) }))
vi.mock('@/components/goals/create-goal-sheet', () => ({
  CreateGoalSheet: ({ initialHabitIds = [], fromHabit, onCreated, onClose }: { initialHabitIds?: string[]; fromHabit?: { title: string }; onCreated?: (id: string, habitIds: string[]) => void; onClose: () => void }) =>
    <div role="dialog" aria-label="goal create flow">
      <output aria-label="habit">{fromHabit?.title}</output>
      <output aria-label="linked">{initialHabitIds.join(',')}</output>
      <button type="button" onClick={() => { onCreated?.('new-goal', initialHabitIds); onClose() }}>finish</button>
    </div>,
}))

const copy = (locale: 'en' | 'pt-BR') => createTranslator({ locale, messages: locale === 'en' ? en : ptBR })
const noop = () => {}

function StepFlow({ view }: Readonly<{ view: FlowStepView }>) {
  return <QuestionFlow flow="habit_create" stepKey={view.stepKey ?? 'optional:goals'} question={view.question} line={view.line}
    options={view.options} primary={view.primary} position={5} total={5} progressLabel="Passo 5 de 5" backLabel="Voltar" closeLabel="Fechar"
    direction={1} onBack={view.onBack ?? noop} onClose={noop}>{view.free}</QuestionFlow>
}

function Harness({ habitId, initial = [], onContinue = noop }: Readonly<{ habitId?: string; initial?: string[]; onContinue?: () => void }>) {
  const [selected, setSelected] = useState(initial)
  useEffect(() => { state.selected = selected })
  const view = useGoalLinkStepView({
    habitId, habitTitle: 'Ler 20 páginas', selectedGoalIds: selected, atGoalLimit: selected.length >= MAX_GOALS_PER_HABIT,
    onToggleGoal: (goalId) => setSelected((current) => toggleSelectedId(current, goalId)), onContinue,
  })
  return <StepFlow view={view} />
}

const heading = () => screen.getByRole('heading', { level: 1 })
const options = () => within(screen.getByRole('group', { name: heading().textContent })).getAllByRole('button')
const press = async (name: string | RegExp) => { await act(async () => { fireEvent.click(screen.getByRole('button', { name })) }) }
const goals = (count: number) => Array.from({ length: count }, (_, index) => createMockGoal({ id: `goal-${index + 1}`, title: `Meta ${index + 1}`, progressPercentage: index * 10 }))

beforeEach(() => {
  state.locale = 'pt-BR'
  state.goals = []
  state.selected = []
  state.goalsQuery = 'ready'
  state.refetch = vi.fn()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: noop, removeEventListener: noop }))
})

describe('the goal step', () => {
  it.each(['pt-BR', 'en'] as const)('with no goal yet, asks the question, says what a goal does and offers to create one in %s', (locale) => {
    state.locale = locale
    const t = copy(locale)
    render(<Harness />)
    expect(heading()).toHaveTextContent(t('habits.flow.optional.goals'))
    expect(heading()).toHaveAccessibleDescription(t('habits.flow.goals.lineEmpty'))
    expect(options().map((option) => option.textContent)).toEqual([t('habits.form.createGoal')])
  })

  it('shows a skeleton while the goals load and a retry after an error, never the line of a person with no goal', () => {
    state.goalsQuery = 'loading'
    const view = render(<Harness />)
    expect(heading()).toHaveAccessibleDescription('Uma meta soma o progresso dos hábitos ligados a ela.')
    expect(screen.getByLabelText(ptBR.common.loading)).toBeInTheDocument()
    view.unmount()
    state.goalsQuery = 'error'
    render(<Harness />)
    expect(heading()).toHaveAccessibleDescription('Uma meta soma o progresso dos hábitos ligados a ela.')
    expect(screen.getByText('Não foi possível carregar suas metas. Tente de novo.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: ptBR.common.retry }))
    expect(state.refetch).toHaveBeenCalledTimes(1)
  })

  it('shows the active goals as options that toggle without advancing, and continues on its own action', async () => {
    state.goals = [...goals(3), createMockGoal({ id: 'done', title: 'Meta concluída', status: 'Completed' })]
    const onContinue = vi.fn()
    render(<Harness onContinue={onContinue} />)
    expect(heading()).toHaveAccessibleDescription('Uma meta soma o progresso dos hábitos ligados a ela.')
    expect(options().map((option) => option.textContent), 'each quick goal shows its progress').toEqual(['Meta 1, 0%', 'Meta 2, 10%', 'Meta 3, 20%', 'Criar meta'])
    await press('Meta 2, 10%')
    expect(screen.getByRole('button', { name: 'Meta 2, 10%' })).toHaveAttribute('aria-pressed', 'true')
    expect(options().map((option) => option.textContent), 'a press never moves the other options').toEqual(['Meta 1, 0%', 'Meta 2, 10%', 'Meta 3, 20%', 'Criar meta'])
    expect(state.selected).toEqual(['goal-2'])
    expect(onContinue).not.toHaveBeenCalled()
    await press('Meta 2, 10%')
    expect(state.selected).toEqual([])
    await press('Continuar')
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('puts the selected goals first and every goal behind the search when there are more than four', async () => {
    state.goals = goals(6)
    render(<Harness initial={['goal-6']} />)
    expect(options().map((option) => option.textContent)).toEqual(['Meta 6, 50%', 'Meta 1, 0%', 'Meta 2, 10%', 'Meta 3, 20%', 'Criar meta'])
    await act(async () => { fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar metas' }), { target: { value: 'meta 5' } }) })
    await press('Meta 5')
    expect(state.selected).toEqual(['goal-6', 'goal-5'])
    await act(async () => { fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar metas' }), { target: { value: 'correr' } }) })
    expect(screen.getByText('Nenhuma meta com esse nome.')).toBeInTheDocument()
  })

  it('shows no search while four goals or fewer fit the options', () => {
    state.goals = goals(4)
    render(<Harness />)
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('dims the other goals at ten with the reason in text', async () => {
    state.goals = goals(12)
    render(<Harness initial={goals(10).map((goal) => goal.id)} />)
    expect(screen.getByRole('button', { name: 'Criar meta' })).toBeDisabled()
    expect(screen.getAllByText('Escolha até 10 metas').length).toBeGreaterThan(0)
    await act(async () => { fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar metas' }), { target: { value: 'Meta 11' } }) })
    expect(screen.getByRole('button', { name: 'Meta 11' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Meta 1, 0%' })).toBeEnabled()
  })

  it('opens the goal create flow with the habit linked and returns the new goal selected', async () => {
    state.goals = goals(1)
    render(<Harness habitId="habit-1" />)
    await press('Criar meta')
    const flow = screen.getByRole('dialog', { name: 'goal create flow' })
    expect(within(flow).getByRole('status', { name: 'habit' })).toHaveTextContent('Ler 20 páginas')
    expect(within(flow).getByRole('status', { name: 'linked' })).toHaveTextContent('habit-1')
    await press('finish')
    expect(state.selected).toEqual(['new-goal'])
    expect(screen.queryByRole('dialog', { name: 'goal create flow' })).not.toBeInTheDocument()
  })

  it('selects a goal created for a habit that is not saved yet', async () => {
    render(<Harness />)
    await press('Criar meta')
    expect(screen.getByRole('status', { name: 'linked' })).toBeEmptyDOMElement()
    await press('finish')
    expect(state.selected).toEqual(['new-goal'])
  })
})

const BARE_NOUNS = ['tags', 'tag', 'metas', 'meta', 'modelos', 'checklist', 'goals', 'goal']

describe('the bar: no bare system noun', () => {
  it.each(['pt-BR', 'en'] as const)('never titles or labels the goal step with a bare noun in %s', (locale) => {
    state.locale = locale
    state.goals = goals(6)
    const { container } = render(<Harness />)
    const texts = [
      ...screen.getAllByRole('heading').map((element) => element.textContent),
      ...[...container.querySelectorAll('label, [role="group"]')].map((element) => element.getAttribute('aria-label') ?? element.textContent),
      ...screen.getAllByRole('button').filter((button) => !button.textContent.startsWith('Meta ')).map((button) => button.textContent),
    ].map((text) => text.trim().toLocaleLowerCase())
    expect(texts.filter((text) => BARE_NOUNS.includes(text))).toEqual([])
  })
})
