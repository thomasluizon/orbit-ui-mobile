import { sanitizeEvidence } from './evidence.mjs'
import { suggestionAnswer } from './suggestions.mjs'
import { normalizeField } from './trace-policy.mjs'
import { redactCredentials } from './credentials.mjs'
import { visiblePreview } from './visible-preview.mjs'

const privateField = (key) => /(?:^id$|ids$|id$|token|credential|password|secret|cookie|authorization|cursor|revision|keyprefix|keyhash|^instruction$)/.test(normalizeField(key))
const identity = /^(?:[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i

function collectPrivate(value, withheld) {
  if (typeof value === 'string' && value) withheld.add(value)
  else if (value && typeof value === 'object') Object.values(value).forEach((child) => collectPrivate(child, withheld))
}
function publicFacts(value, withheld) {
  if (typeof value === 'string') return value.replace(/\b(?:[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\b/gi, '[redacted]')
  if (Array.isArray(value)) return value.map((child) => publicFacts(child, withheld))
  if (!value || typeof value !== 'object') return value
  if (Object.keys(value).length && Object.keys(value).every((key) => identity.test(key))) {
    return Object.values(value).map((child) => publicFacts(child, withheld))
  }
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    if (privateField(key)) { collectPrivate(child, withheld); return [] }
    return [[key, publicFacts(child, withheld)]]
  }))
}

function evidenceFacts(output, vars, withheld) {
  const trace = output.trace
  const bound = typeof vars.evalRequestId === 'string' && trace?.responseRequestId === vars.evalRequestId
  const calls = bound && trace.state === 'available' && trace.requestId === vars.evalRequestId
    && Array.isArray(trace.calls) ? trace.calls : []
  const successful = calls.filter((call) => call.resultStatus === 'Succeeded'
      && call.result?.success === true && call.result.error === null)
  const refusal = bound && trace.state === 'refused' && output.httpError?.status === output.httpStatus
    && output.httpError?.errorCode === trace.refusalCode
  return publicFacts({ fixture: vars.fixtureEvidence ?? null,
    successfulTools: successful.map((call) => ({ name: call.name, result: call.result.payload })),
    toolOutcomes: calls.filter((call) =>
      (call.resultStatus === 'Failed' && call.result?.success === false && typeof call.result.error === 'string')
      || (call.resultStatus === 'PendingConfirmation' && call.result?.success === true && call.result.error === null))
      .map((call) => ({ name: call.name, status: call.resultStatus, error: call.result.error, result: call.result.payload })),
    readScopes: (output.composition?.parts ?? []).flatMap((part) => {
      const read = part.type === 'block' ? part.block?.read : null
      return read && successful.some((call) => call.name === read.queryFamily)
        ? [{ name: read.queryFamily, scope: read.scope }] : []
    }),
    ...(refusal ? { httpError: output.httpError } : {}),
  }, withheld)
}

export function groundingEvidence(output, vars) {
  const withheld = new Set()
  return sanitizeEvidence(evidenceFacts(output, vars, withheld), withheld)
}

export default function gradingInput(output, { vars }) {
  const withheld = new Set()
  const facts = evidenceFacts(output, vars, withheld)
  const emailPattern = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
  const emails = new Map()
  for (const [email] of JSON.stringify(facts).matchAll(emailPattern)) {
    const key = email.toLowerCase()
    if (!emails.has(key)) emails.set(key, `[grounded-email-${emails.size + 1}]`)
  }
  const replaceEmails = (text) => text.replace(emailPattern, (email) => emails.get(email.toLowerCase()) ?? '[unsupported-email]')
  const originalSelectedDraft = vars.refineDraft ? JSON.parse(suggestionAnswer([{ type: 'block', kind: 'habitSuggestions',
    block: { drafts: [vars.refineDraft] } }], vars.clientContext.locale)).parts[0].block.drafts[0] : undefined
  return JSON.stringify({ answer: typeof output.answer === 'string' ? redactCredentials(replaceEmails(output.answer)) : output.answer,
    groundingEvidence: sanitizeEvidence(JSON.parse(replaceEmails(JSON.stringify(facts))), withheld),
    ...(vars.composition?.correction && vars.baselinePreview ? {
      setupPreview: JSON.parse(redactCredentials(replaceEmails(JSON.stringify(vars.baselinePreview.map(visiblePreview))))),
    } : {}),
    ...(originalSelectedDraft ? { originalSelectedDraft } : {}) })
}
