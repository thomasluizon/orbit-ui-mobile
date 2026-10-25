import React from 'react'
import { createInstance } from 'i18next'
import ICUCommonJs from 'i18next-icu/cjs'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { actionResultSchema } from '@orbit/shared/types/chat'
import { makeEmojiToolResult, toolResultRegressionCases } from '../../../../../packages/shared/src/test-support/tool-result-fixtures'
import { renderedText } from '@/__tests__/support/react-test-renderer'
import { expandedTextControls, pressTextControl } from '@/__tests__/support/personal-text'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { Button } from '@/components/ui/pill-button'
import { BlockFrame } from '@/components/ui/block-frame'
import { makeClarificationPreviewMessage } from '@orbit/shared/test-support/chat-fixtures'
import { MessageBubble } from '@/components/message-bubble'
import { ActionChips } from '@/components/chat/action-chips'

vi.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }))
vi.unmock('react-i18next')
const ICU = typeof ICUCommonJs === 'function' ? ICUCommonJs : ICUCommonJs.default

const resolveClarification = vi.hoisted(() => vi.fn(() => new Promise(() => {})))
vi.mock('@/hooks/use-resolve-clarification', () => ({ useResolveClarification: () => ({ mutateAsync: resolveClarification, isPending: false }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/ui/markdown', () => ({ Markdown: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/components/chat/block-registry', () => ({ ChatBlock: () => null }))
vi.mock('@/components/chat/breakdown-suggestion', () => ({ BreakdownSuggestion: () => null }))

describe.each([
  { locale: 'en', zero: '0 habits', singular: '1 habit', plural: '185 habits' },
  { locale: 'pt-BR', zero: '0 hábitos', singular: '1 hábito', plural: '185 hábitos' },
])('ActionChips result messages in $locale on Android', ({ locale, zero, singular, plural }) => {
  async function renderElement(payload: React.ReactNode) {
    const i18n = createInstance()
    await i18n.use(ICU).use(initReactI18next).init({
      lng: locale,
      resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } },
    })
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<I18nextProvider i18n={i18n}>{payload}</I18nextProvider>) })
    return tree
  }

  function renderAction(payload: unknown, onChipClick?: (entityId: string, actionType: string) => void) {
    return renderElement(<ActionChips actions={[actionResultSchema.parse(payload)]} onChipClick={onChipClick} />)
  }

  it.each(toolResultRegressionCases)('handles $name through the real translator', async (scenario) => {
    const tree = await renderAction(scenario.payload)
    const output = renderedText(tree.root)
    expect(output).toContain(locale === 'en' ? scenario.en : scenario.ptBR)
    expect(output).not.toContain('chat.toolResult.')
    expect(output).not.toContain('{count}')
  })

  it.each([0, 1, 185])('renders the producer emoji result with %i habits', async (count) => {
    const tree = await renderAction(makeEmojiToolResult(count))
    const output = renderedText(tree.root)
    expect(output).toContain(count === 0 ? zero : count === 1 ? singular : plural)
    expect(output).not.toContain('habit(s)')
    expect(output).not.toContain('chat.toolResult.')
  })

  it.each([undefined, 'chat.toolResult.futureKey'])('keeps legacy content for key %s', async (messageKey) => {
    const tree = await renderAction({ type: 'bulk_update_habit_emojis', status: 'Success', entityName: 'Legacy summary', messageKey })
    expect(renderedText(tree.root)).toContain('Legacy summary')
  })

  it.each([undefined, 'chat.toolResult.futureKey'])('omits an empty card for key %s', async (messageKey) => {
    const tree = await renderAction({ type: 'LogHabit', status: 'Success', messageKey })
    expect(tree.root.findAll((node) => String(node.type) === 'View')).toHaveLength(0)
  })

  it('renders a keyed failure with empty params and keeps failure semantics', async () => {
    const tree = await renderAction({ type: 'LogHabit', status: 'Failed', error: 'database unavailable', messageKey: 'chat.toolResult.toolFailure', params: {} })
    const output = renderedText(tree.root)
    expect(output).toContain(locale === 'en' ? 'I could not complete that. Try again.' : 'Não consegui concluir. Tente de novo.')
    expect(output).toContain(locale === 'en' ? en.chat.operation.status.Failed : ptBR.chat.operation.status.Failed)
    expect(output).not.toContain('database unavailable')
  })

  it.each([
    ['UnlogHabit', 'Success', 'Undid log for Leitura', 'Desfez o registro de Leitura'],
    ['unlog_habit', 'Failed', 'Could not undo the log for Leitura', 'Não foi possível desfazer o registro de Leitura'],
    ['bulk_log_habits', 'Success', 'Logged Leitura', 'Registrou Leitura'],
    ['bulk_skip_habits', 'Failed', 'Could not skip Leitura', 'Não foi possível pular Leitura'],
    ['create_goal', 'Success', 'Created goal: Leitura', 'Meta criada: Leitura'],
    ['update_goal', 'Failed', 'Could not update goal: Leitura', 'Não foi possível atualizar a meta: Leitura'],
    ['delete_goal', 'Success', 'Deleted goal: Leitura', 'Meta apagada: Leitura'],
    ['update_goal_progress', 'Success', 'Updated goal progress: Leitura', 'Progresso da meta atualizado: Leitura'],
    ['update_goal_status', 'Success', 'Updated goal status: Leitura', 'Status da meta atualizado: Leitura'],
    ['link_habits_to_goal', 'Success', 'Linked habits to goal: Leitura', 'Hábitos vinculados à meta: Leitura'],
  ])('localizes the legacy %s %s action', async (type, status, english, portuguese) => {
    const tree = await renderAction({ type, status, entityName: 'Leitura', error: status === 'Failed' ? 'arbitrary engine failure' : undefined })
    expect(renderedText(tree.root)).toContain(locale === 'en' ? english : portuguese)
  })

  it('keeps a snake case deleted goal from opening a removed target', async () => {
    const open = vi.fn()
    const tree = await renderAction({ type: 'delete_goal', status: 'Success', entityName: 'Leitura', entityId: 'removed-goal' }, open)
    const messages = locale === 'en' ? en : ptBR
    expect(tree.root.findAll(node => node.type === Button).some(button => button.props.children === messages.chat.action.open)).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })

  it.each(['frequency_quantity', 'frequencyQuantity'])('names the localized validation field %s without a message key', async (field) => {
    const tree = await renderAction({ type: 'CreateHabit', status: 'Failed', field })
    expect(renderedText(tree.root)).toContain(locale === 'en' ? 'Check the Frequency count field and try again.' : 'Confira o campo Número da frequência e tente de novo.')
    expect(renderedText(tree.root)).toContain(locale === 'en' ? en.chat.operation.status.Failed : ptBR.chat.operation.status.Failed)
  })

  it.each(['frequency_quantity', 'private_engine_property'])('discloses each target in named validation failures for %s', async field => {
    const messages = locale === 'en' ? en : ptBR
    const onChipClick = vi.fn()
    const names = ['Morning walk', 'Read ten pages']
    const tree = await renderElement(<ActionChips actions={names.map(entityName => actionResultSchema.parse({ type: 'CreateHabit', status: 'Failed', entityName, field }))} onChipClick={onChipClick} />)
    const guidance = field === 'private_engine_property'
      ? messages.chat.toolResult.invalidDetails
      : locale === 'en'
        ? 'Check the Frequency count field and try again.'
        : 'Confira o campo Número da frequência e tente de novo.'
    const labels = names.map(name => `${messages.chat.action.createFailed.replace('{name}', name)}. ${guidance}`)

    expect(tree.root.findAll(node => node.type === PersonalTextDetails).map(node => node.props.children)).toEqual(labels)
    for (const label of labels) {
      expect(renderedText(tree.root)).toContain(label)
      await act(() => pressTextControl(expandedTextControls(tree.root, label, false)[0]!))
      expect(expandedTextControls(tree.root, label, true)).toHaveLength(1)
    }
    expect(tree.root.findAll(node => node.type === Button).some(button => button.props.children === messages.chat.action.open)).toBe(false)
    expect(renderedText(tree.root)).not.toContain(field)
    expect(onChipClick).not.toHaveBeenCalled()
  })

  it('keeps an unknown validation field private and renders a localized failure', async () => {
    const tree = await renderAction({ type: 'CreateHabit', status: 'Failed', field: 'private_engine_property' })
    expect(renderedText(tree.root)).toContain(locale === 'en' ? en.chat.toolResult.invalidDetails : ptBR.chat.toolResult.invalidDetails)
    expect(renderedText(tree.root)).not.toContain('private_engine_property')
  })

  it('keeps a clarification question and its tappable answer separate from failure', async () => {
    const messages = locale === 'en' ? en : ptBR
    const message = makeClarificationPreviewMessage()
    message.actions![0]!.error = 'Days can only be set when frequency quantity is 1.'
    const tree = await renderElement(<MessageBubble message={message} />)
    const output = renderedText(tree.root)
    expect(output).toContain(messages.habits.clarification.questionFallback)
    expect(tree.root.findAll(node => node.type === BlockFrame).map(frame => frame.props.state)).toEqual(['resting'])
    expect(output).not.toContain(messages.chat.operation.status.Failed)
    expect(output).not.toContain(message.actions![0]!.error)
    const answer = tree.root.findAll(node => node.type === Button).find(button => button.props.children === messages.habits.clarification.quickAction.daily)!
    const selectAnswer = answer.props.onClick
    if (typeof selectAnswer !== 'function') throw new Error('Missing answer action')
    await act(() => { selectAnswer() })
    expect(resolveClarification).toHaveBeenCalledWith({ operationId: message.actions![0]!.clarificationRequest!.operationId, value: 'daily' })
  })

  it.each(['Days can only be set when frequency quantity is 1.', 'Unrecognized engine complaint'])('keeps a Failed result a localized failure regardless of error text: %s', async error => {
    const messages = locale === 'en' ? en : ptBR
    const message = makeClarificationPreviewMessage()
    message.actions = [{ ...message.actions![0]!, status: 'Failed', error, messageKey: 'chat.toolResult.toolFailure', params: {} }]
    const tree = await renderElement(<MessageBubble message={message} />)
    const output = renderedText(tree.root)
    expect(tree.root.findAll(node => node.type === BlockFrame).map(frame => frame.props.state)).toEqual(['partiallyFailed'])
    expect(output).toContain(messages.chat.toolResult.toolFailure)
    expect(output).not.toContain(error)
    expect(output).not.toContain(messages.habits.clarification.questionFallback)
    expect(tree.root.findAll(node => node.type === Button).some(button => button.props.children === messages.habits.clarification.quickAction.daily)).toBe(false)
  })

  it('preserves user authored names and referral values', async () => {
    const named = await renderAction({ type: 'CreateHabit', status: 'Success', messageKey: 'chat.toolResult.createdHabit', params: { entityName: "Ler d'água {#} <livro>" } })
    expect(renderedText(named.root)).toContain("Ler d'água {#} <livro>")
    const referral = await renderAction({ type: 'get_referral_code', status: 'Success', messageKey: 'chat.toolResult.referralCode', params: { referralCode: 'MY-CODE-{#}' } })
    expect(renderedText(referral.root)).toContain('MY-CODE-{#}')
  })
})
