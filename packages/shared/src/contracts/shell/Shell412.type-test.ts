import type { ReactNode } from 'react'
import type { Shell412Props } from './Shell412'

const node = null as ReactNode

const destination: Shell412Props = { tabBar: node, composer: node }
const flow: Shell412Props = { nav: false, action: node }

// @ts-expect-error A destination requires its tab bar.
const destinationWithoutTabBar: Shell412Props = { composer: node }
// @ts-expect-error A destination cannot carry a flow action.
const destinationWithAction: Shell412Props = { tabBar: node, action: node }
// @ts-expect-error A flow cannot carry a tab bar.
const flowWithTabBar: Shell412Props = { nav: false, tabBar: node }
// @ts-expect-error A flow cannot carry the destination composer.
const flowWithComposer: Shell412Props = { nav: false, composer: node }
// @ts-expect-error Conversation content requires an accessible label.
const conversationWithoutLabel: Shell412Props = { tabBar: node, conversation: node }

void destination
void flow
void destinationWithoutTabBar
void destinationWithAction
void flowWithTabBar
void flowWithComposer
void conversationWithoutLabel
