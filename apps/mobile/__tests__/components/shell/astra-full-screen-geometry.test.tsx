import { createChatThreadScroll } from '@orbit/shared/hooks'
import { Composer } from '@/components/shell/composer'
import { __setWindowDimensions } from '@/test-mocks/react-native'
import en from '@orbit/shared/i18n/en.json'
import React from 'react'
import { View, AccessibilityInfo } from 'react-native'
import { afterEach, expect, it, vi } from 'vitest'
import { Shell412 } from '@/components/shell/shell-412'
import { ChatEmptyState } from '@/components/chat/chat-empty-state'
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

const renderer = require('react-test-renderer') as typeof import('react-test-renderer')
type ChatController = Parameters<typeof AstraConversation>[0]['chat']
const chat = {
  threadScroll: createChatThreadScroll(), flatListRef: { current: null }, messages: [], activeSteps: [], canShowFollowUps: false,
  isTyping: false, streamingMessageId: null, showSuggestions: true,
  sendMessage: vi.fn(), scrollToBottom: vi.fn(), composerProps: { state: 'idle', value: '', suggestions: [], words: en.shell.composer, onChangeValue: vi.fn(), onSend: vi.fn() },
} as unknown as ChatController

afterEach(() => { useUIStore.getState().setAstraConversationOpen(false) })


function App() {
  const open = useUIStore(state => state.astraConversationOpen)
  return <Shell412 header={<View style={{ height: 48 }} />} tabBar={<View testID="tabs" style={{ height: 80 }} />}
    composer={<Composer {...chat.composerProps} onOpenConversation={() => useUIStore.getState().setAstraConversationOpen(true)} conversationLabel={en.todayAstra.openConversation} />}
    conversationOpen={open} conversation={<AstraConversation chat={chat} />} conversationLabel={en.chat.title} />
}

it.each([412, 840])('pins the full conversation over navigation at %ipx', async (width) => {
  __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
  useUIStore.getState().setAstraConversationOpen(true)
  let tree!: GeometryTree
  await renderer.act(() => { tree = renderer.create(<App />) as GeometryTree })
  try {
    const empty = tree.root.findAll(node => node.type === ChatEmptyState)[0]!
    expect(empty.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'button')).toHaveLength(0)
    const geometry = measureSafeArea(tree.toJSON(), host => {
      if (host.props.testID === 'shell-conversation') return 'layer'
      if (host.props.testID === 'shell-tab-bar') return 'tabs'
      if (host.props.testID === 'composer-idle') return 'composer'
    }, { width, height: 915 })
    const layer = geometry.get('layer')!
    const tabs = geometry.get('tabs')!
    expect(layer.top).toBe(0)
    expect(layer.bottom).toBe(915)
    expect(layer.width).toBe(Math.min(width, 740))
    expect(layer.left).toBe((width - layer.width) / 2)
    expect(tabs.top).toBeGreaterThanOrEqual(layer.top)
    expect(tabs.bottom).toBeLessThanOrEqual(layer.bottom)
    expect(geometry.get('composer')!.bottom).toBe(915 - safeArea.bottom)
  } finally { await renderer.act(() => tree.unmount()) }
})

it('returns accessibility focus to the Hoje glyph after a header close', async () => {
  const focus = vi.spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
  let tree!: GeometryTree
  await renderer.act(() => { tree = renderer.create(<App />) as GeometryTree })
  try {
    const trigger = () => tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === en.todayAstra.openConversation)[0]!
    await renderer.act(() => (trigger().props.onPress as () => void)())
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    focus.mockClear()
    const close = tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === 'common.closeConversation')[0]!
    await renderer.act(() => (close.props.onPress as () => void)())
    await renderer.act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    expect(useUIStore.getState().astraConversationOpen).toBe(false)
    expect(focus).toHaveBeenCalledWith(expect.objectContaining({ __nativeTag: trigger().props.__nativeTag }), 'focus')
  } finally { focus.mockRestore(); await renderer.act(() => tree.unmount()) }
})
