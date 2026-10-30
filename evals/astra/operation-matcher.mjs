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
    if ('anyOf' in expected) return expected.anyOf.some((value) => matchesArguments(actual, value, orderedArrays))
    if ('allOf' in expected) return expected.allOf.every((value) => matchesArguments(actual, value, orderedArrays))
    if ('optional' in expected) return actual == null || matchesArguments(actual, expected.optional, orderedArrays)
    if ('jsonEquals' in expected) {
      if (typeof actual !== 'string') return false
      try { return isDeepStrictEqual(JSON.parse(actual), expected.jsonEquals) } catch { return false }
    }
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
      .some((arguments_) => matchesArguments(call.arguments, arguments_))
}

export function outcomeCalls(calls, expectations) {
  const scope = [...expectations.required ?? [], ...expectations.permittedMutations ?? []]
  return calls.filter((call, index) => {
    if (call.name !== 'bulk_create_habits') return true
    const deferred = call.resultStatus === 'Succeeded' && call.result?.success === true
      && call.result.error === null && call.result.payload?.status === 'awaiting_reads'
    const rejected = call.resultStatus === 'Failed' && call.result?.success === false
      && typeof call.result.error === 'string' && call.result.error.trim().length > 0
      && call.result.payload?.status === 'no_new_preview'
    if (!deferred && !rejected) return true
    // Only producer-confirmed non-dispatches recovered by a later scoped preview leave the outcome count.
    return !calls.slice(index + 1).some((candidate) => candidate.name === call.name
      && candidate.resultStatus === 'PendingConfirmation' && candidate.result?.success === true
      && candidate.result.error === null && candidate.result.payload?.status === 'awaiting_confirmation'
      && scope.some((operation) => matchesOperation(candidate, operation)))
  })
}
