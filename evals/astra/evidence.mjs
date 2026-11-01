import { redactCredentials } from './credentials.mjs'
import { tools, legacyTools, postReadTools, habitSetupTools, offerTools, offerPostReadTools, offerHabitSetupTools, normalizeField } from './trace-policy.mjs'
import { schemaVariants } from './tool-schema.mjs'

function collectStrings(value, withheld) {
  if (typeof value === 'string' && value) withheld.add(value)
  else if (value && typeof value === 'object') Object.values(value).forEach((child) => collectStrings(child, withheld))
}

function bulkCreateItemSchemas(catalog) {
  return catalog.filter((tool) => tool.function.name === 'bulk_create_habits').flatMap((tool) => {
    const root = tool.function.parameters
    return schemaVariants(root, root).flatMap((schema) => schemaVariants(schema.properties?.habits, root))
      .flatMap((schema) => schemaVariants(schema.items, root))
      .filter((schema) => schema.type === 'object' && schema.properties)
      .map((schema) => ({ schema, root }))
  })
}

function observableEncodedArguments(value, schemas, sensitiveFields, withheld) {
  let decoded
  try {
    decoded = JSON.parse(value)
  } catch {
    collectStrings(value, withheld)
    return null
  }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded) || !schemas.length) {
    collectStrings(value, withheld)
    collectStrings(decoded, withheld)
    return null
  }
  return observableArguments(decoded, schemas, sensitiveFields, withheld)
}

function observableArguments(value, schemas, sensitiveFields, withheld, encodedItemSchemas) {
  const variants = schemas.flatMap(({ schema, root }) => schemaVariants(schema, root).map((schema) => ({ schema, root })))
  if (!variants.length || (variants.every(({ schema }) => [schema.type].flat()
    .every((type) => ['object', 'array', 'null'].includes(type))) && typeof value !== 'object')) {
    collectStrings(value, withheld)
    return null
  }
  if (Array.isArray(value)) {
    const items = variants.flatMap(({ schema, root }) => schema.items ? [{ schema: schema.items, root }] : [])
    return value.map((child) => observableArguments(child, items, sensitiveFields, withheld, encodedItemSchemas))
  }
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    const matches = variants.flatMap(({ schema, root }) => Object.hasOwn(schema.properties ?? {}, key)
      ? [{ schema: schema.properties[key], root }] : [])
    if (!matches.length || sensitiveFields.has(normalizeField(key))) {
      collectStrings(child, withheld)
      return []
    }
    return [[key, key === 'arguments' && typeof child === 'string' && encodedItemSchemas
      ? observableEncodedArguments(child, encodedItemSchemas, sensitiveFields, withheld)
      : observableArguments(child, matches, sensitiveFields, withheld, encodedItemSchemas)]]
  }))
}

function timingEvidence(timing) {
  if (!timing) return null
  return { totalMilliseconds: timing.totalMilliseconds,
    phases: timing.phases?.map(({ name, milliseconds, elapsedMilliseconds }) => ({ name, milliseconds, elapsedMilliseconds })) }
}

function collectMarkedValues(value, sensitiveFields, withheld) {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (sensitiveFields.has(normalizeField(key))) collectStrings(child, withheld)
    else collectMarkedValues(child, sensitiveFields, withheld)
  }
}

export function sanitizeEvidence(value, withheld = new Set()) {
  if (typeof value === 'string') {
    let text = redactCredentials(value)
    for (const secret of [...withheld].sort((left, right) => right.length - left.length)) text = text.replaceAll(secret, '[redacted]')
    return text.replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[redacted]')
      .replace(/\bBearer\s+[^\s"\\]+/gi, 'Bearer [redacted]')
  }
  if (Array.isArray(value)) return value.map((child) => sanitizeEvidence(child, withheld))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sanitizeEvidence(child, withheld)]))
}

function resultEvidence(result, name) {
  if (!result || typeof result !== 'object') return null
  const scalar = (value) => ['string', 'number', 'boolean'].includes(typeof value) || value === null
  const payloadFields = ['status', 'item_count', 'habit_count', 'date_count', 'proposed_titles', 'dates', 'errorCode', 'error', 'arguments']
  return { success: typeof result.success === 'boolean' ? result.success : null,
    error: typeof result.error === 'string' ? result.error : null,
    payload: result.payload && typeof result.payload === 'object'
      ? { ...Object.fromEntries(payloadFields.filter((key) => Object.hasOwn(result.payload, key)
        && (scalar(result.payload[key]) || (Array.isArray(result.payload[key]) && result.payload[key].every(scalar))))
        .map((key) => [key, result.payload[key]])),
      ...(name === 'suggest_habits' && Array.isArray(result.payload.drafts) ? { drafts: result.payload.drafts } : {}) } : null }
}

export function attemptEvidence(entry, attempt) {
  const output = entry.response?.output
  const catalog = entry.testCase.vars?.clientContext?.supportsParts === true ? [...tools, ...postReadTools, ...habitSetupTools, ...offerTools, ...offerPostReadTools, ...offerHabitSetupTools] : legacyTools
  const withheld = new Set()
  const toolCalls = (output?.trace?.calls ?? []).map((call) => {
    const declarations = catalog.filter((candidate) => candidate.function.name === call.name)
    const sensitiveFields = new Set(declarations.flatMap((tool) => tool.sensitiveFields))
    const encodedItemSchemas = call.name === 'ask' && call.arguments?.input?.form === 'pickList'
      ? (call.arguments.input.action === 'create_habits' ? bulkCreateItemSchemas(catalog) : []) : undefined
    collectMarkedValues(call.result, sensitiveFields, withheld)
    return { name: call.name,
      arguments: observableArguments(call.arguments, declarations.map((tool) => ({
        schema: tool.function.parameters, root: tool.function.parameters,
      })), sensitiveFields, withheld, encodedItemSchemas),
      resultStatus: call.resultStatus, ...(declarations.length ? { result: resultEvidence(call.result, call.name) } : {}) }
  })
  const evidence = sanitizeEvidence({ ...attempt,
    ...(entry.testCase.vars?.setupEvidence ? { setup: entry.testCase.vars.setupEvidence } : {}),
    ...(output?.httpError ? { httpError: output.httpError } : {}),
    ...(entry.testCase.vars?.offerFamily ? { requestedAim: entry.testCase.vars.requestedAim ?? null } : {}),
    answer: output?.answer ?? null,
    ...(output?.trace ? { trace: { state: output.trace.state } } : {}),
    composition: (output?.composition?.parts ?? []).filter((part) => part?.type === 'block')
      .map((part) => ({ kind: part.kind, subtype: part.block?.kind ?? null })),
    toolCalls,
    ...(output?.restartReadback ? { restart: {
      proposed: (output.composition.pendingOperations ?? []).flatMap((pending) => pending.items.map((item) => ({
        title: item.entityName, dueDate: item.fields.find((field) => field.field === 'due_date')?.newValue,
      }))),
      ...output.restartReadback,
    } } : {}),
    timing: timingEvidence(output?.trace?.timing),
    savedStep: entry.gradingResult?.componentResults?.find((assertion) => assertion.assertion?.metric === 'savedStep')?.metadata?.savedStep ?? null,
    ...(output?.brainDumpReadback ? { brainDumpReadback: output.brainDumpReadback } : {}),
    ...(output?.offerReadback ? { offerReadback: output.offerReadback } : {}),
    renderError: output?.renderError ?? null,
    graderRationale: attempt.assertions.filter((assertion) => assertion.metric === 'finalAnswer')
      .map((assertion) => assertion.reason).join('\n') || entry.gradingResult?.reason || null,
  }, withheld)
  for (const field of ['requestId', 'responseRequestId']) {
    const value = output?.trace?.[field]
    if (typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(value)
      && redactCredentials(value) === value && !withheld.has(value)) evidence.trace[field] = value
  }
  for (const [index, turn] of (output?.offerReadback?.turns ?? []).entries()) {
    for (const field of ['requestId', 'responseRequestId']) {
      const value = turn.trace?.[field]
      if (typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(value)
        && redactCredentials(value) === value && !withheld.has(value)) evidence.offerReadback.turns[index].trace[field] = value
    }
  }
  const requestId = output?.httpError?.responseRequestId
  if (typeof requestId === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(requestId)
    && redactCredentials(requestId) === requestId && !withheld.has(requestId)) {
    evidence.httpError.responseRequestId = requestId
  }
  const setupRequestId = entry.testCase.vars?.setupEvidence?.requestId
  if (typeof setupRequestId === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(setupRequestId)
    && redactCredentials(setupRequestId) === setupRequestId && !withheld.has(setupRequestId)) {
    evidence.setup.requestId = setupRequestId
  }
  return evidence
}
