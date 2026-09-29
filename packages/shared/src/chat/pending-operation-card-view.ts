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
  diffLabel: (field: string, oldValue: string, newValue: string, accessible: string) => Node
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
  item: PendingOperationItem,
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

function previewValue(field: PendingOperationItem['fields'][number], labels: PendingOperationCardLabels): string {
  const value = field.newValue ?? ''
  if (field.valueType === 'boolean') return localizedBoolean(value, labels)
  if (field.valueType === 'time') return labels.formatTime(value)
  if (field.field === 'days') return value.split(',').map((day) => labels.dayLabels[day.trim()] ?? day.trim()).join(', ')
  return value
}

function localizedBoolean(value: string, labels: PendingOperationCardLabels): string {
  if (value.toLowerCase() === 'true') return labels.yes
  if (value.toLowerCase() === 'false') return labels.no
  return value
}

function changeValue(value: string | null, valueType: string, labels: PendingOperationCardLabels): string {
  if (value == null) return labels.notSet
  if (valueType === 'boolean') return localizedBoolean(value, labels)
  if (valueType === 'time') return labels.formatTime(value)
  return value
}

function actionLabel(field: string, labels: PendingOperationCardLabels): string {
  return labels.fieldLabels[field] ?? labels.name
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
  const firstEditableItem = revision.items.find((item) => item.fields.some(isPendingOperationEditableField))
  if (!firstEditableItem) return render.actionRow(approve, reject)
  return render.actionRow(
    approve,
    render.button({
      label: labels.edit,
      variant: 'ghost',
      onClick: () => revision.startEdit(firstEditableItem.itemId),
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
      wrapMeta: true,
      control: itemControl(item, revision.items.length, revision, card, labels, render),
    }
  })
}

function unshownItemRows<Node>(
  shownEntities: Set<string>,
  revision: CardRevision | undefined,
  card: PendingOperationCardActions,
  labels: PendingOperationCardLabels,
  render: PendingOperationCardRenderers<Node>,
  destructive: boolean,
): PendingOperationFrame<Node>['items'] {
  if (!revision?.canRevise) return []
  const rows: Array<PendingOperationFrame<Node>['items'][number]> = []
  for (const item of revision.items) {
    if (item.entityId != null && shownEntities.has(item.entityId)) continue
    const action = item.fields.find((field) => field.valueType === 'action')
    rows.push({
      id: item.itemId,
      label: action ? actionLabel(action.field, labels) : item.entityName,
      meta: action ? item.entityName : labels.pending,
      status: card.status,
      irreversible: destructive && card.status == null,
      wrapLabel: true,
      editable: false,
      control: itemControl(item, revision.items.length, revision, card, labels, render),
    })
    if (item.entityId != null) shownEntities.add(item.entityId)
  }
  return rows
}

function changeRows<Node>(
  changes: readonly PendingOperationChange[],
  count: number | null | undefined,
  card: PendingOperationCardActions,
  labels: PendingOperationCardLabels,
  render: PendingOperationCardRenderers<Node>,
  destructive: boolean,
  revision: CardRevision | undefined,
): PendingOperationFrame<Node>['items'] {
  const shownEntities = new Set<string>()
  const rows: Array<PendingOperationFrame<Node>['items'][number]> = changes.map((change, index) => {
    const field = change.valueType === 'action'
      ? actionLabel(change.field, labels)
      : labels.fieldLabels[change.field] ?? change.field
    const oldValue = changeValue(change.oldValue, change.valueType, labels)
    const newValue = changeValue(change.newValue, change.valueType, labels)
    const item = revision?.items.find((entry) => entry.entityId === change.entityId)
    const firstField = !shownEntities.has(change.entityId)
    shownEntities.add(change.entityId)
    return {
      id: `${change.entityId}-${change.field}-${index}`,
      label: change.valueType === 'action'
        ? field
        : render.diffLabel(field, oldValue, newValue, labels.diff(field, oldValue, newValue)),
      meta: change.entityName,
      status: card.status,
      irreversible: destructive && card.status == null,
      wrapLabel: true,
      editable: false,
      control: firstField ? completedTargetControl(count === 1 ? card.completedOperation?.targetId ?? change.entityId : change.entityId, change.entityName, card, labels, render) ?? (item && revision && card.status == null && !revision.stale
        ? render.removeItem(`${labels.remove} ${item.entityName}`, card.busy || revision.busy, () => void revision.rejectItem(item.itemId))
        : undefined) : undefined,
    }
  })
  rows.push(...unshownItemRows(shownEntities, revision, card, labels, render, destructive))
  const remaining = count == null ? 0 : Math.max(0, count - shownEntities.size)
  if (remaining > 0) rows.push({
    id: 'remaining', label: labels.more(remaining), meta: '', status: card.status,
    irreversible: false, wrapLabel: true, editable: false, control: undefined,
  })
  return rows
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

function previewFrame<Node>(
  pendingOperation: PendingAgentOperation,
  card: PendingOperationCardActions,
  labels: PendingOperationCardLabels,
  render: PendingOperationCardRenderers<Node>,
  presentation: ReturnType<typeof getPendingOperationCardPresentation>,
): Node {
  const revision = card.revision
  const actions = pendingActions(presentation.action, presentation.destructive, card, revision, labels, render)
  const previewItems = pendingOperation.changes?.length
    ? changeRows(pendingOperation.changes, pendingOperation.changeTargetCount, card, labels, render, presentation.destructive, revision)
    : previewRows(revision, card, labels, presentation.destructive, render)
  const frameBase: PendingOperationFrameBase<Node> = {
    title: previewItems ? labels.name : labels.pendingTitle,
    wrapTitle: true,
    focusTitleOnMount: card.focusTitleOnMount,
    body: previewBody(card, labels, render),
    count: pendingOperation.changeTargetCount ?? undefined,
    items: previewItems ?? [{
      id: pendingOperation.id, label: labels.name, meta: labels.pending,
      status: card.status, irreversible: presentation.destructive && card.status == null,
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
  if (card.dismissed) return null
  const revision = card.revision
  if (revision?.rejected) return render.notice(`${labels.rejected} ${labels.name}`)

  const presentation = getPendingOperationCardPresentation(
    pendingOperation.riskClass, pendingOperation.confirmationRequirement,
    card.busy || revision?.busy === true, card.status, card.canRetry,
  )
  const openableCapability = pendingOperation.capabilityId === 'habits.write'
    || pendingOperation.capabilityId === 'habits.bulk.write'
    || pendingOperation.capabilityId === 'goals.write'
  const blockFrame = previewFrame(pendingOperation, { ...card, openableCapability }, labels, render, presentation)
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
  return render.fragment(blockFrame, confirmSheet, verification, editSheet,
    revision?.error && !revision.editingItem && !revision.stale ? render.notice(labels.invalid) : null)
}
