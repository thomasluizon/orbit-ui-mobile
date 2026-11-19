// The answer of the card question read: exactly one key, `half`, with one of the three names. claude-grader.mjs retries a
// call whose answer has another shape, and same-title-card.mjs reads the answer of any configured grader with the same check.
export const halfNames = ['deleted', 'renamed', 'unclear']

export function isHalfAnswer(value) {
  const keys = value !== null && typeof value === 'object' ? Object.keys(value) : []
  return keys.length === 1 && keys[0] === 'half' && halfNames.includes(value.half)
}
