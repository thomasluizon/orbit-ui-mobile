import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TextInput } from 'react-native'
import type { PendingAgentOperation } from '@orbit/shared/types/ai'
import { PendingOperationCard } from '@/components/chat/pending-operation-card'
import { renderedText } from '../../support/react-test-renderer'

const TestRenderer = require('react-test-renderer')

vi.mock('@/components/ui/confirm-sheet', () => ({
  ConfirmSheet: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? React.createElement('ConfirmSheet', { onConfirm }) : null,
}))
vi.mock('@/components/ui/sheet', async () => await import('../../support/sheet-double'))
vi.mock('@/components/ui/otp-input', () => ({
  OtpInput: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) =>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} />,
}))

function operation(overrides: Partial<PendingAgentOperation> = {}): PendingAgentOperation {
  return {
    id: 'pending-1',
    capabilityId: 'habits.delete',
    displayName: 'DeleteHabit',
    summary: 'raw server summary',
    riskClass: 'Destructive',
    confirmationRequirement: 'FreshConfirmation',
    expiresAtUtc: '2026-09-02T12:00:00Z',
    ...overrides,
  }
}

function renderCard(overrides: Partial<PendingAgentOperation> = {}) {
  const handlers = {
    onConfirmExecute: vi.fn(),
    onPrepareStepUp: vi.fn(),
    onVerifyStepUp: vi.fn(),
  }
  let tree: any
  TestRenderer.act(() => {
    tree = TestRenderer.create(<PendingOperationCard pendingOperation={operation(overrides)} {...handlers} />)
  })
  return { tree, handlers }
}

function press(tree: any, label: string) {
  return tree.root.findAll((node: any) =>
    typeof node.props?.onPress === 'function' && renderedText(node.props.children).includes(label),
  )[0]
}

beforeEach(() => vi.clearAllMocks())

describe('PendingOperationCard (mobile)', () => {
  it('states risk and requires confirmation before a destructive operation', async () => {
    const { tree, handlers } = renderCard()
    handlers.onConfirmExecute.mockResolvedValue({
      ok: true,
      response: { operation: { status: 'Succeeded' } },
    })

    expect(renderedText(tree.toJSON())).toContain('chat.operation.risk.destructive')
    expect(renderedText(tree.toJSON())).toContain('chat.operation.irreversible')
    TestRenderer.act(() => press(tree, 'chat.operation.approve').props.onPress())
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
    await TestRenderer.act(async () => {
      tree.root.findByType('ConfirmSheet').props.onConfirm()
      await Promise.resolve()
    })
    expect(handlers.onConfirmExecute).toHaveBeenCalledWith('pending-1')
  })

  it('hands step up to a sheet, verifies the code, and executes', async () => {
    const { tree, handlers } = renderCard({ confirmationRequirement: 'StepUp', riskClass: 'High' })
    handlers.onPrepareStepUp.mockResolvedValue({
      ok: true,
      challengeId: 'challenge-1',
      confirmationToken: 'confirmation-1',
    })
    handlers.onVerifyStepUp.mockResolvedValue({
      ok: true,
      response: { operation: { status: 'Succeeded' } },
    })

    expect(tree.root.findAll((node: any) => typeof node.props?.onChangeText === 'function')).toHaveLength(0)
    await TestRenderer.act(async () => {
      press(tree, 'chat.operation.stepUpAction').props.onPress()
      await Promise.resolve()
    })
    expect(handlers.onPrepareStepUp).toHaveBeenCalledWith('pending-1')
    const codeInput = tree.root.findByProps({ accessibilityLabel: 'stepUp.codeLabel' })
    TestRenderer.act(() => codeInput.props.onChangeText('123456'))
    await TestRenderer.act(async () => {
      press(tree, 'stepUp.confirm').props.onPress()
      await Promise.resolve()
    })
    expect(handlers.onVerifyStepUp).toHaveBeenCalledWith(
      'pending-1',
      'challenge-1',
      '123456',
      'confirmation-1',
    )
    expect(renderedText(tree.toJSON())).toContain('status.done')
  })

  it('cancels without executing', () => {
    const { tree, handlers } = renderCard()
    TestRenderer.act(() => press(tree, 'common.cancel').props.onPress())

    expect(tree.toJSON()).toBeNull()
    expect(handlers.onConfirmExecute).not.toHaveBeenCalled()
  })

  it('does not mark a denied execution as done', async () => {
    const { tree, handlers } = renderCard({ riskClass: 'Low', confirmationRequirement: 'None' })
    handlers.onConfirmExecute.mockResolvedValue({
      ok: true,
      response: { operation: { status: 'Denied' } },
    })
    await TestRenderer.act(async () => {
      press(tree, 'chat.operation.approve').props.onPress()
      await Promise.resolve()
    })

    expect(renderedText(tree.toJSON())).toContain('status.failed')
    expect(renderedText(tree.toJSON())).not.toContain('status.done')
  })
})
