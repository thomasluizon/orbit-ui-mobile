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
type NavConversationVariant = Extract<Shell412Props, { nav?: true; conversation: React.ReactNode }>
type FlowPlainVariant = Extract<Shell412Props, { nav: false; conversation?: undefined }>
type FlowConversationVariant = Extract<Shell412Props, { nav: false; conversation: React.ReactNode }>
type ExpectedBase = {
  children?: React.ReactNode
  header?: React.ReactNode
  notice?: React.ReactNode
  fab?: React.ReactNode
  sheets?: React.ReactNode
}
type ExpectedPlainConversation = {
  conversation?: undefined
  conversationOpen?: never
  conversationLabel?: never
}
type ExpectedConversation = {
  conversation: React.ReactNode
  conversationOpen?: boolean
  conversationLabel: string
}
type ExpectedNav = {
  nav?: true
  tabBar: React.ReactNode
  composer?: React.ReactNode
  action?: never
}
type ExpectedFlow = {
  nav: false
  tabBar?: never
  action?: React.ReactNode
  composer?: never
}

export type Shell412TypeContract = [
  Assert<IsExactWidth<Fields<NavPlainVariant>, Fields<ExpectedBase & ExpectedPlainConversation & ExpectedNav>>>,
  Assert<IsExactWidth<Fields<NavConversationVariant>, Fields<ExpectedBase & ExpectedConversation & ExpectedNav>>>,
  Assert<IsExactWidth<Fields<FlowPlainVariant>, Fields<ExpectedBase & ExpectedPlainConversation & ExpectedFlow>>>,
  Assert<IsExactWidth<Fields<FlowConversationVariant>, Fields<ExpectedBase & ExpectedConversation & ExpectedFlow>>>,
  Assert<IsExactWidth<Shell412Props['children'], React.ReactNode>>,
  Assert<IsExactWidth<Shell412Props['header'], React.ReactNode>>,
  Assert<IsExactWidth<Shell412Props['notice'], React.ReactNode>>,
  Assert<IsExactWidth<Shell412Props['fab'], React.ReactNode>>,
  Assert<IsExactWidth<Shell412Props['sheets'], React.ReactNode>>,
  Assert<IsExactWidth<Shell412Props['conversation'], React.ReactNode>>,
  Assert<IsExactWidth<Shell412Props['conversationOpen'], boolean | undefined>>,
  Assert<IsExactWidth<Shell412Props['conversationLabel'], string | undefined>>,
  Assert<IsExactWidth<Shell412Props['nav'], boolean | undefined>>,
  Assert<IsExactWidth<Shell412Props['tabBar'], React.ReactNode>>,
  Assert<IsExactWidth<Shell412Props['composer'], React.ReactNode>>,
  Assert<IsExactWidth<Shell412Props['action'], React.ReactNode>>,
  Assert<IsExact<{ tabBar: React.ReactNode; composer: React.ReactNode }, Shell412Props>>,
  Assert<IsExact<{ nav: true; tabBar: React.ReactNode; header: React.ReactNode }, Shell412Props>>,
  Assert<IsExact<{ tabBar: React.ReactNode; notice: React.ReactNode; fab: React.ReactNode }, Shell412Props>>,
  Assert<IsExact<{ nav: false; action: React.ReactNode }, Shell412Props>>,
  Assert<IsExact<{ nav: false }, Shell412Props>>,
  Assert<
    IsExact<
      { tabBar: React.ReactNode; conversation: React.ReactNode; conversationLabel: 'Conversa com o Astra' },
      Shell412Props
    >
  >,
  Assert<
    IsExact<
      {
        tabBar: React.ReactNode
        conversation: React.ReactNode
        conversationLabel: 'Conversation with Astra'
        conversationOpen: true
      },
      Shell412Props
    >
  >,
  // @ts-expect-error a destination requires its tab bar
  Assert<IsExact<{ composer: React.ReactNode }, Shell412Props>>,
  // @ts-expect-error a destination cannot carry a flow's forward action
  Assert<IsExact<{ tabBar: React.ReactNode; action: React.ReactNode }, Shell412Props>>,
  // @ts-expect-error a flow cannot carry a tab bar
  Assert<IsExact<{ nav: false; tabBar: React.ReactNode }, Shell412Props>>,
  // @ts-expect-error a flow cannot pin Astra's front door
  Assert<IsExact<{ nav: false; composer: React.ReactNode }, Shell412Props>>,
  // @ts-expect-error conversation content requires its accessible name
  Assert<IsExact<{ tabBar: React.ReactNode; conversation: React.ReactNode }, Shell412Props>>,
  // @ts-expect-error a name with no conversation names nothing
  Assert<IsExact<{ tabBar: React.ReactNode; conversationLabel: 'Conversa' }, Shell412Props>>,
  // @ts-expect-error openness is not a state a shell without a conversation has
  Assert<IsExact<{ tabBar: React.ReactNode; conversationOpen: true }, Shell412Props>>,
  // @ts-expect-error nav is the discriminant, not a width
  Assert<IsExact<{ nav: 412; tabBar: React.ReactNode }, Shell412Props>>,
  // @ts-expect-error the shell has no sidebar props
  Assert<IsExact<{ tabBar: React.ReactNode; items: [] }, Shell412Props>>,
  // @ts-expect-error a screen cannot hand the shell a stylesheet to hide its chrome
  Assert<IsExact<{ tabBar: React.ReactNode; className: 'hide-tab-bar' }, Shell412Props>>,
]
