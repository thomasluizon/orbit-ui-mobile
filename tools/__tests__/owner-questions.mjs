import { spawnSync } from "node:child_process"
import { cpSync } from "node:fs"
import { join } from "node:path"
import { T, toolPath } from "./_harness.mjs"
import { ANSWERABLE, PRODUCT, exitedPid, reusedPidRecord, stageClaudeSessions, stageQuestionChain } from "./owner-questions-core.mjs"
import { readRunState, writeRunState } from "../lib/run-state.mjs"

export const cases = async () => {
  const checkout = stageQuestionChain("command", 2, () => [PRODUCT, ANSWERABLE[0]])
  cpSync(toolPath("lib"), join(checkout, "tools", "lib"), { recursive: true })
  cpSync(toolPath("owner-questions.mjs"), join(checkout, "tools", "owner-questions.mjs"))
  writeRunState({ sessionId: "current", sleep: true, openOwnerQuestions: [] }, checkout)
  const invoke = (flag, input, sessionId = "current") => {
    const environment = { ...process.env, CLAUDE_CODE_SESSION_ID: sessionId }
    if (!sessionId) delete environment.CLAUDE_CODE_SESSION_ID
    return spawnSync(process.execPath, [join(checkout, "tools", "owner-questions.mjs"), flag], { encoding: "utf8", env: environment, input })
  }
  const listed = invoke("--list")
  const rows = listed.status === 0 ? JSON.parse(listed.stdout) : []
  T("owner-questions: --list prints one JSON row per distinct question", rows.length === 2 && rows[0].question === PRODUCT && rows[0].sources.join() === "s1,s2", listed.stderr)
  T("owner-questions: --list with no session id is refused", invoke("--list", "", null).status === 1 && /QUESTIONS_REFUSED: no CLAUDE_CODE_SESSION_ID/.test(invoke("--list", "", null).stderr))
  const malformed = invoke("--record", "not json")
  T("owner-questions: --record refuses stdin that is not JSON", malformed.status === 1 && /QUESTIONS_REFUSED: stdin is not JSON/.test(malformed.stderr))
  const uncovered = invoke("--record", JSON.stringify([{ id: rows[0]?.id, disposition: "queued" }]))
  T("owner-questions: --record refuses dispositions that miss a candidate", uncovered.status === 1 && /has no disposition/.test(uncovered.stderr) && readRunState(checkout).questionFilter === undefined)
  const recorded = invoke("--record", JSON.stringify([{ id: rows[0]?.id, disposition: "queued" }, { id: rows[1]?.id, disposition: "answered", record: "packages/shared/src/types/contract.ts:12" }]))
  T("owner-questions: --record writes and prints the surviving queue", recorded.status === 0 && JSON.parse(recorded.stdout).length === 1 && readRunState(checkout).openOwnerQuestions[0].question === PRODUCT, recorded.stderr)
  foreignRunCases()
}

/** The owner's session owns no run state; the checkout's run belongs to another session. */
const foreignRunCases = () => {
  const queued = { question: PRODUCT, blocks: ["#2101"] }
  const ownerCli = (label, run, sessions = {}) => {
    const checkout = stageQuestionChain(`foreign-${label}`, 0, () => [])
    cpSync(toolPath("lib"), join(checkout, "tools", "lib"), { recursive: true })
    cpSync(toolPath("owner-questions.mjs"), join(checkout, "tools", "owner-questions.mjs"))
    writeRunState(run, checkout)
    const claudeDirectory = stageClaudeSessions(`foreign-${label}`, { owner: process.pid, ...sessions })
    const invoke = (flag, input, sessionId = "owner") => spawnSync(process.execPath, [join(checkout, "tools", "owner-questions.mjs"), flag],
      { encoding: "utf8", input, env: { ...process.env, CLAUDE_CODE_SESSION_ID: sessionId, CLAUDE_CONFIG_DIR: claudeDirectory } })
    const listed = invoke("--list")
    return { checkout, claudeDirectory, invoke, listed, rows: listed.status === 0 ? JSON.parse(listed.stdout) : [] }
  }
  const reusedPid = reusedPidRecord(process.pid)
  for (const [label, run, sessions] of [
    ["a stopped run of another session", { sessionId: "finished", sleep: false, openOwnerQuestions: [queued] }, {}],
    ["an unattended run of another session whose process is gone", { sessionId: "finished", sleep: true, openOwnerQuestions: [queued] }, { finished: exitedPid() }],
    ["an unattended run of another session whose pid a later process reuses", { sessionId: "finished", sleep: true, openOwnerQuestions: [queued] }, { finished: reusedPid }],
  ]) {
    const { checkout, invoke, listed, rows } = ownerCli(label.replace(/\W+/g, "-"), run, sessions)
    T(`owner-questions: --list in a session that owns no run prints the queue of ${label}`, rows.length === 1 && rows[0].question === PRODUCT &&
      rows[0].sources.join() === "finished" && rows[0].blocks.join() === "#2101", `${listed.stdout} ${listed.stderr}`)
    const recorded = invoke("--record", JSON.stringify([{ id: rows[0]?.id, disposition: "queued", blocks: ["#2102"] }]))
    const state = readRunState(checkout)
    T(`owner-questions: --record of the owner's own /questions keeps the queue of ${label} in that run`, recorded.status === 0 && state.sessionId === "finished" &&
      state.openOwnerQuestions.length === 1 && state.openOwnerQuestions[0].blocks.join() === "#2101,#2102" && state.questionFilter.sessionId === "owner", recorded.stderr)
    const relisted = invoke("--list")
    T(`owner-questions: after that filter, --list prints the queue of ${label} once`, relisted.status === 0 && JSON.parse(relisted.stdout).map((row) => row.question).join("|") === PRODUCT, relisted.stdout)
  }
  const unseen = (claudeDirectory, sessionId) => `cannot find this session's Claude session record in ${join(claudeDirectory, "sessions")}, so the liveness of session ${sessionId} is unknown; use a session on the Claude account of session ${sessionId}, then run /questions again`
  for (const [label, run, sessions, refusalOf] of [
    ["a live unattended run of another session", { sessionId: "unattended", sleep: true }, { unattended: process.pid },
      () => "session unattended runs unattended in this checkout; say stop in that session, then run /questions again"],
    ["a live attended run of another session", { sessionId: "attended", sleep: false }, { attended: { pid: process.pid, cwd: "/elsewhere/orbit-ui-mobile" } },
      () => "session attended (Claude session in /elsewhere/orbit-ui-mobile) is live in this checkout; run /questions in that session, or end it"],
  ]) {
    const { checkout, invoke, listed, rows } = ownerCli(label.replace(/\W+/g, "-"), { ...run, openOwnerQuestions: [queued] }, sessions)
    // The holder's own list gives the real row id, so the owner sends a complete record that only the refusal stops.
    const held = JSON.parse(invoke("--list", "", run.sessionId).stdout)
    const refused = invoke("--record", JSON.stringify(held.map((row) => ({ id: row.id, disposition: "answered", record: "ticket #2101 comment" }))))
    const after = readRunState(checkout)
    T(`owner-questions: beside ${label}, --list leaves its queue to that session and names why`, listed.status === 0 && rows.length === 0 && listed.stderr === `${refusalOf()}\n`, listed.stderr)
    T(`owner-questions: beside ${label}, --record refuses and writes nothing`, refused.status === 1 && refused.stderr === `QUESTIONS_REFUSED: ${refusalOf()}\n` &&
      held.length === 1 && after.questionFilter === undefined && after.openOwnerQuestions.length === 1, `status ${refused.status} ${refused.stderr} queue ${JSON.stringify(after.openOwnerQuestions)}`)
  }
  const blind = ownerCli("no-own-record", { sessionId: "finished", sleep: false, openOwnerQuestions: [queued] }, { owner: undefined })
  const blindRecord = blind.invoke("--record", "[]")
  T("owner-questions: a session that cannot find its own Claude session record leaves a foreign queue alone and names why", blind.listed.status === 0 && blind.rows.length === 0 &&
    blind.listed.stderr === `${unseen(blind.claudeDirectory, "finished")}\n` && blindRecord.status === 1 && blindRecord.stderr === `QUESTIONS_REFUSED: ${unseen(blind.claudeDirectory, "finished")}\n` &&
    readRunState(blind.checkout).questionFilter === undefined, `${blind.listed.stderr} ${blindRecord.stderr}`)
}
