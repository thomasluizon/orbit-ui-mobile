import { apiOrigin } from '../credentials.mjs'

function fixtureFailure(method, path, cause) {
  const pathname = path.split(/[?#]/u)[0].replace(/^(habits|tags|goals|checklist-templates)\/([^/]+)/u,
    (_, resource, id) => `${resource}/${resource === 'habits' && id === 'bulk' ? id : '{id}'}`)
  return new Error(`Fixture API ${method} ${pathname} failed: ${cause}.`)
}

export function publicApi(credentialKey) {
  return async (method, path, body, accepted = [], acceptedStatuses = []) => {
    const token = process.env[credentialKey]
    if (!token) throw new Error('Fixture requires a refreshed credential.')
    const multipart = body instanceof FormData
    const url = `${apiOrigin()}/api/${path}`
    const options = {
      method, headers: { Authorization: `Bearer ${token}`, ...(multipart ? {} : { 'Content-Type': 'application/json' }), 'api-version': '2.0' },
      ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }),
      redirect: 'error',
    }
    let rateLimitWaits = 0
    while (true) {
      let response
      let text
      try {
        response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) })
        text = await response.text()
      } catch (error) {
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
      if (!response.ok && !acceptedStatuses.includes(response.status) && !accepted.includes(payload?.errorCode)) throw new Error(`Fixture API ${method} failed with HTTP ${response.status}.`)
      return { status: response.status, payload }
    }
  }
}

export async function requireEvalAccess(credentialKey) {
  const expected = credentialKey === 'ORBIT_EVAL_TOKEN'
  try {
    const { payload } = await publicApi(credentialKey)('GET', 'config')
    const enabled = payload?.features?.astra_eval_unmetered?.enabled
    if (enabled !== expected) throw new Error('Eval allowance policy is unavailable.')
    return enabled
  } catch {
    throw new Error(`Eval preflight failed: turn ${expected ? 'on' : 'off'} astra_eval_unmetered for ${credentialKey} through /flag on staging, then verify /api/config and retry.`)
  }
}
