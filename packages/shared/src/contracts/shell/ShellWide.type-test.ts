import type { ReactNode } from 'react'
import type { ShellWideProps } from './ShellWide'

const node = null as ReactNode
const items = [{ id: 'today', label: 'Today' }]

const destination: ShellWideProps = {
  items,
  activeId: 'today',
  navLabel: 'Main navigation',
  composer: node,
}
const flow: ShellWideProps = { nav: false, action: node }

// @ts-expect-error A destination requires items.
const destinationWithoutItems: ShellWideProps = { activeId: 'today', navLabel: 'Main navigation' }
// @ts-expect-error A destination requires an active id.
const destinationWithoutActiveId: ShellWideProps = { items, navLabel: 'Main navigation' }
// @ts-expect-error A destination requires a navigation label.
const destinationWithoutNavLabel: ShellWideProps = { items, activeId: 'today' }
// @ts-expect-error A destination cannot carry a flow action.
const destinationWithAction: ShellWideProps = {
  items,
  activeId: 'today',
  navLabel: 'Main navigation',
  action: node,
}
// @ts-expect-error A flow cannot carry sidebar items.
const flowWithItems: ShellWideProps = { nav: false, items }
// @ts-expect-error A flow cannot carry the destination composer.
const flowWithComposer: ShellWideProps = { nav: false, composer: node }
const itemWithoutId: ShellWideProps = {
  // @ts-expect-error Every item requires an id.
  items: [{ label: 'Today' }],
  activeId: 'today',
  navLabel: 'Main navigation',
}
const itemWithoutLabel: ShellWideProps = {
  // @ts-expect-error Every item requires a label.
  items: [{ id: 'today' }],
  activeId: 'today',
  navLabel: 'Main navigation',
}
// @ts-expect-error Conversation content requires an accessible label.
const conversationWithoutLabel: ShellWideProps = {
  items,
  activeId: 'today',
  navLabel: 'Main navigation',
  conversation: node,
}
// @ts-expect-error A create callback requires its word.
const createWithoutLabel: ShellWideProps = {
  items,
  activeId: 'today',
  navLabel: 'Main navigation',
  onCreate: () => undefined,
}
// @ts-expect-error A palette callback requires its word.
const paletteWithoutLabel: ShellWideProps = {
  items,
  activeId: 'today',
  navLabel: 'Main navigation',
  onPalette: () => undefined,
}

void destination
void flow
void destinationWithoutItems
void destinationWithoutActiveId
void destinationWithoutNavLabel
void destinationWithAction
void flowWithItems
void flowWithComposer
void itemWithoutId
void itemWithoutLabel
void conversationWithoutLabel
void createWithoutLabel
void paletteWithoutLabel
