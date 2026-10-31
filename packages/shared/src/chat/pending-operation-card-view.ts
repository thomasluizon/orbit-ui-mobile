import { pendingOperationSubHabits } from './pending-operation-sub-habits'
import { groupPendingOperationItems } from './pending-operation-item-groups'
import type { AgentOperationResult, HabitPlacement, PendingAgentOperation, PendingOperationChange, PendingOperationItem, PendingOperationFieldOptions, PendingOperationPlacement } from '../types/ai'
import type {
  PendingOperationCardStatus,
  PreparedPendingOperationStepUp,
  PendingOperationExecutionResult,
} from '../hooks/pending-operation-card-core'
import { getPendingOperationCardPresentation, getPendingOperationItemResults } from '../hooks/pending-operation-card-core'
import { isPendingOperationEditableField } from '../hooks/pending-operation-revision-core'
import type { PendingOperationCardLabels } from './pending-operation-card'
import { getActionChipNavigation } from './action-chips'
import type { AstraNextAction } from '../types/astra-offer'

export interface PreviewItemTitleProps {
  meta?: string
  title: string
  icon?: string
  proposed?: boolean
  rename?: { label: string; disabled: boolean; onSave: (title: string) => Promise<boolean>; onDraftChange?: (title: string | undefined) => void }
}


export interface PendingOperationButtonSpec {
  icon?: 'refresh' | 'close' | 'edit'
  disabled?: boolean
  focusRequest?: number
  shouldFocus?: () => boolean
  label: string
  hint?: string
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
    groupHeading?: string
    label: string | Node
    meta: string
    status: PendingOperationCardStatus
    irreversible: boolean
    proposed?: boolean
    wrapLabel?: boolean
    wrapMeta?: boolean
    indented?: boolean
    editable?: boolean
    body?: Node
    control?: Node
    icon?: string
    rename?: NonNullable<PreviewItemTitleProps['rename']>
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
  offer?: (action: AstraNextAction, disabled: boolean) => Node
  blockFrame: (props: PendingOperationFrame<Node>) => Node
  button: (spec: PendingOperationButtonSpec) => Node
  confirmSheet: (props: PendingOperationConfirmSheetProps) => Node
  stepUp: (props: { message: string; actionLabel: string; onAction: () => void; busy: boolean }) => Node
  verification: (props: PendingOperationVerificationProps) => Node
  editSheet: (props: PendingOperationEditSheetProps) => Node
  parentChoice: (props: { itemId: string; focusRequest?: number; shouldFocus?: () => boolean; itemName: string; field: PendingOperationFieldOptions; labels: PendingOperationCardLabels; disabled: boolean; onSelect: (value: unknown, ownsFocus?: () => boolean) => void }) => Node
  placementChoice: (props: { itemId: string; itemName: string; placement: PendingOperationPlacement; labels: PendingOperationCardLabels; disabled: boolean; busy: boolean; onSelect: (value: HabitPlacement) => void }) => Node
  removeItem: (label: string, disabled: boolean, onClick: () => void) => Node
  notice: (message: string) => Node
  fragment: (...children: (Node | null | undefined)[]) => Node
  rejected: (message: string) => Node
}

export interface PendingOperationCardActions {
  busy: boolean
  parentChoiceFocus?: { request: number; shouldFocus: () => boolean }
  hasRequiredChoices?: boolean
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
    errorSource?: 'revision' | 'refresh'
    setDraftField: (field: string, value: string) => void
    closeEdit: () => void
    startEdit: (itemId: string) => void
    saveEdit: () => Promise<boolean>
    hasRequiredChoices?: boolean
    chooseParent?: (itemId: string, value: unknown, ownsFocus?: () => boolean) => Promise<boolean>
    switchPlacement?: (itemId: string, value: HabitPlacement) => Promise<boolean>
    hasTitleDrafts?: boolean
    setTitleDraft?: (itemId: string, title: string | undefined) => void
    renameItem?: (itemId: string, title: string) => Promise<boolean>
    rejectSubHabit?: (itemId: string, index: number) => Promise<boolean>
    rejectItem: (itemId: string) => Promise<boolean>
    removeField?: (itemId: string, field: PendingOperationChange) => Promise<boolean>
    rejectAll: () => Promise<boolean>
  }
}

type CardRevision = NonNullable<PendingOperationCardActions['revision']>
type PreviewItem = Pick<PendingOperationItem, 'itemId' | 'entityId' | 'entityName' | 'entityEmoji' | 'habitType' | 'fields' | 'removesData' | 'fieldOptions' | 'placement'>

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
  status = card.status,
): Node | undefined {
  const operation = card.completedOperation
  if (status !== 'done' || !card.openableCapability || !operation || !targetId) return undefined
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
  status: PendingOperationCardStatus,
  completedTargetId?: string | null,
): Node | undefined {
  const targetId = completedTargetId ?? (itemCount === 1
    ? card.completedOperation?.targetId ?? item.entityId
    : item.entityId)
  const open = completedTargetControl(targetId, item.entityName, card, labels, render, status)
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
    busy: card.busy || revision?.busy === true || revision?.hasTitleDrafts === true || card.hasRequiredChoices === true,
  })
  if (action !== 'buttons') return undefined
  if (card.status === 'failed') return render.fragment(render.button({
    label: labels.retry,
    icon: 'refresh',
    disabled: card.busy || revision?.busy === true || card.hasRequiredChoices === true,
    variant: 'primary',
    onClick: () => (destructive ? card.setConfirmOpen(true) : void card.execute()),
  }))
  const reject = render.button({
    label: labels.reject,
    icon: 'close',
    disabled: card.busy || revision?.busy === true,
    variant: 'ghost',
    onClick: revision?.canRevise ? () => void revision.rejectAll() : card.dismiss,
  })
  const approve = render.button({
    label: labels.approve(count),
    accessibleName: labels.approveName?.(count),
    focusRequest: card.hasRequiredChoices ? undefined : card.parentChoiceFocus?.request,
    shouldFocus: card.parentChoiceFocus?.shouldFocus,
    hint: card.hasRequiredChoices ? labels.parentChoiceRequired : undefined,
    variant: 'primary',
    disabled: card.busy || revision?.busy === true || revision?.hasTitleDrafts === true || card.hasRequiredChoices === true || (revision?.canRevise === true && revision.items.length === 0),
    onClick: () => (destructive ? card.setConfirmOpen(true) : void card.execute()),
  })
  if (!revision?.canRevise) return render.fragment(reject, approve)
  const firstEditableItem = revision.items.find((item) => item.fields.some(isPendingOperationEditableField))
  if (!firstEditableItem) return render.fragment(reject, approve)
  return render.fragment(
    reject,
    render.button({
      label: labels.edit,
      icon: 'edit',
      disabled: card.busy || revision.busy,
      variant: 'ghost',
      onClick: () => revision.startEdit(firstEditableItem.itemId),
    }),
    approve,
  )
}

function parentChoiceBody<Node>(
  item: PreviewItem,
  field: PendingOperationFieldOptions | undefined,
  firstParentChoiceId: string | undefined,
  card: PendingOperationCardActions,
  labels: PendingOperationCardLabels,
  render: PendingOperationCardRenderers<Node>,
): Node | undefined {
  if (!field || card.status != null) return undefined
  const revision = card.revision
  return render.parentChoice({
    itemId: item.itemId, itemName: item.entityName, field, labels,
    focusRequest: item.itemId === firstParentChoiceId ? card.parentChoiceFocus?.request : undefined,
    shouldFocus: card.parentChoiceFocus?.shouldFocus,
    disabled: card.busy || revision?.busy === true || revision?.stale === true || !revision?.canRevise,
    onSelect: (value, ownsFocus) => { void revision?.chooseParent?.(item.itemId, value, ownsFocus) },
  })
}

function previewItemBody<Node>(
  item: PreviewItem, parentChoice: PendingOperationFieldOptions | undefined, firstParentChoiceId: string | undefined,
  card: PendingOperationCardActions, labels: PendingOperationCardLabels, render: PendingOperationCardRenderers<Node>,
): Node | undefined {
  const parent = parentChoiceBody(item, parentChoice, firstParentChoiceId, card, labels, render)
  if (!item.placement || card.status != null) return parent
  const revision = card.revision
  return render.fragment(parent, render.placementChoice({
    itemId: item.itemId, itemName: item.entityName, placement: item.placement, labels,
    busy: card.busy || revision?.busy === true,
    disabled: card.busy || !revision?.canRevise || revision.busy || revision.stale
      || revision.hasTitleDrafts === true || Boolean(revision.editingItem),
    onSelect: (value) => { void revision?.switchPlacement?.(item.itemId, value) },
  }))
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
  const firstParentChoiceId = items.find((item) => item.fieldOptions?.some((field) => field.field === 'parent_habit_id'))?.itemId
  const results = getPendingOperationItemResults(card.completedOperation)
  const resultsByIndex = new Map(results?.map((result) => [result.index, result]))
  const groups = groupPendingOperationItems(items.map((item, index) => ({ item, index, habitType: item.habitType })))
    .map(group => ({ ...group, heading: group.habitType ? labels.itemGroup(group.habitType) : undefined }))
  const rows: PendingOperationFrame<Node>['items'][number][] = groups.flatMap(group => group.items.flatMap(({ item, index }, groupIndex) => {
    const result = resultsByIndex.get(index)
    const status: PendingOperationCardStatus = result ? result.status === 'Success' ? 'done' : 'failed'
      : results || card.status === 'failed' ? undefined : card.status
    const edited = revision?.editedItemIds.includes(item.itemId) === true
    const parentChoice = item.fieldOptions?.find((field) => field.field === 'parent_habit_id')
    const summary = placementSummary(item, pendingOperation, labels, Boolean(parentChoice))
    const parent: PendingOperationFrame<Node>['items'][number] = {
      id: item.itemId,
      groupHeading: groupIndex === 0 ? group.heading : undefined,
      label: item.fields.find((field) => ['title', 'name'].includes(field.field))?.newValue || item.entityName || labels.name,
      icon: item.fields.find((field) => field.field === 'emoji')?.newValue || item.entityEmoji || undefined,
      rename: revision?.canRevise && revision.renameItem && card.status == null && !revision.stale
        && item.fields.some((field) => field.field === 'title' && isPendingOperationEditableField(field))
        ? { label: labels.fieldLabels.title!, disabled: card.busy || revision.busy,
            onSave: (title: string) => revision.renameItem!(item.itemId, title),
            onDraftChange: (title: string | undefined) => revision.setTitleDraft?.(item.itemId, title) } : undefined,
      body: previewItemBody(item, parentChoice, firstParentChoiceId, card, labels, render),
      meta: edited ? `${labels.edited} · ${summary}` : summary,
      status,
      irreversible: item.removesData === true && card.status == null,
      proposed: card.status == null && !edited,
      wrapLabel: true,
      wrapMeta: true,
      editable: false,
      control: revision?.canRevise
        ? itemControl(item, items.length, revision, card, labels, render, status, result?.habitId)
        : completedTargetControl(result?.habitId ?? (items.length === 1 ? card.completedOperation?.targetId ?? item.entityId : item.entityId), item.entityName, card, labels, render, status),
    }
    return [parent, ...offeredFieldRows(item, card, labels, render), ...(item.placement?.selected === 'checklist_item' ? [] : pendingOperationSubHabits(item.fields)).map((child, childIndex) => ({
      id: `${item.itemId}-child-${childIndex}`, label: child.title,
      icon: child.fields.find((field) => field.field === 'emoji')?.newValue ?? undefined,
      meta: labels.summarize(child.fields, 'createHabit'), indented: true,
      status, irreversible: false, proposed: parent.proposed, wrapLabel: true, wrapMeta: true, editable: false,
      control: revision?.canRevise && revision.rejectSubHabit && card.status == null && !revision.stale
        && item.fields.some((field) => field.field === 'sub_habits' && field.isEditable === true)
        ? render.removeItem(`${labels.remove} ${child.title}`, card.busy || revision.busy,
          () => { void revision.rejectSubHabit!(item.itemId, childIndex) }) : undefined,
    }))]
  }))
  const remaining = Math.max(0, (pendingOperation.changeTargetCount ?? items.length) - items.length)
  if (remaining > 0) rows.push({
    id: 'remaining', label: labels.more(remaining), meta: '', status: undefined,
    irreversible: false, proposed: false, wrapLabel: true, wrapMeta: true, editable: false, control: undefined,
  })
  return rows
}

const HABIT_ONLY_PREVIEW_FIELDS = new Set([
  'frequency_unit', 'frequency_quantity', 'is_bad_habit', 'is_general', 'is_flexible', 'parent_habit_id', 'checklist_items', 'sub_habits',
  'days', 'due_date', 'due_time', 'due_end_time', 'end_date', 'reminder_enabled', 'reminder_times', 'scheduled_reminders', 'slip_alert_enabled',
])

function placementSummary(item: PreviewItem, operation: PendingAgentOperation, labels: PendingOperationCardLabels, parentChoice: boolean): string {
  const placement = item.placement
  const creating = operation.actionKey === 'applyAccountChanges' && operation.capabilityId === 'chat.changes'
    && item.fields.some((field) => HABIT_ONLY_PREVIEW_FIELDS.has(field.field))
    && !item.fields.some((field) => field.field === 'habit_id' || field.oldValue != null)
  const summary = labels.summarize(item.fields.filter((field) => !(parentChoice || placement) || field.field !== 'parent_habit_id'), creating ? 'createHabit' : undefined)
  if (!placement) return summary || labels.pending
  const selected = labels.placementOption(placement.selected, placement.destinationName)
  return placement.selected === 'checklist_item' || !summary ? selected : `${selected} · ${summary}`
}

function offeredFieldRows<Node>(item: PreviewItem, card: PendingOperationCardActions, labels: PendingOperationCardLabels, render: PendingOperationCardRenderers<Node>): PendingOperationFrame<Node>['items'] {
  if (card.status != null) return []
  const revision = card.revision
  return item.fields.filter(field => field.provenance === 'suggested').map(field => {
    const name = labels.fieldLabels[field.field.split('/').at(-1)!] ?? field.field
    const disabled = card.busy || revision?.busy === true || revision?.stale === true
    return {
      id: `${item.itemId}:offer:${field.field}`, label: field.field.includes('/') ? `${field.entityName}: ${name}` : name,
      meta: field.newValue ?? '', status: undefined, irreversible: false, proposed: true,
      wrapLabel: true, wrapMeta: true, indented: true,
      control: revision?.canRevise ? render.fragment(
        render.button({ label: `${labels.edit} ${name}`, icon: 'edit', disabled, onClick: () => revision.startEdit(item.itemId) }),
        field.removal && revision.removeField ? render.removeItem(`${labels.remove} ${name}`, disabled, () => { void revision.removeField!(item.itemId, field) }) : undefined,
      ) : undefined,
    }
  })
}

function groupedChanges(changes: readonly PendingOperationChange[]): PreviewItem[] {
  const groups = new Map<string, PreviewItem>()
  for (const change of changes) {
    const item = groups.get(change.entityId)
    if (item) {
      item.fields.push(change)
      item.entityEmoji ||= change.entityEmoji
    }
    else groups.set(change.entityId, {
      itemId: change.entityId, entityId: change.entityId, entityName: change.entityName, entityEmoji: change.entityEmoji,
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
  if (card.status == null && card.hasRequiredChoices) return render.notice(labels.parentChoiceRequired)
  if (card.status !== 'failed') return undefined
  if (card.completedOperation?.status === 'Denied') return render.notice(labels.denied)
  if (card.completedOperation?.status === 'UnsupportedByPolicy') return render.notice(labels.unsupported)
  if (card.canRetry) return render.notice(labels.failed)
  return render.notice(getPendingOperationItemResults(card.completedOperation)?.length
    ? labels.batchFailed : labels.unavailableRecovery)
}

function targetCount(operation: PendingAgentOperation): number {
  return operation.changeTargetCount ?? operation.items?.length
    ?? Math.max(1, new Set(operation.changes?.map((change) => change.entityId)).size)
}

function frameBody<Node>(operation: PendingAgentOperation, card: PendingOperationCardActions, labels: PendingOperationCardLabels, render: PendingOperationCardRenderers<Node>): Node | undefined {
  if (card.revision?.stale) return undefined
  return render.fragment(previewBody(card, labels, render), operation.nextAction && card.status == null
    ? render.offer?.(operation.nextAction, card.busy || card.revision?.busy === true) : undefined)
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
    body: frameBody(pendingOperation, card, labels, render),
    count: pendingOperation.changeTargetCount ?? undefined,
    items: previewItems ?? [{
      id: pendingOperation.id, label: labels.name, meta: labels.pending,
      status: card.status === 'failed' ? undefined : card.status, irreversible: false,
    }],
    proposedLabel: labels.proposed,
    irreversibleLabel: labels.irreversible,
    confirmNote: labels.confirmNote,
    actions: revision?.stale ? undefined : actions,
  }
  if (revision?.stale && !revision.busy) return render.blockFrame({
    ...frameBase, state: 'stale',
    staleMessage: revision.errorSource === 'refresh' ? labels.refreshFailed : revision.canRefresh ? labels.stale : labels.staleUnavailable,
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

  if (card.status == null && (pendingOperation.changeTargetCount === 0 || (pendingOperation.changeTargetCount == null
    && pendingOperation.items?.length === 0 && !pendingOperation.changes?.length))) return render.notice(labels.empty)

  const deletionCount = pendingOperation.items?.filter((item) => item.removesData === true).length ?? 0
  const presentation = getPendingOperationCardPresentation(
    deletionCount > 0, pendingOperation.confirmationRequirement,
    card.busy || revision?.busy === true, card.status, card.canRetry,
  )
  const openableCapability = pendingOperation.capabilityId === 'habits.write'
    || pendingOperation.capabilityId === 'habits.bulk.write'
    || pendingOperation.capabilityId === 'goals.write'
  const blockFrame = previewFrame(pendingOperation, { ...card, openableCapability, hasRequiredChoices: pendingOperation.items?.some((item) => item.fieldOptions?.some((field) => field.required)) }, labels, render, presentation)
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
