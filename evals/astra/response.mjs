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

export default function parseResponse(response, _text, context) {
  const httpStatus = context?.response?.status ?? 200
  const responseRequestId = context?.response?.headers?.['x-orbit-request-id']
  if (httpStatus === 403) {
    if (response?.errorCode !== 'PAY_GATE' || typeof response.error !== 'string' || !response.error.trim()) {
      return { error: 'Astra returned an unexpected refusal.' }
    }
    return { answer: response.error, httpStatus, trace: { state: 'refused', responseRequestId } }
  }
  if (!response || typeof response.aiMessage !== 'string' || !response.aiMessage.trim()) {
    return { error: 'Astra did not return a nonempty aiMessage final answer.' }
  }
  return { answer: response.aiMessage, httpStatus, trace: extractTrace(response, responseRequestId) }
}
