import { clientContextOf, openConversation, sendTurn } from './client-turn.mjs'
import { answerQuestion, questionCards, questionOf } from './answers.mjs'
import { imageBytes } from './corpus.mjs'
import { detailFields, gradePreview, savedRecords } from './outcome.mjs'
import { approvePendingOperation, publicApi } from '../fixtures/api.mjs'
import { visibleAnswer } from '../visible-answer.mjs'
import { safeFailureMessage } from '../credentials.mjs'

// Only a throttle, a spend ceiling, or a card or preview turn whose grading needs the eval trace and that returned none
// is no evidence of the build: the case stays incomplete and continues in a later window. Each other failure is the build
// under test failing the person: an HTTP 5xx, a stream that stops or ends without a final event, a failed approval. It
// fails the attempt, so no later window runs the case again.
const ceilingCodes = ['AI_DAILY_BUDGET_EXCEEDED', 'AI_PROVIDER_QUOTA_EXHAUSTED']
const failure = (turn, step) => ({ unavailable: turn.status === 429 || ceilingCodes.includes(turn.code),
  error: `${step} failed${turn.status ? ` with HTTP ${turn.status}` : ''}${turn.code ? ` (${turn.code})` : ''}: ${turn.error}` })
const requestFailure = (error, step) => ({ unavailable: error?.status === 429, error: `${step} failed: ${safeFailureMessage(error)}` })

const readHabits = async (api) => (await api('GET', 'eval/snapshot')).payload.habits

// The saved rows of the account after the approval. The snapshot row of a habit holds no due time, so a record that the
// approval created is read with its habit detail when the request names a field that only the detail holds.
async function readSaved(api, { expected, baseline }) {
  const habits = await readHabits(api)
  const named = expected.changes.filter((change) => change.kind === 'create').flatMap((change) => Object.keys(change.fields ?? {}))
  if (!named.some((field) => detailFields.includes(field))) return habits
  const saved = []
  for (const habit of habits) {
    if (baseline.some((stored) => stored.id === habit.id)) { saved.push(habit); continue }
    const { payload: detail } = await api('GET', `habits/${habit.id}`)
    if (detail?.id !== habit.id) throw new Error('The habit detail readback names another record.')
    saved.push({ ...detail, ...habit })
  }
  return saved
}

// Approves each held preview as the client does, then reads the saved state back. Nothing is approved when the held
// preview already changed the account.
async function approveAndReadBack(previews, conversation, vars, api) {
  try {
    const held = await readHabits(api)
    const unchanged = JSON.stringify(savedRecords(held, vars.accountDate)) === JSON.stringify(savedRecords(vars.core.baseline, vars.accountDate))
    if (unchanged) for (const preview of previews) await approvePendingOperation(api, preview.id, clientContextOf(conversation))
    return { baseline: vars.core.baseline, held, after: unchanged ? await readSaved(api, vars.core) : held }
  } catch (error) {
    return requestFailure(error, 'Approval or the saved state readback')
  }
}

async function sendTurnAgain(turn, api) {
  const again = await turn.sendAgain()
  if (again.kind === 'failed') return failure(again, 'The turn sent again')
  try {
    const { payload } = await api('GET', 'eval/pending-operations')
    return { replayed: again.replayed, previewIds: again.previewIds, pendingCount: payload?.pendingCount ?? null }
  } catch (error) {
    return requestFailure(error, 'The pending preview count readback')
  }
}

// Runs one case as a person with a shipped client. The person sends the earlier owner messages of a live situation and
// then the phrasing, one message after each question, in one conversation; answers each further question the case
// allows; and stops at the first preview. A reply that is no question, and one question past the allowed count, are
// recorded and not answered. A write case whose preview holds the expected changes is approved and read back.
export async function runCase(vars, { send = sendTurn, api = publicApi(vars.credentialKey), now = () => performance.now() } = {}) {
  const { expected, prefix, lead, image, resend } = vars.core
  const conversation = openConversation({ platform: vars.clientContext.platform, locale: vars.clientContext.locale,
    credentialKey: vars.credentialKey, timeZone: vars.accountTimeZone, uses24HourClock: vars.uses24HourClock, messages: prefix })
  const output = { turns: 0, questionsBeforePreview: 0, previews: [], modelCalls: 0, seconds: 0 }
  const maxQuestions = expected.questions?.max ?? 0
  const typed = [...lead, vars.input]
  const typedMessage = (index) => ({ content: typed[index],
    ...(image && index === typed.length - 1 ? { image: { name: image, type: 'image/png', bytes: imageBytes(image) } } : {}) })
  let attempted = typedMessage(0)
  let waited = 0
  let turn
  for (;;) {
    const sent = now()
    turn = await send(conversation, attempted, output.turns === 0 ? vars.evalRequestId : undefined)
    waited += now() - sent
    output.seconds = Number((waited / 1000).toFixed(1))
    if (turn.kind === 'failed') return { ...output, ...failure(turn, 'The chat turn') }
    output.turns++
    const counted = output.modelCalls
    output.modelCalls = counted === null || turn.trace?.modelCalls == null ? null : counted + turn.trace.modelCalls
    output.previews = turn.response.pendingOperations ?? []
    if (output.previews.length || expected.read) break
    const question = questionOf(turn, expected)
    if (!question.pass) { output.answerFailure = question.reason; break }
    output.questionsBeforePreview++
    if (output.questionsBeforePreview > maxQuestions) break
    if (output.turns < typed.length) { attempted = typedMessage(output.turns); continue }
    const answer = answerQuestion(turn, vars)
    if (!answer.pass) {
      // The turn without the trace adds no counted model calls, as a failed turn adds none, so a later window that
      // replaces this attempt keeps the cost of the run measured.
      Object.assign(output, answer.unavailable ? { unavailable: true, error: answer.reason, modelCalls: counted }
        : { answerFailure: answer.reason, graderLimit: answer.graderLimit === true })
      break
    }
    attempted = { content: answer.message, ...(answer.blockAnswer ? { blockAnswer: answer.blockAnswer } : {}) }
  }
  output.composition = turn.response
  output.asked = questionCards(turn.response).length > 0
  output.trace = turn.trace ? { state: 'available', requestId: turn.trace.requestId, responseRequestId: turn.responseRequestId,
    calls: turn.trace.calls, timing: turn.trace.timing } : null
  try {
    output.answer = visibleAnswer(turn.response, vars.clientContext, vars.accountDate, vars.accountTimeZone)
  } catch (error) {
    return { ...output, answer: null, error: `The answer cannot be drawn (${error.blockKind ?? 'composition'}): ${error.message}` }
  }
  if (expected.read) return output
  const preview = gradePreview(output, vars)
  if (preview.metadata.graderLimit) output.graderLimit = true
  if (!preview.pass) return output
  if (resend) output.resend = await sendTurnAgain(turn, api)
  output.readback = await approveAndReadBack(output.previews, conversation, vars, api)
  return output
}
