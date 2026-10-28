'use client'

import { createContext, useContext, useId, type ReactNode } from 'react'

const ComposerMotionContext = createContext<string | undefined>(undefined)

export function ConversationComposerMotionProvider({ children }: Readonly<{ children: ReactNode }>) {
  const id = useId()
  return <ComposerMotionContext value={id}>{children}</ComposerMotionContext>
}

export function useConversationComposerId() {
  return useContext(ComposerMotionContext)
}
