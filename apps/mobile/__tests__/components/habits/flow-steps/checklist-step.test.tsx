import { useEffect, useState } from 'react'
import { act } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import { resolveMotionPreset } from '@orbit/shared/theme'
import type { ChecklistTemplate } from '@orbit/shared/types/checklist-template'
import type { ChecklistItem } from '@orbit/shared/types/habit'
import { MAX_CHECKLIST_ITEMS } from '@orbit/shared/validation'
import { QuestionFlow } from '@/components/ui/question-flow'
import { useChecklistStepView } from '@/components/habits/flow-steps/checklist-step'
import { i18n } from '@/lib/i18n'
import { press, renderNavigation } from '../../ui/navigation-render'

const state = vi.hoisted(() => ({
  templates: [] as ChecklistTemplate[],
  loading: false,
  templatesError: false,
  refetchTemplates: vi.fn(),
  reduced: false,
  create: vi.fn(),
  remove: vi.fn(),
  items: [] as ChecklistItem[],
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => i18n.t(key, params), i18n: { language: i18n.language } }),
}))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/lib/motion', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/motion')>(), usePrefersReducedMotion: () => state.reduced }))
vi.mock('@/hooks/use-checklist-templates', () => ({
  useChecklistTemplates: () => ({ data: state.templates, isLoading: state.loading, isError: state.templatesError, refetch: state.refetchTemplates }),
  useCreateChecklistTemplate: () => ({ mutate: state.create, isPending: false }),
  useDeleteChecklistTemplate: () => ({ mutate: state.remove }),
}))

const noop = () => {}

function StepFlow({ view }: Readonly<{ view: FlowStepView }>) {
  return <QuestionFlow flow="habit_create" stepKey={view.stepKey ?? 'optional:checklist'} question={view.question} line={view.line}
    options={view.options} primary={view.primary} position={5} total={5} progressLabel="Passo 5 de 5" backLabel="Voltar" closeLabel="Fechar"
    direction={1} onBack={view.onBack ?? noop} onClose={noop}>{view.free}</QuestionFlow>
}

function Harness({ initial = [], proposedItemCount, onContinue = noop }: Readonly<{ initial?: ChecklistItem[]; proposedItemCount?: number; onContinue?: () => void }>) {
  const [items, setItems] = useState(initial)
  useEffect(() => { state.items = items })
  return <StepFlow view={useChecklistStepView({ items, onItemsChange: setItems, proposedItemCount, onContinue })} />
}

type Tree = ReturnType<typeof renderNavigation>
const plainText = (value: unknown) => (typeof value === 'string' ? value : '')
type Host = ReturnType<Tree['hosts']>[number]
const headings = (tree: Tree) => tree.hosts().filter((node) => node.props.accessibilityRole === 'header').map((node) => plainText(node.props.children))
const named = (tree: Tree, label: string) => tree.hosts().filter((node) => node.props.accessibilityLabel === label)
const spoken = (node: Host): string => (node as unknown as { findAll: (match: (child: { type: unknown; props: { children?: unknown } }) => boolean) => { props: { children?: unknown } }[] })
  .findAll((child) => child.type === 'Text').map((child) => String(child.props.children)).join('')
const control = (tree: Tree, label: string) => {
  const found = named(tree, label).find((node) => node.props.onPress) ?? tree.hosts().find((node) => node.props.onPress && node.props.accessibilityRole === 'button' && spoken(node) === label)
  if (!found) throw new Error(`no control named ${label}`)
  return found
}
const textOf = (tree: Tree) => tree.hosts().filter((node) => node.type === 'Text').map((node) => plainText(node.props.children))
async function tap(tree: Tree, label: string) {
  const target = control(tree, label)
  await act(async () => { press(target); await Promise.resolve() })
}
async function typeInto(tree: Tree, label: string, value: string) {
  const input = named(tree, label).find((node) => (node.props as { onChangeText?: unknown }).onChangeText) as (Host & { props: { onChangeText: (text: string) => void } }) | undefined
  if (!input) throw new Error(`no field named ${label}`)
  await act(async () => { input.props.onChangeText(value); await Promise.resolve() })
}
const isDisabled = (node: Host) => node.props.disabled === true || node.props.accessibilityState?.disabled === true
const items = (...texts: string[]): ChecklistItem[] => texts.map((text) => ({ text, isChecked: false }))
const template = (id: string, name: string, ...entries: string[]): ChecklistTemplate => ({ id, name, items: entries })

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
  state.templates = []
  state.loading = false
  state.templatesError = false
  state.refetchTemplates = vi.fn()
  state.reduced = false
  state.create.mockReset()
  state.remove.mockReset()
})

describe('the checklist step on Android', () => {
  it.each(['pt-BR', 'en'] as const)('asks the question with its line, the two quick options and the item editor in %s', async (locale) => {
    await i18n.changeLanguage(locale)
    const tree = renderNavigation(<Harness />)
    expect(headings(tree)).toEqual([i18n.t('habits.flow.optional.checklist')])
    expect(named(tree, i18n.t('habits.flow.optional.checklist'))).toHaveLength(0)
    expect(tree.hosts().find((node) => node.props.accessibilityRole === 'header')!.props).toMatchObject({ accessibilityHint: i18n.t('habits.flow.checklist.line') })
    expect(isDisabled(control(tree, i18n.t('habits.flow.optional.no')))).toBe(false)
    expect(control(tree, i18n.t('habits.flow.checklist.useTemplate'))).toBeDefined()
    expect(named(tree, i18n.t('habits.form.checklistPlaceholder')).length).toBeGreaterThan(0)
    tree.unmount()
  })

  it('advances on Não when the list is empty', async () => {
    const onContinue = vi.fn()
    const tree = renderNavigation(<Harness onContinue={onContinue} />)
    await tap(tree, 'Não')
    expect(onContinue).toHaveBeenCalledTimes(1)
    tree.unmount()
  })

  it('never drops typed steps on Não: it waits for a clear and says why', async () => {
    const onContinue = vi.fn()
    const tree = renderNavigation(<Harness initial={items('Separar a roupa')} onContinue={onContinue} />)
    expect(isDisabled(control(tree, 'Não'))).toBe(true)
    expect(textOf(tree)).toContain('Limpe a lista para seguir sem passos.')
    await tap(tree, i18n.t('habits.form.clearChecklist'))
    expect(state.items).toEqual([])
    await tap(tree, 'Não')
    expect(onContinue).toHaveBeenCalledTimes(1)
    tree.unmount()
  })

  it('adds, edits, reorders, duplicates and removes steps in the free path', async () => {
    const tree = renderNavigation(<Harness />)
    await typeInto(tree, i18n.t('habits.form.checklistPlaceholder'), 'Separar a roupa')
    await tap(tree, i18n.t('common.add'))
    await typeInto(tree, i18n.t('habits.form.checklistPlaceholder'), 'Lavar a louça')
    await tap(tree, i18n.t('common.add'))
    expect(state.items).toEqual(items('Separar a roupa', 'Lavar a louça'))
    await typeInto(tree, i18n.t('habits.form.checklistItemLabel', { n: 1 }), 'Separar a mochila')
    expect(state.items[0]!.text).toBe('Separar a mochila')
    const moveDown = named(tree, i18n.t('habits.form.moveChecklistItemDown')).find((node) => node.props.onPress && !isDisabled(node))!
    await act(async () => { press(moveDown); await Promise.resolve() })
    expect(state.items).toEqual(items('Lavar a louça', 'Separar a mochila'))
    await act(async () => { press(named(tree, i18n.t('habits.form.duplicateChecklistItem')).find((node) => node.props.onPress)!); await Promise.resolve() })
    expect(state.items).toHaveLength(3)
    await act(async () => { press(named(tree, i18n.t('habits.form.removeChecklistItem')).find((node) => node.props.onPress)!); await Promise.resolve() })
    expect(state.items).toHaveLength(2)
    tree.unmount()
  })

  it('keeps the rows already there still, and lets an added step enter and a removed step leave on the list timings, with no travel under reduced motion', async () => {
    type Motion = { durationMs: number; definitions: Record<number, { transform: { translateY: number }[] }> }
    for (const reduced of [false, true]) {
      state.reduced = reduced
      const tree = renderNavigation(<Harness initial={items('Alongar', 'Correr')} />)
      const rows = () => tree.hosts().filter((node) => (node.props as { exiting?: unknown }).exiting !== undefined)
      expect(rows()).toHaveLength(2)
      expect(rows().map((row) => (row.props as { entering?: unknown }).entering), 'the rows already there stay still').toEqual([undefined, undefined])
      await typeInto(tree, i18n.t('habits.form.checklistPlaceholder'), 'Beber água')
      await tap(tree, i18n.t('common.add'))
      const added = rows().find((row) => (row.props as { entering?: unknown }).entering !== undefined)!
      const { entering, exiting, layout } = added.props as unknown as { layout?: unknown; entering: Motion; exiting: Motion }
      expect(entering.durationMs).toBe(resolveMotionPreset('list-enter', reduced).enterDuration)
      expect(exiting.durationMs).toBe(resolveMotionPreset('list-exit', reduced).exitDuration)
      expect(entering.definitions[0]!.transform[0]!.translateY).toBe(reduced ? 0 : 12)
      expect(exiting.definitions[100]!.transform[0]!.translateY).toBe(reduced ? 0 : 10)
      expect(layout === undefined).toBe(reduced)
      expect(rows().filter((row) => (row.props as { entering?: unknown }).entering !== undefined)).toHaveLength(1)
      tree.unmount()
    }
  })

  it('stops at 50 steps and keeps the duplicate guard', () => {
    const tree = renderNavigation(<Harness initial={Array.from({ length: MAX_CHECKLIST_ITEMS }, (_, index) => ({ text: `Passo ${index + 1}`, isChecked: false }))} />)
    expect(textOf(tree)).toContain(i18n.t('habits.form.checklistItemLimit'))
    expect(named(tree, i18n.t('habits.form.duplicateChecklistItem')).filter((node) => node.props.onPress).every(isDisabled)).toBe(true)
    tree.unmount()
  })
})

describe('the template question inside the checklist step on Android', () => {
  it('lists the saved templates with their item count and loads one back into the checklist question', async () => {
    state.templates = [template('t1', 'Treino', 'Alongar', 'Correr'), template('t2', 'Manhã', 'Beber água')]
    const tree = renderNavigation(<Harness />)
    await tap(tree, 'Usar um modelo')
    expect(headings(tree)).toEqual(['Qual modelo você quer usar?'])
    await tap(tree, 'Treino, 2 itens')
    expect(state.items).toEqual(items('Alongar', 'Correr'))
    expect(headings(tree)).toEqual(['Tem passos dentro disso?'])
    tree.unmount()
  })

  it('goes back to the checklist question with no change', async () => {
    state.templates = [template('t1', 'Treino', 'Alongar')]
    const tree = renderNavigation(<Harness initial={items('Separar a roupa')} />)
    await tap(tree, 'Usar um modelo')
    await tap(tree, 'Voltar')
    expect(headings(tree)).toEqual(['Tem passos dentro disso?'])
    expect(state.items).toEqual(items('Separar a roupa'))
    tree.unmount()
  })

  it('says there is no template and offers the item editor', async () => {
    const tree = renderNavigation(<Harness />)
    await tap(tree, 'Usar um modelo')
    expect(textOf(tree)).toContain('Você ainda não guardou nenhum modelo. Escreva os passos e eu guardo para a próxima.')
    await tap(tree, 'Escrever passos')
    expect(headings(tree)).toEqual(['Tem passos dentro disso?'])
    tree.unmount()
  })

  it('says the templates did not load, offers a retry and keeps the item editor, never the line of no template', async () => {
    state.templatesError = true
    const tree = renderNavigation(<Harness />)
    await tap(tree, 'Usar um modelo')
    expect(textOf(tree)).toContain('Não foi possível carregar seus modelos. Tente de novo.')
    expect(textOf(tree)).not.toContain('Você ainda não guardou nenhum modelo. Escreva os passos e eu guardo para a próxima.')
    await tap(tree, i18n.t('common.retry'))
    expect(state.refetchTemplates).toHaveBeenCalledTimes(1)
    await tap(tree, 'Escrever passos')
    expect(headings(tree)).toEqual(['Tem passos dentro disso?'])
    tree.unmount()
  })

  it('shows a skeleton while the templates load', async () => {
    state.loading = true
    const tree = renderNavigation(<Harness />)
    await tap(tree, 'Usar um modelo')
    expect(tree.hosts().some((node) => node.props.accessibilityRole === 'progressbar' && node.props.accessibilityLabel === i18n.t('common.loading'))).toBe(true)
    tree.unmount()
  })

  it('deletes a template and shows its error text when the delete fails', async () => {
    state.templates = [template('t1', 'Treino', 'Alongar')]
    const tree = renderNavigation(<Harness />)
    await tap(tree, 'Usar um modelo')
    await tap(tree, 'Apagar: Treino')
    expect(state.remove).toHaveBeenCalledWith('t1', expect.anything())
    await act(async () => { (state.remove.mock.calls[0]![1] as { onError: () => void }).onError(); await Promise.resolve() })
    expect(tree.hosts().find((node) => node.props.accessibilityRole === 'alert')?.props.children).toBe('Não foi possível apagar o modelo. Tente de novo.')
    tree.unmount()
  })

  it('keeps every template reachable when there are more than four', async () => {
    state.templates = ['A', 'B', 'C', 'D', 'E'].map((name, index) => template(`t${index}`, name, 'Passo'))
    const tree = renderNavigation(<Harness />)
    await tap(tree, 'Usar um modelo')
    expect(tree.hosts().filter((node) => node.props.testID === 'option-card')).toHaveLength(4)
    await tap(tree, 'E, 1 item')
    expect(state.items).toEqual(items('Passo'))
    tree.unmount()
  })

  it('keeps a template saved while the question was hidden still when the question opens', async () => {
    state.templates = [template('t1', 'Treino', 'Alongar')]
    const tree = renderNavigation(<Harness />)
    state.templates = [template('t1', 'Treino', 'Alongar'), template('t2', 'Casa', 'Varrer')]
    tree.update(<Harness />)
    await tap(tree, 'Usar um modelo')
    const rows = tree.hosts().filter((node) => (node.props as { exiting?: unknown }).exiting !== undefined)
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => (row.props as { entering?: unknown }).entering === undefined)).toBe(true)
    tree.unmount()
  })

  it('keeps the template rows still when the question opens and lets a deleted template leave on the list timing, with no travel under reduced motion', async () => {
    for (const reduced of [false, true]) {
      state.reduced = reduced
      state.templates = [template('t1', 'Treino', 'Alongar')]
      const tree = renderNavigation(<Harness />)
      await tap(tree, 'Usar um modelo')
      const row = tree.hosts().find((node) => (node.props as { exiting?: unknown }).exiting !== undefined)!
      const { entering, exiting } = row.props as unknown as { entering?: unknown; exiting: { durationMs: number; definitions: Record<number, { transform: { translateY: number }[] }> } }
      const exit = resolveMotionPreset('list-exit', reduced)
      expect(entering, 'a template already saved does not enter').toBeUndefined()
      expect(exiting.durationMs).toBe(exit.exitDuration)
      expect(exiting.definitions[100]!.transform[0]!.translateY).toBe(reduced ? 0 : exit.shift)
      tree.unmount()
    }
  })
})

describe('the save question inside the checklist step on Android', () => {
  it('asks for a name, shows the hint on an empty save and keeps the list as a template', async () => {
    const tree = renderNavigation(<Harness initial={items('Alongar', 'Correr')} />)
    await tap(tree, 'Salvar modelo')
    expect(headings(tree)).toEqual(['Que nome vai ter esse modelo?'])
    await tap(tree, 'Salvar')
    expect(state.create).not.toHaveBeenCalled()
    expect(textOf(tree)).toContain('Escreva um nome para o modelo.')
    await typeInto(tree, 'Que nome vai ter esse modelo?', ' Treino ')
    await tap(tree, 'Salvar')
    expect(state.create).toHaveBeenCalledWith({ name: 'Treino', items: ['Alongar', 'Correr'] }, expect.anything())
    await act(async () => { (state.create.mock.calls[0]![1] as { onSuccess: () => void }).onSuccess(); await Promise.resolve() })
    expect(headings(tree)).toEqual(['Tem passos dentro disso?'])
    tree.unmount()
  })

  it('stays on the question with the error text when the save fails', async () => {
    const tree = renderNavigation(<Harness initial={items('Alongar')} />)
    await tap(tree, 'Salvar modelo')
    await typeInto(tree, 'Que nome vai ter esse modelo?', 'Treino')
    await tap(tree, 'Salvar')
    await act(async () => { (state.create.mock.calls[0]![1] as { onError: () => void }).onError(); await Promise.resolve() })
    expect(tree.hosts().find((node) => node.props.accessibilityRole === 'alert')?.props.children).toBe('Não foi possível salvar o modelo. Tente de novo.')
    expect(headings(tree)).toEqual(['Que nome vai ter esse modelo?'])
    tree.unmount()
  })
})

const BARE_NOUNS = ['tags', 'tag', 'metas', 'modelos', 'checklist', 'templates', 'goals']

describe('the bar on Android: no bare system noun', () => {
  it.each(['pt-BR', 'en'] as const)('never titles or labels a question with a bare noun in %s', async (locale) => {
    await i18n.changeLanguage(locale)
    state.templates = [template('t1', 'Treino', 'Alongar')]
    const tree = renderNavigation(<Harness initial={items('Alongar')} />)
    const labels = () => tree.hosts().flatMap((node) => [node.props.accessibilityLabel, node.props.accessibilityRole === 'header' ? plainText(node.props.children) : undefined])
      .filter((text): text is string => typeof text === 'string').map((text) => text.trim().toLocaleLowerCase())
    const seen = [...labels()]
    await tap(tree, i18n.t('habits.flow.checklist.useTemplate'))
    seen.push(...labels())
    await tap(tree, 'Voltar')
    await tap(tree, i18n.t('habits.form.saveAsTemplate'))
    seen.push(...labels())
    expect(seen.filter((text) => BARE_NOUNS.includes(text))).toEqual([])
    tree.unmount()
  })
})
