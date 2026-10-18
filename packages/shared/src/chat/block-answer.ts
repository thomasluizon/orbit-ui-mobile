import type { BlockAnswer, ChoiceBlock, PickListBlock } from '../types/chat'

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

export function blockAnswerOptions(definition: AnswerBlockProps['definition']) {
  return definition.kind === 'choice'
    ? definition.block.options
    : definition.block.items.map(item => ({ ...item, description: item.detail }))
}

export function hasBlockAnswer(definition: AnswerBlockProps['definition'], selectedIds: readonly string[], freeText: string): boolean {
  if (selectedIds.length > 0) return true
  return definition.kind === 'choice' && !definition.block.multiSelect && freeText.trim().length > 0
}
