import type { ReactNode } from 'react'
import type { Shell412Props } from './Shell412'

type Keys<T> = T extends unknown ? keyof T : never
type IsExact<T, U> = T extends U ? (Exclude<keyof T, Keys<U>> extends never ? true : false) : false
type Assert<T extends true> = T

export type Shell412TypeContract = [
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
