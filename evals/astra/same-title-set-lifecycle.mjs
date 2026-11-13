import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { tsImport } from 'tsx/esm/api'
import { structural, behavior, composition } from './assertions.mjs'
import { sameTitleProposal } from './same-title-set.mjs'
import { sameTitleCard } from './same-title-card.mjs'
import { approvePendingOperation, publicApi } from './fixtures/api.mjs'
import { readSameTitleSet } from './fixtures/same-title-set.mjs'
import { requireEvalOrigin } from './fixtures/reset.mjs'

const { buildRecentChatHistory } = await tsImport('../../packages/shared/src/utils/chat-history.ts', import.meta.url)
const actionTools = { deleted: 'bulk_delete_habits', renamed: 'bulk_update_habits' }
const passed = (check) => check.pass === true && !check.metadata?.skipped && !check.metadata?.unavailable

async function gates(output, vars) {
  const context = { vars: { ...vars, sameTitleSet: undefined }, test: { vars } }
  const checks = []
  for (const grade of [structural, behavior, composition]) checks.push({ metric: grade.name, ...await grade(output, context) })
  return checks.map(({ metric, pass, reason, metadata }) => ({ metric, pass: passed({ pass, metadata }), reason }))
}

// The answer turn must hold the whole request: one preview with every declared action and no further question.
function answerVars(vars, card) {
  const tools = Object.keys(actionTools).filter((name) => vars.sameTitleSet[name]).map((name) => actionTools[name])
  const history = buildRecentChatHistory([
    ...(vars.history ?? []).map(({ role, content }) => ({ role: role === 'assistant' ? 'ai' : 'user', content })),
    { role: 'user', content: vars.input }, { role: 'ai', content: card.turn.aiMessage ?? '', parts: card.turn.parts },
    { role: 'user', content: card.message },
  ])
  return { ...vars, input: card.message, evalRequestId: randomUUID(), sameTitleSet: undefined, history: undefined,
    historyJson: JSON.stringify(history), blockAnswerJson: card.blockAnswer ? JSON.stringify(card.blockAnswer) : undefined,
    composition: { mode: 'preview', previews: 1, allowPreviewNote: vars.composition.allowPreviewNote },
    expectations: { required: tools.map((name) => ({ name })), allowed: ['query_habits', ...tools],
      forbidden: ['ask', 'delete_habit', 'update_habit'], counts: Object.fromEntries(tools.map((name) => [name, 1])) } }
}

async function answerQuestion(output, vars, chat) {
  const card = sameTitleCard(output, vars)
  if (!card.pass) return { card: { pass: false, reason: card.reason } }
  const next = answerVars(vars, { ...card, turn: output.composition })
  const response = await chat(next.input, { vars: next })
  if (response.error || !response.output?.composition) {
    return { card: { pass: true, reason: card.reason }, checks: [{ metric: 'answerTurn', pass: false, reason: response.error ?? 'Missing answer turn.' }] }
  }
  return { card: { pass: true, reason: card.reason }, message: card.message, checks: await gates(response.output, next),
    composition: { pendingOperations: response.output.composition.pendingOperations ?? [] } }
}

export async function completeSameTitleSet(output, vars, chat) {
  requireEvalOrigin()
  if (!(await gates(output, vars)).every((check) => check.pass)) return output
  const asked = Boolean(vars.sameTitleSet.answer) && !(output.composition.pendingOperations ?? []).length
  if (!asked && !sameTitleProposal(output, vars).pass) return output
  const api = publicApi(vars.credentialKey)
  const parentId = vars.sameTitleBaseline.parent.id
  const held = await readSameTitleSet(api, parentId)
  if (!isDeepStrictEqual(held, vars.sameTitleBaseline)) return { ...output, sameTitleReadback: { held, after: held } }
  const answered = asked ? { ...output, sameTitleAnswer: await answerQuestion(output, vars, chat) } : output
  if (asked && !sameTitleProposal(answered, vars).pass) return answered
  const pending = asked ? answered.sameTitleAnswer.composition.pendingOperations : output.composition.pendingOperations ?? []
  const before = asked ? await readSameTitleSet(api, parentId) : held
  if (!isDeepStrictEqual(before, vars.sameTitleBaseline)) return { ...answered, sameTitleReadback: { held: before, after: before } }
  for (const operation of pending) await approvePendingOperation(api, operation.id, vars.clientContext)
  return { ...answered, sameTitleReadback: { held: before, after: await readSameTitleSet(api, parentId) } }
}
