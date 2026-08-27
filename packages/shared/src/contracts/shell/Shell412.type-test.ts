import type { ReactNode } from 'react'
import type { Shell412Props } from './Shell412'

type Assert<T extends true> = T
type IsAssignable<From, To> = [From] extends [To] ? true : false

export type Shell412TypeTests = [
  Assert<IsAssignable<{ tabBar: ReactNode; composer: ReactNode }, Shell412Props>>,
  Assert<IsAssignable<{ nav: false; action: ReactNode }, Shell412Props>>,
  // @ts-expect-error A destination requires its tab bar.
  Assert<IsAssignable<{ composer: ReactNode }, Shell412Props>>,
  // @ts-expect-error A destination cannot carry a flow action.
  Assert<IsAssignable<{ tabBar: ReactNode; action: ReactNode }, Shell412Props>>,
  // @ts-expect-error A flow cannot carry a tab bar.
  Assert<IsAssignable<{ nav: false; tabBar: ReactNode }, Shell412Props>>,
  // @ts-expect-error A flow cannot carry the destination composer.
  Assert<IsAssignable<{ nav: false; composer: ReactNode }, Shell412Props>>,
  // @ts-expect-error Conversation content requires an accessible label.
  Assert<IsAssignable<{ tabBar: ReactNode; conversation: ReactNode }, Shell412Props>>,
]
