import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { visibleAnswer } from '../visible-answer.mjs'
import { buildChatClientContext } from '../../../packages/shared/src/chat/client-context.ts'
import { beforeEach as prepareAttempt } from '../hooks.mjs'
import AstraHttpProvider from '../http-provider.mjs'
import { fixtureFetch } from './fixtures/public-api.mjs'
import { offlineCredentials } from './fixtures/credentials.mjs'
import { captures } from './fixtures/core-streams.mjs'
import { recordedStream } from './fixtures/core-replay.mjs'

const corpus = ['scenarios.yaml', 'composition-scenarios.yaml'].flatMap((file) =>
  parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')))
const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
const scenario = (id) => structuredClone(corpus.find((entry) => entry.metadata.id === id))
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it('projects the skipped row state parsed by the shared client schema', () => {
  const client = buildChatClientContext({ platform: 'web', locale: 'pt-BR' })
  const answer = JSON.parse(visibleAnswer({ aiMessage: '', parts: [{ type: 'block', kind: 'habitList', block: {
    scope: 'today', items: [{ id: 'walk', title: 'Caminhada', emoji: null, depth: 0,
      isBadHabit: false, status: 'today', isSkippedOnDate: true }], totalCount: 1,
  } }] }, client))
  expect(answer.parts[0].block.items[0]).toMatchObject({ isSkippedOnDate: true, status: 'Pulado' })
})
it.each(['legacy-create-pt', 'legacy-moderation-pt', 'single-create-pt', 'composition-compound-pt-BR'])(
  'runs %s on a pt-BR profile and verifies it before a chat on the client path', async (id) => {
    offlineCredentials()
    const state = { habits: [], goals: [], tags: [], templates: [], requests: [], pro: true,
      exhausted: false, capacity: 100, email: 'thomaslrgregorio+orbit-eval-pro@gmail.com' }
    const api = fixtureFetch(() => state)
    let language = 'en'
    const writes = []
    let chatLanguage
    const chat = recordedStream([captures.complete.turns[0]])
    vi.stubGlobal('fetch', async (url, options) => {
      const path = new URL(url).pathname
      if (path === '/api/chat/stream') {
        chatLanguage = language
        return chat(url, options)
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
    const { test } = await prepareAttempt({ test: scenario(id) })
    expect(test.vars.preconditionFailure).toBeUndefined()
    const provider = new AstraHttpProvider({ config: { ...configuration.providers[0].config, url: `${process.env.ORBIT_EVAL_BASE_URL}/api/chat`, method: 'POST',
      transformResponse: `file://${new URL('../response.mjs', import.meta.url).pathname}` } })
    const response = await provider.callApi(test.vars.input, { vars: test.vars })
    expect(response.error).toBeUndefined()
    const legacy = id.startsWith('legacy-')
    expect(chatLanguage).toBe('pt-BR')
    expect(language).toBe('pt-BR')
    expect(writes).toEqual(legacy ? ['pt-BR', 'pt-BR', 'pt-BR'] : ['pt-BR'])
    if (test.vars.clientContext.supportsParts) expect(test.vars.clientContext.supportsSkippedHabitRows).toBe(true)
  },
)
