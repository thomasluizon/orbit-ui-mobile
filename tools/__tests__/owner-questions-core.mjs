import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { T, stageRepo } from "./_harness.mjs"
import { ownerQuestionCandidates, questionFilterGaps, recordQuestionFilter } from "../lib/owner-questions.mjs"
import { appendChainEntry, confirmChainSuccessor, sessionChainEntry } from "../lib/session-chain.mjs"
import { readRunState, updateRunState, writeRunState } from "../lib/run-state.mjs"

export const ANSWERABLE = Array.from({ length: 16 }, (_, index) => `Which layer owns contract ${index + 1}?`)
export const PRODUCT = "Is the yearly plan priced below ten monthly payments?"

/** Predecessors `s1..sN` each relayed with `questionsOf(index)`; the last successor is `current`. */
export const stageQuestionChain = (label, relays, questionsOf) => {
  const checkout = stageRepo(`questions-${label}`).path
  for (let index = 1; index <= relays; index++) {
    appendChainEntry({ sessionId: `s${index}`, openOwnerQuestions: questionsOf(index) }, checkout)
    confirmChainSuccessor(`s${index}`, index === relays ? "current" : `s${index + 1}`, `term_${index + 1}`, 1, checkout)
  }
  return checkout
}

const refusal = (action) => {
  try { action(); return "" } catch (error) { return error.message }
}

const answerableCases = () => {
  const respelled = (index) => ANSWERABLE.map((question) => index % 2 ? question : `  ${question.toUpperCase().replace(" ", "   ")}`)
  const checkout = stageQuestionChain("answerable", 8, respelled)
  writeRunState({ sessionId: "current", sleep: true, openOwnerQuestions: ANSWERABLE }, checkout)
  const candidates = ownerQuestionCandidates("current", checkout)
  T("owner-questions: 144 queued copies across the chain list 16 distinct candidates", candidates.length === 16 && candidates.every((row) => row.sources.length === 9), JSON.stringify(candidates.map((row) => row.sources.length)))
  T("owner-questions: a relay with no recorded filter has a gap", /no recorded filter/.test(questionFilterGaps("current", checkout).join()))
  const settled = candidates.map((row, index) => ({ id: row.id, disposition: index % 2 ? "decided" : "answered", record: `ticket #${index + 1} comment` }))
  const partial = refusal(() => recordQuestionFilter("current", settled.slice(1), checkout))
  T("owner-questions: a candidate with no disposition refuses the record and names the question", partial.includes(`no disposition: ${candidates[0].question}`) && readRunState(checkout).openOwnerQuestions.length === 16, partial)
  const queue = recordQuestionFilter("current", settled, checkout)
  T("owner-questions: 16 answerable duplicate questions queue 0", queue.length === 0 && readRunState(checkout).openOwnerQuestions.length === 0)
  T("owner-questions: the filter record keeps each question with its disposition and record", readRunState(checkout).questionFilter.dispositions.length === 16 &&
    readRunState(checkout).questionFilter.dispositions[1].question === candidates[1].question && readRunState(checkout).questionFilter.dispositions[1].record === "ticket #2 comment")
  T("owner-questions: a complete filter leaves no gap", questionFilterGaps("current", checkout).length === 0, questionFilterGaps("current", checkout).join())
  updateRunState((state) => ({ ...state, openOwnerQuestions: [PRODUCT] }), checkout, { sessionId: "current" })
  T("owner-questions: a question that enters the queue after the filter is a gap", questionFilterGaps("current", checkout).join() === `no disposition for: ${PRODUCT}`, questionFilterGaps("current", checkout).join())
  updateRunState((state) => ({ ...state, openOwnerQuestions: [ANSWERABLE[0]] }), checkout, { sessionId: "current" })
  T("owner-questions: a settled question back in the queue is a gap", /differs from the questions the filter queued/.test(questionFilterGaps("current", checkout).join()))
  T("owner-questions: a session that does not own the run state records nothing", refusal(() => recordQuestionFilter("other", [], checkout)) === "no run state for this session")
}

const survivorCases = async () => {
  const paraphrase = "Yearly plan: cheaper than ten monthly payments?"
  const step = "Cancel the second account on 4 December."
  const checkout = stageQuestionChain("survivor", 3, (index) => [{ question: PRODUCT, blocks: [`#${100 + index}`] }, ...(index === 2 ? [paraphrase, step] : [])])
  writeRunState({ sessionId: "current", sleep: true, openOwnerQuestions: [PRODUCT, "Should the helper live in packages/shared?"] }, checkout)
  const [product, repeated, ownerStep, engineering] = ownerQuestionCandidates("current", checkout)
  T("owner-questions: one candidate row keeps every source and blocker", product.sources.join() === "s1,s2,s3,current" && product.blocks.join() === "#101,#102,#103")
  const dispositions = [
    { id: product.id, disposition: "queued" },
    { id: repeated.id, disposition: "duplicate", of: product.id, blocks: ["#200"] },
    { id: ownerStep.id, disposition: "owner-step", record: ".claude/specs/relay.md ## Open questions" },
    { id: engineering.id, disposition: "decided", record: "decision log D7" },
  ]
  for (const [name, rows, expected] of [
    ["an asked disposition", [{ ...dispositions[0], disposition: "asked" }, ...dispositions.slice(1)], /has disposition "asked"/],
    ["an answer with no record", [...dispositions.slice(0, 3), { id: engineering.id, disposition: "answered" }], /answered with no record/],
    ["an owner step with no spec line", [...dispositions.slice(0, 2), { id: ownerStep.id, disposition: "owner-step" }, dispositions[3]], /owner-step with no record/],
    ["a duplicate of a duplicate", [dispositions[0], dispositions[1], { id: ownerStep.id, disposition: "duplicate", of: repeated.id }, dispositions[3]], /duplicate of no settled or queued candidate/],
    ["an unknown candidate id", [...dispositions, { id: "00000000", disposition: "queued" }], /00000000 names no candidate/],
    ["two rows for one candidate", [...dispositions, dispositions[0]], /exactly one disposition/],
    ["blocks that are not text", [{ ...dispositions[0], blocks: [7] }, ...dispositions.slice(1)], /blocks that are not a list of text/],
    ["a payload that is not an array", { id: product.id }, /JSON array of objects/],
  ]) {
    const refused = refusal(() => recordQuestionFilter("current", rows, checkout))
    T(`owner-questions: ${name} refuses the record`, expected.test(refused) && readRunState(checkout).questionFilter === undefined, refused)
  }
  const queue = recordQuestionFilter("current", dispositions, checkout)
  T("owner-questions: a real product question survives once", queue.length === 1 && queue[0].question === PRODUCT)
  T("owner-questions: the surviving row joins the sources and blockers of its duplicate", queue[0].sources.join() === "s1,s2,s3,current" && queue[0].blocks.join() === "#101,#102,#103,#200", JSON.stringify(queue[0]))
  T("owner-questions: an owner-only step and a decided question leave the queue", JSON.stringify(readRunState(checkout).openOwnerQuestions) === JSON.stringify(queue) && questionFilterGaps("current", checkout).length === 0)

  const transcriptPath = join(checkout, ".git", "transcript.jsonl")
  writeFileSync(transcriptPath, `${JSON.stringify({ type: "assistant", timestamp: "2026-11-01T00:00:00.000Z", message: { id: "call", usage: { input_tokens: 1, cache_creation_input_tokens: 1, cache_read_input_tokens: 1, output_tokens: 1 } } })}\n`)
  const decisionLogPath = join(checkout, ".git", "sleep-decisions.md")
  writeFileSync(decisionLogPath, "D7 The helper stays in the app until a third caller exists.\n")
  appendChainEntry(await sessionChainEntry({ ...readRunState(checkout), decisionLogPath }, transcriptPath), checkout)
  confirmChainSuccessor("current", "next", "term_next", 1, checkout)
  writeRunState({ sessionId: "next", sleep: true, openOwnerQuestions: ["Does the widget ship in the first release?"] }, checkout)
  const later = ownerQuestionCandidates("next", checkout)
  T("owner-questions: a later relay lists the survivors and the new question, never a settled one", later.map((row) => row.question).join("|") === `${PRODUCT}|Does the widget ship in the first release?`, JSON.stringify(later.map((row) => row.question)))
  T("owner-questions: a carried survivor keeps the sessions that raised it", later[0].sources.join() === "s1,s2,s3,current" && later[1].sources.join() === "next")
}

export const cases = async () => {
  answerableCases()
  await survivorCases()
}
