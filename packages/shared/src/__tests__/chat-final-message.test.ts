import { describe, expect, it } from 'vitest'
import { buildChatFinalMessageFields } from '../chat/final-message'
import { chatResponseSchema } from '../types/chat'

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
      actions: [],
      followUps: ['Next'],
      correlationId: 'request',
      toolSteps: [{ domain: 'habits', access: 'read' }],
    })
  })
})
