import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-test-renderer'
import { GuidedHabitFlow } from '@/components/habits/guided/guided-habit-flow'
import { useHabitForm } from '@/hooks/use-habit-form'
import { i18n } from '@/lib/i18n'
import { press, renderNavigation } from '../ui/navigation-render'

const state = vi.hoisted(() => ({ helpers: null, read: vi.fn() }))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => i18n.t(key, params), i18n: { language: i18n.language } }),
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: 'UTC', uses24HourClock: true, weekStartDay: 0 } }), useHasProAccess: () => true }))
vi.mock('@/hooks/use-habit-phrase-read', () => ({ useHabitPhraseRead: () => ({ mutateAsync: state.read, isPending: false }) }))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: vi.fn() }))

const submit = vi.fn()
const helpers = () => state.helpers as ReturnType<typeof useHabitForm>

function Harness({ saveError = null }: Readonly<{ saveError?: string | null }>) {
  const formHelpers = useHabitForm({ initialData: { dueDate: '' } })
  state.helpers = formHelpers
  return (
    <GuidedHabitFlow formHelpers={formHelpers} lockedGeneral={null} fromConversation={false} pending={false}
      saveError={saveError} moreFields={null} createLabel="Criar tarefa" onSubmit={submit} onClose={vi.fn()} />
  )
}

type Tree = ReturnType<typeof renderNavigation>
const labelled = (tree: Tree, label: string) => tree.hosts().find((node) => node.props.accessibilityLabel === label)
const progress = (tree: Tree) => tree.hosts().find((node) => /^Passo \d de \d$/.test(node.props.accessibilityLabel ?? ''))?.props.accessibilityLabel
const headings = (tree: Tree) => tree.hosts().filter((node) => node.props.accessibilityRole === 'header').map((node) => (typeof node.props.children === 'string' ? node.props.children : ''))
async function type(tree: Tree, text: string) {
  const input = tree.hosts().find((node) => (node.props as { onChangeText?: unknown }).onChangeText && node.props.accessibilityLabel === 'O que você quer fazer?')
  await act(async () => { (input?.props as unknown as { onChangeText: (value: string) => void }).onChangeText(text); await Promise.resolve() })
}
async function tapPrimary(tree: Tree) {
  const primary = tree.hosts().find((node) => node.props.testID === 'button-primary-sm')
  if (!primary) throw new Error('no primary action')
  await act(async () => { press(primary); await Promise.resolve() })
}
async function tap(tree: Tree, label: string) {
  const target = labelled(tree, label)
  if (!target) throw new Error(`no control named ${label}`)
  await act(async () => { press(target); await Promise.resolve() })
}

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
  submit.mockReset()
  state.read.mockReset()
})

describe('the guided create flow on Android', () => {
  it('asks the question in the words of the person and names the progress', () => {
    const tree = renderNavigation(<Harness />)
    expect(headings(tree)).toContain('O que você quer fazer?')
    expect(progress(tree)).toMatch(/^Passo 1 de \d$/)
    tree.unmount()
  })

  it('reaches the reminder and then the summary from one phrase that holds the repeat and the time', async () => {
    const tree = renderNavigation(<Harness />)
    await type(tree, 'tomar remédio todo dia às 8')
    await tapPrimary(tree)
    expect(headings(tree)[0]).toContain('Quer que eu te lembre')
    expect(progress(tree)).toBe('Passo 2 de 3')
    await tap(tree, 'Sim, me lembre')
    expect(headings(tree)).toContain('É isso?')
    expect(helpers().form.getValues('reminderEnabled')).toBe(true)
    tree.unmount()
  })

  it('answers a task with a date and a time through the quick options and creates once', async () => {
    const tree = renderNavigation(<Harness />)
    await type(tree, 'ligar para o João')
    await tapPrimary(tree)
    expect(headings(tree)).toContain('Quando?')
    await tap(tree, 'Amanhã')
    expect(helpers().form.getValues('itemType')).toBe('task')
    expect(helpers().form.getValues('dueDate')).not.toBe('')
    await tap(tree, '08:00')
    expect(helpers().form.getValues('dueTime')).toBe('08:00')
    await tap(tree, 'Sim, me lembre')
    expect(headings(tree)).toContain('É isso?')
    await tapPrimary(tree)
    expect(submit).toHaveBeenCalledTimes(1)
    tree.unmount()
  })

  it('keeps an undated task in General when the answer is no date', async () => {
    const tree = renderNavigation(<Harness />)
    await type(tree, 'arrumar a garagem')
    await tapPrimary(tree)
    await tap(tree, 'Sem data')
    expect(helpers().isGeneral).toBe(true)
    expect(helpers().form.getValues('dueDate')).toBe('')
    tree.unmount()
  })

  it('advances one step on a double press of an option', async () => {
    const tree = renderNavigation(<Harness />)
    await type(tree, 'ligar para o João')
    await tapPrimary(tree)
    const today = labelled(tree, 'Hoje')
    if (!today) throw new Error('no option Hoje')
    await act(async () => { today.props.onPress?.(); today.props.onPress?.(); await Promise.resolve() })
    expect(headings(tree)).toContain('Tem hora certa?')
    tree.unmount()
  })

  it('shows the hint and keeps step 1 on an empty phrase', async () => {
    const tree = renderNavigation(<Harness />)
    await tapPrimary(tree)
    expect(tree.hosts().some((node) => node.props.children === 'Escreva o que você quer fazer.')).toBe(true)
    expect(headings(tree)).toContain('O que você quer fazer?')
    tree.unmount()
  })

  it('keeps the summary open with the server message after a failed save', async () => {
    const tree = renderNavigation(<Harness saveError="Servidor indisponível" />)
    await type(tree, 'tomar remédio todo dia às 8')
    await tapPrimary(tree)
    await tap(tree, 'Agora não')
    expect(tree.hosts().some((node) => node.props.children === 'Servidor indisponível')).toBe(true)
    tree.unmount()
  })

  it('opens the step of a summary value and returns to the summary', async () => {
    const tree = renderNavigation(<Harness />)
    await type(tree, 'tomar remédio todo dia às 8')
    await tapPrimary(tree)
    await tap(tree, 'Agora não')
    const timeRow = tree.hosts().find((node) => /^Hora/.test(node.props.accessibilityLabel ?? ''))
    if (!timeRow) throw new Error('no time row')
    await act(async () => { press(timeRow); await Promise.resolve() })
    expect(headings(tree)).toContain('Tem hora certa?')
    await tap(tree, '14:00')
    expect(headings(tree)).toContain('É isso?')
    expect(helpers().form.getValues('dueTime')).toBe('14:00')
    tree.unmount()
  })
})
