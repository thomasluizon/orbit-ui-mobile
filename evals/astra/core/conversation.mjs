import { readFileSync } from 'node:fs'
import { clientContextOf, openConversation, sendTurn } from './client-turn.mjs'
import { answerQuestion } from './answers.mjs'
import { gradePreview, savedRecords } from './outcome.mjs'
import { approvePendingOperation, publicApi } from '../fixtures/api.mjs'
import { shownCards } from '../same-title-card.mjs'
import { visibleAnswer } from '../visible-answer.mjs'
import { safeFailureMessage } from '../credentials.mjs'

// A turn without an answer from the assistant is no evidence of its behavior: the stream failed, the service was
// throttled or down, or a spend ceiling stopped the call. The case stays incomplete and continues in a later window.
const serviceCodes = ['AI_UNAVAILABLE', 'AI_DAILY_BUDGET_EXCEEDED', 'AI_PROVIDER_QUOTA_EXHAUSTED']
const noEvidence = ({ status, code }) => status === null || status === 429 || status >= 500 || serviceCodes.includes(code)
const failure = (turn, step) => ({ unavailable: noEvidence(turn),
  error: `${step} failed${turn.status ? ` with HTTP ${turn.status}` : ''}${turn.code ? ` (${turn.code})` : ''}: ${turn.error}` })

const readImage = (name) => ({ name, type: 'image/png', bytes: readFileSync(new URL(`./fixtures/${name}`, import.meta.url)) })

const readHabits = async (api) => (await api('GET', 'eval/snapshot')).payload.habits

// Approves each held preview as the client does, then reads the saved state back. Nothing is approved when the held
// preview already changed the account.
async function approveAndReadBack(previews, conversation, vars, api) {
  try {
    const held = await readHabits(api)
    const unchanged = JSON.stringify(savedRecords(held, vars.accountDate)) === JSON.stringify(savedRecords(vars.core.baseline, vars.accountDate))
    if (unchanged) for (const preview of previews) await approvePendingOperation(api, preview.id, clientContextOf(conversation))
    return { baseline: vars.core.baseline, held, after: unchanged ? await readHabits(api) : held }
  } catch (error) {
    return { unavailable: true, error: `Approval or the saved state readback failed: ${safeFailureMessage(error)}` }
  }
}

async function sendTurnAgain(turn, api) {
  const again = await turn.sendAgain()
  if (again.kind === 'failed') return failure(again, 'The turn sent again')
  try {
    const { payload } = await api('GET', 'eval/pending-operations')
    return { replayed: again.replayed, previewIds: again.previewIds, pendingCount: payload?.pendingCount ?? null }
  } catch (error) {
    return { unavailable: true, error: `The pending preview count readback failed: ${safeFailureMessage(error)}` }
  }
}

// Runs one case as a person with a shipped client: sends the phrasing, answers each question the case allows, and stops
// at the first preview. One question past the allowed count is recorded and not answered. A write case whose preview
// holds the expected changes is approved and read back.
export async function runCase(vars, { send = sendTurn, api = publicApi(vars.credentialKey) } = {}) {
  const { expected, prefix, image, resend } = vars.core
  const conversation = openConversation({ platform: vars.clientContext.platform, locale: vars.clientContext.locale,
    credentialKey: vars.credentialKey, timeZone: vars.accountTimeZone, messages: prefix })
  const output = { turns: 0, questionsBeforePreview: 0, previews: [], modelCalls: 0 }
  const maxQuestions = expected.questions?.max ?? 0
  let attempted = { content: vars.input, ...(image ? { image: readImage(image) } : {}) }
  let turn
  for (;;) {
    turn = await send(conversation, attempted, output.turns === 0 ? vars.evalRequestId : undefined)
    if (turn.kind === 'failed') return { ...output, ...failure(turn, 'The chat turn') }
    output.turns++
    output.modelCalls = output.modelCalls === null || turn.trace?.modelCalls == null ? null : output.modelCalls + turn.trace.modelCalls
    output.previews = turn.response.pendingOperations ?? []
    if (output.previews.length || expected.read) break
    output.questionsBeforePreview++
    if (output.questionsBeforePreview > maxQuestions) break
    const answer = answerQuestion(turn, vars)
    if (!answer.pass) { Object.assign(output, { answerFailure: answer.reason, graderLimit: answer.graderLimit === true }); break }
    attempted = { content: answer.message, ...(answer.blockAnswer ? { blockAnswer: answer.blockAnswer } : {}) }
  }
  output.composition = turn.response
  output.asked = shownCards(output).length > 0
  output.trace = turn.trace ? { state: 'available', requestId: turn.requestId, responseRequestId: turn.requestId, calls: turn.trace.calls } : null
  try {
    output.answer = visibleAnswer(turn.response, vars.clientContext, vars.accountDate, vars.accountTimeZone)
  } catch (error) {
    return { ...output, answer: null, error: `The answer cannot be drawn (${error.blockKind ?? 'composition'}): ${error.message}` }
  }
  if (expected.read || !gradePreview(output, vars).pass) return output
  if (resend) output.resend = await sendTurnAgain(turn, api)
  output.readback = await approveAndReadBack(output.previews, conversation, vars, api)
  return output
}
