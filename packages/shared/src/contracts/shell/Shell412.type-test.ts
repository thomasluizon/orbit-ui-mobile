import type { ReactNode } from 'react'
import type { Shell412Props } from './Shell412'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? (Exclude<keyof T, Keys<U>> extends never ? true : false) : false
type IsExactWidth<T, U> =
  (<TValue>() => TValue extends T ? 1 : 2) extends <TValue>() => TValue extends U ? 1 : 2
    ? (<TValue>() => TValue extends U ? 1 : 2) extends <TValue>() => TValue extends T ? 1 : 2
      ? true
      : false
    : false
type Assert<T extends true> = T
type Fields<T> = { [TKey in keyof T]: T[TKey] }

type NavPlainVariant = Extract<Shell412Props, { nav?: true; conversation?: undefined }>
type NavConversationVariant = Extract<Shell412Props, { nav?: true; conversation: ReactNode }>
type FlowPlainVariant = Extract<Shell412Props, { nav: false; conversation?: undefined }>
type FlowConversationVariant = Extract<Shell412Props, { nav: false; conversation: ReactNode }>
type ExpectedBase = {
  children?: ReactNode
  header?: ReactNode
  notice?: ReactNode
  fab?: ReactNode
  sheets?: ReactNode
}
type ExpectedPlainConversation = {
  conversation?: undefined
  conversationOpen?: never
  conversationLabel?: never
}
type ExpectedConversation = {
  conversation: ReactNode
  conversationOpen?: boolean
  conversationLabel: string
}
type ExpectedNav = {
  nav?: true
  tabBar: ReactNode
  composer?: ReactNode
  action?: never
}
type ExpectedFlow = {
  nav: false
  tabBar?: never
  action?: ReactNode
  composer?: never
}

export type Shell412TypeContract = [
  Assert<IsExactWidth<Fields<NavPlainVariant>, Fields<ExpectedBase & ExpectedPlainConversation & ExpectedNav>>>,
  Assert<IsExactWidth<Fields<NavConversationVariant>, Fields<ExpectedBase & ExpectedConversation & ExpectedNav>>>,
  Assert<IsExactWidth<Fields<FlowPlainVariant>, Fields<ExpectedBase & ExpectedPlainConversation & ExpectedFlow>>>,
  Assert<IsExactWidth<Fields<FlowConversationVariant>, Fields<ExpectedBase & ExpectedConversation & ExpectedFlow>>>,
  Assert<IsExactWidth<Shell412Props['children'], ReactNode>>,
  Assert<IsExactWidth<Shell412Props['header'], ReactNode>>,
  Assert<IsExactWidth<Shell412Props['notice'], ReactNode>>,
  Assert<IsExactWidth<Shell412Props['fab'], ReactNode>>,
  Assert<IsExactWidth<Shell412Props['sheets'], ReactNode>>,
  Assert<IsExactWidth<Shell412Props['conversation'], ReactNode>>,
  Assert<IsExactWidth<Shell412Props['conversationOpen'], boolean | undefined>>,
  Assert<IsExactWidth<Shell412Props['conversationLabel'], string | undefined>>,
  Assert<IsExactWidth<Shell412Props['nav'], boolean | undefined>>,
  Assert<IsExactWidth<Shell412Props['tabBar'], ReactNode>>,
  Assert<IsExactWidth<Shell412Props['composer'], ReactNode>>,
  Assert<IsExactWidth<Shell412Props['action'], ReactNode>>,
  Assert<IsExact<{ tabBar: ReactNode; composer: ReactNode }, Shell412Props>>,
  Assert<IsExact<{ nav: true; tabBar: ReactNode; header: ReactNode }, Shell412Props>>,
  Assert<IsExact<{ tabBar: ReactNode; notice: ReactNode; fab: ReactNode }, Shell412Props>>,
  Assert<IsExact<{ nav: false; action: ReactNode }, Shell412Props>>,
  Assert<IsExact<{ nav: false }, Shell412Props>>,
  Assert<
    IsExact<
      { tabBar: ReactNode; conversation: ReactNode; conversationLabel: 'Conversa com o Astra' },
      Shell412Props
    >
  >,
  Assert<
    IsExact<
      {
        tabBar: ReactNode
        conversation: ReactNode
        conversationLabel: 'Conversation with Astra'
        conversationOpen: true
      },
      Shell412Props
    >
  >,
  // @ts-expect-error a destination requires its tab bar
  Assert<IsExact<{ composer: ReactNode }, Shell412Props>>,
  // @ts-expect-error a destination cannot carry a flow's forward action
  Assert<IsExact<{ tabBar: ReactNode; action: ReactNode }, Shell412Props>>,
  // @ts-expect-error a flow cannot carry a tab bar
  Assert<IsExact<{ nav: false; tabBar: ReactNode }, Shell412Props>>,
  // @ts-expect-error a flow cannot pin Astra's front door
  Assert<IsExact<{ nav: false; composer: ReactNode }, Shell412Props>>,
  // @ts-expect-error conversation content requires its accessible name
  Assert<IsExact<{ tabBar: ReactNode; conversation: ReactNode }, Shell412Props>>,
  // @ts-expect-error a name with no conversation names nothing
  Assert<IsExact<{ tabBar: ReactNode; conversationLabel: 'Conversa' }, Shell412Props>>,
  // @ts-expect-error openness is not a state a shell without a conversation has
  Assert<IsExact<{ tabBar: ReactNode; conversationOpen: true }, Shell412Props>>,
  // @ts-expect-error nav is the discriminant, not a width
  Assert<IsExact<{ nav: 412; tabBar: ReactNode }, Shell412Props>>,
  // @ts-expect-error the shell has no sidebar props
  Assert<IsExact<{ tabBar: ReactNode; items: [] }, Shell412Props>>,
  // @ts-expect-error a screen cannot hand the shell a stylesheet to hide its chrome
  Assert<IsExact<{ tabBar: ReactNode; className: 'hide-tab-bar' }, Shell412Props>>,
]
