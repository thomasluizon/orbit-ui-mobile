/** Narrows an unknown value to a non-null object (a record). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}
