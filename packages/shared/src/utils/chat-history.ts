import type { ChatMessage } from '../types/chat'

interface ChatHistoryEntry {
  role: ChatMessage['role']
  content: string | null
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
  return messages
    .slice(-(limit + 1), -1)
    .filter((message): message is ChatHistoryEntry & { content: string } => message.content !== null)
    .map((message) => ({
      role: toChatHistoryRole(message.role),
      content: message.content,
    }))
}
