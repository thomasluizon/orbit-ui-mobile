export function getChatReplyState(state: {
  isTyping: boolean
  streamingMessageId: string | null
  activeStepCount: number
  atMessageLimit: boolean
  hasPlan?: boolean
}): { showPendingReply: boolean; replyWorking: boolean } {
  return {
    showPendingReply: (state.isTyping || state.streamingMessageId !== null) && state.activeStepCount === 0 && !state.atMessageLimit && !state.hasPlan,
    replyWorking: state.isTyping || state.streamingMessageId !== null || state.activeStepCount > 0,
  }
}
