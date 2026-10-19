import { describe, expect, it } from 'vitest'
import { getChatReplyState } from '../chat/reply-state'

describe('chat reply state', () => {
  it.each([
    { name: 'idle', isTyping: false, streamingMessageId: null, activeStepCount: 0, atMessageLimit: false, showPendingReply: false, replyWorking: false },
    { name: 'waiting for the reply', isTyping: true, streamingMessageId: null, activeStepCount: 0, atMessageLimit: false, showPendingReply: true, replyWorking: true },
    { name: 'streaming', isTyping: true, streamingMessageId: 'reply', activeStepCount: 0, atMessageLimit: false, showPendingReply: false, replyWorking: true },
    { name: 'streaming after typing ends', isTyping: false, streamingMessageId: 'reply', activeStepCount: 0, atMessageLimit: false, showPendingReply: false, replyWorking: true },
    { name: 'running tools', isTyping: true, streamingMessageId: null, activeStepCount: 2, atMessageLimit: false, showPendingReply: false, replyWorking: true },
    { name: 'running tools after typing ends', isTyping: false, streamingMessageId: null, activeStepCount: 1, atMessageLimit: false, showPendingReply: false, replyWorking: true },
    { name: 'waiting at capacity', isTyping: true, streamingMessageId: null, activeStepCount: 0, atMessageLimit: true, showPendingReply: false, replyWorking: true },
    { name: 'idle at capacity', isTyping: false, streamingMessageId: null, activeStepCount: 0, atMessageLimit: true, showPendingReply: false, replyWorking: false },
  ])('$name', ({ name: _name, showPendingReply, replyWorking, ...state }) => {
    expect(getChatReplyState(state)).toEqual({ showPendingReply, replyWorking })
  })
})
