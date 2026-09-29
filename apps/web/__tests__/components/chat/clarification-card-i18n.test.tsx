import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import type { ClarificationRequest } from '@orbit/shared/types/chat'
import { ClarificationCard } from '@/components/chat/clarification-card'

vi.mock('@/hooks/use-resolve-clarification', () => ({
  useResolveClarification: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))

const clarificationRequest: ClarificationRequest = {
  question: 'habits.clarification.questionFallback',
  operationId: '00000000-0000-0000-0000-000000000001',
  missingArgumentKey: 'frequency_unit',
  quickActions: [
    { label: 'habits.clarification.quickAction.daily', value: '{"frequency_unit":"Day","frequency_quantity":1}', description: null },
    { label: 'habits.clarification.quickAction.weekly', value: '{"frequency_unit":"Week","frequency_quantity":1}', description: null },
    { label: 'habits.clarification.quickAction.threePerWeek', value: '{"frequency_unit":"Week","frequency_quantity":3,"is_flexible":true}', description: null },
    { label: 'habits.clarification.quickAction.oneTime', value: '{"frequency_unit":null}', description: null },
  ],
}

describe.each([
  { locale: 'en', messages: en, labels: ['Daily', 'Weekly', '3 times per week', 'Once'] },
  { locale: 'pt-BR', messages: ptBR, labels: ['Todo dia', 'Toda semana', '3 vezes por semana', 'Uma vez'] },
])('ClarificationCard translations in $locale', ({ locale, messages, labels }) => {
  it('renders every API-provided frequency choice from the catalog', () => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <ClarificationCard clarificationRequest={clarificationRequest} />
      </NextIntlClientProvider>,
    )

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(labels)
    expect(screen.queryByText(/habits\.clarification\.quickAction\./)).not.toBeInTheDocument()
  })
})
