import { apiOrigin } from '../credentials.mjs'

export function publicApi(credentialKey) {
  return async (method, path, body, accepted = [], acceptedStatuses = []) => {
    const token = process.env[credentialKey]
    if (!token) throw new Error('Fixture requires a refreshed credential.')
    const multipart = body instanceof FormData
    let response
    let payload
    try {
      response = await fetch(`${apiOrigin()}/api/${path}`, {
        method, headers: { Authorization: `Bearer ${token}`, ...(multipart ? {} : { 'Content-Type': 'application/json' }), 'api-version': '2.0' },
        ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }),
        redirect: 'error', signal: AbortSignal.timeout(15000),
      })
      const text = await response.text()
      payload = text ? JSON.parse(text) : null
    } catch {
      throw new Error('Fixture API transport or JSON response failed.')
    }
    if (!response.ok && !acceptedStatuses.includes(response.status) && !accepted.includes(payload?.errorCode)) throw new Error(`Fixture API ${method} failed with HTTP ${response.status}.`)
    return { status: response.status, payload }
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
