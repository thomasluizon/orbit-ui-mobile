import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import {
  SharedPendingOperationCard,
  type PendingOperationButtonSpec,
  type PendingOperationCardLabels,
  type PendingOperationCardRenderers,
  type PendingOperationConfirmSheetProps,
  type PendingOperationVerificationProps,
} from '../chat/pending-operation-card'
import type { BlockFrameProps } from '../contracts/blocks'
import type { StepUpProps } from '../contracts/overlay'
import { makePendingAgentOperation } from '../test-support/chat-fixtures'

const labels: PendingOperationCardLabels = {
  approve: 'Approve',
  cancel: 'Cancel',
  confirm: 'Confirm',
  confirmBody: 'This cannot be undone.',
  confirmNote: 'Review before confirming.',
  confirmTitle: 'Confirm operation',
  irreversible: 'Irreversible',
  name: 'Delete habit',
  pending: 'Pending',
  pendingTitle: 'Pending operation',
  risk: 'Destructive',
  stepUpAction: 'Verify',
  stepUpMessage: 'Verification required',
}

interface RenderRecord {
  blockFrame?: BlockFrameProps
  buttons: PendingOperationButtonSpec[]
  confirmSheet?: PendingOperationConfirmSheetProps
  stepUp?: StepUpProps
  verification?: PendingOperationVerificationProps
}

function makeRenderers(record: RenderRecord): PendingOperationCardRenderers {
  return {
    blockFrame: (props) => {
      record.blockFrame = props
      return null
    },
    button: (spec) => {
      record.buttons.push(spec)
      return null
    },
    confirmSheet: (props) => {
      record.confirmSheet = props
      return null
    },
    risk: (label) => label,
    stepUp: (props) => {
      record.stepUp = props
      return null
    },
    verification: (props) => {
      record.verification = props
      return null
    },
  }
}

async function renderCard(
  overrides: Partial<React.ComponentProps<typeof SharedPendingOperationCard>> = {},
): Promise<{ record: RenderRecord; renderer: ReactTestRenderer }> {
  const record: RenderRecord = { buttons: [] }
  let renderer: ReactTestRenderer | undefined
  const props: React.ComponentProps<typeof SharedPendingOperationCard> = {
    labels,
    pendingOperation: makePendingAgentOperation(),
    onConfirmExecute: vi.fn().mockResolvedValue({
      ok: true,
      response: {
        operation: {
          operationId: 'operation-1',
          sourceName: 'DeleteHabit',
          riskClass: 'Destructive',
          confirmationRequirement: 'FreshConfirmation',
          status: 'Succeeded',
        },
      },
    }),
    onPrepareStepUp: vi.fn(),
    onVerifyStepUp: vi.fn(),
    render: makeRenderers(record),
    ...overrides,
  }

  await act(async () => {
    renderer = create(React.createElement(SharedPendingOperationCard, props))
  })
  return { record, renderer: renderer as ReactTestRenderer }
}

describe('SharedPendingOperationCard', () => {
  it('confirms a destructive operation and exposes its completed frame', async () => {
    const card = await renderCard()

    expect(card.record.blockFrame).toMatchObject({
      state: 'resting',
      title: labels.pendingTitle,
      items: [{ irreversible: true, label: labels.name, meta: labels.pending }],
    })
    expect(card.record.buttons.map(({ label }) => label)).toEqual(['Cancel', 'Approve'])

    act(() => card.record.buttons[1]?.onClick())
    expect(card.record.confirmSheet?.open).toBe(true)
    act(() => card.record.confirmSheet?.onCancel())
    expect(card.record.confirmSheet?.open).toBe(false)
    act(() => card.record.buttons[1]?.onClick())
    await act(async () => card.record.confirmSheet?.onConfirm())

    expect(card.record.confirmSheet?.open).toBe(false)
    expect(card.record.blockFrame).toMatchObject({
      state: 'resting',
      items: [{ irreversible: false, status: 'done' }],
    })
    card.renderer.unmount()
  })

  it('executes a reversible operation directly and can dismiss it', async () => {
    const onConfirmExecute = vi.fn().mockResolvedValue({
      ok: false,
      error: 'Denied',
    })
    const failed = await renderCard({
      pendingOperation: makePendingAgentOperation({ riskClass: 'High' }),
      onConfirmExecute,
    })

    await act(async () => failed.record.buttons[1]?.onClick())
    expect(onConfirmExecute).toHaveBeenCalledWith('pending-1')
    expect(failed.record.blockFrame?.state).toBe('partiallyFailed')
    failed.renderer.unmount()

    const dismissed = await renderCard()
    act(() => dismissed.record.buttons[0]?.onClick())
    expect(dismissed.renderer.toJSON()).toBeNull()
    dismissed.renderer.unmount()
  })

  it('hands a prepared step-up operation to the platform verifier', async () => {
    const onPrepareStepUp = vi.fn().mockResolvedValue({
      ok: true,
      challengeId: 'challenge-1',
      confirmationToken: 'confirmation-1',
    })
    const card = await renderCard({
      pendingOperation: makePendingAgentOperation({ confirmationRequirement: 'StepUp' }),
      onPrepareStepUp,
    })

    expect(card.record.stepUp).toMatchObject({
      actionLabel: labels.stepUpAction,
      message: labels.stepUpMessage,
    })
    await act(async () => card.record.stepUp?.onAction())
    expect(onPrepareStepUp).toHaveBeenCalledWith('pending-1')
    expect(card.record.verification).toMatchObject({
      pendingOperationId: 'pending-1',
      prepared: {
        challengeId: 'challenge-1',
        confirmationToken: 'confirmation-1',
      },
    })

    const verification = card.record.verification
    card.record.verification = undefined
    act(() => verification?.onClose())
    expect(card.record.verification).toBeUndefined()

    await act(async () => card.record.stepUp?.onAction())
    act(() => card.record.verification?.onCompleted('done'))
    expect(card.record.blockFrame).toMatchObject({
      items: [{ status: 'done' }],
    })
    card.renderer.unmount()
  })
})
