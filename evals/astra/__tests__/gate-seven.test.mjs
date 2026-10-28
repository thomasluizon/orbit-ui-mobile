import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { behavior } from '../assertions.mjs'
import { visibleAnswer } from '../visible-answer.mjs'
import { buildChatClientContext } from '../../../packages/shared/src/chat/client-context.ts'
import { beforeEach as prepareAttempt } from '../hooks.mjs'
import AstraHttpProvider from '../http-provider.mjs'
import { fixtureFetch } from './fixtures/public-api.mjs'
import { offlineCredentials } from './fixtures/credentials.mjs'
import { toolCall, chatResponse } from './fixtures/producer.mjs'

const corpus = ['scenarios.yaml', 'composition-scenarios.yaml'].flatMap((file) =>
  parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')))
const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
const recorded = JSON.parse(readFileSync(new URL('./fixtures/gate-seven.json', import.meta.url), 'utf8'))
const scenario = (id) => structuredClone(corpus.find((entry) => entry.metadata.id === id))
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

function grade(test, calls) {
  return behavior({ trace: { state: 'available', requestId: 'request', responseRequestId: 'request',
    calls: calls.map(({ status, ...call }) => ({ ...call, resultStatus: status })) } },
  { vars: { ...test.vars, evalRequestId: 'request' } })
}
it('replays the valid nested medical bulk call with strict dates and cadence', () => {
  const test = scenario('composition-medical-batch-en')
  test.vars = JSON.parse(JSON.stringify(test.vars).replaceAll('{accountYear}', '2026'))
  const args = structuredClone(recorded.at(-1).toolCalls.find(({ name }) => name === 'bulk_create_habits').arguments)
  args.habits[1].sub_habits = args.habits.splice(2)
  expect(grade(test, [toolCall('bulk_create_habits', args, 'PendingConfirmation')]).pass).toBe(true)
  for (const wrong of ['date', 'cadence', 'extra']) {
    const supplied = structuredClone(args)
    if (wrong === 'date') supplied.habits[0].due_date = '2026-10-27'
    if (wrong === 'cadence') supplied.habits[1].sub_habits[0].frequency_unit = 'Week'
    if (wrong === 'extra') supplied.habits[1].sub_habits.push({ title: 'Unrequested' })
    expect(grade(test, [toolCall('bulk_create_habits', supplied, 'PendingConfirmation')]).pass).toBe(false)
  }
  const invalid = recorded.find(({ caseId }) => caseId === 'composition-medical-batch-en')
  expect(grade(test, [toolCall('bulk_create_habits', invalid.toolCalls[0].arguments, 'PendingConfirmation')]).pass).toBe(false)
})
it.each(['en', 'pt-BR'])('accepts existing parent wrappers only for the seeded identities in %s', (locale) => {
  const test = scenario(`composition-existing-parents-${locale}`)
  const args = structuredClone(recorded.find(({ caseId }) => caseId === 'composition-existing-parents-en').toolCalls[1].arguments)
  const parentTitles = locale === 'en' ? ['Post Lunch', 'Before Bed'] : ['Depois do almoço', 'Antes de dormir']
  args.habits.forEach((parent, index) => {
    parent.title = parentTitles[index]
    parent.habit_id = index ? '{secondHabitId}' : '{habitId}'
    parent.sub_habits[0].parent_habit_id = parent.habit_id
    if (locale === 'pt-BR') parent.sub_habits[0].title = index ? 'Tomar rosuvastatina' : 'Tomar vitamina D'
  })
  expect(grade(test, [toolCall('bulk_create_habits', args, 'PendingConfirmation')]).pass).toBe(true)
  args.habits[0].habit_id = 'wrong-parent'
  expect(grade(test, [toolCall('bulk_create_habits', args, 'PendingConfirmation')]).pass).toBe(false)
})
it('projects the skipped row state parsed by the shared client schema', () => {
  const client = buildChatClientContext({ platform: 'web', locale: 'pt-BR' })
  const answer = JSON.parse(visibleAnswer({ aiMessage: '', parts: [{ type: 'block', kind: 'habitList', block: {
    scope: 'today', items: [{ id: 'walk', title: 'Caminhada', emoji: null, depth: 0,
      isBadHabit: false, status: 'today', isSkippedOnDate: true }], totalCount: 1,
  } }] }, client))
  expect(answer.parts[0].block.items[0]).toMatchObject({ isSkippedOnDate: true, status: 'Pulado' })
})
it.each(['legacy-create-pt', 'legacy-moderation-pt', 'single-create-pt', 'composition-compound-pt-BR'])(
  'isolates and restores the profile locale only when required by %s', async (id) => {
    offlineCredentials()
    const state = { habits: [], goals: [], tags: [], templates: [], requests: [], pro: true,
      exhausted: false, capacity: 100, email: 'thomaslrgregorio+orbit-eval-pro@gmail.com' }
    const api = fixtureFetch(() => state)
    let language = 'en'
    const writes = []
    let chatLanguage
    let test
    vi.stubGlobal('fetch', async (url, options) => {
      const path = new URL(url).pathname
      if (path === '/api/chat') {
        chatLanguage = language
        return Response.json(chatResponse(test.vars.evalRequestId), { headers: { 'x-orbit-request-id': test.vars.evalRequestId } })
      }
      if (path === '/api/profile/language') {
        language = JSON.parse(options.body).language
        writes.push(language)
        return new Response(null, { status: 204 })
      }
      const response = await api(url, options)
      if (path === '/api/profile') return Response.json({ ...await response.json(), language })
      return response
    })
    test = (await prepareAttempt({ test: scenario(id) })).test
    expect(test.vars.preconditionFailure).toBeUndefined()
    const provider = new AstraHttpProvider({ config: { ...configuration.providers[0].config, url: `${process.env.ORBIT_EVAL_BASE_URL}/api/chat`, method: 'POST',
      transformResponse: `file://${new URL('../response.mjs', import.meta.url).pathname}` } })
    const response = await provider.callApi(test.vars.input, { vars: test.vars })
    expect(response.error).toBeUndefined()
    const legacy = id.startsWith('legacy-')
    expect(chatLanguage).toBe(legacy ? 'pt-BR' : 'en')
    expect(language).toBe('en')
    expect(writes).toEqual(legacy ? ['pt-BR', 'en'] : [])
    if (test.vars.clientContext.supportsParts) expect(test.vars.clientContext.supportsSkippedHabitRows).toBe(true)
  },
)
