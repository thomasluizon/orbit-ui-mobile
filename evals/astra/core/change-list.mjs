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

// The change list of the held previews: one entry for each record a preview changes, with the kind of the change, the
// record, the fields that the model writes, the fields that the preview offers, the fields that the server derives, and
// the titles of the records that the offered drafts add. A stored row is written when the held writes name its field
// (`written`, from writtenFields), and derived otherwise; without the trace (`written` null) it is undetermined. A row
// of a create preview that only names a habit the create reuses is no change.
export function changeList(pendingOperations, written = null) {
  const changes = []
  const unclassified = []
  for (const operation of pendingOperations ?? []) {
    for (const item of previewItems(operation)) {
      const kind = itemKind(item, operation.actionKey)
      if (!kind) { unclassified.push(operation.actionKey ?? 'a preview without an action key'); continue }
      if (kind === 'create' && item.fields.some(marksExistingHabit)) continue
      const offers = item.fields.filter(isOffer)
      const stored = item.fields.filter((field) => field.provenance === 'stored')
      const derived = written ? stored.filter((field) => !written.includes(field.field)) : []
      const undetermined = written ? [] : stored
      const requested = item.fields.filter((field) => !isOffer(field) && !derived.includes(field) && !undetermined.includes(field))
      changes.push({ kind, target: recordId(item.entityId), preview: operation.id, fields: changedFields(requested, kind),
        offered: changedFields(offers, kind), derived: changedFields(derived, kind), undetermined: changedFields(undetermined, kind),
        drafts: offeredDrafts(offers) })
    }
  }
  return { changes, unclassified: [...new Set(unclassified)] }
}
