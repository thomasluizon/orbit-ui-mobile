import { act, create, type ReactTestRenderer, type ReactTestRendererJSON } from 'react-test-renderer'
import { expectPersonalTextLayout, expandedTextControls, pressTextControl } from '@/__tests__/support/personal-text'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    let tree!: ReactTestRenderer & { toJSON(): ReactTestRendererJSON }
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
    const profile = tree.root.findAll((node: ReactTestRenderer['root']) => String(node.type) === 'Pressable' && typeof node.props.onPress === 'function' && renderedText(node.props.children).includes('chat.operation.openProfile'))[0]
    expect(tree.root.findAll((node: ReactTestRenderer['root']) => String(node.type) === 'View' && node.props.testID === 'action-row')).toHaveLength(1)
    TestRenderer.act(() => (profile!.props.onPress as () => void)())
    expect(push).toHaveBeenCalledWith('/profile')
  })

  it('renders one policy outcome when the API returns a denial twice', () => {
    let tree!: ReactTestRenderer & { toJSON(): ReactTestRendererJSON }
    const deniedOperation = { ...makeAgentOperationResult('Denied', 1), operationId: denial.operationId }
    TestRenderer.act(() => {
      const outcomes = selectMessageOperationBlocks(makeHeldHabitMessage({ pendingOperations: [], operations: [deniedOperation], policyDenials: [denial] })).outcomes
      tree = TestRenderer.create(<OperationOutcomes outcomes={outcomes} />)
    })

    expect(renderedText(tree.toJSON()).match(/chat\.operation\.outcome\.UnsupportedByPolicy/g)).toHaveLength(1)
  })
  it.each(['UnbrokenToken'.repeat(24), 'Read extraordinarilyLongWord daily before breakfast with the people in my neighborhood'])('discloses the full operation target %s', async (name) => {
    const operation = { ...makeAgentOperationResult('Failed', 2), targetName: name }
    const outcomes = selectMessageOperationBlocks(makeHeldHabitMessage({ pendingOperations: [], operations: [operation] })).outcomes
    let tree!: ReactTestRenderer
    await act(() => { tree = create(<OperationOutcomes outcomes={outcomes} />) })
    await expectPersonalTextLayout(tree.root, name)
    await act(() => pressTextControl(expandedTextControls(tree.root, name, false)[0]!))
    expect(expandedTextControls(tree.root, name, true)).toHaveLength(1)
    await act(() => tree.update(<></>))
  })

})
