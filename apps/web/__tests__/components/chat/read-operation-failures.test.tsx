import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { chatMessageSchema } from '@orbit/shared/types/chat'
import { failedReadOperationFixture, makeHeldHabitMessage } from '@orbit/shared/test-support/chat-fixtures'
import { MessageBubble } from '@/components/chat/message-bubble'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: false } }) }))
vi.mock('@/hooks/use-habits', () => ({ useBulkCreateHabits: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-resolve-clarification', () => ({ useResolveClarification: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
afterEach(cleanup)

it.each(['en', 'pt-BR'] as const)('keeps a failed retrospective answer without a write block in %s', locale => {
  const messages = locale === 'en' ? en : pt
  const message = chatMessageSchema.parse(makeHeldHabitMessage({
    content: messages.chat.toolResult.toolFailure, pendingOperations: [], operations: [failedReadOperationFixture],
  }))
  const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}><MessageBubble message={message} /></NextIntlClientProvider>)
  expect(screen.getByText(message.content)).toBeInTheDocument()
  expect(container.querySelectorAll('section[data-state]')).toHaveLength(0)
  expect(screen.queryByText(messages.chat.operation.outcome.Failed)).not.toBeInTheDocument()
  expect(screen.queryByText(messages.chat.operation.status.Failed)).not.toBeInTheDocument()
  expect(screen.queryByText(messages.chat.operation.unknown)).not.toBeInTheDocument()
})

it.each(['en', 'pt-BR'] as const)('keeps a failed write block with its localized tool label in %s', locale => {
  const messages = locale === 'en' ? en : pt
  const message = chatMessageSchema.parse(makeHeldHabitMessage({ pendingOperations: [], operations: [{
    ...failedReadOperationFixture, access: 'write', operationId: 'create_habit', sourceName: 'create_habit',
  }] }))
  const { container } = render(<NextIntlClientProvider locale={locale} messages={messages}><MessageBubble message={message} /></NextIntlClientProvider>)
  expect(container.querySelectorAll('section[data-state]')).toHaveLength(1)
  expect(screen.getByText(messages.chat.operation.outcome.Failed)).toBeInTheDocument()
  expect(screen.getByText(messages.chat.operation.source.createHabit)).toBeInTheDocument()
  expect(screen.queryByText(messages.chat.operation.unknown)).not.toBeInTheDocument()
})
