import { isDeepStrictEqual } from 'node:util'

const normalizeText = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/\s+/g, ' ').trim()

export function matchesArguments(actual, expected, orderedArrays = false) {
  if (actual === '[redacted]') return false
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false
    if (orderedArrays) return expected.every((value, index) => matchesArguments(actual[index], value, true))
    const unmatched = [...actual]
    return expected.every((value) => {
      const index = unmatched.findIndex((candidate) => matchesArguments(candidate, value))
      if (index < 0) return false
      unmatched.splice(index, 1)
      return true
    })
  }
  if (expected && typeof expected === 'object') {
    if ('optional' in expected) return actual == null || matchesArguments(actual, expected.optional, orderedArrays)
    if ('textContains' in expected) {
      return typeof actual === 'string' && normalizeText(actual).includes(normalizeText(expected.textContains))
    }
    return actual && typeof actual === 'object'
      && Object.entries(expected).every(([key, value]) => matchesArguments(actual[key], value, orderedArrays))
  }
  return actual === expected
}

export function matchesOperation(call, expected) {
  if (expected.anyOf) return expected.anyOf.some((alternative) => matchesOperation(call, alternative))
  return call.name === expected.name
    && (expected.argumentsAnyOf ?? [expected.arguments ?? {}])
      .some((arguments_) => expected.exactArguments === true
        ? isDeepStrictEqual(call.arguments, arguments_) : matchesArguments(call.arguments, arguments_))
}
