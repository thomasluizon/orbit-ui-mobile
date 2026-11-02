import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import { afterEach, expect, it, vi } from 'vitest'
import { beforeEach } from '../hooks.mjs'
import { offlineCredentials, refreshResponse } from './fixtures/credentials.mjs'
import { chatResponse, preview, toolCall } from './fixtures/producer.mjs'
import AstraHttpProvider from '../http-provider.mjs'
import { summarize, writeResults } from '../report.mjs'
const directories = []
afterEach(() => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

// ProactiveProposal.Schema retains these ordinary arguments when no suggested_fields are supplied.
vi.mock('../trace-policy.mjs', async (original) => {
  const catalog = await original()
  return { ...catalog, offerTools: catalog.tools }
})
it.each([false, true])('verifies the real setup turn before a correction; wrongRequest=%s', async (wrongRequest) => {
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://orbit-api-staging-uqu2.onrender.com')
  vi.stubEnv('ORBIT_EVAL_TOKEN', 'offline-token')
  let setupRequestId
  vi.stubGlobal('fetch', async (url, options) => {
    if (new URL(url).pathname === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
    if (new URL(url).pathname === '/api/auth/refresh') return refreshResponse()
    const request = new Request(url, options)
    setupRequestId = request.headers.get('x-orbit-request-id')
    const form = await request.formData()
    expect(form.get('message')).toBe('Original exam request')
    expect(JSON.parse(form.get('clientContext')).supportsParts).toBe(true)
    expect(form.get('history')).toBe('[]')
    const response = { ...chatResponse(setupRequestId, [toolCall('create_habit', { title: 'Cholesterol exam' }, 'PendingConfirmation')]),
      parts: [], aiMessage: null, pendingOperations: [preview()] }
    return Response.json(response, { headers: { 'x-orbit-request-id': wrongRequest ? 'wrong' : setupRequestId } })
  })
  const test = { metadata: { id: 'correction' }, vars: { credentialKey: 'ORBIT_EVAL_TOKEN',
    clientContext: { supportsParts: true, partKinds: [] }, setup: { caseId: 'composition-medical-batch-en', input: 'Original exam request',
      composition: { mode: 'preview' }, expectations: { required: [{ name: 'create_habit', arguments: { title: 'Cholesterol exam' } }] } },
  } }
  if (wrongRequest) {
    const prepared = (await beforeEach({ test })).test
    expect(prepared.vars.preconditionFailure).toContain('composition-medical-batch-en')
    expect(prepared.vars.preconditionFailure).toContain('Trace is missing, malformed, or belongs to another request.')
    const response = await new AstraHttpProvider({ config: { url: 'https://astra.invalid/api/chat' } })
      .callApi('Change the exam time.', { vars: prepared.vars })
    expect(response.metadata.astraPreconditionFailure).toBe(true)
    expect(summarize([{ testCase: prepared, response, error: response.error, success: false }], [prepared.metadata]).cases[0])
      .toMatchObject({ unavailable: 1, allAttemptsPass: 'incomplete' })
    const directory = mkdtempSync(join(tmpdir(), 'astra-setup-evidence-'))
    directories.push(directory)
    writeResults([{ testCase: prepared, response, success: false }], directory)
    const evidence = JSON.parse(readFileSync(join(directory, 'attempts/correction-r1.json'), 'utf8'))
    expect(evidence.setup.requestId).toBe(setupRequestId)
    expect(evidence.setup.answer).toContain('Cholesterol exam')
    expect(evidence.setup.toolCalls[0]).toMatchObject({ name: 'create_habit', resultStatus: 'PendingConfirmation' })
    expect(evidence.setup.pass).toBe(false)
  } else {
    const prepared = await beforeEach({ test })
    expect(prepared.test.vars.evalRequestId).not.toBe(setupRequestId)
    expect(prepared.test.vars.baselinePreview).toEqual([preview()])
    const history = JSON.parse(prepared.test.vars.historyJson)
    expect(history[0]).toEqual({ role: 'user', content: 'Original exam request' })
    expect(history[1].content).toContain('Cholesterol exam')
    expect(history[1].content).not.toContain('evalTrace')
  }
})

it.each(['valid', 'no-reminder', 'malformed-removal'])(
  'B prepares any removable reminder group for rejection and retains failed setup evidence: %s', async (fault) => {
    offlineCredentials()
    const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'), { merge: true })
    const source = structuredClone(corpus.find((entry) => entry.metadata.id === 'offers-preview-rejection-en'))
    let requestId
    let chats = 0
    vi.stubGlobal('fetch', async (url, options) => {
      const path = new URL(url).pathname
      if (path === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
      if (path === '/api/auth/refresh') return refreshResponse()
      if (path === '/api/profile/export') return Response.json({ habits: [], goals: [], tags: [], checklistTemplates: [] })
      expect(path).toBe('/api/chat')
      chats++
      const request = new Request(url, options)
      requestId = request.headers.get('x-orbit-request-id')
      const client = JSON.parse((await request.formData()).get('clientContext'))
      const pending = preview('Drink water person@example.invalid offline-refresh')
      const base = pending.items[0].fields[0]
      pending.items[0].fields = [{ ...base, field: 'title', newValue: 'Drink water', proposedValue: 'Drink water', provenance: 'requested' }]
      if (fault !== 'no-reminder') pending.items[0].fields.push({ ...base, field: 'scheduled_reminders',
        proposedValue: [{ when: 'same_day', time: '09:00' }], provenance: 'suggested',
        removal: { offerKey: 'preview:scheduled_reminders', field: 'scheduled_reminders',
          fields: fault === 'malformed-removal' ? ['title'] : ['scheduled_reminders'] } })
      const response = { ...chatResponse(requestId, [toolCall('create_habit', { title: 'Drink water' }, 'PendingConfirmation', 'setup-write', client)]),
        aiMessage: null, parts: [], pendingOperations: [pending] }
      return Response.json(response, { headers: { 'x-orbit-request-id': requestId } })
    })
    const prepared = (await beforeEach({ test: source })).test
    if (fault === 'valid') {
      expect(prepared.vars.preconditionFailure).toBeUndefined()
      expect(prepared.vars.baselinePreview[0].items[0].fields[1].field).toBe('scheduled_reminders')
    } else {
      expect(prepared.vars.preconditionFailure).toBeTruthy()
      const response = await new AstraHttpProvider({ config: {} }).callApi(prepared.vars.input, { vars: prepared.vars })
      expect(response.metadata.astraPreconditionFailure).toBe(true)
      const directory = mkdtempSync(join(tmpdir(), 'astra-setup-evidence-'))
      directories.push(directory)
      writeResults([{ testCase: prepared, response, success: false }], directory)
      const contents = readFileSync(join(directory, 'attempts/offers-preview-rejection-en-r1.json'), 'utf8')
      const evidence = JSON.parse(contents)
      expect(evidence.setup.requestId).toBe(requestId)
      expect(evidence.setup.answer).toContain('Drink water')
      expect(evidence.setup.toolCalls[0]).toMatchObject({ name: 'create_habit', resultStatus: 'PendingConfirmation',
        result: { success: true, payload: { status: 'awaiting_confirmation' } } })
      expect(contents).not.toMatch(/person@example.invalid|offline-refresh/)
    }
    expect(chats).toBe(1)
  },
)

vi.mock('../fixtures/reset.mjs', async (importOriginal) => ({ ...await importOriginal(), resetFixture: vi.fn() }))

it('reports a missing starting-step setup tool as unavailable and sends no save request', async () => {
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_HABIT_ID', 'water')
  const corpus = parse(readFileSync(new URL('../composition-scenarios.yaml', import.meta.url), 'utf8'))
  const test = structuredClone(corpus.find((entry) => entry.metadata.id === 'composition-one-small-step-save-checklist-en'))
  const chats = []
  vi.stubGlobal('fetch', async (url, options) => {
    const path = new URL(url).pathname
    if (path === '/health') return Response.json({ status: 'Healthy', commit: null, checks: [] })
    if (path === '/api/auth/refresh') return refreshResponse()
    if (path === '/api/profile/export') return Response.json({ habits: [{ id: 'water', title: 'Water', checklistItems: [{ text: 'Fill bottle', isChecked: false }] }] })
    expect(path).toBe('/api/chat')
    const request = new Request(url, options)
    const form = await request.formData()
    chats.push(form.get('message'))
    const requestId = request.headers.get('x-orbit-request-id')
    return Response.json(chatResponse(requestId), { headers: { 'x-orbit-request-id': requestId } })
  })
  const prepared = (await beforeEach({ test })).test
  expect(prepared.vars.preconditionFailure).toContain('Missing tool or incorrect arguments/result: suggest_breakdown')
  const response = await new AstraHttpProvider({ config: {} }).callApi('Save the step.', { vars: prepared.vars })
  expect(chats).toEqual([test.vars.setup.input])
  expect(response.metadata.astraPreconditionFailure).toBe(true)
  const summary = summarize([{ testCase: prepared, response, success: false }], [prepared.metadata])
  expect(summary.cases[0]).toMatchObject({ unavailable: 1, allAttemptsPass: 'incomplete' })
})
