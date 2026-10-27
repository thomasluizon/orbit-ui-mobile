import { describe, expect, it } from 'vitest'
import { buildChatFinalMessageFields } from '../chat/final-message'
import { chatResponseSchema } from '../types/chat'
import { focusedPeriodTotalFixture, habitListCardFixture, makeHeldHabitMessage } from '../test-support/chat-fixtures'
import { getChatCompletionText, getMessageBubbleView } from '../chat/message-bubble'

describe('chat final message fields', () => {
  it('keeps response cards and tool steps while replacing the wire message key', () => {
    const response = chatResponseSchema.parse({
      aiMessage: 'Done',
      actions: [],
      followUps: ['Next'],
      correlationId: 'request',
    })
    expect(buildChatFinalMessageFields(response, [{ domain: 'habits', access: 'read' }])).toEqual({
      content: 'Done',
      parts: [{ type: 'text', text: 'Done' }],
      actions: [],
      followUps: ['Next'],
      correlationId: 'request',
      toolSteps: [{ domain: 'habits', access: 'read' }],
    })
  })

  it('recovers legacy cards when every negotiated block fails boundary validation', () => {
    const response = chatResponseSchema.parse({ actions: [], aiMessage: '', habitList: habitListCardFixture,
      parts: [{ type: 'block', kind: 'habitList', block: {} }] })
    expect(buildChatFinalMessageFields(response, []).parts).toEqual([
      { type: 'text', text: '' }, { type: 'block', kind: 'habitList', block: habitListCardFixture },
    ])
  })

  it('announces visible recovery for a missing sole answer and withholds provisional prose', () => {
    const message = makeHeldHabitMessage({ content: '', pendingOperations: [], actions: [], operations: [] })
    expect(getMessageBubbleView({ message }, new Set()).showUnreadableReply).toBe(true)
    expect(getMessageBubbleView({ message: { ...message, content: 'Provisional introduction' }, isStreaming: true }, new Set()).parts).toEqual([])
  })
})

it('announces the rendered answer without legacy prose and deduplicates by query identity', () => {
  const read = { queryId: '11111111-1111-4111-8111-111111111111', queryFamily: 'query_habits', scope: {}, revision: 'v1', completeness: 'complete', refreshToken: 'signed' }
  const part = { type: 'block', kind: 'habitList', block: { ...habitListCardFixture, read } }
  const response = chatResponseSchema.parse({ aiMessage: 'Repeated figures', actions: [], habitList: habitListCardFixture, parts: [part, part] })
  const message = makeHeldHabitMessage({ pendingOperations: [], ...buildChatFinalMessageFields(response, []) })
  expect(message.parts).toHaveLength(1)
  expect(getChatCompletionText(message, { ready: 'Ready', unreadable: 'Retry' })).toBe('Ready')
})

it.each([
  "I couldn't complete that. Please try again.",
  'This response was cut off before completion, so the result is partial.',
])('keeps producer recovery text beside a successful total: %s', text => {
  const parts = [{ type: 'block', kind: 'periodTotal', block: focusedPeriodTotalFixture }, { type: 'text', text }]
  const response = chatResponseSchema.parse({ actions: [], parts, aiMessage: text })
  const fields = buildChatFinalMessageFields(response, [])
  expect(fields.parts).toEqual(parts)
  const message = makeHeldHabitMessage({ ...fields, pendingOperations: [] })
  expect(getMessageBubbleView({ message }, new Set()).parts).toMatchObject([{ type: 'block', part: parts[0] }, { type: 'text', text }])
  expect(getChatCompletionText(message, { ready: 'Ready', unreadable: 'Retry' })).toContain(text)
})
