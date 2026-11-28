import { formatConjunctionList } from '../utils/conjunction-list'
import type { ChatStoreState } from '../stores/chat-store'
import type { BlockAnswer, ChatMessage, ChoiceBlock, PickListBlock } from '../types/chat'

export type BlockAnswerResult = { ok: true } | { ok: false; status: number | null; dailyBudgetReached?: true; allowanceReached?: true }

export interface BlockAnswerRequest {
  kind: 'choice' | 'pickList' | 'question'
  answer: BlockAnswer
  labels: string[]
}

export interface BlockAnswerInteraction {
  isOnline: boolean
  isSending: boolean
  dailyBudgetReached?: boolean
  atMessageLimit: boolean
  limitReason?: string
  allowance: number
  send: (request: BlockAnswerRequest) => Promise<BlockAnswerResult>
  /** Closes one open block for good. It sends no message and costs no message. */
  close?: (blockId: string) => Promise<BlockAnswerResult>
}

export type AnswerBlockProps = Readonly<{
  definition: { kind: 'choice'; block: ChoiceBlock } | { kind: 'pickList'; block: PickListBlock }
  interaction?: BlockAnswerInteraction
  savedAnswer?: { text: string; answered: boolean }
  expired?: boolean
}>

/** What a close request leaves on the card. A refusal that says the block is gone or answered settles the card, and any other failure reopens it. */
export function blockCloseOutcome(result: BlockAnswerResult): 'closed' | 'alreadyAnswered' | 'error' {
  if (result.ok) return 'closed'
  const key = blockAnswerErrorKey(result.status)
  return key === 'closed' || key === 'alreadyAnswered' ? key : 'error'
}

/** Closes one block through the injected request and keeps the closed line in the chat store so a remounted card stays closed. */
export async function closeBlock(chat: Pick<ChatStoreState, 'messages' | 'transitionMessage'>, blockId: string, request: (blockId: string) => Promise<BlockAnswerResult>, closedText: string, alreadyAnsweredText: string): Promise<BlockAnswerResult> {
  const result = await request(blockId)
  const outcome = blockCloseOutcome(result)
  if (outcome !== 'error') recordBlockAnswer(chat, blockId, outcome === 'closed' ? { ok: false, status: 410 } : { ok: false, status: 409 }, '', closedText, alreadyAnsweredText)
  return result
}

export function isSameBlockAnswer(answer: BlockAnswer, uncertain: BlockAnswer | null): boolean {
  return uncertain !== null && answer.blockId === uncertain.blockId && answer.freeText === uncertain.freeText &&
    answer.selectedIds.length === uncertain.selectedIds.length && answer.selectedIds.every((id, index) => id === uncertain.selectedIds[index]) &&
    sameQuestionAnswers(answer.answers, uncertain.answers)
}

function sameSelection(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every(id => right.includes(id))
}

function sameQuestionAnswers(left: BlockAnswer['answers'], right: BlockAnswer['answers']): boolean {
  if (!left || !right) return left === right
  return left.length === right.length && left.every(first => right.some(second =>
    first.questionId === second.questionId && first.number === second.number && first.boolean === second.boolean &&
    first.freeText === second.freeText && sameSelection(first.selectedIds ?? [], second.selectedIds ?? [])))
}

export function formatBlockAnswer(labels: readonly string[], freeText: string | undefined, locale: string): string {
  const words = freeText?.trim() ? [...labels, freeText.trim()] : [...labels]
  return formatConjunctionList(words, locale)
}

export function blockAnswerErrorKey(status: number | null): 'closed' | 'alreadyAnswered' | 'invalid' | 'error' {
  if (status === 404 || status === 410) return 'closed'
  if (status === 409) return 'alreadyAnswered'
  if (status === 400) return 'invalid'
  return 'error'
}

export function blockAnswerOptions(definition: AnswerBlockProps['definition']): { id: string; label: string; description?: string | null }[] {
  return definition.kind === 'choice'
    ? definition.block.options
    : definition.block.items.map(item => ({ ...item, description: item.detail }))
}

export function hasBlockAnswer(definition: AnswerBlockProps['definition'], selectedIds: readonly string[], freeText: string): boolean {
  if (selectedIds.length > 0) return true
  return definition.kind === 'choice' && !definition.block.multiSelect && freeText.trim().length > 0
}

export function recordBlockAnswer(chat: Pick<ChatStoreState, 'messages' | 'transitionMessage'>, blockId: string, result: BlockAnswerResult, answeredText: string, closedText: string, alreadyAnsweredText: string): void {
  const key = result.ok ? 'answered' : blockAnswerErrorKey(result.status)
  if (key === 'invalid' || key === 'error') return
  const owner = chat.messages.find(message => message.parts?.some(part =>
    part?.type === 'block' && (part.kind === 'choice' || part.kind === 'pickList' || part.kind === 'question') && part.block.blockId === blockId))
  if (!owner) return
  const answer: NonNullable<ChatMessage['blockAnswers']>[string] = {
    text: key === 'answered' ? answeredText : key === 'closed' ? closedText : alreadyAnsweredText,
    answered: result.ok,
  }
  chat.transitionMessage(owner.id, message => ({ ...message, blockAnswers: { ...message.blockAnswers, [blockId]: answer } }))
}
