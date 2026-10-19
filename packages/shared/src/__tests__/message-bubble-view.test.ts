import { expect, it, vi } from 'vitest'
import { getMessageBubbleOperations, getMessageBubbleView, type MessageBubbleProps } from '../chat/message-bubble'
import { makeActionResult, makeClarificationPreviewMessage, makeHeldHabitMessage } from '../test-support/chat-fixtures'
import { choiceBlockFixture } from '../test-support/choice-fixtures'
import type { ChatStoreState } from '../stores/chat-store'

it('keeps ordered parts, hides empty prose and expires only after unrelated messages', () => {
  const message = makeHeldHabitMessage({ content: '', parts: [
    { type: 'text', text: '---' },
    { type: 'block', kind: 'choice', block: choiceBlockFixture },
    { type: 'text', text: 'Hello [[orbit:open:today]]' },
  ] })
  const ownAnswer = { ...message, id: 'answer', role: 'user' as const, answerToBlockId: choiceBlockFixture.blockId }
  const view = getMessageBubbleView({ message, laterMessages: [ownAnswer] }, new Set())
  expect(view.parts).toMatchObject([{ type: 'block', key: 1, expired: false }, { type: 'text', key: 2, text: 'Hello', showImage: false }])
  expect(getMessageBubbleView({ message, laterMessages: [{ ...ownAnswer, answerToBlockId: undefined }] }, new Set()).parts[0]).toMatchObject({ expired: true })
  expect(getMessageBubbleView({ message: { ...message, role: 'user', content: '[[orbit:open:today]]' } }, new Set()).parts).toEqual([
    { type: 'text', key: 0, text: '[[orbit:open:today]]', showImage: false },
  ])
  expect(getMessageBubbleView({ message: { ...message, content: 'Streaming [[orbit:open' }, isStreaming: true }, new Set()).parts).toEqual([
    { type: 'text', key: 0, text: 'Streaming', showImage: false },
  ])
  expect(getMessageBubbleView({ message: { ...message, imageUrl: 'attachment' } }, new Set()).parts[0]).toMatchObject({ key: 0, showImage: true })
})

it('retains suggestion props and filters a dismissed suggestion by its stable key', () => {
  const message = makeHeldHabitMessage({ pendingOperations: [], actions: [makeActionResult({
    status: 'Suggestion', entityId: 'suggestion', entityName: 'Walk', suggestedSubHabits: [{ title: 'Morning' }, { title: 'Evening' }],
  })] })
  expect(getMessageBubbleView({ message }, new Set()).suggestions).toEqual([
    { key: 'suggestion', parentName: 'Walk', subHabits: [{ title: 'Morning' }, { title: 'Evening' }], warning: undefined },
  ])
  expect(getMessageBubbleView({ message }, new Set(['suggestion'])).suggestions).toEqual([])
})

it('writes clarification previews and operation patches against the current message, then restores them', () => {
  let message = makeClarificationPreviewMessage()
  const transition: ChatStoreState['transitionMessage'] = (id, update) => {
    expect(id).toBe(message.id)
    message = update(message)
  }
  const callbacks = { onPendingOperationConfirmExecute: vi.fn(), onPendingOperationPrepareStepUp: vi.fn(), onPendingOperationVerifyStepUp: vi.fn() }
  const props = (): MessageBubbleProps => ({ message, ...callbacks })
  const clarification = getMessageBubbleOperations(props(), transition).clarifications[0]!
  const operation = makeHeldHabitMessage().pendingOperations![0]!
  clarification.onPreview(operation)
  clarification.onStateChange(operation.id, { editedItemIds: ['chosen'] })
  const restored = getMessageBubbleOperations(props(), transition).clarifications[0]!
  expect(restored.pendingOperation).toEqual(operation)
  expect(restored.savedState).toEqual({ editedItemIds: ['chosen'] })
  message = { ...message, pendingOperations: [operation] }
  const pending = getMessageBubbleOperations(props(), transition).pendingOperations[0]!
  pending.onStateChange({ dismissed: true })
  expect(getMessageBubbleOperations(props(), transition).pendingOperations[0]!.savedState).toEqual({ editedItemIds: ['chosen'], dismissed: true })
  expect(pending.onConfirmExecute).toBe(callbacks.onPendingOperationConfirmExecute)
  expect(pending.onPrepareStepUp).toBe(callbacks.onPendingOperationPrepareStepUp)
  expect(pending.onVerifyStepUp).toBe(callbacks.onPendingOperationVerifyStepUp)
  expect(getMessageBubbleOperations({ message }, transition).pendingOperations).toEqual([])
})
