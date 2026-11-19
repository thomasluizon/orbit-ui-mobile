import { mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { T, check, githubIssueReadPlan, orcaEnv, realOrchestratorConfig, root, stage, stageWithConfig } from "./_harness.mjs"

const TOOL = "run-file.mjs"
const TICKETS = "thomasluizon/orbit-tickets"

const issue = JSON.stringify({
  blockedBy: { nodes: [], totalCount: 0 }, blocking: { nodes: [], totalCount: 0 }, body: "Eval baselines", labels: [{ name: "repo:ui" }],
  number: 2135, state: "OPEN", stateReason: null, title: "Eval baselines", url: `https://github.com/${TICKETS}/issues/2135`,
})

export const cases = () => {
  // The staged checkout is a fresh clone: its run files live in its own git directory through ORBIT_TEST_RUN_FILES.
  const staged = stageWithConfig("run-file", TOOL, realOrchestratorConfig())
  mkdirSync(join(staged.base, ".git"), { recursive: true })
  const options = (plan = []) => ({ path: staged.path, env: orcaEnv(plan) })
  const data = stage("run-file/windows.json", JSON.stringify({ windows: [[1, 2], [3, 4]] }))
  check(TOOL, "a missing run file exits 3", ["--get", "2135/baseline-windows.json"], { status: 3, stderr: /run-files\/2135\/baseline-windows\.json does not exist/ }, options())
  const comment = stage("run-file/comment.txt", "unwritten")
  check(TOOL, "a stored file comments its name and blob sha on the owning ticket", ["--put", "2135/baseline-windows.json", "--file", data, "--issue", "#2135"],
    { status: 0, stdout: /"path":"run-files\/2135\/baseline-windows\.json","sha":"[0-9a-f]{40}","bytes":\d+,"issue":2135/ },
    options([...githubIssueReadPlan(issue), { match: `issue comment 2135 --repo ${TICKETS}`, stdout: "", ignoreTicketShape: true, stdinFile: comment }]))
  T(`${TOOL}: the ticket comment names the read command`, readFileSync(comment, "utf8").includes("node tools/run-file.mjs --get 2135/baseline-windows.json"), readFileSync(comment, "utf8"))
  const out = join(root, "run-file", "read-back.json")
  check(TOOL, "the stored file reads back byte for byte", ["--get", "2135/baseline-windows.json", "--out", out], { status: 0 }, options())
  T(`${TOOL}: the read-back equals the stored bytes`, readFileSync(out, "utf8") === readFileSync(data, "utf8"))
  check(TOOL, "a name that leaves the run files is refused", ["--get", "../intake.json"], { status: 2, stderr: /run file path/ }, options())
  check(TOOL, "a store without its owning ticket is refused", ["--put", "2135/x.json", "--file", data], { status: 2, stderr: /--put needs --file and --issue/ })
  check(TOOL, "a read and a write together are refused", ["--get", "a.json", "--put", "b.json"], { status: 2, stderr: /exactly one of --get or --put/ })
}
