import { createHash } from "node:crypto"
import { openSessionChain } from "./session-chain.mjs"
import { REPO_ROOT, readRunState, updateRunState } from "./run-state.mjs"

/** `queued` is the only disposition that keeps a question for the owner's own /questions. */
export const QUESTION_DISPOSITIONS = ["answered", "decided", "owner-step", "duplicate", "queued"]
const RECORDED_DISPOSITIONS = ["answered", "decided", "owner-step"]

const questionId = (question) =>
  createHash("sha256").update(question.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex").slice(0, 8)

const union = (...lists) => [...new Set(lists.flat())]

/** The fields of a row other than its identity, text, sources and blockers, such as `ticket` or `recommendation`. */
const rowDetails = ({ id, question, sources, blocks, ...details }) => details

/**
 * A row is the legacy question string or `{ question, sources, blocks, ...details }`; a row with no sources
 * belongs to its holder. A legacy row can hold its blockers as one string, so blocks always reads as a list.
 */
const questionRow = (row, holderSessionId) => {
  const { question, sources, blocks, ...details } = typeof row === "string" ? { question: row } : row ?? {}
  if (typeof question !== "string" || !question.trim()) throw new Error(`owner question row in session ${holderSessionId} has no question text`)
  return { ...details, id: questionId(question), question, sources: sources?.length ? sources : [holderSessionId], blocks: [blocks ?? []].flat() }
}

/**
 * One row per distinct question that still needs a disposition. A recorded filter settled every
 * question older than its own survivors, so the list starts at the newest chain entry that has one.
 */
export const ownerQuestionCandidates = (sessionId, repoRoot = REPO_ROOT) => {
  const state = readRunState(repoRoot)
  const predecessors = openSessionChain(sessionId, repoRoot)?.entries.filter((entry) => entry.sessionId !== sessionId) ?? []
  const settled = predecessors.findLastIndex((entry) => entry.questionFilter)
  const holders = [...predecessors.slice(Math.max(settled, 0)), ...(state?.sessionId === sessionId ? [state] : [])]
  const candidates = new Map()
  for (const holder of holders) {
    for (const row of (holder.openOwnerQuestions ?? []).map((entry) => questionRow(entry, holder.sessionId))) {
      const known = candidates.get(row.id)
      candidates.set(row.id, known ? { ...known, ...rowDetails(row), sources: union(known.sources, row.sources), blocks: union(known.blocks, row.blocks) } : row)
    }
  }
  return [...candidates.values()]
}

const isTextList = (value) => Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim())

const dispositionFailures = (candidates, dispositions) => {
  if (!Array.isArray(dispositions) || dispositions.some((row) => !row || typeof row !== "object" || Array.isArray(row))) return ["dispositions must be a JSON array of objects"]
  const failures = []
  const rows = new Map(dispositions.map((row) => [row.id, row]))
  if (rows.size !== dispositions.length) failures.push("each candidate id takes exactly one disposition")
  for (const row of dispositions) {
    if (!candidates.some((candidate) => candidate.id === row.id)) failures.push(`${row.id} names no candidate`)
    if (!QUESTION_DISPOSITIONS.includes(row.disposition)) failures.push(`${row.id} has disposition ${JSON.stringify(row.disposition)}; use ${QUESTION_DISPOSITIONS.join(", ")}`)
    if (RECORDED_DISPOSITIONS.includes(row.disposition) && (typeof row.record !== "string" || !row.record.trim())) failures.push(`${row.id} is ${row.disposition} with no record of where the work reads it`)
    if (row.disposition === "duplicate" && (row.of === row.id || !rows.has(row.of) || rows.get(row.of).disposition === "duplicate")) failures.push(`${row.id} is a duplicate of no settled or queued candidate`)
    if (row.blocks !== undefined && !isTextList(row.blocks)) failures.push(`${row.id} has blocks that are not a list of text`)
  }
  for (const candidate of candidates) {
    if (!rows.has(candidate.id)) failures.push(`${candidate.id} has no disposition: ${candidate.question}`)
  }
  return failures
}

const survivingRows = (candidates, dispositions) => dispositions.filter((row) => row.disposition === "queued").map((row) => {
  const joined = [row, ...dispositions.filter((other) => other.disposition === "duplicate" && other.of === row.id)]
  const asked = joined.map((entry) => candidates.find((candidate) => candidate.id === entry.id))
  return { ...Object.assign({}, ...asked.toReversed().map(rowDetails)), question: asked[0].question, sources: union(...asked.map((candidate) => candidate.sources)),
    blocks: union(...asked.map((candidate) => candidate.blocks), ...joined.map((entry) => entry.blocks ?? [])) }
})

/** Writes the filter and the surviving queue in one update, so the queue never holds a question the filter took out. */
export const recordQuestionFilter = (sessionId, dispositions, repoRoot = REPO_ROOT) => {
  const candidates = ownerQuestionCandidates(sessionId, repoRoot)
  const failures = dispositionFailures(candidates, dispositions)
  if (failures.length) throw new Error(failures.join("; "))
  const openOwnerQuestions = survivingRows(candidates, dispositions)
  const recorded = dispositions.map(({ id, disposition, record, of }) =>
    ({ id, question: candidates.find((candidate) => candidate.id === id).question, disposition, ...(record ? { record } : {}), ...(of ? { of } : {}) }))
  updateRunState((state) => {
    if (state?.sessionId !== sessionId) throw new Error("no run state for this session")
    return { ...state, openOwnerQuestions, questionFilter: { sessionId, recordedAt: new Date().toISOString(), dispositions: recorded } }
  }, repoRoot, { sessionId })
  return openOwnerQuestions
}

/**
 * Why the recorded filter does not cover the queue a relay would carry; empty when it does.
 * A run state outlives its session, so only a filter this session recorded counts.
 */
export const questionFilterGaps = (sessionId, repoRoot = REPO_ROOT) => {
  const state = readRunState(repoRoot)
  const recorded = state?.sessionId === sessionId && state.questionFilter?.sessionId === sessionId ? state.questionFilter.dispositions : null
  if (!recorded) return ["no recorded filter; run /questions --relay"]
  const unfiltered = ownerQuestionCandidates(sessionId, repoRoot).filter((candidate) => !recorded.some((row) => row.id === candidate.id))
  if (unfiltered.length) return unfiltered.map((candidate) => `no disposition for: ${candidate.question}`)
  const queued = recorded.filter((row) => row.disposition === "queued").map((row) => row.id).sort()
  const held = (state.openOwnerQuestions ?? []).map((row) => questionRow(row, sessionId).id).sort()
  return queued.join() === held.join() ? [] : ["openOwnerQuestions differs from the questions the filter queued"]
}
