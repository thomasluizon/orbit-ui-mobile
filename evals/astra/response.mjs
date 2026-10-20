export const traceSkipReason = 'Tool evidence skipped: orbit-tickets#1573 has no verified response field or opt-in header yet.'

// The API adapter waits for a verified #1573 response, rather than guessing an external field.
export function extractTrace() {
  return { state: 'skipped', reason: traceSkipReason }
}

export default function parseResponse(response, _text, context) {
  const httpStatus = context?.response.status ?? 200
  if (httpStatus === 403) {
    if (response?.errorCode !== 'PAY_GATE' || typeof response.error !== 'string' || !response.error.trim()) {
      throw new Error('Astra returned an unexpected refusal.')
    }
    return { answer: response.error, httpStatus, trace: extractTrace() }
  }
  if (!response || typeof response.aiMessage !== 'string' || !response.aiMessage.trim()) {
    throw new Error('Astra did not return a nonempty aiMessage final answer.')
  }
  return { answer: response.aiMessage, httpStatus, trace: extractTrace() }
}
