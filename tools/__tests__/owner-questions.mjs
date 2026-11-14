import { spawnSync } from "node:child_process"
import { cpSync } from "node:fs"
import { join } from "node:path"
import { T, toolPath } from "./_harness.mjs"
import { ANSWERABLE, PRODUCT, stageQuestionChain } from "./owner-questions-core.mjs"
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
}
