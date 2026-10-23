import type { ChatMessage } from '../types/chat'
import { getChatMessageParts } from '../chat/final-message'

interface ChatHistoryEntry {
  id?: ChatMessage['id']
  role: ChatMessage['role']
  content: string | null
  parts?: ChatMessage['parts']
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
      content: historyContent(message),
    }))
}

function historyContent(message: ChatHistoryEntry & { content: string }): string {
  if (message.role !== 'ai' || !message.parts) return message.content
  const queries = getChatMessageParts({ ...message, id: message.id ?? '', timestamp: new Date(0) })
    .flatMap(part => part?.type === 'block' && 'read' in part.block && part.block.read
      ? [{ kind: part.kind, queryId: part.block.read.queryId, queryFamily: part.block.read.queryFamily, scope: part.block.read.scope }]
      : [])
  return queries.length ? [message.content, JSON.stringify(queries)].filter(Boolean).join('\n') : message.content
}
