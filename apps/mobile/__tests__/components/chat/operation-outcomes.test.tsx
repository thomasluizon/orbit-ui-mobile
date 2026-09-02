import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Pressable, Text, View } from 'react-native'
import type { BlockFrameProps } from '@orbit/shared/contracts/blocks'
import {
  agentPolicyDenialFixture as denial,
  makeAgentOperationResult,
} from '@orbit/shared/test-support/chat-fixtures'
import { OperationOutcomes } from '@/components/chat/operation-outcomes'
import { renderedText } from '../../support/react-test-renderer'

const TestRenderer = require('react-test-renderer')
const push = vi.fn()
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/ui/badge', () => ({ Badge: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> }))
vi.mock('@/components/ui/pill-button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) =>
    <Pressable accessibilityRole="button" onPress={onClick}><Text>{children}</Text></Pressable>,
}))
vi.mock('@/components/ui/block-frame', () => ({
  BlockFrame: ({ title, items, risk, actions }: BlockFrameProps) => <View>
    <Text>{title}</Text>{risk}
    {items.map((item) => <View key={item.id}><Text>{item.label}</Text><Text>{item.meta}</Text><Text>{item.status}</Text></View>)}
    {actions}
  </View>,
}))

describe('OperationOutcomes on mobile', () => {
  beforeEach(() => push.mockReset())

  it('renders localized typed outcomes and keeps policy recovery on Profile', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<OperationOutcomes operations={[
        makeAgentOperationResult('Succeeded', 1),
        makeAgentOperationResult('Failed', 2),
        makeAgentOperationResult('Denied', 3),
        makeAgentOperationResult('PendingConfirmation', 4),
      ]} denials={[denial]} />)
    })

    const output = renderedText(tree.toJSON())
    for (const status of ['Succeeded', 'Failed', 'Denied', 'PendingConfirmation', 'UnsupportedByPolicy']) {
      expect(output).toContain(`chat.operation.outcome.${status}`)
      expect(output).toContain(`chat.operation.status.${status}`)
    }
    expect(output).not.toContain('DeleteAccount')
    const profile = tree.root.findAll((node: any) => typeof node.props?.onPress === 'function' && renderedText(node.props.children).includes('chat.operation.openProfile'))[0]
    TestRenderer.act(() => profile.props.onPress())
    expect(push).toHaveBeenCalledWith('/profile')
  })

  it('renders one policy outcome when the API returns a denial twice', () => {
    let tree: any
    const deniedOperation = { ...makeAgentOperationResult('Denied', 1), operationId: denial.operationId }
    TestRenderer.act(() => {
      tree = TestRenderer.create(<OperationOutcomes operations={[deniedOperation]} denials={[denial]} />)
    })

    expect(renderedText(tree.toJSON()).match(/chat\.operation\.outcome\.UnsupportedByPolicy/g)).toHaveLength(1)
  })
})
