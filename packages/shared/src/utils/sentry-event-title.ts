interface TitledEvent {
  exception?: { values?: { type?: string; mechanism?: { synthetic?: boolean } }[] }
}

/**
 * Makes Sentry title an event by its message or by the captured value. The React Native SDK attaches a
 * stack to each message, which makes the event synthetic, as does a captured value that is no `Error`.
 */
export function titleSentryEventByContent<T extends TitledEvent>(event: T): T {
  const exception = event.exception?.values?.[0]
  if (!exception?.mechanism?.synthetic) return event
  // WHY: Sentry titles a synthetic exception with its function name, so a capture from a callback reads "anonymous" https://github.com/getsentry/sentry/blob/master/src/sentry/eventtypes/error.py
  exception.mechanism.synthetic = false
  exception.type ??= 'Message'
  return event
}
