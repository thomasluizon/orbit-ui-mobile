import type { ChatClientContext } from '../types/chat'
import type { ChatStoreState } from '../stores/chat-store'
import type { Profile } from '../types/profile'
import type { PreparedChatTurn } from './stream-turn'
import type { ChatStreamResult } from './block-answer-submission'
import { sendInConversation } from '../hooks/chat-composer-core'

interface QueuedAttempt {
  content: string
  draftContent: string
  textFile: { name: string } | null
  restoreDraftOnFailure: boolean
  clearDraftOnSuccess: boolean
}

export function enqueueChatPrompt<Attempt extends QueuedAttempt>(
  chat: ChatStoreState,
  id: string,
  attempted: Attempt,
  send: (attempted: Attempt, isRetry: boolean) => Promise<boolean>,
): boolean {
  return chat.enqueuePrompt({
    id,
    content: attempted.draftContent || attempted.textFile?.name || attempted.content,
    send: () => send({ ...attempted, restoreDraftOnFailure: false, clearDraftOnSuccess: false }, false),
  })
}

export async function sendQueuedChatPrompt(
  chat: ChatStoreState,
  id: string,
  available: boolean,
  profile: Pick<Profile, 'aiMessagesUsed' | 'aiMessagesLimit'> | undefined,
): Promise<void> {
  if (!available || (profile && profile.aiMessagesUsed >= profile.aiMessagesLimit)) return
  const prompt = chat.takeQueuedPrompt(id)
  if (prompt) await prompt.send()
}

type ChatRequestContext = Pick<ChatClientContext, 'messageOrigin' | 'previousStartingStep' | 'selectedOfferKey'>

export function resolveChatRequestContext(content: string | undefined, request?: 'followUp' | Omit<ChatRequestContext, 'messageOrigin'>): ChatRequestContext & { sendsComposerDraft: boolean } {
  const context: ChatRequestContext = typeof request === 'object' ? request : { messageOrigin: request }
  return { ...context, sendsComposerDraft: content === undefined && context.messageOrigin !== 'followUp' }
}

export function isChatReplyActive(chat: Pick<ChatStoreState, 'replyActive' | 'isTyping' | 'streamingMessageId'>): boolean {
  return chat.replyActive || chat.isTyping || chat.streamingMessageId !== null
}

export function nextQueuedChatPrompt(chat: ChatStoreState): string | undefined {
  if (!chat.queueReady || chat.queuePaused || isChatReplyActive(chat)) return
  return chat.queuedPrompts[0]?.id
}

interface ReplyLifecycleOptions {
  getChat: () => ChatStoreState
  ownsAccount: () => boolean
  getDraftMessageId: () => string | null
  createMessageId: () => string
  stoppedMessage: string
  clearActivity: () => void
  abort: () => void
}

export class ChatReplyLifecycle {
  private stopped = false
  private readonly replyRevision: number
  private revealStopped!: () => void
  private readonly stoppedReveal = new Promise<void>(resolve => { this.revealStopped = resolve })

  constructor(private readonly options: ReplyLifecycleOptions) {
    this.replyRevision = options.getChat().replyRevision
  }

  canComplete = (): boolean => !this.stopped && !this.isCancelled()
  isCancelled = (): boolean => !this.options.ownsAccount()
  isHidden = (): boolean => this.stopped || !this.ownsReply()

  private ownsReply(): boolean {
    return !this.isCancelled() && this.options.getChat().replyRevision === this.replyRevision
  }

  stop = (): void => {
    if (this.isHidden()) return
    this.stopped = true
    this.revealStopped()
    const chat = this.options.getChat()
    const draftMessageId = this.options.getDraftMessageId()
    if (draftMessageId) chat.transitionMessage(draftMessageId, message => ({ ...message, content: message.content || this.options.stoppedMessage }))
    else chat.addMessage({ id: this.options.createMessageId(), role: 'ai', content: this.options.stoppedMessage, timestamp: new Date() })
    this.finish(false)
    this.options.abort()
  }

  async waitForReveal(reveal: Promise<void>): Promise<void> {
    await Promise.race([reveal, this.stoppedReveal])
  }

  finish(succeeded: boolean): void {
    if (!this.ownsReply()) return
    const chat = this.options.getChat()
    if (!succeeded || this.stopped) {
      chat.setIsTyping(false)
      this.options.clearActivity()
    }
    if (chat.streamingMessageId === this.options.getDraftMessageId()) chat.setStreamingMessageId(null)
    chat.finishReply(succeeded && !this.stopped)
  }
}

interface PromptAttempt extends QueuedAttempt {
  turn?: PreparedChatTurn<unknown>
  preview: string | null
  contextualRequest?: NonNullable<ChatStoreState['contextualSuggestion']>
}

interface PromptSendContext<Attempt> {
  conversation: { astraConversationOpen: boolean; setAstraConversationOpen: (open: boolean) => void }
  getChat: () => ChatStoreState
  getAccountGeneration: () => number
  createMessageId: () => string
  beginSend: () => void
  run: (request: Attempt & { messageCost: 1 }) => Promise<ChatStreamResult>
  onFailure: (failure: Extract<ChatStreamResult, { kind: 'failed' }>['failure'], attempted: Attempt, draftMessageId: string | null) => void
  retainRetry: (attempted: Attempt) => void
}

export function sendChatPrompt<Attempt extends PromptAttempt>(attempted: Attempt, isRetry: boolean, context: PromptSendContext<Attempt>): Promise<boolean> {
  return sendInConversation(context.conversation, async () => {
    context.beginSend()
    if (!isRetry) context.getChat().addMessage({
      id: context.createMessageId(), role: 'user', content: attempted.content, imageUrl: attempted.preview, timestamp: new Date(),
    })
    const accountGeneration = context.getAccountGeneration()
    const replyRevision = context.getChat().replyRevision
    const request = { ...attempted, messageCost: 1 as const }
    const result = await context.run(request)
    attempted.turn = request.turn
    if (result.kind === 'cancelled' && request.turn && context.getAccountGeneration() === accountGeneration && context.getChat().replyRevision === replyRevision) {
      context.retainRetry({ ...attempted, restoreDraftOnFailure: false, clearDraftOnSuccess: false })
    }
    const succeeded = result.kind === 'final'
    if (result.kind === 'failed') context.onFailure(result.failure, attempted, result.draftMessageId)
    if (succeeded && context.getAccountGeneration() === accountGeneration && attempted.contextualRequest && context.getChat().contextualSuggestion === attempted.contextualRequest) {
      context.getChat().setContextualSuggestion(null)
    }
    return succeeded
  })
}
