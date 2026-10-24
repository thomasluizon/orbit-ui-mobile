import type { ChatStoreState } from '../stores/chat-store'
import type { BlockAnswer } from '../types/chat'
import { formatBlockAnswer, isSameBlockAnswer, recordBlockAnswer, type BlockAnswerRequest, type BlockAnswerResult } from './block-answer'

export interface ChatStreamRequest<Image> {
  content: string
  messageCost: 0 | 1
  image: Image | null
  blockAnswer?: BlockAnswer
  messageOrigin?: 'followUp'
  intendedAccountId?: string | null
}

export type ChatStreamResult =
  | { kind: 'final' }
  | { kind: 'failed'; failure: { status: number | null; error: string; code: string | null }; draftMessageId: string | null }
  | { kind: 'cancelled' }

interface BlockSubmissionContext {
  isOnline: boolean
  atMessageLimit: boolean
  locale: string
  intendedAccountId?: string | null
  getChat: () => ChatStoreState
  createMessageId: () => string
  conversation: { astraConversationOpen: boolean; setAstraConversationOpen: (open: boolean) => void }
  beginSend: () => void
  run: (request: ChatStreamRequest<never>, onAccepted: () => void) => Promise<ChatStreamResult>
  refreshProfile: () => Promise<void>
  words: { answered: (content: string) => string; closed: string; alreadyAnswered: string }
}

export class BlockAnswerSubmission {
  private inFlight = false
  private uncertainAnswer: BlockAnswer | null = null
  private uncertainRequest: ChatStreamRequest<never> | null = null

  reset(): void {
    this.uncertainAnswer = null
    this.uncertainRequest = null
  }

  async send(request: BlockAnswerRequest, context: BlockSubmissionContext): Promise<BlockAnswerResult> {
    const chat = context.getChat()
    const recovery = isSameBlockAnswer(request.answer, this.uncertainAnswer)
    if (this.inFlight || chat.isTyping || chat.streamingMessageId !== null || !context.isOnline ||
      (request.kind === 'choice' && context.atMessageLimit && !recovery)) return { ok: false, status: null }
    this.inFlight = true
    this.uncertainAnswer = { ...request.answer, selectedIds: [...request.answer.selectedIds] }
    const content = formatBlockAnswer(request.labels, request.answer.freeText, context.locale)
    if (!recovery || !this.uncertainRequest) {
      this.uncertainRequest = { content, messageCost: request.kind === 'pickList' ? 0 : 1, image: null, blockAnswer: request.answer, intendedAccountId: context.intendedAccountId }
    }
    this.uncertainRequest = { ...this.uncertainRequest, messageCost: request.kind === 'pickList' || recovery ? 0 : 1 }
    try {
      if (!context.conversation.astraConversationOpen) context.conversation.setAstraConversationOpen(true)
      context.beginSend()
      const outcome = await context.run(this.uncertainRequest, () => {
        const current = context.getChat()
        if (current.messages.some(message => message.role === 'user' &&
          message.answerToBlockId === request.answer.blockId && message.content === content)) return
        current.addMessage({
          answerToBlockId: request.answer.blockId, id: context.createMessageId(), role: 'user', content, timestamp: new Date(),
        })
      })
      const result: BlockAnswerResult = outcome.kind === 'final'
        ? { ok: true }
        : { ok: false, status: outcome.kind === 'failed' ? outcome.failure.status : null }
      if (outcome.kind === 'cancelled') return result
      if (outcome.kind === 'final') {
        this.uncertainAnswer = null
        this.uncertainRequest = null
        if (recovery) await context.refreshProfile()
      }
      recordBlockAnswer(context.getChat(), request.answer.blockId, result,
        context.words.answered(content), context.words.closed, context.words.alreadyAnswered)
      return result
    } finally {
      this.inFlight = false
    }
  }
}
