import { sanitizeEvidence } from './evidence.mjs'
import { suggestionAnswer } from './suggestions.mjs'
import { normalizeField } from './trace-policy.mjs'

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

export function groundingEvidence(output, vars) {
  const withheld = new Set()
  const trace = output.trace
  const bound = trace?.state === 'available' && Array.isArray(trace.calls) && typeof vars.evalRequestId === 'string'
    && trace.requestId === vars.evalRequestId && trace.responseRequestId === vars.evalRequestId
  const facts = publicFacts({ fixture: vars.fixtureEvidence ?? null,
    successfulTools: (bound ? trace.calls : []).filter((call) => call.resultStatus === 'Succeeded'
      && call.result?.success === true && call.result.error === null)
      .map((call) => ({ name: call.name, result: call.result.payload })),
  }, withheld)
  return sanitizeEvidence(facts, withheld)
}

export default function gradingInput(output, { vars }) {
  const originalSelectedDraft = vars.refineDraft ? JSON.parse(suggestionAnswer([{ type: 'block', kind: 'habitSuggestions',
    block: { drafts: [vars.refineDraft] } }], vars.clientContext.locale)).parts[0].block.drafts[0] : undefined
  return JSON.stringify({ answer: output.answer, groundingEvidence: groundingEvidence(output, vars),
    ...(originalSelectedDraft ? { originalSelectedDraft } : {}) })
}
