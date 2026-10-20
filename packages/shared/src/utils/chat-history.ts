import type { ChatMessage } from '../types/chat'

interface ChatHistoryEntry {
  id?: ChatMessage['id']
  role: ChatMessage['role']
  content: string | null
  proactiveContextAfterMessageId?: ChatMessage['proactiveContextAfterMessageId']
}

interface ChatHistoryPayloadEntry {
  role: 'user' | 'assistant'
  content: string
}

function toChatHistoryRole(role: ChatMessage['role']): ChatHistoryPayloadEntry['role'] {
  return role === 'ai' ? 'assistant' : 'user'
}

export function buildRecentChatHistory(
  messages: ReadonlyArray<ChatHistoryEntry>,
  limit = 10,
): ChatHistoryPayloadEntry[] {
  const previousMessages = messages.slice(0, -1)
  const latestUserMessageId = previousMessages.filter((message) => message.role === 'user').at(-1)?.id ?? null
  const openedItem = previousMessages[0]
  const recentMessages = messages.slice(-(limit + 1), -1)
  if (limit > 0 && openedItem?.proactiveContextAfterMessageId !== undefined
    && openedItem.proactiveContextAfterMessageId === latestUserMessageId
    && !recentMessages.includes(openedItem)) {
    recentMessages.shift()
    recentMessages.push(openedItem)
  }
  return recentMessages
    .filter((message): message is ChatHistoryEntry & { content: string } => message.content !== null)
    .map((message) => ({
      role: toChatHistoryRole(message.role),
      content: message.content,
    }))
}
