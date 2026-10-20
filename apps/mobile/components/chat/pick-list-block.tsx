import type { PickListBlock as Definition } from '@orbit/shared/types/chat'
import type { AnswerBlockProps } from '@orbit/shared/chat'
import { AnswerBlock } from './answer-block'

export function PickListBlock({ block, ...props }: Readonly<{ block: Definition } & Omit<AnswerBlockProps, 'definition'>>) {
  return <AnswerBlock {...props} definition={{ kind: 'pickList', block }} />
}
