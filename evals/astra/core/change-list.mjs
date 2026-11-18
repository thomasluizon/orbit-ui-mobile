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
  viewApiKeys: 'view',
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
// Producer: AnnotateOfferField (Offers.cs:380-383) marks `stored` each row whose field is not in the requested_fields of
// the offer metadata, or, without that metadata, each row whose field is no argument with a value. The list is written
// once, when the preview is first built (Offers.cs:179, :214-216). So a stored row is a change that the server derives
// (AddChanges diffs the whole record, so a repeat reminder offer also changes reminder_enabled), a field that the model
// clears, or a field that a later revision of the preview writes. The row cannot tell them apart; the held writes can.
export function writtenFields(trace) {
  if (!Array.isArray(trace?.calls)) return null
  const written = new Set()
  // A write clears a field through clear_fields, clear_parent (IsExplicitlyCleared, Offers.cs:316-318) or an empty
  // array (HasValue, ProactiveProposal.cs:169-170); a null argument keeps the value (BulkUpdateHabitsTool.cs:16).
  const visit = (value) => {
    if (Array.isArray(value)) { value.forEach(visit); return }
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (key === 'clear_fields' && Array.isArray(child)) child.forEach((name) => written.add(name))
      else if (key === 'clear_parent' && child === true) written.add('parent_habit_id')
      else if (Array.isArray(child) && !child.length) written.add(key)
      else if (key === 'edits_json' && typeof child === 'string') visitEdits(JSON.parse(child))
      visit(child)
    }
  }
  // A revision of a held preview (revise_pending_changes) gives its edits as the JSON text edits_json, which the server
  // parses before it holds the revision (RevisePendingChangesTool.cs:75-81). Each edited field, a value or a null that
  // clears it (ReviseClearField), is a model write that ApplyEdits never adds to requested_fields
  // (PendingOperationRevisionService.cs:543-561), so the preview of the revision marks it stored.
  const visitEdits = (edits) => {
    for (const key of Object.keys(edits ?? {})) written.add(key)
    visit(edits)
  }
  for (const call of trace.calls.filter((call) => call.resultStatus === 'PendingConfirmation')) visit(call.arguments)
  return [...written].toSorted()
}

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

// Producer: PendingAgentOperationStore.Map holds a read behind a step-up as a preview without items and without changes.
// PendingOperationActionKeys names the API key read viewApiKeys: the approval shows the keys and changes no record.
const heldRead = (operation, items) => !items.length && kindByActionKey[operation.actionKey] === 'view'

// Producer: AgentArgumentPreview.FormatValue shows a value of a held write as its JSON text: a number as its digits and
// a boolean as True or False.
const shownValue = (value) => typeof value === 'boolean' ? (value ? 'True' : 'False') : typeof value === 'number' ? String(value) : value
// The records that the child drafts of a create add (CreationFields, above): each draft that names no stored habit is
// one create with the values of its draft, and the drafts below it follow it. A draft with no parent of its own goes under
// the stored habit that the reused item (PreviewCreateAsync gives it as its entity id) or the enclosing draft names; a
// new parent has no stored id and gives no parent field. Only `nestedCreates` holds them: the launch corpus sets it, and
// the core set does not, so each core verdict stays as it is under rule B1 of #2129.
const childCreates = (drafts, preview, parent) => Array.isArray(drafts) ? drafts.flatMap((draft) => [
  ...recordId(draft?.habit_id) ? [] : [{ kind: 'create', target: null, preview, offered: {}, derived: {}, undetermined: {}, drafts: [],
    fields: { ...parent ? { parent_habit_id: parent } : {}, ...Object.fromEntries(Object.entries(draft ?? {}).map(([field, value]) => [field, shownValue(value)])
      .filter(([, value]) => typeof value === 'string' && value !== '')) } }],
  ...childCreates(draft?.sub_habits, preview, recordId(draft?.habit_id))]) : []

// The change list of the held previews: one entry for each record a preview changes, with the kind of the change, the
// record, the fields that the model writes, the fields that the preview offers, the fields that the server derives, and
// the titles of the records that the offered drafts add. A stored row is written when the held writes name its field
// (`written`, from writtenFields), and derived otherwise; without the trace (`written` null) it is undetermined. A row
// of a create preview that only names a habit the create reuses is no change.
export function changeList(pendingOperations, written = null, { nestedCreates = false } = {}) {
  const changes = []
  const unclassified = []
  for (const operation of pendingOperations ?? []) {
    const items = previewItems(operation)
    if (heldRead(operation, items)) {
      changes.push({ kind: 'view', target: null, preview: operation.id, fields: {}, offered: {}, derived: {}, undetermined: {}, drafts: [] })
    }
    for (const item of items) {
      const kind = itemKind(item, operation.actionKey)
      if (!kind) { unclassified.push(operation.actionKey ?? 'a preview without an action key'); continue }
      const children = nestedCreates && kind === 'create'
        ? item.fields.filter((field) => field.field === 'sub_habits' && !isOffer(field)).flatMap((field) => childCreates(field.proposedValue, operation.id, recordId(item.entityId))) : []
      if (kind === 'create' && item.fields.some(marksExistingHabit)) { changes.push(...children); continue }
      const offers = item.fields.filter(isOffer)
      const stored = item.fields.filter((field) => field.provenance === 'stored')
      const derived = written ? stored.filter((field) => !written.includes(field.field)) : []
      const undetermined = written ? [] : stored
      const requested = item.fields.filter((field) => !isOffer(field) && !derived.includes(field) && !undetermined.includes(field))
      changes.push({ kind, target: recordId(item.entityId), preview: operation.id, fields: changedFields(requested, kind),
        offered: changedFields(offers, kind), derived: changedFields(derived, kind), undetermined: changedFields(undetermined, kind),
        drafts: offeredDrafts(offers) }, ...children)
    }
  }
  return { changes, unclassified: [...new Set(unclassified)] }
}
