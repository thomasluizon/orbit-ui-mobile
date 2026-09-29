import type { ChatMessage, ChatResponse } from '../types/chat'

export function buildChatFinalMessageFields(
  response: ChatResponse,
  toolSteps: NonNullable<ChatMessage['toolSteps']>,
): Omit<ChatResponse, 'aiMessage'> & { content: string; toolSteps: NonNullable<ChatMessage['toolSteps']> } {
  const { aiMessage, ...fields } = response
  return { ...fields, content: aiMessage || '', toolSteps }
}
