import { randomUUID } from 'node:crypto'
import { tsImport } from 'tsx/esm/api'
import { outcome, runOutcomeCase } from '../../client-path.mjs'
import { readCorpus } from '../../grade-method.mjs'
import { preview } from './producer.mjs'

const { buildChatClientContext } = await tsImport('../../../../packages/shared/src/chat/client-context.ts', import.meta.url)

export const accountDate = '2026-11-13'
export const requestId = '77777777-7777-4777-8777-777777777777'
export const corpus = readCorpus()
export const caseOf = (id) => corpus.find((entry) => entry.metadata.id === id)
export const addDays = (offset, from = accountDate) => new Date(Date.parse(`${from}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10)

// The vars of one corpus case as the beforeEach hook leaves them: the client context that the case states over the shared
// one, the records of the fixture by name, and the habits that the reset left in the account.
export function preparedCase(id, { records, habits, ...extra }) {
  const source = caseOf(id)
  const vars = structuredClone(source.vars)
  const { platform = 'web', locale = 'en' } = source.metadata
  const built = buildChatClientContext({ platform, locale })
  const clientContext = !vars.clientContext ? built : vars.clientContext.supportsParts === true ? { ...built, ...vars.clientContext } : vars.clientContext
  return { ...vars, clientContext, accountDate, accountTimeZone: 'UTC', evalRequestId: requestId, records,
    fixtureEvidence: { habits: structuredClone(habits) }, ...extra }
}

// Producer: orbit-api ExportedHabit gives the snapshot row of a habit, and the habit detail gives its due time.
export const storedHabit = (id, title, fields = {}) => ({ id, title, frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: accountDate,
  checklistItems: [], logs: [], ...fields })

const row = (item, field) => item.fields.find((candidate) => candidate.field === field)?.newValue
const unit = (value) => value === 'OneTime' ? null : value

// The fixture API of one account. Approval saves what the held previews show, as the recorded execute did: a `delete`
// action removes the record, a field that the preview shows sets the stored value, and an item with no record creates
// one. A rejected preview, revised to hold no item, refuses confirmation unless `confirmsAfterRevise`.
export function account(habits, held, { confirmsAfterRevise = false } = {}) {
  const state = structuredClone(habits)
  const calls = []
  let revised = false
  const apply = (item) => {
    const index = state.findIndex((stored) => stored.id === item.entityId)
    if (item.fields.some((field) => field.field === 'delete')) { state.splice(index, 1); return }
    if (index < 0) {
      state.push(storedHabit(randomUUID(), row(item, 'title') ?? item.entityName, { frequencyUnit: unit(row(item, 'frequency_unit')),
        frequencyQuantity: row(item, 'frequency_quantity') ? Number(row(item, 'frequency_quantity')) : null,
        dueDate: row(item, 'due_date') ?? null, dueTime: row(item, 'due_time') ? `${row(item, 'due_time')}:00` : null }))
      return
    }
    for (const field of item.fields) {
      if (field.field === 'title') state[index].title = field.newValue
      if (field.field === 'due_date') state[index].dueDate = field.newValue
      if (field.field === 'checklist_items') state[index].checklistItems = JSON.parse(field.newValue).map(({ text, is_checked: isChecked }) => ({ text, isChecked }))
    }
  }
  const api = async (method, path, body) => {
    const route = path.split('?')[0]
    calls.push({ method, path: route, body })
    if (route === 'eval/snapshot') return { status: 200, payload: { habits: structuredClone(state) } }
    if (route === 'eval/pending-operations') return { status: 200, payload: { pendingCount: held.length } }
    if (route.startsWith('habits/')) return { status: 200, payload: structuredClone(state.find((stored) => stored.id === route.split('/')[1])) }
    const [, , id, action] = route.split('/')
    if (action === 'revise') { revised = true; return { status: 200, payload: {} } }
    if (action === 'confirm' && revised && !confirmsAfterRevise) return { status: 404, payload: null }
    if (action === 'confirm') return { status: 200, payload: { pendingOperationId: id, confirmationToken: 'offline-confirmation' } }
    for (const item of held.find((candidate) => candidate.id === id).items) apply(item)
    return { status: 200, payload: {} }
  }
  return { api, calls, state }
}

// The final response of a turn that the server sends, with the held previews or the blocks that the test gives.
export const turnOf = (fields) => ({ aiMessage: '', actions: [], operations: [], pendingOperations: [], parts: [], conversationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', ...fields })

// Runs one corpus case through the provider path of a converted case, against the replies that the test gives in order.
// `held` is what the account approves. Returns the output of the attempt, the requests that the account saw, and the verdict.
export async function attempt(id, { replies, held = replies.at(-1).pendingOperations ?? [], habits, records, confirmsAfterRevise, ...extra }) {
  const vars = preparedCase(id, { records, habits, ...extra })
  const fixture = account(habits, held, { confirmsAfterRevise })
  const sent = []
  let turn = 0
  const send = async (_conversation, attempted) => {
    sent.push(attempted)
    return { kind: 'final', response: replies[turn++], requestId, responseRequestId: requestId, trace: null }
  }
  const response = await runOutcomeCase(vars, { send, api: fixture.api })
  return { vars, sent, response, fixture, verdict: response.output ? outcome(response.output, { vars }) : { pass: false, reason: response.error } }
}

// Producer: orbit-api PendingOperationChangePreviewer. A bulk write previews each record as one item, with one row for
// each field that it changes.
export function itemOf(entityId, entityName, fields) {
  return { itemId: entityId ?? entityName, entityId, entityName, stateFingerprint: 'state', removesData: null,
    fields: Object.entries(fields).map(([field, [oldValue, newValue, valueType = 'text']]) => ({ entityId: entityId ?? '00000000-0000-0000-0000-000000000000',
      entityName, field, oldValue, newValue, valueType, proposedValue: newValue, isEditable: true })) }
}

export const previewOf = (actionKey, items, id = '11111111-1111-4111-8111-111111111111') => ({ ...preview(), id, actionKey,
  changeTargetCount: items.length, items })
