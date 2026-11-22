// Producer: orbit-api ChatStreamEvent. A turn of POST /api/chat/stream is a started event and a final event with the
// response; the opt-in eval trace of the turn rides in the response (core/client-turn.mjs readTrace reads it there).
// The request id is echoed on the HTTP response (RequestCorrelationMiddleware).
export function streamedTurn(response, requestId) {
  const events = [{ type: 'started', turnId: '9a3c1c1e-3a52-4a4b-8f0a-0c2f6d6d2b11', state: 'running', replayed: false },
    { type: 'final', response }]
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream', 'x-orbit-request-id': requestId } })
}

// What the client sent for one turn of POST /api/chat/stream: the request id, the message, the history and the client context.
export async function sentTurn(url, options) {
  const request = new Request(url, options)
  const form = await request.formData()
  return { requestId: request.headers.get('x-orbit-request-id'), message: form.get('message'),
    history: JSON.parse(form.get('history')), clientContext: JSON.parse(form.get('clientContext')) }
}
