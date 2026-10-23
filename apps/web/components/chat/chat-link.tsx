'use client'

import type { ComponentProps } from 'react'
import { PillLink } from '@/components/ui/pill-button'
import { closeChatForNavigation } from '@/hooks/use-chat-navigation'

export function ChatLink(props: Readonly<Omit<ComponentProps<typeof PillLink>, 'onClick' | 'onNavigate'>>) {
  return <PillLink {...props} onNavigate={closeChatForNavigation} />
}
