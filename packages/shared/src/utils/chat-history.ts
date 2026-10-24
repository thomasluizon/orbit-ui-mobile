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
    .map((message) => ({
      role: toChatHistoryRole(message.role),
      content: historyContent(message),
    }))
    .filter(message => message.content.trim().length > 0)
}

function historyContent(message: ChatHistoryEntry): string {
  if (message.role !== 'ai' || !message.parts) return message.content ?? ''
  const parts = getChatMessageParts({ ...message, content: message.content ?? '', id: message.id ?? '', timestamp: new Date(0) })
  const text = parts.flatMap(part => part?.type === 'text' ? [part.text] : []).join('\n')
  const blocks = parts.flatMap<unknown>(part => {
    if (part?.type !== 'block') return []
    if ('read' in part.block && part.block.read) {
      const { queryId, queryFamily, scope } = part.block.read
      return [{ kind: part.kind, queryId, queryFamily, scope }]
    }
    if (part.kind === 'habitRanking') {
      const { queryId, query } = part.block.ranking
      return [{ kind: part.kind, queryId, query }]
    }
    return [{ kind: part.kind, block: part.block }]
  })
  return [text, blocks.length ? JSON.stringify(blocks) : ''].filter(Boolean).join('\n').slice(0, 4000)
}
