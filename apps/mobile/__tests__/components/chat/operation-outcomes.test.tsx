import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Pressable, Text, View } from 'react-native'
import type { BlockFrameProps } from '@orbit/shared/contracts/blocks'
import {
  agentPolicyDenialFixture as denial,
  makeAgentOperationResult,
  makeHeldHabitMessage,
} from '@orbit/shared/test-support/chat-fixtures'
import { OperationOutcomes } from '@/components/chat/operation-outcomes'
import { selectMessageOperationBlocks } from '@orbit/shared/chat'
import { renderedText } from '../../support/react-test-renderer'

const TestRenderer = require('react-test-renderer')
const push = vi.fn()
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/ui/pill-button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) =>
    <Pressable accessibilityRole="button" onPress={onClick}><Text>{children}</Text></Pressable>,
}))
vi.mock('@/components/ui/block-frame', () => ({
  BlockFrame: ({ title, items, actions, irreversibleLabel, confirmNote }: BlockFrameProps) => <View>
    <Text>{title}</Text>
    {items.map((item) => <View key={item.id}><Text>{item.label}</Text><Text>{item.meta}</Text><Text>{item.status}</Text>{item.irreversible ? <Text>{irreversibleLabel}</Text> : null}</View>)}
    {items.some((item) => item.irreversible) ? <Text>{confirmNote}</Text> : null}
    {actions}
  </View>,
}))

describe('OperationOutcomes on mobile', () => {

  it.each(['Low', 'Destructive', 'High'] as const)('keeps %s internal risk out of terminal outcome treatment', (riskClass) => {
    const outcomes = selectMessageOperationBlocks(makeHeldHabitMessage({ pendingOperations: [], operations: [
      { ...makeAgentOperationResult('Failed', 1), riskClass },
      { ...makeAgentOperationResult('Denied', 2), riskClass },
      { ...makeAgentOperationResult('UnsupportedByPolicy', 3), riskClass },
    ] })).outcomes
    let tree: ReturnType<typeof TestRenderer.create>
    TestRenderer.act(() => { tree = TestRenderer.create(<OperationOutcomes outcomes={outcomes} />) })
    expect(renderedText(tree!.toJSON())).not.toContain('chat.operation.irreversible')
    expect(renderedText(tree!.toJSON())).not.toContain('chat.operation.confirmNote')
    expect(renderedText(tree!.toJSON())).toContain('chat.operation.outcome.Failed')
  })

  beforeEach(() => push.mockReset())

  it('renders localized typed outcomes and keeps policy recovery on Profile', () => {
    let tree: any
    TestRenderer.act(() => {
      const outcomes = selectMessageOperationBlocks(makeHeldHabitMessage({ pendingOperations: [], operations: [
        makeAgentOperationResult('Succeeded', 1),
        makeAgentOperationResult('Failed', 2),
        makeAgentOperationResult('Denied', 3),
        makeAgentOperationResult('PendingConfirmation', 4),
      ], policyDenials: [denial] })).outcomes
      tree = TestRenderer.create(<OperationOutcomes outcomes={outcomes} />)
    })

    const output = renderedText(tree.toJSON())
    for (const status of ['Failed', 'Denied', 'UnsupportedByPolicy']) {
      expect(output).toContain(`chat.operation.outcome.${status}`)
      expect(output).toContain(`chat.operation.status.${status}`)
    }
    expect(output).not.toContain('chat.operation.outcome.Succeeded')
    expect(output).not.toContain('DeleteAccount')
    const profile = tree.root.findAll((node: any) => typeof node.props?.onPress === 'function' && renderedText(node.props.children).includes('chat.operation.openProfile'))[0]
    TestRenderer.act(() => profile.props.onPress())
    expect(push).toHaveBeenCalledWith('/profile')
  })

  it('renders one policy outcome when the API returns a denial twice', () => {
    let tree: any
    const deniedOperation = { ...makeAgentOperationResult('Denied', 1), operationId: denial.operationId }
    TestRenderer.act(() => {
      const outcomes = selectMessageOperationBlocks(makeHeldHabitMessage({ pendingOperations: [], operations: [deniedOperation], policyDenials: [denial] })).outcomes
      tree = TestRenderer.create(<OperationOutcomes outcomes={outcomes} />)
    })

    expect(renderedText(tree.toJSON()).match(/chat\.operation\.outcome\.UnsupportedByPolicy/g)).toHaveLength(1)
  })
})
