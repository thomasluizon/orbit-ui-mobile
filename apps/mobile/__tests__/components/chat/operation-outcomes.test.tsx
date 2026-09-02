import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Pressable, Text, View } from 'react-native'
import type { BlockFrameProps } from '@orbit/shared/contracts/blocks'
import type { AgentOperationResult, AgentPolicyDenial } from '@orbit/shared/types/ai'
import { OperationOutcomes } from '@/components/chat/operation-outcomes'

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

function operation(status: AgentOperationResult['status'], index: number): AgentOperationResult {
  return {
    operationId: `operation-${index}`,
    sourceName: 'CreateHabit',
    riskClass: status === 'Failed' ? 'Destructive' : 'Low',
    confirmationRequirement: 'None',
    status,
    targetName: `Habit ${index}`,
  }
}

const denial: AgentPolicyDenial = {
  operationId: 'policy-1',
  sourceName: 'DeleteAccount',
  riskClass: 'High',
  confirmationRequirement: 'StepUp',
  reason: 'Profile only',
}

function text(node: unknown): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join(' ')
  if (typeof node === 'object' && 'children' in node) return text((node as { children?: unknown }).children)
  if (typeof node === 'object' && 'props' in node) return text((node as { props: { children?: unknown } }).props.children)
  return ''
}

describe('OperationOutcomes on mobile', () => {
  beforeEach(() => push.mockReset())

  it('renders localized typed outcomes and keeps policy recovery on Profile', () => {
    let tree: any
    TestRenderer.act(() => {
      tree = TestRenderer.create(<OperationOutcomes operations={[
        operation('Succeeded', 1),
        operation('Failed', 2),
        operation('Denied', 3),
        operation('PendingConfirmation', 4),
      ]} denials={[denial]} />)
    })

    const output = text(tree.toJSON())
    for (const status of ['Succeeded', 'Failed', 'Denied', 'PendingConfirmation', 'UnsupportedByPolicy']) {
      expect(output).toContain(`chat.operation.outcome.${status}`)
      expect(output).toContain(`chat.operation.status.${status}`)
    }
    expect(output).not.toContain('DeleteAccount')
    const profile = tree.root.findAll((node: any) => typeof node.props?.onPress === 'function' && text(node.props.children).includes('chat.operation.openProfile'))[0]
    TestRenderer.act(() => profile.props.onPress())
    expect(push).toHaveBeenCalledWith('/profile')
  })

  it('renders one policy outcome when the API returns a denial twice', () => {
    let tree: any
    const deniedOperation = { ...operation('Denied', 1), operationId: denial.operationId }
    TestRenderer.act(() => {
      tree = TestRenderer.create(<OperationOutcomes operations={[deniedOperation]} denials={[denial]} />)
    })

    expect(text(tree.toJSON()).match(/chat\.operation\.outcome\.UnsupportedByPolicy/g)).toHaveLength(1)
  })
})
