import { captures } from './core-streams.mjs'
import { fixtureFetch } from './public-api.mjs'

// The offline API of the core set CLI test: the fixture API of an eval account whose profile uses the 12-hour clock,
// the recorded staging stream of the capture that CORE_TEST_CAPTURE names, and an approval that saves what the held
// preview shows. CORE_TEST_TRACE=off turns off the trace flag of the account.
const account = { habits: [], goals: [], tags: [], templates: [], requests: [], pro: true, exhausted: false, capacity: 100,
  email: 'thomaslrgregorio+orbit-eval-pro@gmail.com', uses24HourClock: false, trace: process.env.CORE_TEST_TRACE !== 'off' }
const fixtureApi = fixtureFetch(() => account)
const capture = captures[process.env.CORE_TEST_CAPTURE]
const headers = { Authorization: 'Bearer pro-access', 'api-version': '2.0' }
const fixture = (method, path, body) => fixtureApi(`https://offline.invalid/api/${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) })

// The recorded record ids, mapped to the six children that the fixture reset created in the offline account.
// CORE_TEST_ACTION_KEY gives the held preview another action key, as an API key that the grader does not know.
async function recordedEvents(turn) {
  const { habits } = await (await fixture('GET', 'eval/snapshot')).json()
  const children = habits.filter((habit) => habit.title === 'Water - 710ml').map((habit) => habit.id)
  const events = JSON.parse(capture.children.reduce((text, id, index) => text.replaceAll(id, children[index]), JSON.stringify(capture.turns[turn])))
  const actionKey = process.env.CORE_TEST_ACTION_KEY
  if (actionKey) for (const preview of events.at(-1).response.pendingOperations) preview.actionKey = actionKey
  return JSON.stringify(events)
}

// The chat context holds the clock setting of the profile, as the clients send it; pt-BR alone gives the 24-hour clock.
async function stream(options) {
  process.stderr.write('core-test: chat turn sent\n')
  const request = new Request('https://offline.invalid/', options)
  const form = await request.formData()
  if (JSON.parse(form.get('clientContext')).timeFormat !== '12h') throw new Error('Expected the clock setting of the account profile.')
  const turn = form.has('blockAnswer') ? 1 : 0
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
