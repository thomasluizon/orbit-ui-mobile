import { refineResult } from './suggestions.mjs'
import { restartProposal, restartReadback } from './restart.mjs'
import { composition } from './composition.mjs'
export { composition }
export { proactiveOffers } from './proactive-offers.mjs'
import { matchesArguments, matchesOperation, outcomeCalls, failedBeforeDispatch } from './operation-matcher.mjs'
import { validateToolArguments } from './tool-validation.mjs'
import { tools, legacyTools, postReadTools, habitSetupTools, habitSetupBinding,
  toolWrites, toolSensitiveFields, observableSchema, offerTools, offerPostReadTools, offerHabitSetupTools } from './trace-policy.mjs'
import { resolveSchema } from './tool-schema.mjs'

const traceCatalog = (catalog) => catalog.map((tool) => ({ ...tool, function: { ...tool.function,
  description: tool.function.description ?? undefined,
  parameters: observableSchema(tool.function.parameters, new Set(tool.sensitiveFields)),
} }))
const compositionCatalog = traceCatalog(tools)
const legacyCatalog = traceCatalog(legacyTools)
const mergeCatalog = (initial, updates) => [...new Map([...initial, ...updates].map((tool) => [tool.function.name, tool])).values()]
const postReadCatalog = mergeCatalog(compositionCatalog, traceCatalog(postReadTools))
const offerCatalog = traceCatalog(offerTools)
const offerContinuationCatalog = mergeCatalog(offerCatalog, traceCatalog(offerPostReadTools))
const habitSetupCatalog = traceCatalog(habitSetupTools)
const offerHabitSetupCatalog = traceCatalog(offerHabitSetupTools)

const result = (pass, reason, metadata = {}) => ({ pass, score: pass ? 1 : 0, reason, metadata })
const decode = (output) => typeof output === 'string' ? JSON.parse(output) : output

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const statuses = new Set(['Succeeded', 'Failed', 'PendingConfirmation', 'Denied', 'UnsupportedByPolicy', 'NotExecuted'])

function bindDraftSchema(schema, draft, root) {
  if (Array.isArray(schema)) return schema.map((entry) => bindDraftSchema(entry, draft, root))
  schema = resolveSchema(schema, root)
  if (!isObject(schema)) return schema
  return Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, key === 'enum'
    ? value.map((entry) => entry === habitSetupBinding.draftCallId ? draft.callId
      : entry === habitSetupBinding.missingField ? draft.missingField : entry)
    : bindDraftSchema(value, draft, root)]))
}

function boundHabitSetupCatalog(drafts, offers = false) {
  const bound = structuredClone(offers ? offerHabitSetupCatalog : habitSetupCatalog)
  for (const tool of bound) {
    const root = tool.function.parameters
    root.properties.input = { anyOf: [...drafts.values()].map((draft) => bindDraftSchema(root.properties.input, draft, root)) }
  }
  return mergeCatalog(offers ? offerCatalog : compositionCatalog, bound)
}

function recordHabitSetupDraft(call, drafts) {
  if (!['create_habit', 'create_sub_habit'].includes(call.name) || typeof call.arguments.title !== 'string') return
  for (const [id, draft] of drafts) {
    if (draft.title === call.arguments.title) drafts.delete(id)
  }
  const payload = call.result?.payload
  if (call.resultStatus !== 'Succeeded' || call.result.success !== true || !isObject(payload)
    || payload.draft_call_id !== call.id || payload.title !== call.arguments.title
    || typeof payload.missing_field !== 'string' || !payload.missing_field.trim()
    || !isObject(payload.clarification) || payload.clarification.missingArgumentKey !== payload.missing_field) return
  drafts.set(call.id, { callId: call.id, title: payload.title, missingField: payload.missing_field })
}

export function savedStep(output, context) {
  if (!['saveTask', 'saveChecklistItem'].includes(context.vars.startingStepAction)) return result(true, 'No saved-step approval requested.')
  const verdict = decode(output)?.savedStepReadback
  return verdict?.pass === true ? verdict : result(false, verdict?.reason ?? 'Missing saved-step approval readback.', verdict?.metadata)
}

function traceBoundary(output, context) {
  if (decode(output)?.unavailable === true) return result(false, 'Astra response evidence is unavailable.', { unavailable: true })
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
  const supportsParts = context.vars.clientContext?.supportsParts === true
  const offers = context.vars.clientContext?.supportsProactiveOffers === true
  if (offers && !offerCatalog.length) return result(false, 'Missing producer-exported proactive tool catalog; regenerate against the evaluated API.', { unavailable: true })
  let catalog = offers ? offerCatalog : supportsParts ? compositionCatalog : legacyCatalog
  let hasSuccessfulAccountRead = false
  const drafts = new Map()
  let verdict = result(true, 'No tool calls to validate.')
  for (const call of trace.calls) {
    // ProcessUserChatCommand.Ask.cs enforces a typed read or bound missing-field draft before ask.
    if (supportsParts && call.name === 'ask' && !hasSuccessfulAccountRead && !drafts.size) {
      return result(false, 'ask requires a typed account read or a bound missing-field draft.')
    }
    // The trace has no round marker; a read and ask can share the initial declaration.
    const catalogs = supportsParts && call.name === 'ask' && hasSuccessfulAccountRead
      ? [catalog, offers ? offerCatalog : compositionCatalog] : [catalog]
    verdict = await validateToolArguments(call, catalogs, context)
    if (!verdict.pass) return verdict
    // Mirror ProcessUserChatCommand.Ask.cs:125-197 and ToolResults.cs:60-84 for ordered, typed declaration updates.
    const successfulAccountRead = toolWrites.get(call.name) === false
      && call.resultStatus === 'Succeeded' && call.result.success === true
      && (call.result.readDirective === `[[orbit:read:${call.id}]]`
        || (call.name === 'query_habits' && call.result.payload?.selection_required === true))
    if (supportsParts) {
      recordHabitSetupDraft(call, drafts)
      hasSuccessfulAccountRead ||= successfulAccountRead
      if (hasSuccessfulAccountRead) catalog = offers ? offerContinuationCatalog : postReadCatalog
      else if (drafts.size) catalog = boundHabitSetupCatalog(drafts, offers)
    }
  }
  return verdict
}

function checkMutationScope(calls, expectations) {
  const scope = [...expectations.required ?? [], ...expectations.permittedMutations ?? []]
  for (const call of calls) {
    const writes = toolWrites.get(call.name)
    if (typeof writes !== 'boolean') return result(false, `Tool lacks a catalog write classification: ${call.name}`)
    if (writes && !failedBeforeDispatch(call)) {
      const index = scope.findIndex((operation) => matchesOperation(call, operation))
      if (index < 0) return result(false, `Mutation outside the declared operation scope: ${call.name}`)
      scope.splice(index, 1)
    }
  }
}

export function behavior(output, context) {
  if (decode(output)?.unavailable === true) return result(false, 'Astra response evidence is unavailable.', { unavailable: true })
  const { httpStatus = 200 } = decode(output)
  if (httpStatus !== (context.vars.expectedHttpStatus ?? 200)) return result(false, 'Unexpected HTTP outcome for this scenario.')
  if (context.vars.refine) return refineResult(decode(output), context.vars)
  const trace = traceBoundary(output, context)
  if ('pass' in trace) return trace
  const verdict = toolBehavior(trace.calls, context.vars.expectations)
  if (!verdict.pass || !context.vars.restart) return verdict
  const proposal = restartProposal(decode(output), context.vars)
  return proposal.pass ? restartReadback(decode(output), context.vars) : proposal
}

export function toolBehavior(traceCalls, expectations) {
  const forbidden = [...new Set(traceCalls.filter((call) => expectations.forbidden?.includes(call.name)).map((call) => call.name))]
  if (forbidden.length) return result(false, `Forbidden tool: ${forbidden.join(', ')}`)
  const outside = [...new Set(traceCalls.filter((call) => expectations.allowed && !expectations.allowed.includes(call.name))
    .map((call) => `${call.name} (${call.resultStatus})`))]
  if (outside.length) {
    return result(false, `A tool was called outside the allowed set: ${outside.join(', ')}.`)
  }
  const calls = outcomeCalls(traceCalls, expectations)
  const scopeFailure = checkMutationScope(calls, expectations)
  if (scopeFailure) return scopeFailure
  for (const call of calls) {
    const expected = [...expectations.required ?? [], ...expectations.permittedMutations ?? []]
      .find((operation) => matchesOperation(call, operation))
    const status = expected?.anyOf?.find((alternative) => matchesOperation(call, alternative))?.resultStatus
      ?? expected?.resultStatus ?? (toolWrites.get(call.name) ? 'PendingConfirmation' : 'Succeeded')
    const validResult = status === 'Failed'
      ? expected?.result !== undefined && call.result?.success === false
        && typeof call.result.error === 'string' && call.result.error.trim().length > 0
      : call.result?.success === true && call.result.error === null
    if (call.resultStatus !== status || !validResult
      || (status === 'PendingConfirmation' && call.result.payload?.status !== 'awaiting_confirmation')) {
      return result(false, `Tool execution did not reach its expected outcome: ${call.name}`)
    }
  }
  // Match distinct calls without imposing a sequence on independent operations.
  const unmatched = [...calls]
  for (const required of expectations.required ?? []) {
    const index = unmatched.findIndex((call) => matchesOperation(call, required)
      && (required.resultStatus === undefined || call.resultStatus === required.resultStatus)
      && (required.result === undefined || matchesArguments(call.result, required.result, true)))
    if (index < 0) return result(false, `Missing tool or incorrect arguments/result: ${required.name ?? required.anyOf.map(({ name }) => name).join(' or ')}`)
    unmatched.splice(index, 1)
  }
  for (const [name, count] of Object.entries(expectations.counts ?? {})) {
    if (calls.filter((call) => call.name === name).length !== count) return result(false, `Wrong call count: ${name}`)
  }
  return result(true, 'Required tools, arguments and results matched.')
}
