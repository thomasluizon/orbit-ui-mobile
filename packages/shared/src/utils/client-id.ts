let clientIdSequence = 0

/**
 * Builds a process-unique local identifier for optimistic rows and React keys.
 * Prefers the platform CSPRNG (`crypto.randomUUID`) when available; otherwise a
 * monotonic sequence guarantees local uniqueness without a weak PRNG.
 */
export function createClientId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  clientIdSequence += 1
  return `${prefix}-${Date.now().toString(36)}-${clientIdSequence.toString(36)}`
}
