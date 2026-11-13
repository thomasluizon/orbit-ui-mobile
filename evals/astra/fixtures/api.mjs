import { randomUUID } from 'node:crypto'
import { apiOrigin, safeFailureMessage } from '../credentials.mjs'

// The eval's one GUID rule. orbit-api constrains every route parameter to a GUID ({id:guid}), so a GUID segment is the
// only identifier in a route, and the graders and the report evidence read record and request ids in the same dashed form.
export const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

function isFixtureLog(method, path) {
  const [resource, id, action, ...remaining] = path.split('/')
  return method === 'POST' && resource === 'habits' && guid.test(id ?? '')
    && action === 'log' && remaining.length === 0
}

function canRetryTransport(method, path) {
  if (isFixtureLog(method, path)) return true
  if (['GET', 'DELETE'].includes(method)) return true
  if (method !== 'PUT') return false
  // #1822: profile setters increment a reminder version, so only verified replacement routes may retry.
  if (['calendar/selected-calendars', 'calendar/auto-sync'].includes(path)) return true
  const [resource, id, action, ...remaining] = path.split('/')
  if (!guid.test(id ?? '') || remaining.length) return false
  return (resource === 'habits' && (action === undefined || action === 'checklist'))
    || (resource === 'tags' && action === 'assign')
}

function fixtureFailure(method, path, cause) {
  const route = path.split(/[?#]/u)[0].split('/').map((segment) => guid.test(segment) ? '{id}' : segment).join('/')
  return new Error(`Fixture API ${method} ${route} failed: ${cause}.`)
}

export function publicApi(credentialKey) {
  return async (method, path, body, accepted = [], acceptedStatuses = []) => {
    const token = process.env[credentialKey]
    if (!token) throw new Error('Fixture requires a refreshed credential.')
    const multipart = body instanceof FormData
    const url = `${apiOrigin()}/api/${path}`
    // LogHabitCommand is idempotent with this header; replaying an unkeyed log would toggle it off.
    const replayHeaders = isFixtureLog(method, path) ? { 'Idempotency-Key': randomUUID() } : {}
    const options = {
      method, headers: { Authorization: `Bearer ${token}`, ...(multipart ? {} : { 'Content-Type': 'application/json' }), 'api-version': '2.0', ...replayHeaders },
      ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }),
      redirect: 'error',
    }
    let rateLimitWaits = 0
    let transportRetried = false
    while (true) {
      let response
      let text
      try {
        response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) })
        text = await response.text()
      } catch (error) {
        if (canRetryTransport(method, path) && !transportRetried) {
          transportRetried = true
          continue
        }
        throw fixtureFailure(method, path, error?.name === 'TimeoutError' ? 'timeout' : 'network')
      }
      if (response.status === 429 && rateLimitWaits < 3) {
        const retryAfter = response.headers.get('Retry-After')
        const seconds = retryAfter !== null && /^\d+$/.test(retryAfter) ? Math.min(65, Number(retryAfter)) : 60
        rateLimitWaits++
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
        continue
      }
      let payload
      try { payload = text ? JSON.parse(text) : null } catch {
        throw fixtureFailure(method, path, `non-JSON body (HTTP ${response.status})`)
      }
      if (!response.ok && !acceptedStatuses.includes(response.status) && !accepted.includes(payload?.errorCode)) {
        const errorCode = typeof payload?.errorCode === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/u.test(payload.errorCode)
          ? payload.errorCode : 'none'
        // PendingOperationRevisionResult carries its snake_case reason, such as stale_preview, in error, with no errorCode.
        const reason = errorCode === 'none' && typeof payload?.error === 'string' && /^[a-z][a-z0-9_]{0,79}$/u.test(payload.error)
          ? `, error: ${payload.error}` : ''
        throw fixtureFailure(method, path, `HTTP ${response.status} (errorCode: ${errorCode}${reason})`)
      }
      return { status: response.status, payload }
    }
  }
}

// Contract: orbit-api AiController.ConfirmPendingOperation returns ConfirmPendingOperationResponse
// (pendingOperationId, confirmationToken); execute takes that token with the same clientContext.
export async function approvePendingOperation(api, pendingId, clientContext) {
  const path = `ai/pending-operations/${pendingId}`
  const { payload } = await api('POST', `${path}/confirm?clientContext=${encodeURIComponent(JSON.stringify(clientContext))}`)
  if (payload?.pendingOperationId !== pendingId || typeof payload.confirmationToken !== 'string' || !payload.confirmationToken.trim()) {
    throw new Error('Approval confirmation lacks its bound token.')
  }
  // The token stays in memory and never enters the graded output or evidence reports.
  return api('POST', `${path}/execute`, { confirmationToken: payload.confirmationToken, clientContext })
}

export async function requireEvalAccess(credentialKey) {
  const expected = credentialKey === 'ORBIT_EVAL_TOKEN'
  try {
    const { payload } = await publicApi(credentialKey)('GET', 'config')
    const enabled = payload?.features?.astra_eval_unmetered?.enabled
    if (enabled !== expected) throw new Error('Eval allowance policy is unavailable.')
    return enabled
  } catch (error) {
    throw new Error(`Eval preflight failed: turn ${expected ? 'on' : 'off'} astra_eval_unmetered for ${credentialKey} through /flag on staging, then verify /api/config and retry. ${safeFailureMessage(error)}`)
  }
}
