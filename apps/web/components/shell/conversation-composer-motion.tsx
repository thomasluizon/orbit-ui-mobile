'use client'

import { useId, type ReactNode } from 'react'
import { useConversationMotion } from '@/components/chat/conversation-motion'
import { LayoutGroup, MotionConfig } from 'motion/react'

export function ConversationComposerMotionProvider({ children }: Readonly<{ children: ReactNode }>) {
  const id = useId()
  const configuration = useConversationMotion()
  return <MotionConfig reducedMotion={configuration.duration === 0 ? "always" : "never"}><LayoutGroup id={id}>{children}</LayoutGroup></MotionConfig>
}
