import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { actionResultSchema } from '@orbit/shared/types/chat'
import { makeEmojiToolResult, toolResultRegressionCases } from '../../../../../packages/shared/src/test-support/tool-result-fixtures'
import { makeClarificationPreviewMessage } from '@orbit/shared/test-support/chat-fixtures'
import { MessageBubble } from '@/components/chat/message-bubble'
import { ActionChips } from '@/components/chat/action-chips'

const resolveClarification = vi.hoisted(() => vi.fn(() => new Promise(() => {})))
vi.mock('@/hooks/use-resolve-clarification', () => ({ useResolveClarification: () => ({ mutateAsync: resolveClarification, isPending: false }) }))
vi.mock('@/hooks/use-time-format', () => ({ useTimeFormat: () => ({ displayTime: (value: string) => value }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

describe.each([
  { locale: 'en', messages: en, zero: '0 habits', singular: '1 habit', plural: '185 habits' },
  { locale: 'pt-BR', messages: ptBR, zero: '0 hábitos', singular: '1 hábito', plural: '185 hábitos' },
])('ActionChips result messages in $locale', ({ locale, messages, zero, singular, plural }) => {
  function renderAction(payload: unknown, onChipClick?: (entityId: string, actionType: string) => void) {
    return render(<NextIntlClientProvider locale={locale} messages={messages}>
      <ActionChips actions={[actionResultSchema.parse(payload)]} onChipClick={onChipClick} />
    </NextIntlClientProvider>)
  }

  it.each(toolResultRegressionCases)('handles $name through the real translator', (scenario) => {
    const { container } = renderAction(scenario.payload)
    expect(container).toHaveTextContent(locale === 'en' ? scenario.en : scenario.ptBR)
    expect(container).not.toHaveTextContent('chat.toolResult.')
    expect(container).not.toHaveTextContent('{count}')
  })

  it.each([0, 1, 185])('renders the producer emoji result with %i habits', (count) => {
    const { container } = renderAction(makeEmojiToolResult(count))
    expect(container).toHaveTextContent(count === 0 ? zero : count === 1 ? singular : plural)
    expect(container).not.toHaveTextContent('habit(s)')
    expect(container).not.toHaveTextContent('chat.toolResult.')
  })

  it.each([undefined, 'chat.toolResult.futureKey'])('keeps legacy content for key %s', (messageKey) => {
    renderAction({ type: 'bulk_update_habit_emojis', status: 'Success', entityName: 'Legacy summary', messageKey })
    expect(screen.getByRole('button', { name: 'Legacy summary' })).toBeInTheDocument()
  })

  it.each([undefined, 'chat.toolResult.futureKey'])('omits an empty card for key %s', (messageKey) => {
    const { container } = renderAction({ type: 'LogHabit', status: 'Success', messageKey })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a keyed failure with empty params and keeps failure semantics', () => {
    const { container } = renderAction({ type: 'LogHabit', status: 'Failed', error: 'database unavailable', messageKey: 'chat.toolResult.toolFailure', params: {} })
    expect(container.querySelector('[data-state="partiallyFailed"]')).toBeInTheDocument()
    expect(container).toHaveTextContent(locale === 'en' ? 'I could not complete that. Try again.' : 'Não consegui concluir. Tente de novo.')
    expect(container).not.toHaveTextContent('database unavailable')
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
  ])('localizes the legacy %s %s action', (type, status, english, portuguese) => {
    const { container } = renderAction({ type, status, entityName: 'Leitura', error: status === 'Failed' ? 'arbitrary engine failure' : undefined })
    expect(container).toHaveTextContent(locale === 'en' ? english : portuguese)
  })

  it('keeps a snake case deleted goal from opening a removed target', () => {
    const open = vi.fn()
    renderAction({ type: 'delete_goal', status: 'Success', entityName: 'Leitura', entityId: 'removed-goal' }, open)
    expect(screen.queryByRole('button', { name: messages.chat.action.open })).not.toBeInTheDocument()
    expect(open).not.toHaveBeenCalled()
  })

  it.each(['frequency_quantity', 'frequencyQuantity'])('names the localized validation field %s without a message key', (field) => {
    const { container } = renderAction({ type: 'CreateHabit', status: 'Failed', field })
    expect(container).toHaveTextContent(locale === 'en' ? 'Check Frequency count and try again.' : 'Confira Número da frequência e tente de novo.')
    expect(container.querySelector('[data-state="partiallyFailed"]')).toBeInTheDocument()
  })

  it('keeps an unknown validation field private and renders a localized failure', () => {
    const { container } = renderAction({ type: 'CreateHabit', status: 'Failed', field: 'private_engine_property' })
    expect(container).toHaveTextContent(locale === 'en' ? en.chat.toolResult.invalidDetails : ptBR.chat.toolResult.invalidDetails)
    expect(container).not.toHaveTextContent('private_engine_property')
  })

  it('keeps a clarification question and its tappable answer separate from failure', () => {
    const message = makeClarificationPreviewMessage()
    message.actions![0]!.error = 'Days can only be set when frequency quantity is 1.'
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}><MessageBubble message={message} /></NextIntlClientProvider>)
    expect(screen.getByRole('heading', { name: messages.habits.clarification.questionFallback })).toBeInTheDocument()
    expect(container.querySelector('[data-state="partiallyFailed"]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-status="failed"]')).not.toBeInTheDocument()
    expect(container).not.toHaveTextContent(message.actions![0]!.error)
    fireEvent.click(screen.getByRole('button', { name: messages.habits.clarification.quickAction.daily }))
    expect(resolveClarification).toHaveBeenCalledWith({ operationId: message.actions![0]!.clarificationRequest!.operationId, value: 'daily' })
  })

  it.each(['Days can only be set when frequency quantity is 1.', 'Unrecognized engine complaint'])('keeps a Failed result a localized failure regardless of error text: %s', error => {
    const message = makeClarificationPreviewMessage()
    message.actions = [{ ...message.actions![0]!, status: 'Failed', error, messageKey: 'chat.toolResult.toolFailure', params: {} }]
    const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}><MessageBubble message={message} /></NextIntlClientProvider>)
    expect(container.querySelector('[data-state="partiallyFailed"]')).toBeInTheDocument()
    expect(container).toHaveTextContent(messages.chat.toolResult.toolFailure)
    expect(container).not.toHaveTextContent(error)
    expect(screen.queryByRole('button', { name: messages.habits.clarification.quickAction.daily })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: messages.habits.clarification.questionFallback })).not.toBeInTheDocument()
  })

  it('preserves user authored names and referral values', () => {
    const { unmount } = renderAction({ type: 'CreateHabit', status: 'Success', messageKey: 'chat.toolResult.createdHabit', params: { entityName: "Ler d'água {#} <livro>" } })
    expect(screen.getByRole('button', { name: /Ler d'água \{#\} <livro>/ })).toBeInTheDocument()
    unmount()
    renderAction({ type: 'get_referral_code', status: 'Success', messageKey: 'chat.toolResult.referralCode', params: { referralCode: 'MY-CODE-{#}' } })
    expect(screen.getByRole('button', { name: /MY-CODE-\{#\}/ })).toBeInTheDocument()
  })
})
