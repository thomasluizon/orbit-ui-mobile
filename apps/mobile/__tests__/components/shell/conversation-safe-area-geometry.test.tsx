import React from 'react'
import { View } from 'react-native'
import { afterEach, expect, it, vi } from 'vitest'
import { Shell412 } from '@/components/shell/shell-412'
import { AstraConversation } from '@/components/chat/conversation'
import { useUIStore } from '@/stores/ui-store'
import { measureSafeArea, type GeometryTree } from '@/__tests__/support/safe-area-geometry'

const safeArea = vi.hoisted(() => ({ top: 24, bottom: 16 }))
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ ...safeArea, left: 0, right: 0 }) }))
vi.mock('@/hooks/use-habits', () => ({}))
vi.mock('@react-native-clipboard/clipboard', () => ({ default: {} }))
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
vi.mock('@/hooks/use-astra-suggestions', () => ({ useAstraSuggestions: () => null }))
vi.mock('@/components/shell/composer', () => ({ Composer: () => <View testID="conversation-composer" style={{ height: 48 }} /> }))

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
type ChatController = Parameters<typeof AstraConversation>[0]['chat']
const chat = {
  flatListRef: { current: null }, messages: [], activeSteps: [], canShowFollowUps: false,
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
