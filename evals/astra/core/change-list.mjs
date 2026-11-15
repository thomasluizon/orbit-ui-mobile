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
// Producer: AnnotateOfferField marks a field that the model listed in suggested_fields `suggested` with a `removal`: an
// offer that the person approves or removes in the same preview. PreviewAsync also marks the default date of a create
// `suggested`, with no removal. The client shows a field as an offer only with a removal (suggestedFieldRemovals of
// pending-operation-card-view.ts), and so does the change list. An offer is no change that the request names.
const isOffer = (field) => field.provenance === 'suggested' && field.removal != null
// Producer: AnnotateOfferField marks a field that the model did not write `stored`. An update shows it only when the
// server derives a change from the written fields: AddChanges diffs the whole record, so a repeat reminder offer also
// changes reminder_enabled. A derived field is no change that the request names.
const isDerived = (field) => field.provenance === 'stored'

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
// and AddChildOfferFields gives an offer of a child draft the row path `sub_habits/<n>/<field>`. The records that the
// offered drafts of an item add: the title of each draft that names no stored habit, taken once under its outermost
// offered row. Habit.Create saves the title trimmed.
const draftTitles = (drafts) => Array.isArray(drafts) ? drafts.flatMap((draft) => [
  ...recordId(draft?.habit_id) ? [] : [String(draft?.title ?? '').trim()], ...draftTitles(draft?.sub_habits)]) : []
function offeredDrafts(offers) {
  const rows = offers.filter((field) => /(?:^|\/)sub_habits$/u.test(field.field))
  return rows.filter((row) => !rows.some((outer) => row.field.startsWith(`${outer.field}/`))).flatMap((row) => draftTitles(row.proposedValue))
}

// The change list of the held previews: one entry for each record a preview changes, with the kind of the change, the
// record, the fields that the request changes, the fields that the preview offers, the fields that the server derives,
// and the titles of the records that the offered drafts add. A row of a create preview that only names a habit the
// create reuses is no change.
export function changeList(pendingOperations) {
  const changes = []
  const unclassified = []
  for (const operation of pendingOperations ?? []) {
    for (const item of previewItems(operation)) {
      const kind = itemKind(item, operation.actionKey)
      if (!kind) { unclassified.push(operation.actionKey ?? 'a preview without an action key'); continue }
      if (kind === 'create' && item.fields.some(marksExistingHabit)) continue
      const offers = item.fields.filter(isOffer)
      changes.push({ kind, target: recordId(item.entityId), preview: operation.id,
        fields: changedFields(item.fields.filter((field) => !isOffer(field) && !isDerived(field)), kind),
        offered: changedFields(offers, kind), derived: changedFields(item.fields.filter(isDerived), kind), drafts: offeredDrafts(offers) })
    }
  }
  return { changes, unclassified: [...new Set(unclassified)] }
}
