import type { ChatMessage, ChatPart, ChatResponse } from '../types/chat'

function buildChatParts(response: Omit<ChatResponse, 'actions'>): ChatPart[] {
  const text: ChatPart = { type: 'text', text: response.aiMessage || '' }
  if (response.parts != null) {
    const parts = response.parts.filter(part => part !== null)
    return parts.length > 0 ? parts : [text]
  }
  return [
    text,
    ...(response.habitList ? [{ type: 'block', kind: 'habitList', block: response.habitList } as const] : []),
    ...(response.goalList ? [{ type: 'block', kind: 'goalList', block: response.goalList } as const] : []),
    ...(response.metricsCard ? [{ type: 'block', kind: 'metrics', block: response.metricsCard } as const] : []),
    ...(response.periodInsight ? [{ type: 'block', kind: 'periodInsight', block: response.periodInsight } as const] : []),
    ...(response.daySummary ? [{ type: 'block', kind: 'daySummary', block: response.daySummary } as const] : []),
    ...(response.streak ? [{ type: 'block', kind: 'streak', block: response.streak } as const] : []),
    ...(response.calendar ? [{ type: 'block', kind: 'calendar', block: response.calendar } as const] : []),
    ...(response.recordLists?.map(block => ({ type: 'block', kind: 'recordList', block } as const)) ?? []),
    ...(response.accountRows ? [{ type: 'block', kind: 'accountRows', block: response.accountRows } as const] : []),
  ]
}

export function getChatMessageParts(message: ChatMessage, isStreaming = false): ChatPart[] {
  if (isStreaming) return [{ type: 'text', text: message.content }]
  return buildChatParts({ ...message, aiMessage: message.content })
}

export function buildChatFinalMessageFields(
  response: ChatResponse,
  toolSteps: NonNullable<ChatMessage['toolSteps']>,
): Omit<ChatResponse, 'aiMessage'> & { content: string; toolSteps: NonNullable<ChatMessage['toolSteps']> } {
  const { aiMessage, ...fields } = response
  return { ...fields, content: aiMessage || '', parts: buildChatParts(response), toolSteps }
}
