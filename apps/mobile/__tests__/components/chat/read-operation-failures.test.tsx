import { IntlMessageFormat } from 'intl-messageformat'
import { act, create } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import pt from '@orbit/shared/i18n/pt-BR.json'
import { chatMessageSchema } from '@orbit/shared/types/chat'
import { failedReadOperationFixture, makeHeldHabitMessage } from '@orbit/shared/test-support/chat-fixtures'
import { MessageBubble } from '@/components/message-bubble'
import { BlockFrame } from '@/components/ui/block-frame'
import { renderedText } from '../../support/react-test-renderer'
import type { GeometryTree } from '../../support/safe-area-geometry'

const state = vi.hoisted(() => ({ locale: 'en' }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: state.locale }, t: (key: string, values?: Record<string, string | number>) => {
  const message = key.split('.').reduce<unknown>((current, segment) => typeof current === 'object' && current !== null ? (current as Record<string, unknown>)[segment] : undefined, state.locale === 'en' ? en : pt)
  return typeof message === 'string' ? new IntlMessageFormat(message, state.locale).format(values) : key
} }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { uses24HourClock: false } }) }))
vi.mock('@/hooks/use-habits', () => ({ useBulkCreateHabits: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-resolve-clarification', () => ({ useResolveClarification: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/components/ui/markdown', () => ({ Markdown: ({ children }: { children: string }) => <>{children}</> }))

let tree: GeometryTree | undefined
afterEach(async () => { await act(() => tree?.unmount()); tree = undefined })

it.each(['en', 'pt-BR'])('keeps a failed retrospective answer without a write block in %s', async locale => {
  state.locale = locale
  const messages = locale === 'en' ? en : pt
  const message = chatMessageSchema.parse(makeHeldHabitMessage({
    content: messages.chat.toolResult.toolFailure, pendingOperations: [], operations: [failedReadOperationFixture],
  }))
  await act(() => { tree = create(<MessageBubble message={message} />) as GeometryTree })
  const output = renderedText(tree!.toJSON())
  expect(output).toContain(message.content)
  expect(tree!.root.findAll(node => node.type === BlockFrame)).toHaveLength(0)
  expect(output).not.toContain(messages.chat.operation.outcome.Failed)
  expect(output).not.toContain(messages.chat.operation.status.Failed)
  expect(output).not.toContain(messages.chat.operation.unknown)
})

it.each(['en', 'pt-BR'])('keeps a failed write block with its localized tool label in %s', async locale => {
  state.locale = locale
  const messages = locale === 'en' ? en : pt
  const message = chatMessageSchema.parse(makeHeldHabitMessage({ pendingOperations: [], operations: [{
    ...failedReadOperationFixture, access: 'write', operationId: 'create_habit', sourceName: 'create_habit',
  }] }))
  await act(() => { tree = create(<MessageBubble message={message} />) as GeometryTree })
  const output = renderedText(tree!.toJSON())
  expect(tree!.root.findAll(node => node.type === BlockFrame)).toHaveLength(1)
  expect(output).toContain(messages.chat.operation.outcome.Failed)
  expect(output).toContain(messages.chat.operation.source.createHabit)
  expect(output).not.toContain(messages.chat.operation.unknown)
})
