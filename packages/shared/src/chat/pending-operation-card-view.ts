import type { PendingAgentOperation } from '../types/ai'
import type {
  PendingOperationCardStatus,
  PreparedPendingOperationStepUp,
  PendingOperationExecutionResult,
} from '../hooks/pending-operation-card-core'
import { getPendingOperationCardPresentation } from '../hooks/pending-operation-card-core'
import type { PendingOperationCardLabels } from './pending-operation-card'

export interface PendingOperationButtonSpec {
  disabled?: boolean
  label: string
  loading?: boolean
  onClick: () => void
  variant?: 'destructive' | 'ghost' | 'primary'
}

export interface PendingOperationConfirmSheetProps {
  confirmLabel: string
  destructive: boolean
  message: string
  onCancel: () => void
  onConfirm: () => void
  open: boolean
  title: string
}

export interface PendingOperationVerificationProps {
  onClose: () => void
  onCompleted: (status: 'done' | 'failed') => void
  onVerify: (
    id: string,
    challengeId: string,
    code: string,
    confirmationToken: string,
  ) => Promise<PendingOperationExecutionResult>
  pendingOperationId: string
  prepared: PreparedPendingOperationStepUp
}

export interface PendingOperationFrame<Node> {
  state: 'acting' | 'partiallyFailed' | 'resting'
  title: string
  items: readonly {
    id: string
    label: string
    meta: string
    status: PendingOperationCardStatus
    irreversible: boolean
  }[]
  risk: Node
  irreversibleLabel: string
  confirmNote: string
  actions: Node | undefined
}

export interface PendingOperationCardRenderers<Node> {
  blockFrame: (props: PendingOperationFrame<Node>) => Node
  button: (spec: PendingOperationButtonSpec) => Node
  confirmSheet: (props: PendingOperationConfirmSheetProps) => Node
  risk: (label: string) => Node
  stepUp: (props: { message: string; actionLabel: string; onAction: () => void; busy: boolean }) => Node
  verification: (props: PendingOperationVerificationProps) => Node
  fragment: (...children: (Node | null | undefined)[]) => Node
}

export interface PendingOperationCardActions {
  busy: boolean
  confirmOpen: boolean
  dismissed: boolean
  preparedStepUp: PreparedPendingOperationStepUp | undefined
  status: PendingOperationCardStatus
  completeStepUp: (status: 'done' | 'failed') => void
  closeStepUp: () => void
  dismiss: () => void
  execute: () => Promise<void>
  setConfirmOpen: (open: boolean) => void
  startStepUp: () => Promise<void>
}

export function renderPendingOperationCard<Node>({
  card,
  labels,
  onVerifyStepUp,
  pendingOperation,
  render,
}: {
  card: PendingOperationCardActions
  labels: PendingOperationCardLabels
  onVerifyStepUp: PendingOperationVerificationProps['onVerify']
  pendingOperation: PendingAgentOperation
  render: PendingOperationCardRenderers<Node>
}): Node | null {
  if (card.dismissed) return null

  const { destructive, action, frameState } = getPendingOperationCardPresentation(
    pendingOperation.riskClass, pendingOperation.confirmationRequirement, card.busy, card.status,
  )
  let actions: Node | undefined
  if (action === 'stepUp') {
    actions = render.stepUp({
      message: labels.stepUpMessage,
      actionLabel: labels.stepUpAction,
      onAction: () => void card.startStepUp(),
      busy: card.busy,
    })
  } else if (action === 'buttons') {
    actions = render.fragment(
      render.button({ label: labels.cancel, variant: 'ghost', onClick: card.dismiss }),
      render.button({
        label: labels.approve,
        variant: destructive ? 'destructive' : 'primary',
        onClick: () => (destructive ? card.setConfirmOpen(true) : void card.execute()),
      }),
    )
  }

  const blockFrame = render.blockFrame({
    state: frameState,
    title: labels.pendingTitle,
    items: [{
      id: pendingOperation.id,
      label: labels.name,
      meta: labels.pending,
      status: card.status,
      irreversible: destructive && card.status == null,
    }],
    risk: render.risk(labels.risk),
    irreversibleLabel: labels.irreversible,
    confirmNote: labels.confirmNote,
    actions,
  })
  const confirmSheet = render.confirmSheet({
    open: card.confirmOpen,
    title: labels.confirmTitle,
    message: labels.confirmBody,
    confirmLabel: labels.confirm,
    destructive: true,
    onCancel: () => card.setConfirmOpen(false),
    onConfirm: () => {
      card.setConfirmOpen(false)
      void card.execute()
    },
  })
  const verification = card.preparedStepUp
    ? render.verification({
        pendingOperationId: pendingOperation.id,
        prepared: card.preparedStepUp,
        onClose: card.closeStepUp,
        onCompleted: card.completeStepUp,
        onVerify: onVerifyStepUp,
      })
    : null

  return render.fragment(blockFrame, confirmSheet, verification)
}
