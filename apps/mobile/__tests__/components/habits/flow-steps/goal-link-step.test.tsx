import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { act } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockGoal } from '@orbit/shared/__tests__/factories'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import type { Goal } from '@orbit/shared/types/goal'
import { MAX_GOALS_PER_HABIT } from '@orbit/shared/validation'
import { toggleSelectedId } from '@orbit/shared/utils'
import { QuestionFlow } from '@/components/ui/question-flow'
import { useGoalLinkStepView } from '@/components/habits/flow-steps/goal-link-step'
import { i18n } from '@/lib/i18n'
import { press, renderNavigation } from '../../ui/navigation-render'

const state = vi.hoisted(() => ({ goals: [] as Goal[], selected: [] as string[], goalsQuery: 'ready', refetch: vi.fn() }))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => i18n.t(key, params), i18n: { language: i18n.language } }),
}))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/components/habits/goal-linking-field', () => ({ useLinkableGoals: () => ({ data: state.goalsQuery === 'ready' ? state.goals : undefined, isSuccess: state.goalsQuery === 'ready', isLoading: state.goalsQuery === 'loading', isError: state.goalsQuery === 'error', refetch: state.refetch }) }))
vi.mock('@/components/goals/create-goal-sheet', () => ({
  CreateGoalSheet: ({ initialHabitIds = [], fromHabit, onCreated, onClose }: { initialHabitIds?: string[]; fromHabit?: { title: string }; onCreated?: (id: string, habitIds: string[]) => void; onClose: () => void }) =>
    <View testID="goal-create-flow">
      <Text testID="goal-create-habit">{fromHabit?.title}</Text>
      <Text testID="goal-create-linked">{initialHabitIds.join(',')}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="finish" onPress={() => { onCreated?.('new-goal', initialHabitIds); onClose() }} />
    </View>,
}))

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

type Tree = ReturnType<typeof renderNavigation>
const plainText = (value: unknown) => (typeof value === 'string' ? value : '')
type Host = ReturnType<Tree['hosts']>[number]
const header = (tree: Tree) => tree.hosts().find((node) => node.props.accessibilityRole === 'header')!
const options = (tree: Tree) => tree.hosts().filter((node) => node.props.testID === 'option-card')
const optionLabels = (tree: Tree) => options(tree).map((node) => node.props.accessibilityLabel)
const option = (tree: Tree, label: string) => options(tree).find((node) => node.props.accessibilityLabel === label)!
const isDisabled = (node: Host) => node.props.disabled === true || node.props.accessibilityState?.disabled === true
const byTestId = (tree: Tree, testID: string) => tree.hosts().find((node) => node.props.testID === testID)
async function tap(node: Host | undefined) {
  if (!node) throw new Error('no control')
  await act(async () => { press(node); await Promise.resolve() })
}
async function search(tree: Tree, value: string) {
  const input = tree.hosts().find((node) => node.props.accessibilityLabel === i18n.t('habits.form.searchGoals') && (node.props as { onChangeText?: unknown }).onChangeText) as (Host & { props: { onChangeText: (text: string) => void } }) | undefined
  if (!input) throw new Error('no search')
  await act(async () => { input.props.onChangeText(value); await Promise.resolve() })
}
const row = (tree: Tree, label: string) => tree.hosts().find((node) => node.props.accessibilityLabel === label && node.props.testID !== 'option-card' && node.props.accessibilityRole === 'button' && (node.props.onPress || (node.props as { onPressedChange?: unknown }).onPressedChange))
const goals = (count: number) => Array.from({ length: count }, (_, index) => createMockGoal({ id: `goal-${index + 1}`, title: `Meta ${index + 1}`, progressPercentage: index * 10 }))

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
  state.goals = []
  state.selected = []
  state.goalsQuery = 'ready'
  state.refetch = vi.fn()
})

describe('the goal step on Android', () => {
  it.each(['pt-BR', 'en'] as const)('with no goal yet, asks the question, says what a goal does and offers to create one in %s', async (locale) => {
    await i18n.changeLanguage(locale)
    const tree = renderNavigation(<Harness />)
    expect(header(tree).props.children).toBe(i18n.t('habits.flow.optional.goals'))
    expect(header(tree).props).toMatchObject({ accessibilityHint: i18n.t('habits.flow.goals.lineEmpty') })
    expect(optionLabels(tree)).toEqual([i18n.t('habits.form.createGoal')])
    tree.unmount()
  })

  it('shows a skeleton while the goals load and a retry after an error, never the line of a person with no goal', async () => {
    state.goalsQuery = 'loading'
    const loading = renderNavigation(<Harness />)
    expect(header(loading).props).toMatchObject({ accessibilityHint: i18n.t('habits.flow.goals.line') })
    expect(loading.hosts().some((node) => node.props.accessibilityLabel === i18n.t('common.loading'))).toBe(true)
    loading.unmount()
    state.goalsQuery = 'error'
    const failed = renderNavigation(<Harness />)
    expect(header(failed).props).toMatchObject({ accessibilityHint: i18n.t('habits.flow.goals.line') })
    await tap(failed.hosts().find((node) => node.props.accessibilityLabel === i18n.t('common.retry') && node.props.onPress))
    expect(state.refetch).toHaveBeenCalledTimes(1)
    failed.unmount()
  })

  it('shows the active goals as options that toggle without advancing, and continues on its own action', async () => {
    state.goals = [...goals(3), createMockGoal({ id: 'done', title: 'Meta concluída', status: 'Completed' })]
    const onContinue = vi.fn()
    const tree = renderNavigation(<Harness onContinue={onContinue} />)
    expect(header(tree).props).toMatchObject({ accessibilityHint: 'Uma meta soma o progresso dos hábitos ligados a ela.' })
    expect(optionLabels(tree), 'each quick goal shows its progress').toEqual(['Meta 1, 0%', 'Meta 2, 10%', 'Meta 3, 20%', 'Criar meta'])
    await tap(option(tree, 'Meta 2, 10%'))
    expect(option(tree, 'Meta 2, 10%').props.accessibilityState).toMatchObject({ selected: true })
    expect(state.selected).toEqual(['goal-2'])
    expect(onContinue).not.toHaveBeenCalled()
    await tap(byTestId(tree, 'button-primary-sm') ?? tree.hosts().find((node) => node.props.testID?.startsWith('button-primary')))
    expect(onContinue).toHaveBeenCalledTimes(1)
    tree.unmount()
  })

  it('puts the selected goals first and every goal behind the search when there are more than four', async () => {
    state.goals = goals(6)
    const tree = renderNavigation(<Harness initial={['goal-6']} />)
    expect(optionLabels(tree)).toEqual(['Meta 6, 50%', 'Meta 1, 0%', 'Meta 2, 10%', 'Meta 3, 20%', 'Criar meta'])
    await search(tree, 'meta 5')
    await tap(row(tree, 'Meta 5'))
    expect(state.selected).toEqual(['goal-6', 'goal-5'])
    await search(tree, 'correr')
    expect(tree.hosts().some((node) => node.props.children === 'Nenhuma meta com esse nome.')).toBe(true)
    tree.unmount()
  })

  it('shows no search while four goals or fewer fit the options', () => {
    state.goals = goals(4)
    const tree = renderNavigation(<Harness />)
    expect(tree.hosts().some((node) => node.props.accessibilityLabel === 'Buscar metas')).toBe(false)
    tree.unmount()
  })

  it('dims the other goals at ten with the reason in text', async () => {
    state.goals = goals(12)
    const tree = renderNavigation(<Harness initial={goals(10).map((goal) => goal.id)} />)
    expect(isDisabled(option(tree, 'Criar meta'))).toBe(true)
    expect(tree.hosts().some((node) => node.props.children === 'Escolha até 10 metas')).toBe(true)
    await search(tree, 'Meta 11')
    expect(isDisabled(row(tree, 'Meta 11')!)).toBe(true)
    tree.unmount()
  })

  it('opens the goal create flow with the habit linked and returns the new goal selected', async () => {
    state.goals = goals(1)
    const tree = renderNavigation(<Harness habitId="habit-1" />)
    await tap(option(tree, 'Criar meta'))
    expect(byTestId(tree, 'goal-create-habit')?.props.children).toBe('Ler 20 páginas')
    expect(byTestId(tree, 'goal-create-linked')?.props.children).toBe('habit-1')
    await tap(tree.hosts().find((node) => node.props.accessibilityLabel === 'finish'))
    expect(state.selected).toEqual(['new-goal'])
    expect(byTestId(tree, 'goal-create-flow')).toBeUndefined()
    tree.unmount()
  })

  it('selects a goal created for a habit that is not saved yet', async () => {
    const tree = renderNavigation(<Harness />)
    await tap(option(tree, 'Criar meta'))
    expect(byTestId(tree, 'goal-create-linked')?.props.children).toBe('')
    await tap(tree.hosts().find((node) => node.props.accessibilityLabel === 'finish'))
    expect(state.selected).toEqual(['new-goal'])
    tree.unmount()
  })
})

const BARE_NOUNS = ['tags', 'tag', 'metas', 'meta', 'modelos', 'checklist', 'goals', 'goal']

describe('the bar on Android: no bare system noun', () => {
  it.each(['pt-BR', 'en'] as const)('never titles or labels the goal step with a bare noun in %s', async (locale) => {
    await i18n.changeLanguage(locale)
    state.goals = goals(6)
    const tree = renderNavigation(<Harness />)
    const texts = tree.hosts().flatMap((node) => [node.props.accessibilityLabel, node.props.accessibilityRole === 'header' ? plainText(node.props.children) : undefined])
      .filter((text): text is string => typeof text === 'string' && !text.startsWith('Meta ')).map((text) => text.trim().toLocaleLowerCase())
    expect(texts.filter((text) => BARE_NOUNS.includes(text))).toEqual([])
    tree.unmount()
  })
})
