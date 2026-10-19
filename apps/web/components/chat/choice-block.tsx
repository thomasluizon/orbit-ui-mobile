'use client'

import type { ChoiceBlock as Definition } from '@orbit/shared/types/chat'
import type { AnswerBlockProps } from '@orbit/shared/chat'
import { AnswerBlock } from './answer-block'

export function ChoiceBlock({ block, ...props }: Readonly<{ block: Definition } & Omit<AnswerBlockProps, 'definition'>>) {
  return <AnswerBlock {...props} definition={{ kind: 'choice', block }} />
}
