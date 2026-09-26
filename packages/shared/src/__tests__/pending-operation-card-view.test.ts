import { describe, expect, it, vi } from 'vitest'
import { makePendingAgentOperation } from '../test-support/chat-fixtures'
import {
  renderPendingOperationCard,
  type PendingOperationCardActions,
  type PendingOperationCardRenderers,
  type PendingOperationButtonSpec,
  type PendingOperationConfirmSheetProps,
  type PendingOperationFrame,
  type PendingOperationVerificationProps,
} from '../chat/pending-operation-card-view'
import { buildPendingOperationCardLabels, type PendingOperationCardLabels } from '../chat/pending-operation-card'

const labels: PendingOperationCardLabels = {
  approve: 'Approve', cancel: 'Cancel', confirm: 'Confirm',
  confirmBody: 'Confirm the action', confirmNote: 'Review it', confirmTitle: 'Confirm',
  irreversible: 'Irreversible', name: 'Delete habit', pending: 'Pending',
  pendingTitle: 'Pending operation', risk: 'Destructive',
  stepUpAction: 'Verify', stepUpMessage: 'Verification required',
}

it('labels the pending operation from its capability and risk', () => {
  const translated = buildPendingOperationCardLabels(
    makePendingAgentOperation(),
    (key) => key,
  )
  expect(translated.risk).toBe('chat.operation.risk.destructive')
  expect(translated.name).toBe('chat.pendingOp.capability.habits-delete')
})

function createCard(): PendingOperationCardActions {
  return {
    busy: false, confirmOpen: false, dismissed: false, preparedStepUp: undefined,
    status: undefined, completeStepUp: vi.fn(), closeStepUp: vi.fn(), dismiss: vi.fn(),
    execute: vi.fn().mockResolvedValue(undefined), setConfirmOpen: vi.fn(),
    startStepUp: vi.fn().mockResolvedValue(undefined),
  }
}

function createRenderers() {
  const record: {
    frame?: PendingOperationFrame<string>
    buttons: PendingOperationButtonSpec[]
    confirm?: PendingOperationConfirmSheetProps
    verification?: PendingOperationVerificationProps
    stepUp?: { onAction: () => void }
  } = { buttons: [] }
  const render: PendingOperationCardRenderers<string> = {
    blockFrame: (props) => { record.frame = props; return 'frame' },
    button: (spec) => { record.buttons.push(spec); return spec.label },
    confirmSheet: (props) => { record.confirm = props; return 'confirm' },
    risk: (label) => label,
    stepUp: (props) => { record.stepUp = props; return 'step-up' },
    verification: (props) => { record.verification = props; return 'verification' },
    fragment: (...children) => children.filter(Boolean).join('|'),
  }
  return { record, render }
}

describe('pending operation card view', () => {
  it('confirms destructive actions and builds the frame from plain state', () => {
    const card = createCard()
    const { record, render } = createRenderers()
    const output = renderPendingOperationCard({
      card, labels, onVerifyStepUp: vi.fn(), pendingOperation: makePendingAgentOperation(), render,
    })

    expect(output).toBe('frame|confirm')
    expect(record.frame).toMatchObject({
      state: 'resting', items: [{ irreversible: true, status: undefined }],
      actions: 'Cancel|Approve',
    })
    expect(record.buttons.map(({ label }) => label)).toEqual(['Cancel', 'Approve'])
    record.buttons[1]?.onClick()
    expect(card.setConfirmOpen).toHaveBeenCalledWith(true)
    record.confirm?.onConfirm()
    expect(card.setConfirmOpen).toHaveBeenCalledWith(false)
    expect(card.execute).toHaveBeenCalledOnce()
  })

  it('hands step up to the verifier and hides dismissed cards', () => {
    const card = createCard()
    card.preparedStepUp = { challengeId: 'challenge-1', confirmationToken: 'token-1' }
    const { record, render } = createRenderers()
    const operation = makePendingAgentOperation({ confirmationRequirement: 'StepUp' })
    const onVerifyStepUp = vi.fn()
    expect(renderPendingOperationCard({ card, labels, onVerifyStepUp, pendingOperation: operation, render }))
      .toBe('frame|confirm|verification')
    expect(record.stepUp).toBeDefined()
    record.stepUp?.onAction()
    expect(card.startStepUp).toHaveBeenCalledOnce()
    expect(record.verification).toMatchObject({
      prepared: card.preparedStepUp, onVerify: onVerifyStepUp,
    })
    expect(renderPendingOperationCard({
      card: { ...card, dismissed: true }, labels, onVerifyStepUp, pendingOperation: operation, render,
    })).toBeNull()
  })

  it('uses neutral actions for reversible operations and no actions after failure', () => {
    const card = createCard()
    const { record, render } = createRenderers()
    const operation = makePendingAgentOperation({ riskClass: 'High', confirmationRequirement: 'None' })
    renderPendingOperationCard({ card, labels, onVerifyStepUp: vi.fn(), pendingOperation: operation, render })
    expect(record.buttons[1]?.variant).toBe('primary')
    record.buttons[1]?.onClick()
    expect(card.execute).toHaveBeenCalledOnce()

    const failed = createRenderers()
    renderPendingOperationCard({
      card: { ...card, status: 'failed' }, labels, onVerifyStepUp: vi.fn(),
      pendingOperation: operation, render: failed.render,
    })
    expect(failed.record.frame).toMatchObject({ state: 'partiallyFailed', actions: undefined })
  })
})
