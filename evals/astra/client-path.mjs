import { runCase } from './core/conversation.mjs'
import { openConversation, sendTurn } from './core/client-turn.mjs'
import { gradePreview, outcome as gradeOutcome } from './core/outcome.mjs'

const decode = (output) => typeof output === 'string' ? JSON.parse(output) : output

// A case names a record by its fixture name, never by its id. A field that names a record holds its id, or its stored
// title: a preview shows the parent of a new record by title (orbit-api PendingOperationChangePreviewer).
function namedRecords(value, vars) {
  if (Array.isArray(value)) return value.map((entry) => namedRecords(entry, vars))
  if (!value || typeof value !== 'object') return value
  if (typeof value.record === 'string' && Object.keys(value).length === 1) {
    const id = vars.records[value.record]
    return { oneOf: [id, vars.fixtureEvidence.habits.find((habit) => habit.id === id)?.title].filter(Boolean) }
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, namedRecords(child, vars)]))
}

// The vars of one launch corpus case in the form that the core set runs and grades: its expected outcome, the answer of
// the person, and the records of its fixture by name. The expected fields are resolved here; the targets stay names.
function coreVars(vars) {
  const expected = vars.outcome.changes
    ? { ...vars.outcome, changes: vars.outcome.changes.map((change) => ({ ...change, ...(change.fields ? { fields: namedRecords(change.fields, vars) } : {}) })) }
    : vars.outcome
  return { ...vars, core: { expected, answer: vars.answer ?? null, prefix: [], lead: [], image: null, resend: false,
    records: vars.records, nestedCreates: true, decision: vars.outcome.decision,
    reuses: vars.outcome.changes?.some((change) => change.kind === 'reuse') === true, baseline: vars.fixtureEvidence?.habits } }
}

// The conversation of one case on a shipped client: the client context that the case states, and its recorded history
// as the messages that the client already holds. A conversation id makes the shared builder turn offers on, and a
// converted case grades no offer, so a client with parts keeps offers off, as hooks.mjs builds the context that grades it.
export const openCaseConversation = (vars) => openConversation({ platform: vars.clientContext.platform, locale: vars.clientContext.locale,
  credentialKey: vars.credentialKey, timeZone: vars.accountTimeZone, uses24HourClock: vars.uses24HourClock,
  messages: vars.history ?? [],
  context: vars.clientContext.supportsParts === true ? { ...vars.clientContext, supportsProactiveOffers: false } : vars.clientContext })

// The typed error of a turn that the server ended, as the answer of POST /api/chat keeps it (response.mjs): an HTTP 400
// names the response that carried it.
const httpErrorOf = (turn) => ({ status: turn.status, errorCode: turn.code, error: turn.error,
  ...(turn.status === 400 ? { responseRequestId: turn.responseRequestId ?? null } : {}) })

// The answer of a refused turn, in the shape that the composition and the rubric of a refusal case read.
const refusal = ({ error: _error, unavailable: _unavailable, ...output }, turn) => ({ ...output,
  refused: { status: turn.status, code: turn.code }, httpStatus: turn.status,
  httpError: httpErrorOf(turn),
  answer: turn.error, composition: { aiMessage: turn.error },
  trace: { state: 'refused', responseRequestId: turn.responseRequestId, refusalCode: turn.code } })

// Sends the turns of one case on the client path (POST /api/chat/stream, in one conversation) and holds its preview.
// Nothing is approved, unless the case states what the person decides (`decision`: approve, or reject): the case then
// decides the preview and reads the saved state back. A turn that the server refuses is the answer of a case that expects a refusal. An HTTP 400 with
// AI_UNAVAILABLE is an outage of the model provider and no evidence of the build, for each form of case: the attempt
// stays incomplete with its typed error, as on POST /api/chat, and a later window can complete the case.
export async function holdCase(vars, { send = sendTurn, api, conversation = vars.conversation ?? openCaseConversation(vars) } = {}) {
  let last
  const output = await runCase(coreVars(vars), { conversation, api, approve: vars.outcome.decision !== undefined, send: async (...turn) => (last = await send(...turn)) })
  if (last.kind === 'failed' && last.status === 400 && last.code === 'AI_UNAVAILABLE') {
    return { ...output, unavailable: true, httpStatus: last.status, httpError: httpErrorOf(last) }
  }
  return vars.outcome.refusal && last.kind === 'failed' && last.status && !output.unavailable ? refusal(output, last) : output
}

// The provider path of a case with an outcome. An attempt without a gradable answer returns its reason as the provider
// error, so no grader call is spent on it.
export async function runOutcomeCase(vars, dependencies) {
  if (vars.preconditionFailure) {
    return { error: `Precondition unavailable: ${vars.preconditionFailure}`,
      metadata: { astraPreconditionFailure: true, astraPreconditionReason: vars.preconditionFailure } }
  }
  const output = await holdCase(vars, dependencies)
  return output.error ? { error: output.error, output } : { output }
}

// promptfoo assertion: the outcome of one attempt of a launch corpus case: its held preview and, when the case decides
// the preview, the saved state after the decision. A preview that the grader cannot classify is missing evidence of the
// grader, so the case stays incomplete and does not fail the build.
export function outcome(output, context) {
  const vars = coreVars(context.vars)
  const { pass, score, reason, metadata } = vars.outcome.decision ? gradeOutcome(output, { vars }) : gradePreview(decode(output), vars)
  const { matched: _matched, ...kept } = metadata
  return { pass, score, reason, metadata: kept.graderLimit ? { ...kept, unavailable: true } : kept }
}
