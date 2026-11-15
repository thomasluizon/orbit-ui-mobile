import './auth-preload.mjs'
import { captures } from './core-streams.mjs'

// The offline API of the core set CLI test: the fixture API of auth-preload.mjs, the recorded staging stream of the
// capture that CORE_TEST_CAPTURE names, and an approval that saves what the held preview shows.
const fixtureApi = globalThis.fetch
const capture = captures[process.env.CORE_TEST_CAPTURE]
const headers = { Authorization: 'Bearer pro-access', 'api-version': '2.0' }
const fixture = (method, path, body) => fixtureApi(`https://offline.invalid/api/${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) })

// The recorded record ids, mapped to the six children that the fixture reset created in the offline account.
async function recordedEvents(turn) {
  const { habits } = await (await fixture('GET', 'eval/snapshot')).json()
  const children = habits.filter((habit) => habit.title === 'Water - 710ml').map((habit) => habit.id)
  return capture.children.reduce((text, id, index) => text.replaceAll(id, children[index]), JSON.stringify(capture.turns[turn]))
}

async function stream(options) {
  const request = new Request('https://offline.invalid/', options)
  const turn = (await request.formData()).has('blockAnswer') ? 1 : 0
  const text = JSON.parse(await recordedEvents(turn)).map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')
  return new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

async function approve(id, action) {
  if (action === 'confirm') return Response.json({ pendingOperationId: id, confirmationToken: 'offline-confirmation' })
  const held = JSON.parse(await recordedEvents(1)).at(-1).response.pendingOperations.find((preview) => preview.id === id)
  for (const item of held.items) {
    const title = item.fields.find((field) => field.field === 'title')?.newValue
    if (title) await fixture('PUT', `habits/${item.entityId}`, { title, frequencyUnit: 'Day', frequencyQuantity: 1 })
    else await fixture('DELETE', `habits/${item.entityId}`)
  }
  return Response.json({})
}

globalThis.fetch = async (url, options) => {
  const [, , resource, kind, id, action] = new URL(url).pathname.split('/')
  if (resource === 'chat' && kind === 'stream') return stream(options)
  if (resource === 'ai' && kind === 'pending-operations') return approve(id, action)
  return fixtureApi(url, options)
}
