import { describe, expect, it, vi } from 'vitest'
import type { PendingAgentOperation } from '@orbit/shared/types'

const TestRenderer = require('react-test-renderer')

const colorProxy: any = new Proxy(
  {},
  {
    get: (_target, prop) => {
      if (prop === 'white') return '#ffffff'
      return '#111111'
    },
  },
)

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/lib/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: colorProxy,
    shadows: { sm: {} },
  }),
}))

vi.mock('lucide-react-native', () => {
  const React = require('react')
  return {
    ShieldAlert: (props: any) => React.createElement('ShieldAlert', props),
  }
})

import { PendingOperationCard } from '@/components/chat/pending-operation-card'

function makePendingOperation(
  overrides: Partial<PendingAgentOperation> = {},
): PendingAgentOperation {
  return {
    id: 'pending-1',
    capabilityId: 'habit.delete',
    displayName: 'Delete habit',
    summary: 'Delete Meditation habit',
    riskClass: 'Destructive',
    confirmationRequirement: 'FreshConfirmation',
    expiresAtUtc: '2025-01-15T10:00:00Z',
    ...overrides,
  }
}

function findPressables(root: any) {
  return root.findAll(
    (node: any) =>
      node.props &&
      typeof node.props.onPress === 'function' &&
      typeof node.type !== 'string',
  )
}

describe('PendingOperationCard (mobile)', () => {
  it('calls confirm handler for fresh confirmations', async () => {
    const onConfirmExecute = vi.fn().mockResolvedValue({ ok: true })
    let tree: any

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <PendingOperationCard
          pendingOperation={makePendingOperation()}
          onConfirmExecute={onConfirmExecute}
          onPrepareStepUp={vi.fn()}
          onVerifyStepUp={vi.fn()}
        />,
      )
    })

    const [button] = findPressables(tree.root)
    await TestRenderer.act(async () => {
      await button.props.onPress()
    })

    expect(onConfirmExecute).toHaveBeenCalledWith('pending-1')
  })

  it('starts step-up flow when required', async () => {
    const onPrepareStepUp = vi.fn().mockResolvedValue({
      ok: true,
      challengeId: 'challenge-1',
      confirmationToken: 'confirm-token',
    })
    let tree: any

    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <PendingOperationCard
          pendingOperation={makePendingOperation({ confirmationRequirement: 'StepUp', riskClass: 'High' })}
          onConfirmExecute={vi.fn()}
          onPrepareStepUp={onPrepareStepUp}
          onVerifyStepUp={vi.fn()}
        />,
      )
    })

    const [button] = findPressables(tree.root)
    await TestRenderer.act(async () => {
      await button.props.onPress()
    })

    expect(onPrepareStepUp).toHaveBeenCalledWith('pending-1')
    expect(tree.root.findAllByProps({ placeholder: '123456' }).length).toBeGreaterThan(0)
  })
})
