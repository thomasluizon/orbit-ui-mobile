import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Pressable, Text, View } from 'react-native'
import type { BlockFrameProps } from '@orbit/shared/contracts/blocks'
import type { GoalListCard as GoalListData, HabitListCard as HabitListData } from '@orbit/shared/types/chat'
import { GoalListCard } from '@/components/chat/goal-list-card'
import { HabitListCard } from '@/components/chat/habit-list-card'

const TestRenderer = require('react-test-renderer')
const mocks = vi.hoisted(() => ({ push: vi.fn(), mutate: vi.fn() }))

vi.mock('expo-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/hooks/use-habits', () => ({ useLogHabit: () => ({ mutate: mocks.mutate }) }))
vi.mock('@/components/ui/status-ring', () => ({ StatusRing: () => <Text>Status</Text> }))
vi.mock('@/components/ui/progress-ring', () => ({ ProgressRing: () => <Text>Progress</Text> }))
vi.mock('@/components/ui/pill-button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) =>
    <Pressable accessibilityRole="button" onPress={onClick}><Text>{children}</Text></Pressable>,
}))
vi.mock('@/components/ui/block-frame', () => ({
  BlockFrame: ({ title, count, items, actions }: BlockFrameProps) => <View>
    <Text>{title}</Text>
    <Text>{count}</Text>
    {items.map((item) => <View key={item.id}>{item.label}{item.meta ? <Text>{item.meta}</Text> : null}{item.control}</View>)}
    {actions}
  </View>,
}))
vi.mock('@/lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/theme')>()
  return { ...actual, createTokensV2: () => new Proxy({}, { get: () => '#111111' }) }
})

const habits: HabitListData = {
  scope: 'today',
  items: ['Water', 'Walk', 'Read', 'Stretch'].map((title, index) => ({
    id: `habit-${index + 1}`,
    title,
    depth: 0,
    isBadHabit: false,
    status: 'today',
  })),
}

const goals: GoalListData = {
  items: [{ id: 'goal-1', title: 'Run 10 km', current: 4, target: 10, unit: 'km' }],
}

function render(element: React.ReactElement) {
  let tree: any
  TestRenderer.act(() => { tree = TestRenderer.create(element) })
  return tree
}

function allText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(allText).join(' ')
  if (typeof node === 'object' && 'children' in node) return allText((node as { children?: unknown }).children)
  if (typeof node === 'object' && 'props' in node) return allText((node as { props: { children?: unknown } }).props.children)
  return ''
}

describe('Astra list cards on mobile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('logs and unlogs locally, opens the habit, and pages the count without an AI call', () => {
    const tree = render(<HabitListCard habitList={habits} />)
    expect(allText(tree.toJSON())).toContain('chat.habitList.count')
    expect(allText(tree.toJSON())).toContain('3')

    const open = tree.root.findByProps({ accessibilityLabel: 'chat.habitList.open:{"name":"Water"}' })
    TestRenderer.act(() => open.props.onPress())
    expect(mocks.push).toHaveBeenCalledWith({ pathname: '/habits/[id]', params: { id: 'habit-1' } })

    const log = tree.root.findByProps({ accessibilityLabel: 'chat.habitList.log:{"name":"Water"}' })
    TestRenderer.act(() => log.props.onPress())
    const unlog = tree.root.findByProps({ accessibilityLabel: 'chat.habitList.unlog:{"name":"Water"}' })
    TestRenderer.act(() => unlog.props.onPress())
    expect(mocks.mutate).toHaveBeenNthCalledWith(1, { habitId: 'habit-1', intent: 'log' })
    expect(mocks.mutate).toHaveBeenNthCalledWith(2, { habitId: 'habit-1', intent: 'unlog' })

    const more = tree.root.findAll((node: any) => typeof node.props?.onPress === 'function' && allText(node.props.children).includes('chat.habitList.more'))[0]
    TestRenderer.act(() => more.props.onPress())
    expect(allText(tree.toJSON())).toContain('4')
  })

  it('opens a goal row in place and routes the progress action', () => {
    const onOpenGoal = vi.fn()
    const tree = render(<GoalListCard goalList={goals} onOpenGoal={onOpenGoal} />)
    const goal = tree.root.findAll((node: any) => typeof node.props?.onPress === 'function' && allText(node.props.children).includes('Run 10 km'))[0]
    TestRenderer.act(() => goal.props.onPress())
    expect(onOpenGoal).toHaveBeenCalledWith('goal-1')

    const progress = tree.root.findAll((node: any) => typeof node.props?.onPress === 'function' && allText(node.props.children).includes('chat.goalList.progressLink'))[0]
    TestRenderer.act(() => progress.props.onPress())
    expect(mocks.push).toHaveBeenCalledWith('/progress')
  })
})
