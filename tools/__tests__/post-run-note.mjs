import { readFileSync } from "node:fs"

import { T, check, githubIssueReadPlan, orcaEnv, stage } from "./_harness.mjs"

const TOOL = "post-run-note.mjs"
const HEAD = "c".repeat(40)
const TICKETS = "thomasluizon/orbit-tickets"

const issue = JSON.stringify({
  blockedBy: { nodes: [], totalCount: 0 }, blocking: { nodes: [], totalCount: 0 }, body: "Ticket body", labels: [{ name: "repo:ui" }],
  number: 2152, state: "OPEN", stateReason: null, title: "Run state on GitHub", url: `https://github.com/${TICKETS}/issues/2152`,
})

const runRecordSearch = `issue list --repo ${TICKETS} --state all --search`
const commentWrite = (number, stdinFile) => ({ match: `issue comment ${number} --repo ${TICKETS}`, stdout: "", ignoreTicketShape: true, stdinFile })

export const cases = () => {
  const body = stage("post-run-note/round.md", "Fix the two findings of the round 1 review.\n")
  const captured = stage("post-run-note/round-comment.txt", "unwritten")
  check(TOOL, "a round note is posted to its ticket with its marker", ["--kind", "round-note", "--issue", "#2152", "--round", "2", "--head", HEAD, "--body-file", body],
    { status: 0, stdout: /"number":2152,"url":"https:\/\/github\.com\/thomasluizon\/orbit-tickets\/issues\/2152","kind":"round-note"/ },
    { env: orcaEnv([...githubIssueReadPlan(issue), commentWrite(2152, captured)]) })
  T(`${TOOL}: the posted comment starts with the round note marker`, readFileSync(captured, "utf8").startsWith(`<!-- orbit-run-note: kind=round-note round=2 head=${HEAD} pullfrogThreads=0 -->`), readFileSync(captured, "utf8"))

  const threadsCaptured = stage("post-run-note/round-threads-comment.txt", "unwritten")
  check(TOOL, "a round note posts the count of Pullfrog threads in its batch", ["--kind", "round-note", "--issue", "#2152", "--round", "1", "--head", HEAD, "--pullfrog-threads", "2", "--body-file", body],
    { status: 0 }, { env: orcaEnv([...githubIssueReadPlan(issue), commentWrite(2152, threadsCaptured)]) })
  T(`${TOOL}: the posted round note carries pullfrogThreads=2`, readFileSync(threadsCaptured, "utf8").startsWith(`<!-- orbit-run-note: kind=round-note round=1 head=${HEAD} pullfrogThreads=2 -->`), readFileSync(threadsCaptured, "utf8"))
  check(TOOL, "a round note with a non-numeric Pullfrog thread count is refused", ["--kind", "round-note", "--issue", "#2152", "--round", "1", "--head", HEAD, "--pullfrog-threads", "many", "--body-file", body],
    { status: 2, stderr: /--pullfrog-threads/ }, { env: orcaEnv([]) })

  const decision = stage("post-run-note/decision.md", "Batch the notes of one round into one comment.\n")
  const recorded = stage("post-run-note/decision-comment.txt", "unwritten")
  check(TOOL, "a run-wide decision goes to the run record issue found by its exact title", ["--kind", "decision", "--run-record", "--body-file", decision], { status: 0, stdout: /"number":2200/ },
    { env: orcaEnv([
      { match: runRecordSearch, stdout: JSON.stringify([{ number: 2199, state: "OPEN", title: "Orbit run record draft", url: `https://github.com/${TICKETS}/issues/2199` },
        { number: 2200, state: "CLOSED", title: "Orbit run record", url: `https://github.com/${TICKETS}/issues/2200` }]) },
      commentWrite(2200, recorded),
    ]) })
  T(`${TOOL}: the run record comment is a decision note`, readFileSync(recorded, "utf8").startsWith("<!-- orbit-run-note: kind=decision -->\n## Decision"))
  check(TOOL, "a missing run record names the migration that creates it", ["--kind", "decision", "--run-record", "--body-file", decision],
    { status: 1, stderr: /no "Orbit run record" issue exists; node tools\/migrate-run-state\.mjs --apply creates it/ }, { env: orcaEnv([{ match: runRecordSearch, stdout: "[]" }]) })

  check(TOOL, "a review without a verdict line is refused before any GitHub call", ["--kind", "review", "--issue", "#2152", "--head", HEAD, "--body-file", body],
    { status: 2, stderr: /VERDICT: CLEAN or VERDICT: DEFECTS/ }, { env: orcaEnv([]) })
  check(TOOL, "a round note without its head is refused", ["--kind", "round-note", "--issue", "#2152", "--round", "1", "--body-file", body], { status: 2, stderr: /--head/ }, { env: orcaEnv([]) })
  check(TOOL, "the run record takes only decisions", ["--kind", "review", "--run-record", "--head", HEAD, "--body-file", body], { status: 2, stderr: /--run-record takes only --kind decision/ })
  check(TOOL, "a ticket and the run record together are refused", ["--kind", "decision", "--run-record", "--issue", "#2152", "--body-file", body], { status: 2, stderr: /exactly one of --issue or --run-record/ })
  check(TOOL, "a missing body file is refused", ["--kind", "decision", "--issue", "#2152"], { status: 2, stderr: /--body-file is required/ })
}
