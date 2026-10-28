import { sanitizeEvidence } from './evidence.mjs'
import { normalizeField } from './trace-policy.mjs'

const privateField = (key) => /(?:^id$|ids$|id$|token|credential|password|secret|cookie|authorization|cursor|revision|keyprefix|keyhash)/.test(normalizeField(key))
const identity = /^(?:[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i

function collectPrivate(value, withheld) {
  if (typeof value === 'string' && value) withheld.add(value)
  else if (value && typeof value === 'object') Object.values(value).forEach((child) => collectPrivate(child, withheld))
}
function publicFacts(value, withheld) {
  if (typeof value === 'string' && identity.test(value)) return '[redacted]'
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
  const facts = publicFacts({ fixture: vars.fixtureEvidence ?? null,
    successfulTools: (output.trace?.calls ?? []).filter((call) => call.resultStatus === 'Succeeded'
      && call.result?.success === true && call.result.error === null)
      .map((call) => ({ name: call.name, result: call.result.payload })),
  }, withheld)
  return sanitizeEvidence(facts, withheld)
}

export default function gradingInput(output, { vars }) {
  return JSON.stringify({ answer: output.answer, groundingEvidence: groundingEvidence(output, vars) })
}
