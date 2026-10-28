import { redactCredentials } from './credentials.mjs'
import { tools, legacyTools, normalizeField } from './trace-policy.mjs'

function collectStrings(value, withheld) {
  if (typeof value === 'string' && value) withheld.add(value)
  else if (value && typeof value === 'object') Object.values(value).forEach((child) => collectStrings(child, withheld))
}

function observableArguments(value, schema, sensitiveFields, withheld) {
  if (!schema || (schema.type === 'object' && typeof value !== 'object')) {
    collectStrings(value, withheld)
    return null
  }
  if (Array.isArray(value)) return value.map((child) => observableArguments(child, schema?.items, sensitiveFields, withheld))
  if (!value || typeof value !== 'object') return value
  const properties = schema.properties ?? Object.assign({}, ...(schema.anyOf ?? []).map((variant) => variant.properties))
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    const property = Object.hasOwn(properties, key) ? properties[key] : undefined
    if (!property || sensitiveFields.has(normalizeField(key))) {
      collectStrings(child, withheld)
      return []
    }
    return [[key, observableArguments(child, property, sensitiveFields, withheld)]]
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

export function attemptEvidence(entry, attempt) {
  const output = entry.response?.output
  const catalog = entry.testCase.vars?.clientContext?.supportsParts === true ? tools : legacyTools
  const withheld = new Set()
  const toolCalls = (output?.trace?.calls ?? []).map((call) => {
    const tool = catalog.find((candidate) => candidate.function.name === call.name)
    const sensitiveFields = new Set(tool?.sensitiveFields)
    collectMarkedValues(call.result, sensitiveFields, withheld)
    return { name: call.name,
      arguments: observableArguments(call.arguments, tool?.function.parameters, sensitiveFields, withheld),
      resultStatus: call.resultStatus }
  })
  return sanitizeEvidence({ ...attempt,
    answer: output?.answer ?? null,
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
    renderError: output?.renderError ?? null,
    graderRationale: attempt.assertions.filter((assertion) => assertion.metric === 'finalAnswer')
      .map((assertion) => assertion.reason).join('\n') || entry.gradingResult?.reason || null,
  }, withheld)
}
