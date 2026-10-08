import type { AgentOperationResult, PendingAgentOperation, PendingOperationChange, PendingOperationItem } from '../types/ai'
import type {
  PendingOperationCardStatus,
  PreparedPendingOperationStepUp,
  PendingOperationExecutionResult,
} from '../hooks/pending-operation-card-core'
import { getPendingOperationCardPresentation } from '../hooks/pending-operation-card-core'
import { isPendingOperationEditableField } from '../hooks/pending-operation-revision-core'
import type { PendingOperationCardLabels } from './pending-operation-card'
import { getActionChipNavigation } from './action-chips'

export interface PendingOperationButtonSpec {
  disabled?: boolean
  label: string
  accessibleName?: string
  loading?: boolean
  onClick: () => void
  variant?: 'destructive' | 'ghost' | 'primary' | 'secondary'
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
  open: boolean
  onClosed: () => void
  onClose: () => void
  onCompleted: (result: PendingOperationExecutionResult) => void
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

interface PendingOperationFrameBase<Node> {
  title: string
  wrapTitle?: boolean
  focusTitleOnMount?: boolean
  body?: Node
  count?: number
  items: readonly {
    id: string
    label: string | Node
    meta: string
    status: PendingOperationCardStatus
    irreversible: boolean
    proposed?: boolean
    wrapLabel?: boolean
    wrapMeta?: boolean
    editable?: boolean
    control?: Node
  }[]
  proposedLabel?: string
  irreversibleLabel: string
  confirmNote: string
  actions: Node | undefined
}

export type PendingOperationFrame<Node> = PendingOperationFrameBase<Node> & (
  | { state: 'stale'; staleMessage: string; onRefresh?: () => void; refreshLabel?: string }
  | { state: 'acting' | 'partiallyFailed' | 'resting' | 'loading'; staleMessage?: never; onRefresh?: never }
)

export interface PendingOperationCardRenderers<Node> {
  blockFrame: (props: PendingOperationFrame<Node>) => Node
  button: (spec: PendingOperationButtonSpec) => Node
  confirmSheet: (props: PendingOperationConfirmSheetProps) => Node
  stepUp: (props: { message: string; actionLabel: string; onAction: () => void; busy: boolean }) => Node
  verification: (props: PendingOperationVerificationProps) => Node
  editSheet: (props: PendingOperationEditSheetProps) => Node
  removeItem: (label: string, disabled: boolean, onClick: () => void) => Node
  notice: (message: string) => Node
  actionRow: (...children: Node[]) => Node
  fragment: (...children: (Node | null | undefined)[]) => Node
  spacer: () => Node
  rejected: (message: string) => Node
}

export interface PendingOperationCardActions {
  busy: boolean
  confirmOpen: boolean
  dismissed: boolean
  preparedStepUp: PreparedPendingOperationStepUp | undefined
  closingStepUp: PreparedPendingOperationStepUp | undefined
  status: PendingOperationCardStatus
  completedOperation?: AgentOperationResult
  canRetry?: boolean
  focusTitleOnMount?: boolean
  openableCapability?: boolean
  onOpenTarget?: (entityId: string, actionType: string) => void
  completeStepUp: (result: PendingOperationExecutionResult) => void
  closeStepUp: () => void
  clearClosingStepUp: () => void
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
    canRefresh: boolean
    refresh: () => Promise<void>
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
type PreviewItem = Pick<PendingOperationItem, 'itemId' | 'entityId' | 'entityName' | 'fields' | 'removesData'>

const NAVIGABLE_OPERATION_ACTIONS: Readonly<Record<string, string | null>> = {
  create_habit: 'CreateHabit', update_habit: 'UpdateHabit', create_sub_habit: 'CreateSubHabit',
  duplicate_habit: 'DuplicateHabit', move_habit: 'MoveHabit', move_habit_parent: 'MoveHabit',
  log_habit: 'LogHabit', skip_habit: 'SkipHabit', update_checklist: 'UpdateHabit',
  link_goals_to_habit: 'UpdateHabit', reorder_habits: 'ReorderHabits',
  bulk_update_habit_emojis: 'UpdateHabit', bulk_update_habits: 'UpdateHabit',
  bulk_reschedule_habits: 'UpdateHabit', bulk_log_habits: 'BulkLogHabits',
  bulk_skip_habits: 'BulkSkipHabits', bulk_create_habits: 'CreateHabit',
  create_goal: 'CreateGoal', update_goal: 'UpdateGoal', update_goal_status: 'UpdateGoalStatus',
  update_goal_progress: 'UpdateGoalProgress', link_habits_to_goal: 'LinkHabitsToGoal',
  reorder_goals: 'ReorderGoals',
  suggest_breakdown: null, delete_habit: null, bulk_delete_habits: null, delete_goal: null,
  assign_tags: null, create_tag: null, update_tag: null, delete_tag: null,
  update_profile_preferences: null, set_ai_memory: null, set_ai_summary: null,
  update_notifications: null, delete_notifications: null, manage_calendar_sync: null,
  create_checklist_template: null, delete_checklist_template: null,
  delete_user_facts: null, manage_subscription: null, manage_api_keys: null,
  send_support_request: null, manage_account: null,
  CreateHabit: 'CreateHabit', UpdateHabit: 'UpdateHabit', CreateGoal: 'CreateGoal', UpdateGoal: 'UpdateGoal',
}

function completedTargetControl<Node>(
  targetId: string | null | undefined,
  entityName: string,
  card: PendingOperationCardActions,
  labels: PendingOperationCardLabels,
  render: PendingOperationCardRenderers<Node>,
): Node | undefined {
  const operation = card.completedOperation
  if (card.status !== 'done' || !card.openableCapability || !operation || !targetId) return undefined
  const actionType = NAVIGABLE_OPERATION_ACTIONS[operation.sourceName]
  if (!actionType) return undefined
  const navigation = getActionChipNavigation({ type: actionType, status: 'Success', entityId: targetId }, Boolean(card.onOpenTarget))
  return navigation.navigable
    ? render.button({ label: labels.open, accessibleName: labels.openNamed(entityName), variant: 'ghost', onClick: () => card.onOpenTarget?.(navigation.entityId, navigation.actionType) })
    : undefined
}

function itemControl<Node>(
  item: PreviewItem,
  itemCount: number,
  revision: CardRevision,
  card: PendingOperationCardActions,
  labels: PendingOperationCardLabels,
  render: PendingOperationCardRenderers<Node>,
): Node | undefined {
  const targetId = itemCount === 1
    ? card.completedOperation?.targetId ?? item.entityId
    : item.entityId
  const open = completedTargetControl(targetId, item.entityName, card, labels, render)
  if (open || card.status != null || revision.stale) return open
  return render.removeItem(`${labels.remove} ${item.entityName}`, card.busy || revision.busy, () => void revision.rejectItem(item.itemId))
}

function pendingActions<Node>(
  action: 'none' | 'stepUp' | 'buttons',
  destructive: boolean,
  count: number,
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
    label: labels.reject,
    variant: 'ghost',
    onClick: revision?.canRevise ? () => void revision.rejectAll() : card.dismiss,
  })
  const approve = render.button({
    label: labels.approve(count),
    variant: 'primary',
    disabled: revision?.canRevise === true && revision.items.length === 0,
    onClick: () => (destructive ? card.setConfirmOpen(true) : void card.execute()),
  })
  if (!revision?.canRevise) return render.actionRow(approve, render.spacer(), reject)
  const firstEditableItem = revision.items.find((item) => item.fields.some(isPendingOperationEditableField))
  if (!firstEditableItem) return render.actionRow(approve, render.spacer(), reject)
  return render.actionRow(
    approve,
    render.button({
      label: labels.edit,
      variant: 'ghost',
      onClick: () => revision.startEdit(firstEditableItem.itemId),
    }),
    render.spacer(),
    reject,
  )
}

function previewRows<Node>(
  pendingOperation: PendingAgentOperation,
  card: PendingOperationCardActions,
  labels: PendingOperationCardLabels,
  render: PendingOperationCardRenderers<Node>,
): PendingOperationFrame<Node>['items'] | null {
  const revision = card.revision
  const items = pendingOperation.items?.length ? pendingOperation.items : groupedChanges(pendingOperation.changes ?? [])
  if (!items.length) return null
  const rows = items.map((item) => {
    const edited = revision?.editedItemIds.includes(item.itemId) === true
    const summary = labels.summarize(item.fields) || labels.pending
    return {
      id: item.itemId,
      label: item.fields.find((field) => ['title', 'name'].includes(field.field))?.newValue || item.entityName || labels.name,
      meta: edited ? `${labels.edited} · ${summary}` : summary,
      status: card.status,
      irreversible: item.removesData === true && card.status == null,
      proposed: card.status == null && !edited,
      wrapLabel: true,
      wrapMeta: true,
      editable: false,
      control: revision?.canRevise
        ? itemControl(item, items.length, revision, card, labels, render)
        : completedTargetControl(items.length === 1 ? card.completedOperation?.targetId ?? item.entityId : item.entityId, item.entityName, card, labels, render),
    }
  })
  const remaining = Math.max(0, (pendingOperation.changeTargetCount ?? items.length) - items.length)
  if (remaining > 0) rows.push({
    id: 'remaining', label: labels.more(remaining), meta: '', status: card.status,
    irreversible: false, proposed: false, wrapLabel: true, wrapMeta: true, editable: false, control: undefined,
  })
  return rows
}

function groupedChanges(changes: readonly PendingOperationChange[]): PreviewItem[] {
  const groups = new Map<string, PreviewItem>()
  for (const change of changes) {
    const item = groups.get(change.entityId)
    if (item) item.fields.push(change)
    else groups.set(change.entityId, {
      itemId: change.entityId, entityId: change.entityId, entityName: change.entityName,
      fields: [change],
    })
  }
  return [...groups.values()]
}

function previewBody<Node>(
  card: PendingOperationCardActions,
  labels: PendingOperationCardLabels,
  render: PendingOperationCardRenderers<Node>,
): Node | undefined {
  if (card.status !== 'failed') return undefined
  if (card.completedOperation?.status === 'Denied') return render.notice(labels.denied)
  if (card.completedOperation?.status === 'UnsupportedByPolicy') return render.notice(labels.unsupported)
  return render.notice(labels.failed)
}

function targetCount(operation: PendingAgentOperation): number {
  return operation.changeTargetCount ?? operation.items?.length
    ?? Math.max(1, new Set(operation.changes?.map((change) => change.entityId)).size)
}

function previewFrame<Node>(
  pendingOperation: PendingAgentOperation,
  card: PendingOperationCardActions,
  labels: PendingOperationCardLabels,
  render: PendingOperationCardRenderers<Node>,
  presentation: ReturnType<typeof getPendingOperationCardPresentation>,
): Node {
  const revision = card.revision
  const actions = pendingActions(presentation.action, presentation.destructive, targetCount(pendingOperation), card, revision, labels, render)
  const previewItems = previewRows(pendingOperation, card, labels, render)
  const frameBase: PendingOperationFrameBase<Node> = {
    title: previewItems ? labels.name : labels.pendingTitle,
    wrapTitle: true,
    focusTitleOnMount: card.focusTitleOnMount,
    body: previewBody(card, labels, render),
    count: pendingOperation.changeTargetCount ?? undefined,
    items: previewItems ?? [{
      id: pendingOperation.id, label: labels.name, meta: labels.pending,
      status: card.status, irreversible: false,
    }],
    proposedLabel: labels.proposed,
    irreversibleLabel: labels.irreversible,
    confirmNote: labels.confirmNote,
    actions: revision?.stale ? undefined : actions,
  }
  if (revision?.stale && !revision.busy) return render.blockFrame({
    ...frameBase, state: 'stale',
    staleMessage: `${revision.canRefresh ? labels.stale : labels.staleUnavailable}${revision.error ? ` ${labels.refreshFailed}` : ''}`,
    refreshLabel: labels.refresh,
    onRefresh: revision.canRefresh ? () => void revision.refresh() : undefined,
  })
  return render.blockFrame({ ...frameBase, state: revision?.stale ? 'loading' : presentation.frameState })
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
  const revision = card.revision
  if (card.dismissed || revision?.rejected) return render.fragment(render.rejected(labels.rejected(targetCount(pendingOperation))))

  const deletionCount = pendingOperation.items?.filter((item) => item.removesData === true).length ?? 0
  const presentation = getPendingOperationCardPresentation(
    deletionCount > 0, pendingOperation.confirmationRequirement,
    card.busy || revision?.busy === true, card.status, card.canRetry,
  )
  const openableCapability = pendingOperation.capabilityId === 'habits.write'
    || pendingOperation.capabilityId === 'habits.bulk.write'
    || pendingOperation.capabilityId === 'goals.write'
  const blockFrame = previewFrame(pendingOperation, { ...card, openableCapability }, labels, render, presentation)
  const confirmSheet = render.confirmSheet({
    open: card.confirmOpen && presentation.destructive,
    title: labels.confirmTitle(deletionCount),
    message: labels.confirmBody(deletionCount),
    confirmLabel: labels.confirm,
    destructive: presentation.destructive,
    onCancel: () => card.setConfirmOpen(false),
    onConfirm: () => {
      card.setConfirmOpen(false)
      void card.execute()
    },
  })
  const verificationPreparation = card.preparedStepUp ?? card.closingStepUp
  const verification = verificationPreparation
    ? render.verification({
        pendingOperationId: pendingOperation.id,
        prepared: verificationPreparation,
        open: card.preparedStepUp !== undefined,
        onClosed: card.clearClosingStepUp,
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
  return render.fragment(render.rejected(''), blockFrame, confirmSheet, verification, editSheet,
    revision?.error && !revision.editingItem && !revision.stale ? render.notice(labels.invalid) : null)
}
