import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import AstraHttpProvider from '../http-provider.mjs'
import { visibleBlock } from '../visible-blocks.mjs'
import { chatResponse, habitBlock } from './fixtures/producer.mjs'

const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8')).providers[0].config
async function receive(extra, locale = 'pt-BR', supportsParts = true) {
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
  vi.stubGlobal('fetch', async () => Response.json({ ...chatResponse('request'), aiMessage: '', parts: [habitBlock], ...extra },
    { headers: { 'x-orbit-request-id': 'request' } }))
  const provider = new AstraHttpProvider({ config: { ...configuration, url: 'https://astra.invalid/api/chat',
    transformResponse: `file://${fileURLToPath(new URL('../response.mjs', import.meta.url))}` } })
  return provider.callApi('Show my habits.', { vars: { credentialKey: 'ORBIT_EVAL_TOKEN', evalRequestId: 'request',
    clientContext: { supportsParts, locale }, clientContextJson: JSON.stringify({ supportsParts, locale }), historyJson: '[]' } })
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
const operation = (status) => ({ operationId: 'query_habits', sourceName: 'query_habits', riskClass: 'Low',
  confirmationRequirement: 'None', status, summary: 'INVISIBLE_AUDIT_SUMMARY', targetId: null, targetName: null,
  policyReason: 'INVISIBLE_POLICY_REASON', pendingOperationId: null, payload: { text: 'INVISIBLE_TOOL_PAYLOAD' } })

it('excludes a succeeded read summary and hidden habit fields from the actual graded HTTP answer', async () => {
  const part = structuredClone(habitBlock)
  Object.assign(part.block.items[0], { description: 'INVISIBLE_DESCRIPTION', tags: ['INVISIBLE_TAG'], dueDate: 'INVISIBLE_SCHEDULE' })
  const { output } = await receive({ operations: [operation('Succeeded')], parts: [part] })
  expect(output.composition.operations[0].summary).toBe('INVISIBLE_AUDIT_SUMMARY')
  expect(output.answer).toContain('Water')
  expect(output.answer).not.toContain('INVISIBLE_')
  expect(JSON.parse(output.answer)).not.toHaveProperty('operations')
})
it('omits an unlabelled failed read outcome as both clients do', async () => {
  const { output } = await receive({ operations: [operation('Failed')], parts: [] })
  const visible = JSON.parse(output.answer)
  expect(visible).not.toHaveProperty('outcomes')
  expect(output.answer).not.toContain('INVISIBLE_')
})
it('projects a failed write as the localized outcome both clients show', async () => {
  const failed = { ...operation('Failed'), operationId: 'create_habit', sourceName: 'create_habit', targetName: 'Water' }
  const { output } = await receive({ operations: [failed], parts: [] })
  const visible = JSON.parse(output.answer)
  expect(visible.outcomes).toEqual([{ title: 'Alguns itens não foram salvos', label: 'Water', meta: 'Não foi salvo' }])
  expect(output.answer).not.toContain('INVISIBLE_')
})
it.each([
  ['en', 'Created Water'], ['pt-BR', 'Criou Water'],
])('resolves an action chip in %s through the configured HTTP provider', async (locale, label) => {
  const { output } = await receive({ parts: [], actions: [{ type: 'CreateHabit', status: 'Success', entityId: 'water',
    entityName: 'Water', error: 'INVISIBLE_ERROR', field: null, suggestedSubHabits: null, clarificationRequest: null }] }, locale)
  expect(JSON.parse(output.answer).actions).toMatchObject({ rows: [{ label }] })
  expect(output.answer).not.toContain('INVISIBLE_')
  expect(output.answer).not.toContain('CreateHabit')
})
it('uses achievement ids for local copy and never grades payload achievement descriptions', async () => {
  const { output } = await receive({ parts: [{ type: 'block', kind: 'streak', block: {
    currentStreak: 1, longestStreak: 2, level: 1, totalXp: 10, xpForNextLevel: 100, isFrozenToday: false, lastActiveDate: null, recentFreezeDates: [], surfaceId: 'gamification',
    recentAchievements: [{ id: 'first_orbit', name: 'INVISIBLE_NAME', description: 'INVISIBLE_DESCRIPTION', iconKey: 'seedling', earnedAt: null }],
  } }] })
  expect(output.answer).not.toContain('INVISIBLE_')
  expect(output.answer).toContain('Primeira órbita')
})
it('keeps visible notification content and excludes unrendered record properties', async () => {
  const { output } = await receive({ parts: [{ type: 'block', kind: 'recordList', block: { kind: 'notifications',
    totalCount: 1, items: [{ id: 'n', title: 'Notificação pessoal', detail: 'Detalhe visível', isRead: false,
      description: 'INVISIBLE_DESCRIPTION', payload: { text: 'INVISIBLE_PAYLOAD' } }] } }] })
  expect(output.answer).toContain('Notificação pessoal')
  expect(output.answer).toContain('Detalhe visível')
  expect(output.answer).not.toContain('INVISIBLE_')
})
it('uses only aiMessage for a legacy client even when operations and parts are present', async () => {
  const { output } = await receive({ aiMessage: 'Readable fallback.', operations: [operation('Failed')] }, 'en', false)
  expect(output.answer).toBe('Readable fallback.')
})

const fixtures = JSON.parse(readFileSync(new URL('../../../packages/shared/src/test-support/chat-parts.fixture.json', import.meta.url), 'utf8'))
const focused = await import('../../../packages/shared/src/test-support/chat-fixtures.ts')
const typedBlocks = [...fixtures.blocks, ...[
  ['periodTotal', focused.focusedPeriodTotalFixture], ['periodComparison', focused.focusedPeriodComparisonFixture],
  ['habitRanking', focused.habitRankingCardFixture],
].map(([kind, block]) => ({ type: 'block', kind, block }))]

it.each(typedBlocks.map((part) => [part.kind, part]))('projects %s from the existing client contract fixture', async (_, part) => {
  const block = structuredClone(part)
  block.block.unrenderedAuditText = 'INVISIBLE_BLOCK_AUDIT'
  const { output, error } = await receive({ parts: [block] })
  expect(error).toBeUndefined()
  expect(output?.error).toBeUndefined()
  const visible = JSON.parse(output.answer)
  expect(visible.parts[0].kind).toBe(block.kind)
  expect(visible.parts[0].block).toHaveProperty('title')
  expect(output.answer).not.toContain('INVISIBLE_BLOCK_AUDIT')
  expect(output.answer).not.toContain('signed-query')
  expect(output.answer).not.toContain('signed-page')
})
it('localizes account enum values and excludes unknown rows and hidden referral links', async () => {
  const { output } = await receive({ parts: [{ type: 'block', kind: 'accountRows', block: { kind: 'profile', surfaceId: 'profile',
    rows: [{ key: 'language', value: 'en', valueType: 'enum' }, { key: 'INVISIBLE_UNKNOWN_ROW', value: 'INVISIBLE_VALUE', valueType: 'text' }],
    referralLink: 'INVISIBLE_LINK' } }] })
  expect(output.answer).toContain('Inglês')
  expect(output.answer).not.toContain('INVISIBLE_')
})
it('uses resolved follow-up labels and surface actions while preserving text part order without its aiMessage mirror', async () => {
  const { output } = await receive({ aiMessage: 'INVISIBLE_MIRROR',
    parts: [habitBlock, { type: 'text', text: 'Pronto.' }],
    relatedSurfaces: ['today', 'unknown', 'today'], followUps: ['INVISIBLE_FALLBACK'],
    followUpContext: [{ label: 'Ver amanhã', question: 'INVISIBLE_QUESTION', grounding: 'INVISIBLE_GROUNDING' }],
  })
  const answer = JSON.parse(output.answer)
  expect(answer.parts.map(({ type }) => type)).toEqual(['block', 'text'])
  expect(answer.relatedActions).toEqual(['Hoje'])
  expect(answer.followUps).toEqual(['Ver amanhã'])
  expect(output.answer).not.toContain('INVISIBLE_')
})
it('coalesces duplicate failures and hides actions owned by a pending preview', async () => {
  const { preview } = await import('./fixtures/producer.mjs')
  const pending = preview('Beber água')
  const { output } = await receive({ parts: [], pendingOperations: [pending], operations: [
    { ...operation('PendingConfirmation'), sourceName: 'create_habit', pendingOperationId: pending.id },
    { ...operation('Failed'), sourceName: 'log_habit' },
  ], actions: [
    { type: 'CreateHabit', status: 'Success', entityName: 'Beber água' },
    { type: 'LogHabit', status: 'Failed', entityName: 'INVISIBLE_DUPLICATED_ACTION', error: 'INVISIBLE_ERROR' },
  ] })
  const answer = JSON.parse(output.answer)
  expect(answer.pendingOperations).toHaveLength(1)
  expect(answer.outcomes).toHaveLength(1)
  expect(answer.actions).toBeUndefined()
  expect(output.answer).not.toContain('INVISIBLE_')
})
it.each(['unsupported-kind', 'malformed-block'])('fails closed on an unrenderable %s without sending raw text to a grader', async (mode) => {
  const part = { type: 'block', kind: mode === 'unsupported-kind' ? 'invented' : 'habitList',
    block: { toolPayload: 'INVISIBLE_PAYLOAD' } }
  let message
  try { visibleBlock(part, {}) } catch (error) { message = error.message }
  expect(message).toBeTruthy()
  const { error, output } = await receive({ parts: [habitBlock, part] })
  expect(error).toContain(message)
  expect(error).toContain(part.kind)
  expect(output).toMatchObject({ answer: null, httpStatus: 200, renderError: { message, blockKind: part.kind },
    trace: { state: 'available' } })
})

it('preserves suggestion projection failures with their block kind', async () => {
  const { error, output } = await receive({ parts: [{ type: 'block', kind: 'habitSuggestions', block: { drafts: [{}] } }] })
  expect(error).toContain('Malformed suggestion block.')
  expect(error).toContain('habitSuggestions')
  expect(output).toMatchObject({ answer: null, renderError: { blockKind: 'habitSuggestions', message: 'Malformed suggestion block.' } })
})
