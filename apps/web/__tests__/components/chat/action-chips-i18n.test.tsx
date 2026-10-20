import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { actionResultSchema } from '@orbit/shared/types/chat'
import { makeEmojiToolResult } from '../../../../../packages/shared/src/test-support/tool-result-fixtures'
import { ActionChips } from '@/components/chat/action-chips'

describe.each([
  { locale: 'en', messages: en, zero: '0 matching habits', singular: '1 matching habit', plural: '185 matching habits' },
  { locale: 'pt-BR', messages: ptBR, zero: '0 hábitos encontrados', singular: '1 hábito encontrado', plural: '185 hábitos encontrados' },
])('ActionChips result messages in $locale', ({ locale, messages, zero, singular, plural }) => {
  function renderAction(payload: unknown) {
    return render(<NextIntlClientProvider locale={locale} messages={messages}>
      <ActionChips actions={[actionResultSchema.parse(payload)]} />
    </NextIntlClientProvider>)
  }

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

  it('preserves user authored names and referral values', () => {
    const { unmount } = renderAction({ type: 'CreateHabit', status: 'Success', messageKey: 'chat.toolResult.createdHabit', params: { entityName: "Ler d'água {#} <livro>" } })
    expect(screen.getByRole('button', { name: /Ler d'água \{#\} <livro>/ })).toBeInTheDocument()
    unmount()
    renderAction({ type: 'get_referral_code', status: 'Success', messageKey: 'chat.toolResult.referralCode', params: { referralCode: 'MY-CODE-{#}' } })
    expect(screen.getByRole('button', { name: /MY-CODE-\{#\}/ })).toBeInTheDocument()
  })
})
