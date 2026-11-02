import { z } from 'zod'
import { API } from '../api/endpoints'
import { chatResponseSchema, type ChatMessage } from '../types/chat'
import { conversationPreviewOutcomeSchema, type ConversationPage } from '../types/conversation'
import type { ChatStoreState } from '../stores/chat-store'
import { buildChatFinalMessageFields } from './final-message'

export interface ConversationCursor { conversationId?: string; beforeOrder?: number | string }

export function conversationPagePath(cursor: ConversationCursor = {}): string {
  const query = new URLSearchParams({ pageSize: '40' })
  if (cursor.conversationId) query.set('conversationId', cursor.conversationId)
  if (cursor.beforeOrder !== undefined) query.set('beforeOrder', String(cursor.beforeOrder))
  return `${API.chat.latestConversation}?${query.toString()}`
}

export function restoreConversationPage(page: ConversationPage): ChatMessage[] {
  return page.turns.map(turn => {
    const message: ChatMessage = {
      id: `stored-${turn.turnId}-${turn.role}`, role: turn.role === 'user' ? 'user' : 'ai',
      content: turn.content ?? '', timestamp: new Date(turn.createdAtUtc), restored: true,
    }
    if (turn.image) {
      message.imageUrl = API.chat.conversationImage(page.conversationId, turn.turnId)
      message.storedImage = { conversationId: page.conversationId, turnId: turn.turnId }
    }
    if (turn.role === 'assistant' && turn.responseJson) {
      Object.assign(message, buildChatFinalMessageFields(chatResponseSchema.parse(JSON.parse(turn.responseJson)), []))
      const outcomes = z.array(conversationPreviewOutcomeSchema).parse(JSON.parse(turn.previewOutcomesJson))
      message.pendingOperationStates = Object.fromEntries(outcomes.flatMap(outcome => outcome.Outcome === 'pending' ? [] : [[
        outcome.PendingOperationId, outcome.Outcome === 'rejected' ? { rejected: true, dismissed: true }
          : { recordedOutcome: outcome.Outcome },
      ]]))
    }
    return message
  })
}

interface HistoryAdapter {
  getState: () => ChatStoreState
  setState: (patch: Partial<ChatStoreState>) => void
  getAccountGeneration: () => number
  read: (cursor: ConversationCursor) => Promise<ConversationPage | null>
  remove: (id: string) => Promise<void>
}

export interface ConversationHistory {
  latest: (refresh?: boolean) => Promise<boolean>
  earlier: () => Promise<boolean>
  remove: () => Promise<boolean>
  isReady: () => boolean
  prepareSend: () => Promise<boolean>
}

export function createConversationHistory(adapter: HistoryAdapter): ConversationHistory {
  let job: { generation: number; epoch: number; promise: Promise<boolean> } | undefined
  function run(operation: (isCurrent: () => boolean) => Promise<boolean>): Promise<boolean> {
    const generation = adapter.getAccountGeneration()
    const epoch = adapter.getState().conversationEpoch
    if (job?.generation === generation && job.epoch === epoch) return job.promise
    const isCurrent = () => generation === adapter.getAccountGeneration() && epoch === adapter.getState().conversationEpoch
    adapter.setState({ conversationBusy: true })
    const promise = Promise.resolve().then(() => operation(isCurrent)).finally(() => {
      if (isCurrent()) adapter.setState({ conversationBusy: false })
      if (job?.promise === promise) job = undefined
    })
    job = { generation, epoch, promise }
    return promise
  }
  function latest(refresh = false): Promise<boolean> {
    const snapshot = adapter.getState()
    if (!refresh && snapshot.conversationLoaded && !snapshot.conversationBusy) return Promise.resolve(false)
    if (snapshot.replyActive || snapshot.isTyping) return Promise.resolve(false)
    return run(async isCurrent => {
      const page = await adapter.read({})
      if (!isCurrent() || adapter.getState().messages !== snapshot.messages) return false
      const messages = page ? restoreConversationPage(page) : null
      if (!page && snapshot.serverConversationId) {
        adapter.setState({ messages: [], conversationId: null, serverConversationId: null,
          conversationBeforeOrder: null, dismissedOfferKeys: [], conversationLoaded: true })
        return false
      }
      adapter.setState({ conversationLoaded: true, ...(page && messages ? {
        conversationId: page.conversationId, serverConversationId: page.conversationId,
        conversationBeforeOrder: page.beforeOrder,
        messages: [...snapshot.messages.filter(message => message.proactiveItem || message.id.startsWith('daily-summary-')), ...messages],
      } : {}) })
      return Boolean(page)
    })
  }
  function earlier(): Promise<boolean> {
    const snapshot = adapter.getState()
    if (!snapshot.serverConversationId || snapshot.conversationBeforeOrder === null || snapshot.conversationBusy) return Promise.resolve(false)
    return run(async isCurrent => {
      const page = await adapter.read({ conversationId: snapshot.serverConversationId!, beforeOrder: snapshot.conversationBeforeOrder! })
      if (!isCurrent() || !page || page.conversationId !== snapshot.serverConversationId) return false
      const current = adapter.getState().messages
      const ids = new Set(current.map(message => message.id))
      adapter.setState({ messages: [...restoreConversationPage(page).filter(message => !ids.has(message.id)), ...current], conversationBeforeOrder: page.beforeOrder })
      return true
    })
  }
  async function remove(): Promise<boolean> {
    const snapshot = adapter.getState()
    if (!snapshot.serverConversationId || snapshot.conversationBusy || snapshot.replyActive || snapshot.isTyping || snapshot.queuedPrompts.length) return false
    return run(async isCurrent => {
      await adapter.remove(snapshot.serverConversationId!)
      if (!isCurrent()) return false
      adapter.setState({ messages: [], conversationId: null, serverConversationId: null, conversationBeforeOrder: null,
        dismissedOfferKeys: [], proactiveEntryId: null, proactiveOutcomes: {}, conversationLoaded: true,
        conversationBusy: false, conversationEpoch: snapshot.conversationEpoch + 1 })
      return true
    })
  }
  async function prepareSend(): Promise<boolean> {
    const generation = adapter.getAccountGeneration()
    const snapshot = adapter.getState()
    if (!snapshot.conversationLoaded || snapshot.conversationBusy) await latest()
    return generation === adapter.getAccountGeneration()
  }
  return { latest, earlier, remove, prepareSend, isReady: () => adapter.getState().conversationLoaded && !adapter.getState().conversationBusy }
}

export function prepareConversationSend(
  history: ConversationHistory,
  conversation: { astraConversationOpen: boolean; setAstraConversationOpen: (open: boolean) => void },
  onFailure: () => void,
): true | Promise<boolean> {
  if (!conversation.astraConversationOpen) conversation.setAstraConversationOpen(true)
  if (history.isReady()) return true
  return history.prepareSend().catch(() => { onFailure(); return false })
}
