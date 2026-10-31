import { tsImport } from 'tsx/esm/api'

const { chatResponseSchema } = await tsImport('../../packages/shared/src/types/chat.ts', import.meta.url)

export function extractTrace(response, responseRequestId) {
  const trace = response?.evalTrace
  const evidence = { timing: trace?.timing ?? null,
    calls: Array.isArray(trace?.toolCalls) ? trace.toolCalls.map((call) => ({
      id: call?.id, name: call?.name, arguments: call?.arguments,
      resultStatus: call?.status, result: call?.result,
    })) : [],
  }
  if (!trace || typeof trace.traceId !== 'string' || !trace.traceId.trim() || !Array.isArray(trace.toolCalls)) {
    return { ...evidence, state: 'unavailable', reason: 'Missing or malformed opt-in eval trace.' }
  }
  if (trace.traceId !== responseRequestId) {
    return { ...evidence, state: 'mismatched', reason: 'Trace and HTTP response identities differ.' }
  }
  return {
    ...evidence, state: 'available', requestId: trace.traceId, responseRequestId,
  }
}

const compositionKeys = Object.keys(chatResponseSchema.shape)

export default function parseResponse(response, _text, context) {
  const httpStatus = context?.response?.status ?? 200
  const responseRequestId = context?.response?.headers?.['x-orbit-request-id']
  if (httpStatus === 403 || httpStatus === 400) {
    const expectedCode = httpStatus === 403 ? 'PAY_GATE' : 'CONTENT_MODERATION_REFUSED'
    const httpError = { status: httpStatus, errorCode: response?.errorCode ?? null, error: response?.error ?? null,
      ...(httpStatus === 400 ? { responseRequestId: responseRequestId ?? null } : {}) }
    if (response?.errorCode !== expectedCode || typeof response.error !== 'string' || !response.error.trim()) {
      return { error: 'Astra returned an unexpected refusal.', ...(httpStatus === 400 ? { output: { httpStatus, httpError } } : {}) }
    }
    return { answer: response.error, composition: { aiMessage: response.error }, httpStatus,
      httpError,
      trace: { state: 'refused', responseRequestId, refusalCode: expectedCode } }
  }
  if (httpStatus !== 200) return { error: `Astra returned HTTP ${httpStatus}.` }
  if (response?.aiMessage != null && typeof response.aiMessage !== 'string') return { error: 'Astra returned malformed final text.' }
  const composition = Object.fromEntries(compositionKeys.filter((key) => response && Object.hasOwn(response, key))
    .map((key) => [key, response[key]]))
  const hasSurface = (Array.isArray(response?.parts) && response.parts.some((part) => part?.type === 'block'))
    || ['pendingOperations', 'actions', 'operations', 'policyDenials'].some((key) => Array.isArray(response?.[key]) && response[key].length > 0)
  if (!response || (!hasSurface && (typeof response.aiMessage !== 'string' || !response.aiMessage.trim()))) {
    return { error: 'Astra did not return a nonempty aiMessage final answer.' }
  }
  return { answer: response.aiMessage ?? '', composition, httpStatus, trace: extractTrace(response, responseRequestId) }
}
