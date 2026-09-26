import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Pressable, Text, View } from 'react-native'
import type { BlockFrameProps } from '@orbit/shared/contracts/blocks'
import { RecordListCard } from '@/components/chat/record-list-card'
import { renderedText } from '../../support/react-test-renderer'

const TestRenderer = require('react-test-renderer')
const mocks = vi.hoisted(() => ({ push: vi.fn(), markRead: vi.fn(), apiClient: vi.fn(), generation: 0, onAccountChange: null as null | (() => void) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/hooks/use-notifications', () => ({ useMarkNotificationRead: () => ({ mutateAsync: mocks.markRead }) }))
vi.mock('@/lib/api-client', () => ({ apiClient: mocks.apiClient }))
vi.mock('@/lib/session-epoch', () => ({ getAccountGeneration: () => mocks.generation, subscribeToAccountGeneration: (callback: () => void) => { mocks.onAccountChange = callback; return () => { mocks.onAccountChange = null } } }))
vi.mock('@/components/ui/pill-button', () => ({ Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => <Pressable accessibilityRole="button" onPress={onClick}><Text>{children}</Text></Pressable> }))
vi.mock('@/components/ui/block-frame', () => ({ BlockFrame: ({ state, count, items, body, actions }: BlockFrameProps) => <View testID={`frame-${state}`}><Text>{count}</Text>{body}{items.map((item) => <View testID="record-row" key={item.id}>{item.label}{item.meta ? <Text>{item.meta}</Text> : null}{item.control}</View>)}{actions}</View> }))
vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme')>()
  return { ...actual, createTokensV2: () => new Proxy({}, { get: () => '#111111' }) }
})

function render(element: React.ReactElement) {
  let tree: any
  TestRenderer.act(() => { tree = TestRenderer.create(element) })
  return tree
}

describe('Astra record list on mobile', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.generation = 0 })

  it('marks a notification read optimistically and restores it on failure', async () => {
    let rejectRead: (reason: Error) => void = () => {}
    mocks.markRead.mockReturnValue(new Promise((_resolve, reject) => { rejectRead = reject }))
    const tree = render(<RecordListCard recordList={{ kind: 'notifications', totalCount: 1, items: [{ id: 'n1', title: 'Reminder', isRead: false }] }} />)
    const mark = tree.root.findByProps({ accessibilityLabel: 'notifications.markRead:{"title":"Reminder"}' })
    TestRenderer.act(() => mark.props.onPress())
    expect(mocks.markRead).toHaveBeenCalledWith('n1')
    expect(tree.root.findAll((node: any) => node.type === Pressable && String(node.props?.accessibilityLabel).startsWith('notifications.markRead'))).toHaveLength(0)
    await TestRenderer.act(async () => { rejectRead(new Error('offline')); await Promise.resolve() })
    expect(tree.root.findAll((node: any) => node.type === Pressable && String(node.props?.accessibilityLabel).startsWith('notifications.markRead'))).toHaveLength(1)
    expect(renderedText(tree.toJSON())).toContain('chat.recordList.markReadError')
  })

  it('pages and opens the key destination', async () => {
    mocks.apiClient.mockResolvedValue({ kind: 'keys', totalCount: 37, items: Array.from({ length: 10 }, (_, index) => ({ id: `next-${index}`, title: `Key ${index}`, state: 'revoked' })), nextCursor: 'next' })
    const tree = render(<RecordListCard recordList={{ kind: 'keys', totalCount: 37, items: Array.from({ length: 10 }, (_, index) => ({ id: `key-${index}`, title: `Key ${index}`, state: 'active' as const })), nextCursor: 'cursor', surfaceId: 'profile' }} />)
    expect(renderedText(tree.toJSON())).toContain('chat.recordList.count')
    const more = tree.root.findAll((node: any) => typeof node.props?.onPress === 'function' && renderedText(node.props.children).includes('chat.recordList.more'))[0]
    await TestRenderer.act(async () => { more.props.onPress(); await Promise.resolve() })
    expect(tree.root.findAll((node: any) => node.type === View && node.props?.testID === 'record-row')).toHaveLength(20)
    const filter = tree.root.findByProps({ accessibilityLabel: 'chat.recordList.filter' })
    TestRenderer.act(() => filter.props.onChangeText('Key 3'))
    expect(tree.root.findAll((node: any) => node.type === View && node.props?.testID === 'record-row')).toHaveLength(2)
    const open = tree.root.findAll((node: any) => typeof node.props?.onPress === 'function' && renderedText(node.props.children).includes('chat.recordList.open.keys'))[0]
    TestRenderer.act(() => open.props.onPress())
    expect(mocks.push).toHaveBeenCalledWith('/profile')
  })

  it('shows no tag destination chip', () => {
    const tree = render(<RecordListCard recordList={{ kind: 'tags', totalCount: 1, items: [{ id: 'tag-1', title: 'Focus' }] }} />)
    expect(tree.root.findAll((node: any) => node.type === Pressable)).toHaveLength(0)
  })

  it('can page again after switching accounts during a pending page', async () => {
    let resolveFirst: (value: unknown) => void = () => {}
    mocks.apiClient.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
    mocks.apiClient.mockResolvedValue({ kind: 'keys', totalCount: 30, items: [], nextCursor: null })
    const tree = render(<RecordListCard recordList={{ kind: 'keys', totalCount: 30, items: [{ id: 'k1', title: 'Key' }], nextCursor: 'cursor' }} />)
    const more = tree.root.findAll((node: any) => typeof node.props?.onPress === 'function' && renderedText(node.props.children).includes('chat.recordList.more'))[0]
    TestRenderer.act(() => more.props.onPress())
    expect(mocks.apiClient).toHaveBeenCalledTimes(1)
    TestRenderer.act(() => { mocks.generation++; mocks.onAccountChange?.() })
    TestRenderer.act(() => more.props.onPress())
    expect(mocks.apiClient).toHaveBeenCalledTimes(2)
    await TestRenderer.act(async () => { resolveFirst({ kind: 'keys', totalCount: 30, items: [], nextCursor: null }); await Promise.resolve() })
  })
})
