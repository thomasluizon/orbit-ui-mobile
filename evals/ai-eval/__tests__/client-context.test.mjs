import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { buildChatClientContext } from '../../../packages/shared/src/chat/client-context.ts'
import { beforeEach } from '../hooks.mjs'
import OrbitHttpProvider from '../http-provider.mjs'
import { fileURLToPath } from 'node:url'
import { composition } from '../composition.mjs'
import gradingInput from '../grading-input.mjs'
import { outcome } from '../client-path.mjs'
import { offlineCredentials, refreshResponse } from './fixtures/credentials.mjs'
import { chatResponse, preview } from './fixtures/producer.mjs'
import { captures } from './fixtures/core-streams.mjs'

const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
const scenarios = parse(readFileSync(new URL('../scenarios.yaml', import.meta.url), 'utf8'))
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
async function prepare(scenario) {
  offlineCredentials()
  vi.stubGlobal('fetch', async (url) => new URL(url).pathname === '/health'
    ? Response.json({ status: 'Healthy', commit: null, checks: [] }) : refreshResponse())
  return (await beforeEach({ test: structuredClone(scenario) })).test
}
it.each(['web', 'mobile'])('sends the shared shipped context and a preview policy for %s', async (platform) => {
  const scenario = scenarios.find((entry) => entry.metadata.id === 'single-create-pt')
  const test = await prepare({ ...scenario, metadata: { ...scenario.metadata, platform },
    vars: { ...configuration.defaultTest.vars, ...scenario.vars } })
  expect(test.vars.clientContext).toEqual(buildChatClientContext({ platform, locale: 'pt-BR' }))
  expect(JSON.parse(test.vars.clientContextJson)).toEqual(test.vars.clientContext)
  expect(test.vars.composition.mode).toBe('preview')
  const context = { vars: test.vars }
  const response = { ...chatResponse(test.vars.evalRequestId), aiMessage: '', parts: [], pendingOperations: [preview('Meditar')] }
  expect(composition({ composition: response }, context).pass).toBe(true)
  response.aiMessage = 'Meditar todos os dias.'
  response.parts = [{ type: 'text', text: response.aiMessage }]
  expect(composition({ composition: response }, context).pass).toBe(false)
})
it('assigns an explicit parts composition policy to every main catalog case', () => {
  for (const scenario of scenarios.filter((entry) => entry.vars.clientContext === undefined)) {
    expect(scenario.metadata.platform).toMatch(/^(web|mobile)$/)
    expect(['data', 'text', 'clarification', 'preview', 'outcome']).toContain(scenario.vars.composition?.mode)
  }
  expect(configuration.defaultTest.vars).not.toHaveProperty('clientContextJson')
  expect(configuration.defaultTest.vars).not.toHaveProperty('composition')
})
// The legacy profile language calls of a pt-BR case with no locale in its context, and the chat reply of the test.
function legacyApi(reply, requests = []) {
  let language = 'en'
  return async (url, options) => {
    if (new URL(url).pathname === '/api/profile/language') {
      language = JSON.parse(options.body).language
      return new Response(null, { status: 204 })
    }
    if (new URL(url).pathname === '/api/profile') return Response.json({ language })
    const request = new Request(url, options)
    requests.push({ path: new URL(url).pathname, context: JSON.parse((await request.formData()).get('clientContext')) })
    return reply(request.headers.get('x-orbit-request-id'))
  }
}
const provider = () => new OrbitHttpProvider({ config: { ...configuration.providers[0].config, url: 'https://orbit.invalid/api/chat',
  transformResponse: `file://${fileURLToPath(new URL('../response.mjs', import.meta.url))}` } })
const legacyContext = [{ path: '/api/chat/stream', context: { conversationId: expect.stringMatching(/^[0-9a-f-]{36}$/u) } }]

it('keeps legacy previews limited to their readable aiMessage for grading on the client path', async () => {
  const scenario = scenarios.find((entry) => entry.metadata.id === 'legacy-create-pt')
  expect(scenario).toBeDefined()
  const test = await prepare(scenario)
  expect(test.vars.clientContext).toEqual({})
  expect(test.vars.composition.mode).toBe('fallback')
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
  const held = preview('Meditar')
  held.items[0].fields = [['title', 'Meditar'], ['frequency_unit', 'Day'], ['frequency_quantity', '1']].map(([field, value]) => (
    { ...held.items[0].fields[0], field, newValue: value, proposedValue: value, valueType: 'text' }))
  const response = { ...captures.complete.turns[0].at(-1).response, ...chatResponse(test.vars.evalRequestId), parts: undefined,
    aiMessage: 'Confira a prévia de Meditar.', pendingOperations: [held] }
  const requests = []
  vi.stubGlobal('fetch', legacyApi((requestId) => new Response([...captures.complete.turns[0].slice(0, -1), { type: 'final', response, evalTrace: response.evalTrace }]
    .map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream', 'x-orbit-request-id': requestId } }), requests))
  const { output } = await provider().callApi(test.vars.input, { vars: test.vars })
  expect(requests).toEqual(legacyContext)
  expect(output.answer).toBe(response.aiMessage)
  expect(output.composition.pendingOperations).toEqual(response.pendingOperations)
  const context = { vars: test.vars }
  expect(outcome(output, context)).toMatchObject({ pass: true })
  expect(composition(output, context)).toMatchObject({ pass: true })
})
it('grades only an explicitly expected typed legacy moderation refusal with bound identity on the client path', async () => {
  const scenario = scenarios.find((entry) => entry.metadata.id === 'legacy-moderation-pt')
  expect(scenario).toBeDefined()
  const test = await prepare(scenario)
  expect(test.vars.clientContext).toEqual({})
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
  const body = { error: 'Não posso ajudar com isso, mas posso ajudar com seus hábitos e metas.', errorCode: 'CONTENT_MODERATION_REFUSED' }
  const requests = []
  async function refused(response = body, requestId) {
    vi.stubGlobal('fetch', legacyApi((sent) => Response.json(response, { status: 400, headers: { 'x-orbit-request-id': requestId ?? sent } }), requests))
    return provider().callApi(test.vars.input, { vars: test.vars })
  }
  const context = { vars: test.vars }
  const { output, error } = await refused()
  expect(error).toBeUndefined()
  expect(requests).toEqual(legacyContext)
  expect(output.answer).toBe(body.error)
  expect(outcome(output, context)).toMatchObject({ pass: true, reason: 'The request was refused with HTTP 400 (CONTENT_MODERATION_REFUSED).' })
  expect(composition(output, context)).toMatchObject({ pass: true, reason: 'Verified concise legacy moderation refusal.' })
  expect(JSON.parse(gradingInput(output, context)).groundingEvidence.httpError).toMatchObject({ status: 400, errorCode: 'CONTENT_MODERATION_REFUSED' })
  expect(JSON.parse(gradingInput((await refused(body, 'wrong-request')).output, context)).groundingEvidence).not.toHaveProperty('httpError')
  expect(outcome(output, { vars: { ...test.vars, expectedHttpStatus: 403 } }).pass).toBe(false)
  const other = await refused({ ...body, errorCode: 'OTHER_ERROR' })
  expect(outcome(other.output, context)).toMatchObject({ pass: false,
    reason: 'The request was refused with HTTP 400 (OTHER_ERROR); the case expects HTTP 400 (CONTENT_MODERATION_REFUSED).' })
})

vi.mock('../fixtures/reset.mjs', async (importOriginal) => ({ ...await importOriginal(), resetFixture: vi.fn() }))
