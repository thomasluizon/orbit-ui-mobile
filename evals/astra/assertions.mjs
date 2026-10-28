import { refineResult } from './suggestions.mjs'
import { composition } from './composition.mjs'
export { composition }
import { approveStartingStep } from './step-persistence.mjs'
import { safeFailureMessage } from './credentials.mjs'
import { assertions } from 'promptfoo'
import { isDeepStrictEqual } from 'node:util'
import { tools, legacyTools, toolSensitiveFields, observableSchema } from './trace-policy.mjs'

const toolWrites = new Map(tools.map((tool) => [tool.function.name, tool.writes]))

const traceCatalog = (catalog) => catalog.map((tool) => ({ ...tool, function: { ...tool.function,
  parameters: observableSchema(tool.function.parameters, new Set(tool.sensitiveFields)),
} }))
const compositionCatalog = traceCatalog(tools)
const legacyCatalog = traceCatalog(legacyTools)

const result = (pass, reason, metadata = {}) => ({ pass, score: pass ? 1 : 0, reason, metadata })
const decode = (output) => typeof output === 'string' ? JSON.parse(output) : output
const normalizeText = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/\s+/g, ' ').trim()

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const statuses = new Set(['Succeeded', 'Failed', 'PendingConfirmation', 'Denied', 'UnsupportedByPolicy', 'NotExecuted'])

export async function savedStep(output, context) {
  if (!['saveTask', 'saveChecklistItem'].includes(context.vars.startingStepAction)) return result(true, 'No saved-step approval requested.')
  try {
    for (const grade of [structural, behavior, composition]) {
      const check = await grade(output, context)
      if (check.pass !== true || check.metadata?.unavailable) return result(false, `Saved-step approval blocked: ${check.reason}`)
    }
    return await approveStartingStep(decode(output), context.vars)
  } catch (error) { return result(false, `Saved-step approval or readback failed: ${safeFailureMessage(error)}`) }
}

function traceBoundary(output, context) {
  const { trace } = decode(output)
  const requestId = context.vars.evalRequestId
  if (typeof requestId !== 'string' || !requestId.trim() || trace?.responseRequestId !== requestId) {
    return result(false, 'Trace is missing, malformed, or belongs to another request.', { unavailable: true })
  }
  if (trace.state === 'refused') {
    const status = decode(output).httpStatus
    const expectedRefusal = (status === 403 && trace.refusalCode === 'PAY_GATE')
      || (status === 400 && trace.refusalCode === 'CONTENT_MODERATION_REFUSED'
        && context.vars.expectedErrorCode === 'CONTENT_MODERATION_REFUSED' && context.vars.clientContext?.supportsParts !== true)
    return expectedRefusal && context.vars.expectedHttpStatus === status
      && context.vars.expectations?.allowed?.length === 0 && !context.vars.expectations?.required?.length
      ? result(true, 'Verified expected typed HTTP refusal; no tool execution evidence is claimed.')
      : result(false, 'Unexpected refusal cannot satisfy tool requirements.')
  }
  if (trace.state !== 'available' || trace.requestId !== requestId || !Array.isArray(trace.calls)) {
    return result(false, 'Trace is missing, malformed, or belongs to another request.', { unavailable: true })
  }
  const ids = new Set()
  for (const call of trace.calls) {
    if (!call || typeof call.id !== 'string' || !call.id.trim() || ids.has(call.id)
      || typeof call.name !== 'string' || !call.name.trim() || !isObject(call.arguments)
      || !statuses.has(call.resultStatus) || !Object.hasOwn(call, 'result')) {
      return result(false, 'Trace call lacks verifiable identity, arguments, status, or result.', { unavailable: true })
    }
    ids.add(call.id)
    if (call.resultStatus === 'NotExecuted' && call.result === null) continue
    const payload = call.result
    const omitsName = toolSensitiveFields.get(call.name)?.has('name') === true
    if (!isObject(payload) || payload.id !== call.id
      || (omitsName ? Object.hasOwn(payload, 'name') : payload.name !== call.name)
      || typeof payload.success !== 'boolean' || !Object.hasOwn(payload, 'payload')
      || !['entityId', 'entityName', 'error'].every((key) => Object.hasOwn(payload, key)
        && (payload[key] === null || typeof payload[key] === 'string'))) {
      return result(false, 'Tool result is missing, withheld, or malformed.', { unavailable: true })
    }
  }
  return trace
}

export async function structural(output, context) {
  if (context.vars.refine) return refineResult(decode(output), context.vars)
  const trace = traceBoundary(output, context)
  if ('pass' in trace) return trace
  if (trace.calls.length === 0) return result(true, 'No tool calls to validate.')
  return assertions.runAssertion({
    assertion: { type: 'is-valid-openai-tools-call' },
    provider: { config: { tools: context.vars.clientContext?.supportsParts === true ? compositionCatalog : legacyCatalog } },
    test: context.test,
    providerResponse: { output: trace.calls.map((call) => ({
      type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) },
    })) },
  })
}

function matchesArguments(actual, expected, orderedArrays = false) {
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
    if ('allOf' in expected) return expected.allOf.every((value) => matchesArguments(actual, value, orderedArrays))
    if ('optional' in expected) return actual == null || matchesArguments(actual, expected.optional, orderedArrays)
    if ('textContains' in expected) {
      return typeof actual === 'string' && normalizeText(actual).includes(normalizeText(expected.textContains))
    }
    return actual && typeof actual === 'object'
      && Object.entries(expected).every(([key, value]) => matchesArguments(actual[key], value, orderedArrays))
  }
  return actual === expected
}

function matchesOperation(call, expected) {
  if (expected.anyOf) return expected.anyOf.some((alternative) => matchesOperation(call, alternative))
  return call.name === expected.name
    && (expected.argumentsAnyOf ?? [expected.arguments ?? {}])
      .some((arguments_) => expected.exactArguments === true
        ? isDeepStrictEqual(call.arguments, arguments_) : matchesArguments(call.arguments, arguments_))
}

function checkMutationScope(calls, expectations) {
  const scope = [...expectations.required ?? [], ...expectations.permittedMutations ?? []]
  for (const call of calls) {
    const writes = toolWrites.get(call.name)
    if (typeof writes !== 'boolean') return result(false, `Tool lacks a catalog write classification: ${call.name}`)
    if (writes) {
      const index = scope.findIndex((operation) => matchesOperation(call, operation))
      if (index < 0) return result(false, `Mutation outside the declared operation scope: ${call.name}`)
      scope.splice(index, 1)
    }
  }
}

export function behavior(output, context) {
  const { httpStatus = 200 } = decode(output)
  if (httpStatus !== (context.vars.expectedHttpStatus ?? 200)) return result(false, 'Unexpected HTTP outcome for this scenario.')
  if (context.vars.refine) return refineResult(decode(output), context.vars)
  const trace = traceBoundary(output, context)
  if ('pass' in trace) return trace
  const expectations = context.vars.expectations
  const forbidden = [...new Set(trace.calls.filter((call) => expectations.forbidden?.includes(call.name)).map((call) => call.name))]
  if (forbidden.length) return result(false, `Forbidden tool: ${forbidden.join(', ')}`)
  const outside = [...new Set(trace.calls.filter((call) => expectations.allowed && !expectations.allowed.includes(call.name)).map((call) => call.name))]
  if (outside.length) {
    return result(false, `A tool acted outside the allowed set: ${outside.join(', ')}.`)
  }
  const scopeFailure = checkMutationScope(trace.calls, expectations)
  if (scopeFailure) return scopeFailure
  for (const call of trace.calls) {
    const expected = [...expectations.required ?? [], ...expectations.permittedMutations ?? []]
      .find((operation) => matchesOperation(call, operation))
    const status = expected?.anyOf?.find((alternative) => matchesOperation(call, alternative))?.resultStatus
      ?? expected?.resultStatus ?? (toolWrites.get(call.name) ? 'PendingConfirmation' : 'Succeeded')
    if (call.resultStatus !== status || call.result?.success !== true || call.result.error !== null
      || (status === 'PendingConfirmation' && call.result.payload?.status !== 'awaiting_confirmation')) {
      return result(false, `Tool execution did not reach its expected outcome: ${call.name}`)
    }
  }
  // Match distinct calls without imposing a sequence on independent operations.
  const unmatched = [...trace.calls]
  for (const required of expectations.required ?? []) {
    const index = unmatched.findIndex((call) => matchesOperation(call, required)
      && (required.resultStatus === undefined || call.resultStatus === required.resultStatus)
      && (required.result === undefined || matchesArguments(call.result, required.result, true)))
    if (index < 0) return result(false, `Missing tool or incorrect arguments/result: ${required.name ?? required.anyOf.map(({ name }) => name).join(' or ')}`)
    unmatched.splice(index, 1)
  }
  for (const [name, count] of Object.entries(expectations.counts ?? {})) {
    if (trace.calls.filter((call) => call.name === name).length !== count) return result(false, `Wrong call count: ${name}`)
  }
  return result(true, 'Required tools, arguments and results matched.')
}
