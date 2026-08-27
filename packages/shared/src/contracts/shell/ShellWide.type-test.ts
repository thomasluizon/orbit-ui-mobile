import type { ReactNode } from 'react'
import type { ShellWideProps } from './ShellWide'

type Assert<T extends true> = T
type IsAssignable<From, To> = [From] extends [To] ? true : false

type Destination = {
  items: Array<{ id: string; label: string }>
  activeId: string
  navLabel: string
}

export type ShellWideTypeTests = [
  Assert<IsAssignable<Destination & { composer: ReactNode }, ShellWideProps>>,
  Assert<IsAssignable<{ nav: false; action: ReactNode }, ShellWideProps>>,
  // @ts-expect-error A destination requires items.
  Assert<IsAssignable<{ activeId: string; navLabel: string }, ShellWideProps>>,
  // @ts-expect-error A destination requires an active id.
  Assert<IsAssignable<{ items: Destination['items']; navLabel: string }, ShellWideProps>>,
  // @ts-expect-error A destination requires a navigation label.
  Assert<IsAssignable<{ items: Destination['items']; activeId: string }, ShellWideProps>>,
  // @ts-expect-error A destination cannot carry a flow action.
  Assert<IsAssignable<Destination & { action: ReactNode }, ShellWideProps>>,
  // @ts-expect-error A flow cannot carry sidebar items.
  Assert<IsAssignable<{ nav: false; items: Destination['items'] }, ShellWideProps>>,
  // @ts-expect-error A flow cannot carry the destination composer.
  Assert<IsAssignable<{ nav: false; composer: ReactNode }, ShellWideProps>>,
  // @ts-expect-error Every item requires an id.
  Assert<IsAssignable<Omit<Destination, 'items'> & { items: Array<{ label: string }> }, ShellWideProps>>,
  // @ts-expect-error Every item requires a label.
  Assert<IsAssignable<Omit<Destination, 'items'> & { items: Array<{ id: string }> }, ShellWideProps>>,
  // @ts-expect-error Conversation content requires an accessible label.
  Assert<IsAssignable<Destination & { conversation: ReactNode }, ShellWideProps>>,
  // @ts-expect-error A create callback requires its word.
  Assert<IsAssignable<Destination & { onCreate: () => void }, ShellWideProps>>,
  // @ts-expect-error A palette callback requires its word.
  Assert<IsAssignable<Destination & { onPalette: () => void }, ShellWideProps>>,
]
