import { describe, expect, it, vi } from 'vitest'
import type { PendingAgentOperation } from '@orbit/shared/types'

import { PendingOperationCard } from '@/components/chat/pending-operation-card'

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
    currentScheme: 'purple',
    currentTheme: 'dark',
  }),
}))

vi.mock('@/lib/theme', () => ({
  radius: { xl: 20, full: 9999, md: 12, lg: 16, sm: 8 },
  shadows: { sm: {} },
  createTokensV2: () => new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'fgOnPrimary') return '#ffffff'
      return '#111111'
    },
  }),
  tintFromPrimary: () => 'rgba(17, 17, 17, 0.18)',
  primaryGlow: () => ({}),
}))

vi.mock('lucide-react-native', () => {
  const React = require('react')
  return {
    ShieldAlert: (props: any) => React.createElement('ShieldAlert', props),
  }
})

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

function findTexts(root: any, text: string) {
  return root.findAll((node: any) => {
    const children = node.props?.children
    if (typeof children === 'string') {
      return children === text
    }

    return Array.isArray(children) && children.includes(text)
  })
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

  it('dismisses the card without calling the mutation when Cancel is pressed', async () => {
    const onConfirmExecute = vi.fn()
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

    const [cancelButton] = tree.root.findAll(
      (node: any) =>
        node.props?.accessibilityLabel === 'common.cancel' &&
        typeof node.props?.onPress === 'function',
    )

    await TestRenderer.act(async () => {
      cancelButton.props.onPress()
    })

    expect(onConfirmExecute).not.toHaveBeenCalled()
    expect(findPressables(tree.root)).toHaveLength(0)
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
    expect(tree.root.findAllByProps({ placeholder: 'common.codePlaceholder' }).length).toBeGreaterThan(0)
  })

  it('does not show success when execution returns a denied operation', async () => {
    const onConfirmExecute = vi.fn().mockResolvedValue({
      ok: true,
      response: {
        operation: {
          operationId: 'habit.delete',
          sourceName: 'Delete habit',
          riskClass: 'Destructive',
          confirmationRequirement: 'FreshConfirmation',
          status: 'Denied',
          summary: 'Delete Meditation habit',
          policyReason: 'missing_scope:delete_habits',
          payload: null,
        },
      },
    })
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

    expect(findTexts(tree.root, 'missing_scope:delete_habits').length).toBeGreaterThan(0)
  })
})
