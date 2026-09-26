import type { PendingAgentOperation, PendingOperationItem } from '../types/ai'
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

export interface PendingOperationEditSheetProps {
  item: PendingOperationItem
  draft: Readonly<Record<string, string>>
  labels: PendingOperationCardLabels
  busy: boolean
  error: string | undefined
  onChange: (field: string, value: string) => void
  onClose: () => void
  onSave: () => void
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
    editable?: boolean
    control?: Node
  }[]
  editLabel?: string
  onEditItem?: (itemId: string) => void
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
  editSheet: (props: PendingOperationEditSheetProps) => Node
  removeItem: (label: string, disabled: boolean, onClick: () => void) => Node
  notice: (message: string) => Node
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
  revision?: {
    operation: PendingAgentOperation
    canRevise: boolean
    items: readonly PendingOperationItem[]
    editingItem: PendingOperationItem | undefined
    draft: Readonly<Record<string, string>>
    busy: boolean
    stale: boolean
    rejected: boolean
    error: string | undefined
    setDraftField: (field: string, value: string) => void
    closeEdit: () => void
    startEdit: (itemId: string) => void
    saveEdit: () => Promise<void>
    rejectItem: (itemId: string) => Promise<void>
    rejectAll: () => Promise<void>
  }
}

type CardRevision = NonNullable<PendingOperationCardActions['revision']>

function pendingActions<Node>(
  action: 'none' | 'stepUp' | 'buttons',
  destructive: boolean,
  card: PendingOperationCardActions,
  revision: CardRevision | undefined,
  labels: PendingOperationCardLabels,
  render: PendingOperationCardRenderers<Node>,
): Node | undefined {
  if (action === 'stepUp') return render.stepUp({
    message: labels.stepUpMessage,
    actionLabel: labels.stepUpAction,
    onAction: () => void card.startStepUp(),
    busy: card.busy,
  })
  if (action !== 'buttons') return undefined
  return render.fragment(
    render.button({
      label: revision?.canRevise ? labels.reject : labels.cancel,
      variant: 'ghost',
      onClick: revision?.canRevise ? () => void revision.rejectAll() : card.dismiss,
    }),
    render.button({
      label: labels.approve,
      variant: 'primary',
      disabled: revision?.canRevise === true && revision.items.length === 0,
      onClick: () => (destructive ? card.setConfirmOpen(true) : void card.execute()),
    }),
  )
}

function previewRows<Node>(
  revision: CardRevision | undefined,
  card: PendingOperationCardActions,
  labels: PendingOperationCardLabels,
  destructive: boolean,
  render: PendingOperationCardRenderers<Node>,
): PendingOperationFrame<Node>['items'] | null {
  if (!revision?.canRevise) return null
  return revision.items.map((item) => {
    const field = item.fields.length === 1 ? item.fields[0] : undefined
    return {
      id: item.itemId,
      label: item.entityName,
      meta: field?.newValue
        ? `${labels.fieldLabels[field.field] ?? field.field}: ${field.newValue}`
        : labels.pending,
      status: card.status,
      irreversible: destructive && card.status == null,
      editable: item.fields.some((entry) => entry.valueType !== 'action'),
      control: card.status == null ? render.removeItem(
        `${labels.remove} ${item.entityName}`,
        card.busy || revision.busy,
        () => void revision.rejectItem(item.itemId),
      ) : undefined,
    }
  })
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
  const revision = card.revision
  if (revision?.rejected) return render.notice(`${labels.rejected} ${labels.name}`)
  if (revision?.stale) return render.notice(labels.stale)

  const { destructive, action, frameState } = getPendingOperationCardPresentation(
    pendingOperation.riskClass, pendingOperation.confirmationRequirement,
    card.busy || revision?.busy === true, card.status,
  )
  const actions = pendingActions(action, destructive, card, revision, labels, render)
  const previewItems = previewRows(revision, card, labels, destructive, render)
  const blockFrame = render.blockFrame({
    state: frameState,
    title: previewItems ? labels.name : labels.pendingTitle,
    items: previewItems ?? [{
      id: pendingOperation.id,
      label: labels.name,
      meta: labels.pending,
      status: card.status,
      irreversible: destructive && card.status == null,
    }],
    ...(revision?.canRevise ? {
      editLabel: labels.edit,
      onEditItem: revision.startEdit,
    } : {}),
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

  const editSheet = revision?.editingItem
    ? render.editSheet({
        item: revision.editingItem,
        draft: revision.draft,
        labels,
        busy: revision.busy,
        error: revision.error,
        onChange: revision.setDraftField,
        onClose: revision.closeEdit,
        onSave: () => void revision.saveEdit(),
      })
    : null
  return render.fragment(blockFrame, confirmSheet, verification, editSheet)
}
