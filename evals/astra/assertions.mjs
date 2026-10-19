import { assertions } from 'promptfoo'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'

const catalog = parse(readFileSync(new URL('./catalog.yaml', import.meta.url), 'utf8'))

const result = (pass, reason, metadata = {}) => ({ pass, score: pass ? 1 : 0, reason, metadata })
const decode = (output) => typeof output === 'string' ? JSON.parse(output) : output
const normalizeText = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/\s+/g, ' ').trim()

function traceBoundary(output) {
  const { trace } = decode(output)
  if (trace?.state === 'skipped') return result(true, trace.reason, { skipped: true })
  if (trace?.state !== 'available' || typeof trace.requestId !== 'string' || !trace.requestId
    || trace.requestId !== trace.responseRequestId || !Array.isArray(trace.calls)) {
    return result(false, 'Trace is missing, malformed, or belongs to another request.')
  }
  for (const call of trace.calls) {
    if (typeof call.name !== 'string' || !call.arguments || typeof call.arguments !== 'object'
      || Array.isArray(call.arguments) || typeof call.resultStatus !== 'string' || !call.resultStatus
      || !Object.hasOwn(call, 'result')) return result(false, 'Trace call lacks full arguments, status, or result.')
  }
  return trace
}

export async function structural(output, context) {
  const trace = traceBoundary(output)
  if ('pass' in trace) return trace
  if (trace.calls.length === 0) return result(true, 'No tool calls to validate.')
  return assertions.runAssertion({
    assertion: { type: 'is-valid-openai-tools-call' },
    provider: { config: { tools: catalog } },
    test: context.test,
    providerResponse: { output: trace.calls.map((call) => ({
      type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) },
    })) },
  })
}

function matchesArguments(actual, expected) {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length
      && expected.every((value) => actual.some((candidate) => matchesArguments(candidate, value)))
  }
  if (expected && typeof expected === 'object') {
    if ('textContains' in expected) {
      return typeof actual === 'string' && normalizeText(actual).includes(normalizeText(expected.textContains))
    }
    return actual && typeof actual === 'object'
      && Object.entries(expected).every(([key, value]) => matchesArguments(actual[key], value))
  }
  return actual === expected
}

export function behavior(output, context) {
  const { httpStatus = 200 } = decode(output)
  if (httpStatus !== (context.vars.expectedHttpStatus ?? 200)) return result(false, 'Unexpected HTTP outcome for this scenario.')
  const trace = traceBoundary(output)
  if ('pass' in trace) return trace
  const expectations = context.vars.expectations
  for (const forbidden of expectations.forbidden ?? []) {
    if (trace.calls.some((call) => call.name === forbidden)) return result(false, `Forbidden tool: ${forbidden}`)
  }
  if (expectations.allowed && trace.calls.some((call) => !expectations.allowed.includes(call.name))) {
    return result(false, 'A tool acted outside the allowed set.')
  }
  // Match distinct calls without imposing a sequence on independent operations.
  const unmatched = [...trace.calls]
  for (const required of expectations.required ?? []) {
    const argumentChoices = required.argumentsAnyOf ?? [required.arguments ?? {}]
    const index = unmatched.findIndex((call) => call.name === required.name
      && argumentChoices.some((arguments_) => matchesArguments(call.arguments, arguments_))
      && (required.resultStatus === undefined || call.resultStatus === required.resultStatus)
      && (required.result === undefined || matchesArguments(call.result, required.result)))
    if (index < 0) return result(false, `Missing tool or incorrect arguments/result: ${required.name}`)
    unmatched.splice(index, 1)
  }
  for (const [name, count] of Object.entries(expectations.counts ?? {})) {
    if (trace.calls.filter((call) => call.name === name).length !== count) return result(false, `Wrong call count: ${name}`)
  }
  return result(true, 'Required tools, arguments and results matched.')
}
