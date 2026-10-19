import type { ChatStoreState } from '../stores/chat-store'
import type { BlockAnswer } from '../types/chat'
import { formatBlockAnswer, recordBlockAnswer, type BlockAnswerRequest, type BlockAnswerResult } from './block-answer'

export interface ChatStreamRequest<Image> {
  content: string
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
  consumeAllowance: (cost: 0 | 1) => void
  words: { answered: (content: string) => string; closed: string; alreadyAnswered: string }
}

export class BlockAnswerSubmission {
  private inFlight = false

  async send(request: BlockAnswerRequest, context: BlockSubmissionContext): Promise<BlockAnswerResult> {
    const chat = context.getChat()
    if (this.inFlight || chat.isTyping || chat.streamingMessageId !== null || !context.isOnline ||
      (request.kind === 'choice' && context.atMessageLimit)) return { ok: false, status: null }
    this.inFlight = true
    const content = formatBlockAnswer(request.labels, request.answer.freeText, context.locale)
    try {
      if (!context.conversation.astraConversationOpen) context.conversation.setAstraConversationOpen(true)
      context.beginSend()
      const outcome = await context.run({ content, image: null, blockAnswer: request.answer, intendedAccountId: context.intendedAccountId }, () => {
        context.getChat().addMessage({
          answerToBlockId: request.answer.blockId, id: context.createMessageId(), role: 'user', content, timestamp: new Date(),
        })
      })
      const result: BlockAnswerResult = outcome.kind === 'final'
        ? { ok: true }
        : { ok: false, status: outcome.kind === 'failed' ? outcome.failure.status : null }
      if (outcome.kind === 'cancelled') return result
      if (result.ok) context.consumeAllowance(request.kind === 'pickList' ? 0 : 1)
      recordBlockAnswer(context.getChat(), request.answer.blockId, result,
        context.words.answered(content), context.words.closed, context.words.alreadyAnswered)
      return result
    } finally {
      this.inFlight = false
    }
  }
}
