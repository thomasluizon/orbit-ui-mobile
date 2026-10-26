import { createChatThreadScroll } from '@orbit/shared/hooks'
import React from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import { __setWindowDimensions } from '../../../test-mocks/react-native'
import { afterEach, expect, it, vi } from 'vitest'
import { Shell412 } from '@/components/shell/shell-412'
import { ChatEmptyState } from '@/components/chat/chat-empty-state'
import { AstraConversation } from '@/components/chat/conversation'
import { useUIStore } from '@/stores/ui-store'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'

const safeArea = vi.hoisted(() => ({ top: 24, bottom: 16, left: 0, right: 0 }))
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ ...safeArea }) }))
vi.mock('@/hooks/use-habits', () => ({}))
vi.mock('expo-clipboard', () => ({ }))
await vi.hoisted(async () => {
  const { createRequire, Module } = await import('node:module')
  const load = createRequire(import.meta.url)
  const nativePath = load.resolve('react-native')
  const nativeModule = new Module(nativePath)
  nativeModule.exports = await import('react-native')
  load.cache[nativePath] = nativeModule
  const svgPath = load.resolve('react-native-svg')
  const svgModule = new Module(svgPath)
  svgModule.exports = await import('react-native-svg')
  load.cache[svgPath] = svgModule
})
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/shell/composer', () => ({ Composer: () => <View testID="conversation-composer" style={{ height: 48 }} /> }))

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
type ChatController = Parameters<typeof AstraConversation>[0]['chat']
const chat = {
  threadScroll: createChatThreadScroll(), flatListRef: { current: null }, messages: [], activeSteps: [], canShowFollowUps: false,
  isTyping: false, streamingMessageId: null, showSuggestions: true,
  sendMessage: vi.fn(), scrollToBottom: vi.fn(), composerProps: { suggestions: [] },
} as unknown as ChatController

afterEach(() => { useUIStore.getState().setAstraConversationOpen(false) })

it.each([0, 24, 48].flatMap((top) => [true, false].map((safeAreaTop) => ({ top, safeAreaTop }))))(
  'starts the real conversation header at $top with shell safeAreaTop=$safeAreaTop', async ({ top, safeAreaTop }) => {
    safeArea.top = top
    useUIStore.getState().setAstraConversationOpen(true)
    let tree!: GeometryTree
    await renderer.act(() => {
      tree = renderer.create(<Shell412 safeAreaTop={safeAreaTop} header={<View style={{ height: 48 }} />}
        tabBar={<View style={{ height: 48 }} />} conversationOpen={useUIStore.getState().astraConversationOpen}
        conversation={<AstraConversation chat={chat} />} conversationLabel="chat.title" />) as GeometryTree
    })
    try {
      const empty = tree.root.findAll((node) => node.type === ChatEmptyState)[0]!.findAll((node: { type: unknown }) => node.type === 'ScrollView')[0]!
      expect(empty.findAll((node) => typeof node.type === 'string' && node.props.accessibilityRole === 'button')).toHaveLength(1)
      const geometry = measureSafeArea(tree.toJSON(), (host) => {
        if (host.props.testID === 'shell-conversation') return 'layer'
        if (host.props.testID === 'nav-header-plain') return 'header'
        if (host.props.testID === 'conversation-composer') return 'composer'
        if (host.props.accessibilityLabel === 'common.closeConversation') return 'close'
      })
      expect(geometry.get('layer')?.top).toBe(0)
      expect(geometry.get('header')?.top).toBe(top)
      expect(geometry.get('close')?.top).toBeGreaterThanOrEqual(top)
      expect(geometry.get('composer')?.bottom).toBe(915 - safeArea.bottom)
    } finally { await renderer.act(() => tree.unmount()) }
  },
)

it.each([412, 844, 1200].flatMap(width => [true, false].flatMap(navigation =>
  [[28, 64], [64, 28]].map(([left, right]) => ({ width, navigation, left: left!, right: right! })),
)))(
  'pads the destination and conversation at $width with navigation=$navigation', async ({ width, navigation, left, right }) => {
    const height = width === 844 ? 412 : 915
    __setWindowDimensions({ width, height, scale: 1, fontScale: 1 })
    let tree!: GeometryTree
    const slots = navigation ? {
      composer: <View testID="side-composer" style={{ height: 48 }} />,
      fab: <View style={{ width: 48, height: 48 }} />,
      tabBar: <View testID="side-tabs" style={{ height: 48 }} />,
    } : { nav: false as const, action: <View testID="side-action" style={{ height: 48 }} /> }
    const content = (conversationOpen: boolean) => <Shell412 {...slots} safeAreaTop
      header={<View testID="side-header" style={{ height: 48 }} />}
      conversationOpen={conversationOpen} conversation={<AstraConversation chat={chat} />} conversationLabel="chat.title">
      <View testID="side-content" style={{ flex: 1 }} />
    </Shell412>
    await renderer.act(() => { tree = renderer.create(content(false)) as GeometryTree })
    try {
      safeArea.left = left
      safeArea.right = right
      for (const conversationOpen of [false, true]) {
        await renderer.act(() => tree.update(content(conversationOpen)))
        const shell = tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === 'shell-412')[0]!
        expect(StyleSheet.flatten(shell.props.style as ViewStyle).paddingLeft).toBe(left)
        expect(StyleSheet.flatten(shell.props.style as ViewStyle).paddingRight).toBe(right)
        const geometry = measureSafeArea(tree.toJSON(), host => host.props.testID, { width, height })
        const columnWidth = Math.min(width - left - right, 740)
        const columnLeft = left + (width - left - right - columnWidth) / 2
        const keys = conversationOpen ? ['shell-conversation', 'conversation-composer']
          : ['side-header', 'side-content', ...(navigation ? ['side-composer', 'side-tabs'] : ['side-action'])]
        for (const key of keys) {
          const box = geometry.get(key)!
          expect(box.left, key).toBe(columnLeft)
          expect(box.width, key).toBe(columnWidth)
        }
        if (navigation && !conversationOpen) {
          const fab = geometry.get('shell-fab')!
          expect(fab.left + fab.width).toBe(columnLeft + columnWidth - 16)
        }
      }
    } finally {
      safeArea.left = 0
      safeArea.right = 0
      await renderer.act(() => tree.unmount())
    }
  },
)
