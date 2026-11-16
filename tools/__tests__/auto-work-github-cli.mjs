import { spawnSync } from "node:child_process"
import { chmodSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { readRunState, writeRunState } from "../lib/run-state.mjs"
import { T, realOrchestratorConfig, run, stageWithConfig } from "./_harness.mjs"
import { CODE_SCANNING_ALERT, DEPENDABOT_PULL, NOT_FOUND } from "./auto-work-github.mjs"

/** The CLI against a gh stand-in whose answers are the live projections above. */
export const cases = () => {
  const installation = stageWithConfig("auto-work-github", "auto-work-github.mjs", realOrchestratorConfig())
  spawnSync("git", ["-C", installation.base, "init", "-q"])
  spawnSync("git", ["-C", installation.base, "remote", "add", "origin", "https://github.com/thomasluizon/orbit-ui-mobile.git"])
  const gh = join(installation.base, "gh")
  const log = join(installation.base, "gh-calls.log")
  writeFileSync(gh, `#!/bin/sh
echo "$*" >> "${log}"
case "$*" in
  "auth token --user thomasluizon") echo token-2149;;
  *"repos/thomasluizon/orbit-api/pulls?"*) printf '%s\\n' '${JSON.stringify(DEPENDABOT_PULL)}';;
  *"repos/thomasluizon/orbit-api/code-scanning/alerts?"*) printf '%s\\n' '${JSON.stringify(CODE_SCANNING_ALERT).replaceAll("'", "'\\''")}';;
  *"repos/thomasluizon/orbit-landing-page/secret-scanning/alerts?"*) echo '${NOT_FOUND}' >&2; exit 1;;
  "api --paginate "*) ;;
  *) echo "gh stand-in refuses" >&2; exit 1;;
esac
`)
  chmodSync(gh, 0o755)
  writeRunState({ sessionId: "cli", sleep: true, autoWork: true, remaining: [] }, installation.base)
  const env = { GH_BIN: gh, CLAUDE_CODE_SESSION_ID: "cli" }
  const collected = run("auto-work-github.mjs", ["--collect"], { path: installation.path, env })
  let result = {}
  try { result = JSON.parse(collected.stdout) } catch { /* the assertion below reports the raw output */ }
  T("github cli: a collection with a failed read writes the rest and exits 3", collected.status === 3 && result.pullRequests?.open === 1 &&
    result.pullRequests.pending[0]?.key === "api#1106" && result.alerts.pending[0]?.key === "api code-scanning 28" &&
    result.alerts.failures[0]?.read === "landing secret-scanning", `${collected.status} ${collected.stdout}${collected.stderr}`)
  const calls = readFileSync(log, "utf8").trim().split("\n")
  T("github cli: twelve paginated reads cover three repositories and four sources", calls.filter((line) => line.startsWith("api --paginate ")).length === 12, calls.join("\n"))
  T("github cli: the listing reads back from run state", readRunState(installation.base).intake.alerts.open["api code-scanning 28"].rule === "cs/web/cookie-secure-not-set")
  const marked = run("auto-work-github.mjs", ["--mark", "pullRequests"], { path: installation.path, env,
    input: JSON.stringify({ key: "api#1106", head: DEPENDABOT_PULL.head, action: "closed", reason: "Superseded by api#1107." }) })
  T("github cli: a mark from stdin persists", marked.status === 0 && readRunState(installation.base).intake.pullRequests.marks["api#1106"].reason === "Superseded by api#1107.",
    `${marked.status} ${marked.stdout}${marked.stderr}`)
  const refused = run("auto-work-github.mjs", ["--mark", "alerts"], { path: installation.path, env, input: JSON.stringify({ key: "api code-scanning 28", action: "ticket" }) })
  T("github cli: an incomplete alert mark exits 1 and names the requirement", refused.status === 1 && refused.stderr.includes("verified cause"), refused.stderr)
  const foreign = run("auto-work-github.mjs", ["--collect"], { path: installation.path, env: { ...env, CLAUDE_CODE_SESSION_ID: "foreign" } })
  T("github cli: another session cannot write the intake", foreign.status === 1 && foreign.stderr.includes("No matching active auto-work run"), foreign.stderr)
}
