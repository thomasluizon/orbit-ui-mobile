import type { PendingAgentOperation, PendingOperationItem } from '../types/ai'
import type {
  PendingOperationCardStatus,
  PreparedPendingOperationStepUp,
  PendingOperationExecutionResult,
} from '../hooks/pending-operation-card-core'
import { getPendingOperationCardPresentation } from '../hooks/pending-operation-card-core'
import { isPendingOperationEditableField } from '../hooks/pending-operation-revision-core'
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
  stale: boolean
  error: string | undefined
  items: readonly PendingOperationItem[]
  onSelectItem: (itemId: string) => void
  onChange: (field: string, value: string) => void
  onClose: () => void
  onSave: () => Promise<boolean>
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
    proposed?: boolean
    wrapLabel?: boolean
    control?: Node
  }[]
  proposedLabel?: string
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
  actionRow: (...children: Node[]) => Node
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
    editedItemIds: readonly string[]
    busy: boolean
    stale: boolean
    rejected: boolean
    error: string | undefined
    setDraftField: (field: string, value: string) => void
    closeEdit: () => void
    startEdit: (itemId: string) => void
    saveEdit: () => Promise<boolean>
    rejectItem: (itemId: string) => Promise<boolean>
    rejectAll: () => Promise<boolean>
  }
}

type CardRevision = NonNullable<PendingOperationCardActions['revision']>

function previewValue(field: PendingOperationItem['fields'][number], labels: PendingOperationCardLabels): string {
  const value = field.newValue ?? ''
  if (field.valueType === 'boolean') return value === 'true' ? labels.yes : labels.no
  if (field.field === 'days') return value.split(',').map((day) => labels.dayLabels[day.trim()] ?? day.trim()).join(', ')
  return value
}

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
  const reject = render.button({
    label: revision?.canRevise ? labels.reject : labels.cancel,
    variant: 'ghost',
    onClick: revision?.canRevise ? () => void revision.rejectAll() : card.dismiss,
  })
  const approve = render.button({
    label: labels.approve,
    variant: 'primary',
    disabled: revision?.canRevise === true && revision.items.length === 0,
    onClick: () => (destructive ? card.setConfirmOpen(true) : void card.execute()),
  })
  if (!revision?.canRevise) return render.fragment(reject, approve)
  return render.actionRow(
    approve,
    render.button({
      label: labels.edit,
      variant: 'ghost',
      disabled: revision.items.every((item) => item.fields.every((field) => !isPendingOperationEditableField(field))),
      onClick: () => {
        const item = revision.items.find((entry) => entry.fields.some(isPendingOperationEditableField))
        if (item) revision.startEdit(item.itemId)
      },
    }),
    reject,
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
    const edited = revision.editedItemIds.includes(item.itemId)
    const summary = item.fields.map((field) => {
      const name = labels.fieldLabels[field.field] ?? field.field
      const value = previewValue(field, labels)
      return value ? `${name}: ${value}` : name
    }).join(' · ')
    return {
      id: item.itemId,
      label: item.entityName,
      meta: edited ? `${labels.edited} · ${summary || labels.pending}` : summary || labels.pending,
      status: card.status,
      irreversible: destructive && card.status == null,
      proposed: card.status == null && !edited,
      wrapLabel: true,
      control: card.status == null && !revision.stale ? render.removeItem(
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
  if (revision?.stale && !revision.editingItem) return render.notice(labels.stale)

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
    proposedLabel: labels.proposed,
    risk: render.risk(labels.risk),
    irreversibleLabel: labels.irreversible,
    confirmNote: labels.confirmNote,
    actions: revision?.stale ? undefined : actions,
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
        stale: revision.stale,
        error: revision.error,
        items: revision.items,
        onSelectItem: revision.startEdit,
        onChange: revision.setDraftField,
        onClose: revision.closeEdit,
        onSave: revision.saveEdit,
      })
    : null
  return render.fragment(blockFrame, confirmSheet, verification, editSheet,
    revision?.error && !revision.editingItem && !revision.stale ? render.notice(labels.invalid) : null)
}
