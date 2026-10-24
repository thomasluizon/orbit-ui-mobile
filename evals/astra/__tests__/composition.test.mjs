import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { fileURLToPath } from 'node:url'
import { loadApiProvider } from 'promptfoo'
import * as assertions from '../assertions.mjs'
import parseResponse from '../response.mjs'
import { chatResponse, toolCall } from './fixtures/producer.mjs'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
const root = fileURLToPath(new URL('..', import.meta.url))
const config = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
const block = { type: 'block', kind: 'habitList', block: { scope: 'today', items: [
  { id: 'water', title: 'Water', emoji: null, depth: 0, isBadHabit: false, status: 'today' },
], totalCount: 1 } }
const context = { vars: { evalRequestId: 'request', expectations: { allowed: ['query_habits'] },
  clientContext: { supportsParts: true, partKinds: ['habitList'], supportsHabitListCard: true },
  composition: { mode: 'data', kinds: ['habitList'] },
}, test: { vars: {} } }
function response(parts, aiMessage = 'Ready.', extra = {}) {
  return { ...chatResponse('request', [toolCall('query_habits', {})]), parts, aiMessage, ...extra }
}
async function gate(produced, vars = {}) {
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
  vi.stubGlobal('fetch', async () => Response.json(produced, { headers: { 'x-orbit-request-id': 'request' } }))
  const provider = await loadApiProvider('http', { options: { config: { ...config.providers[0].config,
    url: 'https://astra.invalid/api/chat', transformResponse: `file://${root}/response.mjs`,
  } } })
  const received = await provider.callApi('Read habits', { vars: { ...context.vars, ...vars, credentialKey: 'ORBIT_EVAL_TOKEN', historyJson: '[]',
    clientContextJson: JSON.stringify(vars.clientContext ?? context.vars.clientContext) } })
  const output = received.output ?? received
  if (output.error) return { pass: false, reason: output.error }
  const checks = await Promise.all(config.defaultTest.assert.filter((assertion) => assertion.type === 'javascript')
    .map((assertion) => assertions[assertion.value.split(':').at(-1)](output, { ...context, vars: { ...context.vars, ...vars } })))
  return checks.find((check) => !check.pass) ?? { pass: true }
}

describe('production composition gate', () => {
  it('rejects prose-first ordering through the configured assertions', async () => {
    expect((await gate(response([{ type: 'text', text: 'Ready.' }, block]))).pass).toBe(false)
  })
  it('accepts a block-first answer and retains its ordered payload', async () => {
    const produced = response([block, { type: 'text', text: 'Ready.' }])
    expect((await gate(produced)).pass).toBe(true)
    expect(parseResponse(produced).composition.parts).toEqual(produced.parts)
  })
  it.each(['', undefined])('accepts a block-only answer with aiMessage=%s', async (text) => {
    const produced = response([block], text)
    if (text === undefined) delete produced.aiMessage
    expect((await gate(produced)).pass).toBe(true)
    expect(parseResponse(produced).answer).toContain('Water')
  })
  it.each([
    ['extra text', [block, { type: 'text', text: 'Ready.\nAnother line.' }]],
    ['long text', [block, { type: 'text', text: 'x'.repeat(181) }]],
    ['missing parts', undefined], ['empty parts', []], ['malformed parts', [null]],
    ['malformed block', [{ ...block, block: {} }]],
    ['unsupported kind', [{ ...block, kind: 'invented' }]],
    ['unadvertised kind', [{ ...block, kind: 'goalList', block: { items: [] } }]],
  ])('rejects %s', async (_, parts) => {
    expect((await gate(response(parts))).pass).toBe(false)
  })
  it('rejects three follow-ups', async () => {
    expect((await gate(response([block], '', { followUps: ['One?', 'Two?', 'Three?'] }))).pass).toBe(false)
  })
  it('rejects hidden prose outside the ordered parts', async () => {
    expect((await gate(response([block], 'Water has one pending item.'))).pass).toBe(false)
  })
  it.each(['', 'One\nTwo\nThree\nFour', '# Heading', '- Unrequested list', 'x'.repeat(181), 'First.\n\nCaveat paragraph.'])('rejects invalid no-data text: %s', async (text) => {
    expect((await gate(response([{ type: 'text', text }], text), { composition: { mode: 'text' } })).pass).toBe(false)
  })
  it.each(['today', 'subscriptions'])('requires an available relevant action for help: %s', async (surface) => {
    const produced = response([{ type: 'text', text: 'Open the screen.' }], 'Open the screen.')
    const vars = { composition: { mode: 'text', actionSurfaces: [surface] } }
    expect((await gate(produced, vars)).pass).toBe(false)
    produced.relatedSurfaces = ['settings']
    expect((await gate(produced, vars)).pass).toBe(false)
    produced.relatedSurfaces = [surface]
    expect((await gate(produced, vars)).pass).toBe(true)
  })
  it.each(['habits', 'profile'])('rejects an unmapped help action even when policy names it: %s', async (surface) => {
    const produced = response([{ type: 'text', text: 'Open the screen.' }], 'Open the screen.', { relatedSurfaces: [surface] })
    expect((await gate(produced, { composition: { mode: 'text', actionSurfaces: [surface] } })).pass).toBe(false)
  })
  it('accepts the producer text mirror for compound missing-kind fallback only', async () => {
    const parts = ['Water is pending.', 'Goal is on track.'].map((text) => ({ type: 'text', text }))
    const vars = { clientContext: { supportsParts: true, partKinds: [] }, composition: { mode: 'fallback' } }
    expect(await gate(response(parts, 'Water is pending.\n\nGoal is on track.'), vars)).toMatchObject({ pass: true })
    expect((await gate(response(parts, 'Water is pending.\nGoal is on track.'), vars)).pass).toBe(false)
    expect((await gate(response([block, ...parts], 'Water is pending.\n\nGoal is on track.'))).pass).toBe(false)
  })
  it('requires readable fallback and rejects blocks for legacy or missing-kind clients', async () => {
    for (const clientContext of [{ supportsParts: false }, { supportsParts: true, partKinds: [] }]) {
      const vars = { clientContext, composition: { mode: 'fallback' } }
      expect((await gate(response(clientContext.supportsParts ? [{ type: 'text', text: 'Water is pending.' }] : undefined, 'Water is pending.'), vars)).pass).toBe(true)
      expect((await gate(response([block]), vars)).pass).toBe(false)
    }
  })
})

describe('composition reporting', () => {
  it('cannot approve three successes with no composition assertion result', async () => {
    const { summarize } = await import('../report.mjs')
    const attempts = Array.from({ length: 3 }, () => ({ testCase: { metadata: { id: 'a', family: 'habits', locale: 'en' } }, success: true }))
    expect(summarize(attempts, ['a']).status).toBe('incomplete')
  })
})

describe('preview and outcome composition', () => {
  it('retains the batch preview and rejects prose or missing preview items', async () => {
    const { preview } = await import('./fixtures/producer.mjs')
    const pending = preview()
    const produced = response([], '', { pendingOperations: [pending] })
    expect((await gate(produced, { composition: { mode: 'preview' } })).pass).toBe(true)
    expect(parseResponse(produced).composition.pendingOperations).toEqual([pending])
    expect((await gate(response([{ type: 'text', text: 'Here it is.' }], 'Here it is.', { pendingOperations: [pending] }), { composition: { mode: 'preview' } })).pass).toBe(false)
    pending.items = []
    expect((await gate(produced, { composition: { mode: 'preview' } })).pass).toBe(false)
  })
  it('compares every correction field with its actual original preview', async () => {
    const { preview } = await import('./fixtures/producer.mjs')
    const original = preview()
    const revised = structuredClone(original)
    revised.items[0].fields[0].newValue = '16:00'
    revised.items[0].fields[0].proposedValue = '16:00'
    const vars = { baselinePreview: [original], composition: { mode: 'preview', correction: { titleContains: 'cholesterol', field: 'due_time', value: '16:00' } } }
    const produced = response([], '', { pendingOperations: [revised] })
    expect((await gate(produced, vars)).pass).toBe(true)
    expect((await gate(produced, { ...vars, baselinePreview: undefined })).pass).toBe(false)
    revised.items[0].fields[1] = Object.fromEntries(Object.entries(revised.items[0].fields[1]).reverse())
    expect((await gate(produced, vars)).pass).toBe(true)
    revised.items[0].fields[1].proposedValue = 'Day'
    expect((await gate(produced, vars)).pass).toBe(false)
  })
  it('retains a typed terminal action without manufacturing a data block', async () => {
    const produced = response([], '', { actions: [{ type: 'CreateHabit', status: 'Failed', entityId: null, entityName: 'Water', error: 'Unavailable', field: null, suggestedSubHabits: null, clarificationRequest: null }] })
    expect((await gate(produced, { composition: { mode: 'outcome' } })).pass).toBe(true)
    expect((await gate(produced, { composition: { mode: 'data', kinds: ['habitList'] } })).pass).toBe(false)
  })
})

it('accepts a typed operation-only outcome and rejects an unknown composition policy', async () => {
  const produced = response([], '', { operations: [{ operationId: 'create_habit', sourceName: 'create_habit',
    riskClass: 'Low', confirmationRequirement: 'FreshConfirmation', status: 'Denied', summary: null,
    targetId: null, targetName: null, policyReason: 'unsupported_by_policy', pendingOperationId: null, payload: null }] })
  expect((await gate(produced, { composition: { mode: 'outcome' } })).pass).toBe(true)
  produced.operations[0].status = 'Succeeded'
  expect((await gate(produced, { composition: { mode: 'outcome' } })).pass).toBe(false)
  expect((await gate(response([block]), { composition: { mode: 'unknown' } })).pass).toBe(false)
})
