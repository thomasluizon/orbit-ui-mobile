import React from 'react'
import { act, create } from 'react-test-renderer'
import type { ViewStyle } from 'react-native'
import { Resvg } from '@resvg/resvg-js'
import { expect, it, vi } from 'vitest'
import { createChatThreadScroll } from '@orbit/shared/hooks'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { AstraConversation } from '@/components/chat/conversation'
import { Composer } from '@/components/shell/composer'
import { TodayAstraLine } from '@/components/today/today-astra-line'
import { measureProfileRow } from '@/__tests__/support/profile-row-geometry'
import { __setWindowDimensions } from '@/test-mocks/react-native'

vi.mock('@/components/chat/proactive-action', () => ({ ProactiveAction: () => null }))
vi.mock('@/components/message-bubble', () => ({ MessageBubble: () => null }))
vi.mock('@/hooks/use-habits', () => ({}))

vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/chat/chat-empty-state', () => ({ ChatEmptyState: () => null }))
vi.mock('@/components/goals/goal-detail-drawer', () => ({ GoalDetailDrawer: () => null }))

interface Host {
  type: string
  props: {
    style?: ViewStyle | ((state: { pressed: boolean }) => ViewStyle)
    testID?: string
    accessibilityLabel?: string
    width?: number
    height?: number
    viewBox?: string
    d?: string
    fillRule?: string
  }
  children: (Host | string)[] | null
}

type Tree = ReturnType<typeof create> & { toJSON: () => Host[]; unmount: () => void }

function descendants(host: Host): Host[] {
  return [host, ...(host.children ?? []).flatMap(child => typeof child === 'string' ? [] : descendants(child))]
}

function measurable(host: Host): Host {
  if (host.type === 'Svg') return { ...host, props: { ...host.props, style: { width: host.props.width, height: host.props.height } }, children: null }
  return { ...host, children: host.children?.map(child => typeof child === 'string' ? child : measurable(child)) ?? null }
}

function drawnOffset(owner: Host, width: number) {
  const svg = descendants(owner).find(host => host.type === 'Svg' && host.props.testID?.startsWith('astra-mark'))!
  const paths = descendants(svg).filter(host => host.type === 'Path').map(host => `<path d="${host.props.d}" fill-rule="${host.props.fillRule ?? 'nonzero'}"/>`).join('')
  const bounds = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${svg.props.viewBox}">${paths}</svg>`).getBBox()!
  const [, viewTop, viewWidth, viewHeight] = svg.props.viewBox!.split(' ').map(Number)
  const scale = Math.min(svg.props.width! / viewWidth!, svg.props.height! / viewHeight!)
  const centreInSvg = (svg.props.height! - viewHeight! * scale) / 2 + (bounds.y + bounds.height / 2 - viewTop!) * scale
  const layout = measureProfileRow(measurable(owner), width, 1)
  const box = layout.boxes.find(box => box.testID === svg.props.testID)!
  return box.top + centreInSvg - layout.height / 2
}

it.each([390, 1280].flatMap(width => [en, ptBR].map(messages => ({ width, messages }))))(
  'centres the drawn Astra mark on Android surfaces at $width in both locales', async ({ width, messages }) => {
    __setWindowDimensions({ width, height: 915, scale: 1, fontScale: 1 })
    const composerProps = {
      state: 'idle' as const, value: '', onChangeValue: vi.fn(), onSend: vi.fn(), words: messages.shell.composer,
      suggestions: [{ id: 'starter', label: messages.shell.composer.chips.habitDetail.rename, onSelect: vi.fn() }],
    }
    const chat = {
      threadScroll: createChatThreadScroll(), flatListRef: { current: null }, messages: [], activeSteps: [], canShowFollowUps: false,
      isTyping: false, streamingMessageId: null, showSuggestions: true, sendMessage: vi.fn(), scrollToBottom: vi.fn(), composerProps,
    } as unknown as Parameters<typeof AstraConversation>[0]['chat']
    let tree!: Tree
    await act(() => { tree = create(<>
      <AstraConversation chat={chat} />
      <Composer {...composerProps} suggestions={[]} onOpenConversation={vi.fn()} conversationLabel={messages.todayAstra.openConversation} />
      <TodayAstraLine text={messages.todayAstra.openConversation} destination={messages.chat.title} onPress={vi.fn()} />
    </>) as Tree })
    try {
      const hosts = tree.toJSON().flatMap(descendants)
      const owners = [hosts.find(host => host.props.testID === 'nav-header-plain'),
        hosts.find(host => host.type === 'Pressable' && host.props.accessibilityLabel === composerProps.suggestions[0]!.label),
        hosts.find(host => host.type === 'Pressable' && host.props.accessibilityLabel === messages.todayAstra.openConversation),
        hosts.find(host => host.props.testID === 'today-astra-slot')]
      for (const owner of owners) {
        expect(owner).toBeDefined()
        expect.soft(Math.abs(drawnOffset(owner!, width))).toBeLessThanOrEqual(1)
      }
    } finally { await act(() => tree.unmount()) }
  },
)
