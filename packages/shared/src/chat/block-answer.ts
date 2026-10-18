import type { ChatStoreState } from '../stores/chat-store'
import type { BlockAnswer, ChatMessage, ChoiceBlock, PickListBlock } from '../types/chat'

export type BlockAnswerResult = { ok: true } | { ok: false; status: number | null }

export interface BlockAnswerRequest {
  kind: 'choice' | 'pickList'
  answer: BlockAnswer
  labels: string[]
}

export interface BlockAnswerInteraction {
  isOnline: boolean
  isSending: boolean
  atMessageLimit: boolean
  allowance: number
  send: (request: BlockAnswerRequest) => Promise<BlockAnswerResult>
}

export type AnswerBlockProps = Readonly<{
  definition: { kind: 'choice'; block: ChoiceBlock } | { kind: 'pickList'; block: PickListBlock }
  interaction?: BlockAnswerInteraction
  savedAnswer?: { text: string; answered: boolean }
  expired?: boolean
}>

export function formatBlockAnswer(labels: readonly string[], freeText: string | undefined, locale: string): string {
  const words = freeText?.trim() ? [...labels, freeText.trim()] : [...labels]
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(words)
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
    part?.type === 'block' && (part.kind === 'choice' || part.kind === 'pickList') && part.block.blockId === blockId))
  if (!owner) return
  const answer: NonNullable<ChatMessage['blockAnswers']>[string] = {
    text: key === 'answered' ? answeredText : key === 'closed' ? closedText : alreadyAnsweredText,
    answered: result.ok,
  }
  chat.transitionMessage(owner.id, message => ({ ...message, blockAnswers: { ...message.blockAnswers, [blockId]: answer } }))
}
