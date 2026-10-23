import { describe, expect, it } from 'vitest'
import { buildChatFinalMessageFields } from '../chat/final-message'
import { chatResponseSchema } from '../types/chat'
import { habitListCardFixture, makeHeldHabitMessage } from '../test-support/chat-fixtures'
import { getMessageBubbleView } from '../chat/message-bubble'

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
