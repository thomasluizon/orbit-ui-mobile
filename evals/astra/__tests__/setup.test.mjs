import { afterEach, expect, it, vi } from 'vitest'
import { beforeEach } from '../hooks.mjs'
import { offlineCredentials, refreshResponse } from './fixtures/credentials.mjs'
import { chatResponse, preview, toolCall } from './fixtures/producer.mjs'
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
it.each([false, true])('verifies the real setup turn before a correction; wrongRequest=%s', async (wrongRequest) => {
  offlineCredentials()
  vi.stubEnv('ORBIT_EVAL_BASE_URL', 'https://astra.invalid')
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
    clientContext: { supportsParts: true, partKinds: [] }, setup: { input: 'Original exam request',
      composition: { mode: 'preview' }, expectations: { required: [{ name: 'create_habit', arguments: { title: 'Cholesterol exam' } }] } },
  } }
  if (wrongRequest) await expect(beforeEach({ test })).rejects.toThrow('Correction setup failed')
  else {
    const prepared = await beforeEach({ test })
    expect(prepared.test.vars.evalRequestId).not.toBe(setupRequestId)
    expect(prepared.test.vars.baselinePreview).toEqual([preview()])
    const history = JSON.parse(prepared.test.vars.historyJson)
    expect(history[0]).toEqual({ role: 'user', content: 'Original exam request' })
    expect(history[1].content).toContain('Cholesterol exam')
    expect(history[1].content).not.toContain('evalTrace')
  }
})

vi.mock('../fixtures/reset.mjs', async (importOriginal) => ({ ...await importOriginal(), resetFixture: vi.fn() }))
