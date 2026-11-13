import { useEffect } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { GuidedHabitFlow } from '@/components/habits/guided/guided-habit-flow'
import { useHabitForm } from '@/hooks/use-habit-form'

const state = vi.hoisted(() => ({ locale: 'pt-BR' as 'en' | 'pt-BR', read: vi.fn(), helpers: null as unknown }))

function lookup(messages: Record<string, unknown>, key: string): string {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages)
  return typeof value === 'string' ? value : key
}

vi.mock('next-intl', () => ({
  useLocale: () => state.locale,
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    lookup(state.locale === 'en' ? en : ptBR, key).replaceAll(/\{(\w+)\}/g, (_match, name: string) => `${values?.[name] ?? ''}`),
}))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { timeZone: 'UTC', uses24HourClock: true, weekStartDay: 0 } }), useHasProAccess: () => true }))
vi.mock('@/hooks/use-habit-phrase-read', () => ({ useHabitPhraseRead: () => ({ mutateAsync: state.read, isPending: false }) }))
vi.mock('@/lib/posthog', () => ({ captureGuidedFlowEvent: vi.fn(), captureGuidedFlowCompleted: vi.fn() }))

const submit = vi.fn()
const helpers = () => state.helpers as ReturnType<typeof useHabitForm>

function Harness({ saveError = null }: Readonly<{ saveError?: string | null }>) {
  const formHelpers = useHabitForm({ initialData: { dueDate: '' } })
  useEffect(() => { state.helpers = formHelpers })
  return (
    <GuidedHabitFlow formHelpers={formHelpers} lockedGeneral={null} fromConversation={false} pending={false}
      saveError={saveError} moreFields={<p>more</p>} createLabel="Criar tarefa" onSubmit={submit} onClose={vi.fn()} />
  )
}

const progress = () => screen.getByRole('list').getAttribute('aria-label')
const heading = () => screen.getByRole('heading', { level: 1 })
async function type(label: string, text: string) {
  await act(async () => { fireEvent.change(screen.getByLabelText(label), { target: { value: text } }) })
}
async function press(name: string | RegExp) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
}

beforeEach(() => {
  state.locale = 'pt-BR'
  state.read.mockReset()
  submit.mockReset()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }))
})
afterEach(() => vi.unstubAllGlobals())

describe('the guided create flow', () => {
  it('asks the question in the words of the person and names the progress', () => {
    render(<Harness />)
    expect(heading()).toHaveTextContent('O que você quer fazer?')
    expect(progress()).toMatch(/^Passo 1 de \d$/)
  })

  it('reaches the reminder and then the summary from one phrase that holds the repeat and the time', async () => {
    render(<Harness />)
    await type('O que você quer fazer?', 'tomar remédio todo dia às 8')
    await press('Continuar')
    expect(heading().textContent).toContain('Quer que eu te lembre')
    expect(progress()).toBe('Passo 2 de 3')
    await press('Sim, me lembre')
    expect(heading()).toHaveTextContent('É isso?')
    expect(helpers().form.getValues('reminderEnabled')).toBe(true)
  })

  it('answers a task with a date and a time through the quick options and creates once', async () => {
    render(<Harness />)
    await type('O que você quer fazer?', 'ligar para o João')
    await press('Continuar')
    expect(heading()).toHaveTextContent('Quando?')
    await press('Amanhã')
    expect(helpers().form.getValues('itemType')).toBe('task')
    expect(helpers().form.getValues('dueDate')).not.toBe('')
    await press('08:00')
    expect(helpers().form.getValues('dueTime')).toBe('08:00')
    await press('Sim, me lembre')
    expect(heading()).toHaveTextContent('É isso?')
    await press('Criar tarefa')
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('keeps an undated task in General when the answer is no date', async () => {
    render(<Harness />)
    await type('O que você quer fazer?', 'arrumar a garagem')
    await press('Continuar')
    await press('Sem data')
    expect(helpers().isGeneral).toBe(true)
    expect(helpers().form.getValues('dueDate')).toBe('')
  })

  it('advances one step on a double press of an option', async () => {
    render(<Harness />)
    await type('O que você quer fazer?', 'ligar para o João')
    await press('Continuar')
    const today = screen.getByRole('button', { name: 'Hoje' })
    await act(async () => { today.click(); today.click() })
    expect(heading()).toHaveTextContent('Tem hora certa?')
  })

  it('shows the hint and keeps step 1 on an empty phrase', async () => {
    render(<Harness />)
    await press('Continuar')
    expect(screen.getByText('Escreva o que você quer fazer.')).toBeInTheDocument()
    expect(heading()).toHaveTextContent('O que você quer fazer?')
  })

  it('keeps the summary open with the server message after a failed save', async () => {
    render(<Harness saveError="Servidor indisponível" />)
    await type('O que você quer fazer?', 'tomar remédio todo dia às 8')
    await press('Continuar')
    await press('Agora não')
    expect(screen.getByRole('alert')).toHaveTextContent('Servidor indisponível')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the step of a summary value and returns to the summary', async () => {
    render(<Harness />)
    await type('O que você quer fazer?', 'tomar remédio todo dia às 8')
    await press('Continuar')
    await press('Agora não')
    await press(/Hora/)
    expect(heading()).toHaveTextContent('Tem hora certa?')
    await press('14:00')
    expect(heading()).toHaveTextContent('É isso?')
    expect(helpers().form.getValues('dueTime')).toBe('14:00')
  })
})
