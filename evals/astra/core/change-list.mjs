import { tsImport } from 'tsx/esm/api'

const { marksExistingHabit } = await tsImport('../../../packages/shared/src/chat/pending-operation-item-summary.ts', import.meta.url)

// Producer: orbit-api PendingOperationActionKeys gives each held preview the actionKey its card is drawn from. The single
// and the bulk form of one write are one kind. A key outside this table is not classified; it is never guessed.
const kindByActionKey = {
  createHabit: 'create', createHabits: 'create', createSubHabit: 'create',
  updateHabit: 'update', updateHabits: 'update', rescheduleHabits: 'update', updateHabitEmojis: 'update',
  deleteHabit: 'delete', deleteHabits: 'delete',
  logHabit: 'log', logHabits: 'log',
  skipHabit: 'skip', skipHabits: 'skip',
}
// Producer: AccountChangeSet.PreviewAsync joins the items of its member previews under this key and keeps no member key.
const combinedActionKey = 'applyAccountChanges'
// Producer: AgentArgumentPreview.Build gives the rows of a write without a stored record the empty GUID as their record id.
export const recordId = (id) => typeof id === 'string' && !/^[0-]+$/u.test(id) ? id : null
// Producer: PendingOperationChangePreviewer.AnnotateOfferField marks each field that the model listed in suggested_fields
// `suggested`: configuration that the request did not name and that the person approves or removes in the same preview
// (ProactiveProposal.Instruction). A suggestion is no change of the request; the change list keeps it apart.
const isSuggested = (field) => field.provenance === 'suggested'

// A preview without items lists its fields flat; the cards group them by record, and so does this.
function previewItems(operation) {
  if (operation.items?.length) return operation.items
  const groups = new Map()
  for (const field of operation.changes ?? []) {
    const key = recordId(field.entityId) ?? ''
    if (!groups.has(key)) groups.set(key, { entityId: recordId(field.entityId), entityName: field.entityName, fields: [] })
    groups.get(key).fields.push(field)
  }
  return [...groups.values()]
}

// Producer: PendingOperationChangePreviewer.BuildActionChange marks a deletion with one `delete` field of value type
// `action`, and AgentArgumentPreview.SkipAction marks a skip with an `action` field of value `skip`. A member of a
// combined preview that names no action creates a record when it has no stored record, and changes one otherwise.
function itemKind(item, actionKey) {
  const action = item.fields.find((field) => field.valueType === 'action')
  if (action?.field === 'delete') return 'delete'
  if (action?.field === 'action' && action.newValue === 'skip') return 'skip'
  if (actionKey === combinedActionKey) return recordId(item.entityId) ? 'update' : 'create'
  return kindByActionKey[actionKey] ?? null
}

function changedFields(fields, kind) {
  const changed = fields.filter((field) => field.valueType !== 'action' && field.field !== 'habit_id'
    && (kind === 'create' ? field.newValue != null && field.newValue !== '' : field.oldValue !== field.newValue))
  return Object.fromEntries(changed.map((field) => [field.field, field.newValue]))
}

// Producer: CreationFields gives a `sub_habits` row the child drafts as its proposedValue, each with its own children,
// and AddChildOfferFields gives a suggestion of a child draft the row path `sub_habits/<n>/<field>`. The records that the
// suggested drafts of an item add: each draft that names no stored habit, counted once under its outermost suggested row.
const draftCount = (drafts) => Array.isArray(drafts)
  ? drafts.reduce((count, draft) => count + (recordId(draft?.habit_id) ? 0 : 1) + draftCount(draft?.sub_habits), 0) : 0
function suggestedRecords(suggestions) {
  const rows = suggestions.filter((field) => /(?:^|\/)sub_habits$/u.test(field.field))
  return rows.filter((row) => !rows.some((outer) => row.field.startsWith(`${outer.field}/`)))
    .reduce((count, row) => count + draftCount(row.proposedValue), 0)
}

// The change list of the held previews: one entry for each record a preview changes, with the kind of the change, the
// record, the fields that the request changes, the fields that the preview suggests and the records that the suggested
// drafts add. A row of a create preview that only names a habit the create reuses is no change.
export function changeList(pendingOperations) {
  const changes = []
  const unclassified = []
  for (const operation of pendingOperations ?? []) {
    for (const item of previewItems(operation)) {
      const kind = itemKind(item, operation.actionKey)
      if (!kind) { unclassified.push(operation.actionKey ?? 'a preview without an action key'); continue }
      if (kind === 'create' && item.fields.some(marksExistingHabit)) continue
      const suggestions = item.fields.filter(isSuggested)
      changes.push({ kind, target: recordId(item.entityId), preview: operation.id,
        fields: changedFields(item.fields.filter((field) => !isSuggested(field)), kind),
        suggested: changedFields(suggestions, kind), suggestedRecords: suggestedRecords(suggestions) })
    }
  }
  return { changes, unclassified: [...new Set(unclassified)] }
}
