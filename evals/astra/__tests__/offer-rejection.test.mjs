import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { assertions } from 'promptfoo'
import { parse } from 'yaml'
import AstraHttpProvider from '../http-provider.mjs'
import { configureOffers } from '../offer-context.mjs'
import { prepareCorrection } from '../setup.mjs'
import { chatResponse, preview, toolCall } from './fixtures/producer.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const configuration = parse(readFileSync(new URL('../promptfooconfig.yaml', import.meta.url), 'utf8'))
const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'), { merge: true })
const state = { habits: [], goals: [], tags: [], checklistTemplates: [] }
const reminderGroup = ['repeat_reminder', 'reminder_enabled']
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

// ProactiveProposalTests.RemovalRestoresTheRequestedDraftAndRecordsTheSemanticDismissal.
function reminderPreview(title) {
  const pending = preview(title)
  pending.items[0].itemId = '0'
  pending.items[0].fields = Object.entries({ title, is_general: true,
    repeat_reminder: { interval_minutes: 120, active_start: '08:00', active_end: '20:00' },
    reminder_enabled: true, emoji: '💧',
  }).map(([field, value]) => ({ ...pending.items[0].fields[0], field,
    newValue: typeof value === 'string' ? value : JSON.stringify(value), proposedValue: value,
    valueType: field === 'emoji' ? 'emoji' : typeof value === 'boolean' ? 'boolean' : 'text',
    provenance: ['title', 'is_general'].includes(field) ? 'requested' : 'suggested',
    ...(!['title', 'is_general'].includes(field) ? { removal: {
      offerKey: `preview:${field}`, field, fields: reminderGroup.includes(field) ? reminderGroup : [field],
    } } : {}),
  }))
  return pending
}

function removedPreview(original, fault) {
  const pending = structuredClone(original)
  pending.previewFingerprint = 'reminders-removed'
  pending.items[0].fields = pending.items[0].fields.filter((field) => !reminderGroup.includes(field.field))
  const emoji = pending.items[0].fields.find((field) => field.field === 'emoji')
  Object.assign(emoji, { newValue: '🍃', proposedValue: '🍃', provenance: 'requested' })
  delete emoji.removal
  if (fault === 'retained-reminder') {
    pending.items[0].fields.push({ ...structuredClone(original.items[0].fields.find((field) => field.field === 'reminder_enabled')),
      removal: { offerKey: 'preview:reminder_enabled', field: 'reminder_enabled', fields: ['reminder_enabled'] } })
  }
  if (fault === 'missing-emoji') pending.items[0].fields = pending.items[0].fields.filter((field) => field.field !== 'emoji')
  if (fault === 'title-lost') pending.items[0].fields = pending.items[0].fields.filter((field) => field.field !== 'title')
  return pending
}

async function rejectionAttempt(locale, fault) {
  const scenario = structuredClone(corpus.find((entry) => entry.metadata.id === `offers-preview-rejection-${locale}`))
  configureOffers(scenario)
  const title = locale === 'pt-BR' ? 'Beber água' : 'Drink water'
  const original = reminderPreview(title)
  if (fault === 'setup-metadata-only') original.items[0].fields = original.items[0].fields.filter((field) => !reminderGroup.includes(field.field))
  const revised = removedPreview(original, fault)
  Object.assign(scenario.vars, { accountDate: '2031-06-10', evalRequestId: 'main-rejection-request',
    offerRequireReadback: true, offerBaseline: state, fixtureEvidence: state })
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://api.useorbit.org')
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline')
  const requests = []
  vi.stubGlobal('fetch', async (url, options) => {
    const path = new URL(url).pathname
    requests.push({ path, method: options.method })
    if (path === '/api/profile/export') return Response.json(state)
    const revisionPath = `/api/ai/pending-operations/${original.id}`
    if (path === `${revisionPath}/confirm`) return Response.json({ error: 'pending_operation_not_found' }, { status: 404 })
    // PendingOperationRevisionService.ReviseAsync returns a preview, or cancels an empty selection.
    if (path === `${revisionPath}/revise`) {
      const body = JSON.parse(options.body)
      expect(body.previewFingerprint).toBe(revised.previewFingerprint)
      if (!body.items.length) return Response.json({ isSuccess: true, error: null, pendingOperationId: null, preview: null, cancelled: true })
      expect(body.items).toEqual([{ itemId: '0', edits: { description: 'A short water break.' } }])
      const edited = structuredClone(revised)
      edited.items[0].fields.push({ ...edited.items[0].fields[0], field: 'description', newValue: 'A short water break.',
        proposedValue: 'A short water break.', provenance: 'requested' })
      return Response.json({ isSuccess: true, error: null, pendingOperationId: original.id,
        preview: { items: edited.items, previewFingerprint: revised.previewFingerprint }, cancelled: false })
    }
    expect(path).toBe('/api/chat')
    const request = new Request(url, options)
    const form = await request.formData()
    const setup = form.get('message') === scenario.vars.setup.input
    const requestId = request.headers.get('x-orbit-request-id')
    if (!setup) expect(JSON.parse(form.get('history'))).toHaveLength(2)
    // RevisePendingChangesTool uses snake-case tool arguments; the public revise DTO uses camel case.
    const call = setup ? toolCall('bulk_create_habits', { orbit_write_complete: true, orbit_dismissed_offer_keys: [],
      habits: [{ title, is_general: true, suggested_fields: [...reminderGroup, 'emoji'],
        repeat_reminder: { interval_minutes: 120, active_start: '08:00', active_end: '20:00' }, reminder_enabled: true, emoji: '💧' }] },
      'PendingConfirmation', 'setup', scenario.vars.clientContext)
      : toolCall('revise_pending_changes', { orbit_read_complete: true, orbit_dismissed_offer_keys: [],
        pending_operation_id: original.id, answer_question: false,
        items: [{ item_id: '0', edits_json: '{"emoji":"🍃"}', remove_suggested_fields: reminderGroup }],
      }, 'PendingConfirmation', 'revision', scenario.vars.clientContext)
    return Response.json({ ...chatResponse(requestId, [call]), aiMessage: null, parts: [],
      pendingOperations: [setup ? original : revised] }, { headers: { 'x-orbit-request-id': requestId } })
  })
  const prepared = (await prepareCorrection(scenario)).test
  prepared.vars.clientContextJson = JSON.stringify(prepared.vars.clientContext)
  const provider = new AstraHttpProvider({ config: { ...configuration.providers[0].config,
    transformResponse: `file://${root}/response.mjs` } })
  const response = await provider.callApi(prepared.vars.input, { vars: prepared.vars })
  expect(response.error).toBeUndefined()
  const grader = { id: () => 'offline-rejection-grader', callApi: vi.fn(async () => ({
    output: JSON.stringify({ pass: true, score: 1, reason: 'Offline rubric transport control.' }),
  })) }
  const grade = await assertions.runAssertions({ provider, providerResponse: response, test: { ...prepared,
    options: { provider: grader }, assert: configuration.defaultTest.assert.map((assertion) => ({ ...assertion,
      ...(assertion.type === 'javascript' ? { value: assertion.value.replace('file://', `file://${root}/`) } : {}),
    })),
  } })
  expect(grade.componentResults).toHaveLength(configuration.defaultTest.assert.length)
  expect(grader.callApi).toHaveBeenCalledOnce()
  return { response, grade, requests }
}

it.each(['en', 'pt-BR'])('accepts reminder removal through main provider verification and every configured assertion: %s', async (locale) => {
  const { response, grade, requests } = await rejectionAttempt(locale, 'valid')
  expect(response.output.offerReadback, response.output.offerReadback.reason).toMatchObject({ pass: true })
  expect(grade, grade.reason).toMatchObject({ pass: true })
  expect(requests.map(({ path }) => path)).toEqual(['/api/chat', '/api/chat', '/api/profile/export',
    `/api/ai/pending-operations/${preview().id}/revise`, `/api/ai/pending-operations/${preview().id}/revise`,
    `/api/ai/pending-operations/${preview().id}/confirm`, '/api/profile/export'])
})

it.each(['en', 'pt-BR'])('requires the removable reminder group on the setup turn: %s', async (locale) => {
  await expect(rejectionAttempt(locale, 'setup-metadata-only')).rejects.toThrow('Offer setup failed: Missing removable reminder group for rejection.')
})

it.each(['en', 'pt-BR'].flatMap((locale) => ['retained-reminder', 'missing-emoji', 'title-lost'].map((fault) => [locale, fault])))(
  'rejects %s main-turn %s through the configured gate', async (locale, fault) => {
    const { response, grade, requests } = await rejectionAttempt(locale, fault)
    expect(response.output.offerReadback.pass).toBe(false)
    expect(response.output.offerReadback.reason).toContain(fault === 'missing-emoji'
      ? 'requested leaf emoji' : 'Suggested reminder removal lost requested or stored fields')
    expect(grade.pass).toBe(false)
    expect(grade.componentResults.find((entry) => entry.assertion.metric === 'proactiveOffers').pass).toBe(false)
    expect(requests.some(({ path }) => path.includes('/ai/pending-operations/'))).toBe(false)
  },
)
