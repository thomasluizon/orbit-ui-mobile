import { useEffect, useState } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTranslator } from 'next-intl'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import type { ChecklistTemplate } from '@orbit/shared/types/checklist-template'
import type { ChecklistItem } from '@orbit/shared/types/habit'
import { MAX_CHECKLIST_ITEMS } from '@orbit/shared/validation'
import { QuestionFlow } from '@/components/ui/question-flow'
import { useChecklistStepView } from '@/components/habits/flow-steps/checklist-step'

const state = vi.hoisted(() => ({
  locale: 'pt-BR' as 'en' | 'pt-BR',
  templates: [] as ChecklistTemplate[],
  loading: false,
  templatesError: false,
  refetchTemplates: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  items: [] as ChecklistItem[],
}))

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>()
  return { ...actual, useLocale: () => state.locale, useTranslations: () => actual.createTranslator({ locale: state.locale, messages: state.locale === 'en' ? en : ptBR }) }
})
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn() }))
vi.mock('@/hooks/use-checklist-templates', () => ({
  useChecklistTemplates: () => ({ data: state.templates, isLoading: state.loading, isError: state.templatesError, refetch: state.refetchTemplates }),
  useCreateChecklistTemplate: () => ({ mutate: state.create, isPending: false }),
  useDeleteChecklistTemplate: () => ({ mutate: state.remove }),
}))

const copy = (locale: 'en' | 'pt-BR') => createTranslator({ locale, messages: locale === 'en' ? en : ptBR })
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

const heading = () => screen.getByRole('heading', { level: 1 })
const press = async (name: string | RegExp) => { await act(async () => { fireEvent.click(screen.getByRole('button', { name })) }) }
const items = (...texts: string[]): ChecklistItem[] => texts.map((text) => ({ text, isChecked: false }))
const template = (id: string, name: string, ...entries: string[]): ChecklistTemplate => ({ id, name, items: entries })

function stubMedia(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduced && query.includes('reduce'), media: query, addEventListener: noop, removeEventListener: noop }))
}

beforeEach(() => {
  state.locale = 'pt-BR'
  state.templates = []
  state.loading = false
  state.templatesError = false
  state.refetchTemplates = vi.fn()
  state.create.mockReset()
  state.remove.mockReset()
  stubMedia(false)
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('the checklist step', () => {
  it.each(['pt-BR', 'en'] as const)('asks the question with its line, the two quick options and the item editor in %s', (locale) => {
    state.locale = locale
    const t = copy(locale)
    render(<Harness />)
    expect(heading()).toHaveTextContent(t('habits.flow.optional.checklist'))
    expect(heading()).toHaveAccessibleDescription(t('habits.flow.checklist.line'))
    expect(screen.getByRole('button', { name: t('habits.flow.optional.no') })).toBeEnabled()
    expect(screen.getByRole('button', { name: t('habits.flow.checklist.useTemplate') })).toBeEnabled()
    expect(screen.getByRole('textbox', { name: t('habits.form.checklistPlaceholder') })).toBeInTheDocument()
  })

  it('advances on Não when the list is empty', async () => {
    const onContinue = vi.fn()
    render(<Harness onContinue={onContinue} />)
    await press('Não')
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('never drops typed steps on Não: it waits for a clear and says why', async () => {
    const onContinue = vi.fn()
    render(<Harness initial={items('Separar a roupa')} onContinue={onContinue} />)
    expect(screen.getByRole('button', { name: 'Não' })).toBeDisabled()
    expect(screen.getByText('Limpe a lista para seguir sem passos.')).toBeInTheDocument()
    await press('Limpar checklist')
    expect(state.items).toEqual([])
    await press('Não')
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('adds, edits, duplicates and removes steps in the free path, then continues with them', async () => {
    const onContinue = vi.fn()
    render(<Harness onContinue={onContinue} />)
    await act(async () => { fireEvent.change(screen.getByRole('textbox', { name: 'Adicionar item' }), { target: { value: 'Separar a roupa' } }) })
    await press('Adicionar')
    expect(state.items).toEqual(items('Separar a roupa'))
    await act(async () => { fireEvent.change(screen.getByRole('textbox', { name: 'Item 1' }), { target: { value: 'Separar a mochila' } }) })
    expect(state.items).toEqual(items('Separar a mochila'))
    await press('Duplicar item')
    expect(state.items).toEqual(items('Separar a mochila', 'Separar a mochila'))
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Remover item' })[1]!) })
    expect(state.items).toEqual(items('Separar a mochila'))
    await press('Continuar')
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('stops at 50 steps and keeps the duplicate guard', () => {
    render(<Harness initial={Array.from({ length: MAX_CHECKLIST_ITEMS }, (_, index) => ({ text: `Passo ${index + 1}`, isChecked: false }))} />)
    expect(screen.getByText(copy('pt-BR')('habits.form.checklistItemLimit'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'Duplicar item' }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true)
  })

  it('keeps the steps the AI read in the proposed state', () => {
    const { container } = render(<Harness initial={items('Separar a roupa', 'Lavar a louça')} proposedItemCount={1} />)
    expect(container.querySelectorAll('[data-proposed]')).toHaveLength(1)
  })
})

describe('the template question inside the checklist step', () => {
  it('lists the saved templates with their item count and loads one back into the checklist question', async () => {
    state.templates = [template('t1', 'Treino', 'Alongar', 'Correr'), template('t2', 'Manhã', 'Beber água')]
    render(<Harness />)
    await press('Usar modelo')
    expect(heading()).toHaveTextContent('Qual modelo você quer usar?')
    expect(heading()).toHaveAccessibleDescription('Um modelo é uma lista de passos que eu guardei para você usar de novo.')
    await press('Treino, 2 itens')
    expect(state.items).toEqual(items('Alongar', 'Correr'))
    expect(heading()).toHaveTextContent('Tem passos dentro disso?')
  })

  it('goes back to the checklist question with no change', async () => {
    state.templates = [template('t1', 'Treino', 'Alongar')]
    render(<Harness initial={items('Separar a roupa')} />)
    await press('Usar modelo')
    await press('Voltar')
    expect(heading()).toHaveTextContent('Tem passos dentro disso?')
    expect(state.items).toEqual(items('Separar a roupa'))
  })

  it('says there is no template and offers the item editor', async () => {
    render(<Harness />)
    await press('Usar modelo')
    expect(heading()).toHaveAccessibleDescription('Ainda não tenho modelos seus, então escreva os passos que eu guardo.')
    expect(screen.queryByRole('group', { name: 'Qual modelo você quer usar?' })).not.toBeInTheDocument()
    await press('Escrever passos')
    expect(heading()).toHaveTextContent('Tem passos dentro disso?')
  })

  it('says the templates did not load, offers a retry and keeps the item editor, never the line of no template', async () => {
    state.templatesError = true
    render(<Harness />)
    await press('Usar modelo')
    expect(heading()).toHaveAccessibleDescription('Um modelo é uma lista de passos que eu guardei para você usar de novo.')
    expect(screen.getByText('Não foi possível carregar seus modelos. Tente de novo.')).toBeInTheDocument()
    await press(ptBR.common.retry)
    expect(state.refetchTemplates).toHaveBeenCalledTimes(1)
    await press('Escrever passos')
    expect(heading()).toHaveTextContent('Tem passos dentro disso?')
  })

  it('shows a skeleton while the templates load', async () => {
    state.loading = true
    render(<Harness />)
    await press('Usar modelo')
    expect(screen.getByRole('progressbar', { name: copy('pt-BR')('common.loading') })).toBeInTheDocument()
  })

  it('deletes a template and shows its error text when the delete fails', async () => {
    state.templates = [template('t1', 'Treino', 'Alongar')]
    render(<Harness />)
    await press('Usar modelo')
    await press('Apagar: Treino')
    expect(state.remove).toHaveBeenCalledWith('t1', expect.anything())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await act(async () => { state.remove.mock.calls[0]![1].onError() })
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível apagar o modelo. Tente de novo.')
  })

  it('keeps every template reachable when there are more than four', async () => {
    state.templates = ['A', 'B', 'C', 'D', 'E'].map((name, index) => template(`t${index}`, name, 'Passo'))
    render(<Harness />)
    await press('Usar modelo')
    expect(within(screen.getByRole('group', { name: 'Qual modelo você quer usar?' })).getAllByRole('button')).toHaveLength(4)
    await press('E, 1 item')
    expect(state.items).toEqual(items('Passo'))
  })
})

describe('the save question inside the checklist step', () => {
  it('offers the save only once there are steps', () => {
    render(<Harness />)
    expect(screen.queryByRole('button', { name: 'Salvar modelo' })).not.toBeInTheDocument()
  })

  it('asks for a name, shows the hint on an empty save and keeps the list as a template', async () => {
    render(<Harness initial={items('Alongar', 'Correr')} />)
    await press('Salvar modelo')
    expect(heading()).toHaveTextContent('Que nome vai ter esse modelo?')
    await press('Salvar')
    expect(state.create).not.toHaveBeenCalled()
    expect(screen.getByText('Escreva um nome para o modelo.')).toBeInTheDocument()
    await act(async () => { fireEvent.change(screen.getByRole('textbox', { name: 'Que nome vai ter esse modelo?' }), { target: { value: ' Treino ' } }) })
    await press('Salvar')
    expect(state.create).toHaveBeenCalledWith({ name: 'Treino', items: ['Alongar', 'Correr'] }, expect.anything())
    await act(async () => { state.create.mock.calls[0]![1].onSuccess() })
    expect(heading()).toHaveTextContent('Tem passos dentro disso?')
  })

  it('stays on the question with the error text when the save fails', async () => {
    render(<Harness initial={items('Alongar')} />)
    await press('Salvar modelo')
    await act(async () => { fireEvent.change(screen.getByRole('textbox', { name: 'Que nome vai ter esse modelo?' }), { target: { value: 'Treino' } }) })
    await press('Salvar')
    await act(async () => { state.create.mock.calls[0]![1].onError() })
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível salvar o modelo. Tente de novo.')
    expect(heading()).toHaveTextContent('Que nome vai ter esse modelo?')
  })
})

const BARE_NOUNS = ['tags', 'tag', 'metas', 'modelos', 'checklist', 'templates', 'goals']

function visibleLabels(container: HTMLElement): string[] {
  const headings = screen.getAllByRole('heading').map((element) => element.textContent)
  const labels = [...container.querySelectorAll('label, legend, [role="group"]')].map((element) => element.getAttribute('aria-label') ?? element.textContent)
  const controls = screen.getAllByRole('button').map((element) => element.textContent)
  return [...headings, ...labels, ...controls].map((text) => text.trim().toLocaleLowerCase())
}

describe('the bar: no bare system noun', () => {
  it.each(['pt-BR', 'en'] as const)('never titles or labels a question with a bare noun in %s', async (locale) => {
    state.locale = locale
    state.templates = [template('t1', 'Treino', 'Alongar')]
    const t = copy(locale)
    const { container } = render(<Harness initial={items('Alongar')} />)
    const seen = [...visibleLabels(container)]
    await press(t('habits.flow.checklist.useTemplate'))
    seen.push(...visibleLabels(container))
    await press('Voltar')
    await press(t('habits.form.saveAsTemplate'))
    seen.push(...visibleLabels(container))
    expect(seen.filter((text) => BARE_NOUNS.includes(text))).toEqual([])
  })
})

describe('motion of the questions inside the step', () => {
  it('slides the template question in, and shows it at once under reduced motion', async () => {
    state.templates = [template('t1', 'Treino', 'Alongar')]
    const { container, unmount } = render(<Harness />)
    await press('Usar modelo')
    expect(container.querySelector<HTMLElement>('[data-question-flow] [role="presentation"]')!.style.transform).not.toBe('')
    unmount()
    stubMedia(true)
    const reduced = render(<Harness />)
    await press('Usar modelo')
    const block = reduced.container.querySelector<HTMLElement>('[data-question-flow] [role="presentation"]')!
    expect(block.style.transform === '' || block.style.transform === 'none').toBe(true)
  })

  it('lets a removed step leave on the list exit timing, faster under reduced motion, while the others stay', async () => {
    for (const [reduced, exit] of [[false, 160], [true, 70]] as const) {
      stubMedia(reduced)
      const view = render(<Harness initial={items('Alongar', 'Correr')} />)
      expect(view.container.querySelectorAll('[data-list-motion]')).toHaveLength(2)
      vi.useFakeTimers()
      await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Remover item' })[0]!) })
      expect(state.items).toEqual(items('Correr'))
      expect(view.container.querySelectorAll('[data-list-motion][inert]')).toHaveLength(1)
      await act(async () => { vi.advanceTimersByTime(71) })
      expect(view.container.querySelectorAll('[data-list-motion]')).toHaveLength(reduced ? 1 : 2)
      await act(async () => { vi.advanceTimersByTime(exit - 70) })
      expect(view.container.querySelectorAll('[data-list-motion]')).toHaveLength(1)
      vi.useRealTimers()
      view.unmount()
    }
  })

  it('lets a deleted template leave on the list exit timing, faster and with no travel under reduced motion', async () => {
    for (const [reduced, exit] of [[false, 160], [true, 70]] as const) {
      stubMedia(reduced)
      state.templates = [template('t1', 'Treino', 'Alongar'), template('t2', 'Manhã', 'Beber água')]
      const view = render(<Harness />)
      await press('Usar modelo')
      vi.useFakeTimers()
      state.templates = [template('t2', 'Manhã', 'Beber água')]
      view.rerender(<Harness />)
      const leaving = view.container.querySelector('[data-template-row] [aria-label="Apagar: Treino"]')!.closest('[data-list-motion]')!
      expect(leaving).toHaveAttribute('inert')
      await act(async () => { vi.advanceTimersByTime(71) })
      expect(view.container.querySelector('[aria-label="Apagar: Treino"]') === null).toBe(reduced)
      await act(async () => { vi.advanceTimersByTime(exit - 70) })
      expect(view.container.querySelector('[aria-label="Apagar: Treino"]')).toBeNull()
      vi.useRealTimers()
      view.unmount()
    }
  })
})
