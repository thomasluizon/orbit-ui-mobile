import { captures } from './core-streams.mjs'

const parentId = '33333333-3333-4333-8333-333333333333'
const walkId = '55555555-5555-4555-8555-555555555555'
const habit = (id, title) => ({ id, title, logs: [] })

// The offline account of one recorded capture: the parent, its six recorded children in list order, and Walk.
export function recordedAccount(name) {
  const { children } = captures[name]
  return { records: { parent: parentId, children: [...children], walk: walkId },
    habits: [habit(parentId, 'Water'), ...children.map((id) => habit(id, 'Water - 710ml')), habit(walkId, 'Walk')] }
}

// Replays the recorded stream of each turn as the API sends it: one `data:` line for each event, in chunks that cut
// through an event, and the request id echoed on the response.
export function recordedStream(name, requests = []) {
  let turn = 0
  return async (url, options) => {
    const request = new Request(url, options)
    requests.push({ url: String(url), headers: Object.fromEntries(request.headers), form: await request.formData() })
    const text = captures[name].turns[turn++].map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')
    const bytes = new TextEncoder().encode(text)
    const cut = Math.floor(bytes.length / 2)
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(bytes.slice(0, cut))
      controller.enqueue(bytes.slice(cut))
      controller.close()
    } }), { status: 200, headers: { 'content-type': 'text/event-stream', 'x-orbit-request-id': request.headers.get('x-orbit-request-id') } })
  }
}

// The fixture API of one recorded capture. Approval saves what the held preview shows, as the recorded execute did:
// a `delete` action removes the record and a `title` field renames it. Each request is kept for the test to read.
export function recordedApi(name, account, calls = []) {
  const state = structuredClone(account.habits)
  const held = captures[name].turns.at(-1).at(-1).response.pendingOperations
  return async (method, path, body) => {
    calls.push({ method, path: path.split('?')[0], body })
    if (path === 'eval/snapshot') return { status: 200, payload: { habits: structuredClone(state) } }
    if (path === 'eval/pending-operations') return { status: 200, payload: { pendingCount: held.length } }
    const [, , id, action] = path.split('?')[0].split('/')
    if (action === 'confirm') return { status: 200, payload: { pendingOperationId: id, confirmationToken: 'offline-confirmation' } }
    for (const item of held.find((preview) => preview.id === id).items) {
      const index = state.findIndex((stored) => stored.id === item.entityId)
      if (item.fields.some((field) => field.field === 'delete')) state.splice(index, 1)
      else state[index].title = item.fields.find((field) => field.field === 'title').newValue
    }
    return { status: 200, payload: {} }
  }
}

export const requestVars = (name, core, overrides = {}) => {
  const account = recordedAccount(name)
  return { account, vars: { credentialKey: 'ORBIT_EVAL_TOKEN', accountDate: '2026-11-13', accountTimeZone: 'UTC',
    evalRequestId: '77777777-7777-4777-8777-777777777777', ...overrides,
    core: { ...structuredClone(core), baseline: account.habits, records: account.records } } }
}
