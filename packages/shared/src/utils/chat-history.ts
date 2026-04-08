import type { ChatMessage } from '../types/chat'

interface ChatHistoryEntry {
  role: ChatMessage['role']
  content: string | null
}

export function buildRecentChatHistory(
  messages: ReadonlyArray<ChatHistoryEntry>,
  limit = 10,
): Array<Pick<ChatMessage, 'role' | 'content'>> {
  return messages.slice(-(limit + 1), -1).map((message) => ({
    role: message.role,
    content: message.content,
  })).filter((message): message is Pick<ChatMessage, 'role' | 'content'> => message.content !== null)
}
