import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { buildChatClientContext } from '../../../packages/shared/src/chat/client-context.ts'
import { beforeEach } from '../hooks.mjs'
import AstraHttpProvider from '../http-provider.mjs'
import { fileURLToPath } from 'node:url'
import { composition } from '../composition.mjs'
import parseResponse from '../response.mjs'
import { behavior, structural } from '../assertions.mjs'
import { offlineCredentials, refreshResponse } from './fixtures/credentials.mjs'
import { chatResponse, preview } from './fixtures/producer.mjs'

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
    expect(['data', 'text', 'preview', 'outcome']).toContain(scenario.vars.composition?.mode)
  }
  expect(configuration.defaultTest.vars).not.toHaveProperty('clientContextJson')
  expect(configuration.defaultTest.vars).not.toHaveProperty('composition')
})
it('keeps legacy previews limited to their readable aiMessage for grading', async () => {
  const scenario = scenarios.find((entry) => entry.metadata.id === 'legacy-create-pt')
  expect(scenario).toBeDefined()
  const test = await prepare(scenario)
  expect(test.vars.clientContextJson).toBe('{}')
  expect(test.vars.composition.mode).toBe('fallback')
  const response = { ...chatResponse(test.vars.evalRequestId), aiMessage: 'Confira a prévia de Meditar.', pendingOperations: [preview('Hidden operation field')] }
  vi.stubGlobal('fetch', async () => Response.json(response, { headers: { 'x-orbit-request-id': test.vars.evalRequestId } }))
  const provider = new AstraHttpProvider({ config: { ...configuration.providers[0].config, url: 'https://astra.invalid/api/chat',
    transformResponse: `file://${fileURLToPath(new URL('../response.mjs', import.meta.url))}`,
  } })
  const { output } = await provider.callApi(test.vars.input, { vars: test.vars })
  expect(output.answer).toBe(response.aiMessage)
  expect(output.composition.pendingOperations).toEqual(response.pendingOperations)
})
it('grades only an explicitly expected typed legacy moderation refusal with bound identity', async () => {
  const scenario = scenarios.find((entry) => entry.metadata.id === 'legacy-moderation-pt')
  expect(scenario).toBeDefined()
  const test = await prepare(scenario)
  expect(test.vars.clientContextJson).toBe('{}')
  const body = { error: 'Não posso ajudar com isso, mas posso ajudar com seus hábitos e metas.', errorCode: 'CONTENT_MODERATION_REFUSED' }
  const parse = (response = body, requestId = test.vars.evalRequestId) => parseResponse(response, '', {
    vars: test.vars, response: { status: 400, headers: { 'x-orbit-request-id': requestId } },
  })
  const context = { vars: test.vars }
  expect(parse().answer).toBe(body.error)
  expect(behavior(parse(), context).pass).toBe(true)
  expect((await structural(parse(), context)).pass).toBe(true)
  expect(composition(parse(), context).pass).toBe(true)
  expect(behavior(parse(body, 'wrong-request'), context).pass).toBe(false)
  expect(behavior(parse(), { vars: { ...test.vars, expectedHttpStatus: 200 } }).pass).toBe(false)
  expect(parse({ ...body, errorCode: 'OTHER_ERROR' })).toHaveProperty('error')
  expect(parse({ error: body.error })).toHaveProperty('error')
})

vi.mock('../fixtures/reset.mjs', async (importOriginal) => ({ ...await importOriginal(), resetFixture: vi.fn() }))
