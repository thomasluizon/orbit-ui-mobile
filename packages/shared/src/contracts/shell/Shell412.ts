import type { ReactNode } from 'react'

type ConversationSlot =
  | {
      conversation?: undefined
      conversationLabel?: never
    }
  | {
      conversation: ReactNode
      conversationLabel: string
    }

interface Shell412Base {
  children?: ReactNode
  header?: ReactNode
  notice?: ReactNode
  fab?: ReactNode
  conversationOpen?: boolean
  sheets?: ReactNode
}

export type Shell412NavProps = Shell412Base &
  ConversationSlot & {
    nav?: true
    tabBar: ReactNode
    composer?: ReactNode
    action?: never
  }

export type Shell412NoNavProps = Shell412Base &
  ConversationSlot & {
    nav: false
    tabBar?: never
    action?: ReactNode
    composer?: never
  }

export type Shell412Props = Shell412NavProps | Shell412NoNavProps
