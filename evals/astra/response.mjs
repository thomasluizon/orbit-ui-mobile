export function extractTrace(response, responseRequestId) {
  const trace = response?.evalTrace
  if (!trace || typeof trace.traceId !== 'string' || !trace.traceId.trim() || !Array.isArray(trace.toolCalls)) {
    return { state: 'unavailable', reason: 'Missing or malformed opt-in eval trace.' }
  }
  if (trace.traceId !== responseRequestId) {
    return { state: 'mismatched', reason: 'Trace and HTTP response identities differ.' }
  }
  return {
    state: 'available', requestId: trace.traceId, responseRequestId,
    calls: trace.toolCalls.map((call) => ({
      id: call?.id, name: call?.name, arguments: call?.arguments,
      resultStatus: call?.status, result: call?.result,
    })),
  }
}

const compositionKeys = ['aiMessage', 'parts', 'actions', 'operations', 'pendingOperations', 'policyDenials',
  'relatedSurfaces', 'followUps', 'followUpContext']
const privateKeys = new Set(['read', 'payload', 'refreshToken', 'queryToken', 'nextCursor', 'previewFingerprint',
  'stateFingerprint', 'expiresAtUtc', 'correlationId', 'readBlock', 'proposedValue'])

function finalAnswer(composition) {
  const visible = (value) => {
    if (Array.isArray(value)) return value.map(visible)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !privateKeys.has(key)).map(([key, child]) => [key, visible(child)]))
    return value
  }
  return JSON.stringify(visible(composition))
}

export default function parseResponse(response, _text, context) {
  const httpStatus = context?.response?.status ?? 200
  const responseRequestId = context?.response?.headers?.['x-orbit-request-id']
  if (httpStatus === 403) {
    if (response?.errorCode !== 'PAY_GATE' || typeof response.error !== 'string' || !response.error.trim()) {
      return { error: 'Astra returned an unexpected refusal.' }
    }
    return { answer: response.error, composition: { aiMessage: response.error }, httpStatus, trace: { state: 'refused', responseRequestId } }
  }
  if (response?.aiMessage != null && typeof response.aiMessage !== 'string') return { error: 'Astra returned malformed final text.' }
  const composition = Object.fromEntries(compositionKeys.filter((key) => response && Object.hasOwn(response, key))
    .map((key) => [key, response[key]]))
  const hasSurface = (Array.isArray(response?.parts) && response.parts.some((part) => part?.type === 'block'))
    || ['pendingOperations', 'actions', 'operations', 'policyDenials'].some((key) => Array.isArray(response?.[key]) && response[key].length > 0)
  if (!response || (!hasSurface && (typeof response.aiMessage !== 'string' || !response.aiMessage.trim()))) {
    return { error: 'Astra did not return a nonempty aiMessage final answer.' }
  }
  return { answer: hasSurface ? finalAnswer(composition) : response.aiMessage, composition, httpStatus, trace: extractTrace(response, responseRequestId) }
}
