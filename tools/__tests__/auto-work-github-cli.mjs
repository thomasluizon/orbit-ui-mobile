import { spawnSync } from "node:child_process"
import { chmodSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { readRunState, writeRunState } from "../lib/run-state.mjs"
import { T, realOrchestratorConfig, run, stageWithConfig } from "./_harness.mjs"
import { CODE_SCANNING_ALERT, DEPENDABOT_ALERT, DEPENDABOT_PULL, NOT_FOUND, UNEXPECTED_PULL } from "./auto-work-github.mjs"

const CLOSED_TICKET_URL = "https://github.com/thomasluizon/orbit-tickets/issues/2140"
/** The live output of the REST issue filter in tools/lib/github-issues.mjs for a closed ticket, with its body left out. */
const ISSUE_2140 = { body: "", html_url: CLOSED_TICKET_URL, labels: [{ name: "repo:ui" }, { name: "Improvement" }, { name: "parity:no" }, { name: "needs:no-conversation" }],
  number: 2140, state: "CLOSED", state_reason: "COMPLETED", title: "Lay out borders in the mobile Yoga test helpers, so a geometry test sees the device size" }
const quoted = (value) => JSON.stringify(value).replaceAll("'", "'\\''")

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
  "api repos/thomasluizon/orbit-tickets/issues/2140 --jq "*) printf '%s\\n' '${quoted(ISSUE_2140)}' | sed "s/\\"CLOSED\\"/\\"\${ISSUE_STATE:-OPEN}\\"/";;
  "api --method PATCH --input - repos/"*)
    if [ -n "\${DISMISS_FAIL:-}" ]; then echo '${NOT_FOUND}' >&2; exit 1; fi
    cat > "${installation.base}/patch-\$(echo "$6" | tr '/' '_').json"; echo '{}';;
  *"repos/thomasluizon/orbit-api/pulls?"*) printf '%s\\n' '${JSON.stringify(DEPENDABOT_PULL)}';;
  *"repos/thomasluizon/orbit-landing-page/pulls?"*) printf '%s\\n' '${JSON.stringify(UNEXPECTED_PULL)}';;
  *"repos/thomasluizon/orbit-api/code-scanning/alerts?"*) printf '%s\\n' '${quoted(CODE_SCANNING_ALERT)}';;
  *"repos/thomasluizon/orbit-ui-mobile/dependabot/alerts?"*) printf '%s\\n' '${quoted(DEPENDABOT_ALERT)}';;
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
  T("github cli: a collection with a failed read writes the rest and exits 3", collected.status === 3 && result.pullRequests?.open === 2 &&
    JSON.stringify(result.pullRequests.pending.map((pull) => pull.key)) === JSON.stringify(["api#1106"]) &&
    JSON.stringify(result.pullRequests.unexpectedAuthor.map((pull) => pull.key)) === JSON.stringify(["landing#20"]) && JSON.stringify(result.alerts.pending.map((alert) => alert.key)) === JSON.stringify(["ui dependabot 186", "api code-scanning 28"]) &&
    result.alerts.failures[0]?.read === "landing secret-scanning", `${collected.status} ${collected.stdout}${collected.stderr}`)
  const calls = readFileSync(log, "utf8").trim().split("\n")
  T("github cli: twelve paginated reads cover three repositories and four sources", calls.filter((line) => line.startsWith("api --paginate ")).length === 12, calls.join("\n"))
  T("github cli: the listing reads back from run state", readRunState(installation.base).intake.alerts.open["api code-scanning 28"].rule === "cs/web/cookie-secure-not-set")
  const marked = run("auto-work-github.mjs", ["--mark", "pullRequests"], { path: installation.path, env,
    input: JSON.stringify({ key: "api#1106", head: DEPENDABOT_PULL.head, action: "closed", reason: "Superseded by api#1107." }) })
  T("github cli: a mark from stdin persists", marked.status === 0 && readRunState(installation.base).intake.pullRequests.marks["api#1106"].reason === "Superseded by api#1107.",
    `${marked.status} ${marked.stdout}${marked.stderr}`)
  const unexpectedMerge = run("auto-work-github.mjs", ["--mark", "pullRequests"], { path: installation.path, env,
    input: JSON.stringify({ key: "landing#20", head: UNEXPECTED_PULL.head, action: "merged" }) })
  const unexpectedReport = run("auto-work-github.mjs", ["--mark", "pullRequests"], { path: installation.path, env,
    input: JSON.stringify({ key: "landing#20", head: UNEXPECTED_PULL.head, action: "reported" }) })
  T("github cli: a pull request from an unexpected author takes only the reported mark", unexpectedMerge.status === 1 &&
    unexpectedMerge.stderr.includes("never merged, fixed or closed") && unexpectedReport.status === 0 &&
    readRunState(installation.base).intake.pullRequests.marks["landing#20"].action === "reported", `${unexpectedMerge.stderr}${unexpectedReport.stderr}`)
  const refused = run("auto-work-github.mjs", ["--mark", "alerts"], { path: installation.path, env, input: JSON.stringify({ key: "api code-scanning 28", action: "ticket" }) })
  T("github cli: an incomplete alert mark exits 1 and names the requirement", refused.status === 1 && refused.stderr.includes("verified cause"), refused.stderr)

  const collectWith = (issueState) => {
    const again = run("auto-work-github.mjs", ["--collect"], { path: installation.path, env: { ...env, ISSUE_STATE: issueState } })
    try { return { ...again, result: JSON.parse(again.stdout) } } catch { return { ...again, result: {} } }
  }
  run("auto-work-github.mjs", ["--mark", "alerts"], { path: installation.path, env,
    input: JSON.stringify({ key: "api code-scanning 28", action: "ticket", ticket: CLOSED_TICKET_URL, cause: "The test fixture sets Secure false on purpose." }) })
  const ticketOpen = collectWith("OPEN")
  T("github cli: an alert whose carrying ticket is open is not pending", ticketOpen.status === 3 &&
    !ticketOpen.result.alerts?.pending.some((alert) => alert.key === "api code-scanning 28") && ticketOpen.result.alerts.ticketClosed?.length === 0,
  `${ticketOpen.status} ${ticketOpen.stdout}${ticketOpen.stderr}`)
  const ticketClosed = collectWith("CLOSED")
  T("github cli: an alert that stays open after its carrying ticket closed is pending again and listed with its ticket",
    ticketClosed.result.alerts?.pending.some((alert) => alert.key === "api code-scanning 28") &&
    JSON.stringify((ticketClosed.result.alerts.ticketClosed ?? []).map((alert) => [alert.key, alert.ticket])) === JSON.stringify([["api code-scanning 28", CLOSED_TICKET_URL]]),
  `${ticketClosed.status} ${ticketClosed.stdout}${ticketClosed.stderr}`)

  /* The secret scanning item is seeded in run state: no repository has had a secret scanning alert to record. */
  const seeded = readRunState(installation.base)
  writeRunState({ ...seeded, intake: { ...seeded.intake, alerts: { ...seeded.intake.alerts, open: { ...seeded.intake.alerts.open,
    "landing secret-scanning 3": { key: "landing secret-scanning 3", read: "landing secret-scanning", repository: "landing", kind: "secret-scanning", number: 3 } } } } },
  installation.base)
  const falsePositive = { ticket: CLOSED_TICKET_URL, reason: "The alert names a test fixture value." }
  const markOnly = run("auto-work-github.mjs", ["--mark", "alerts"], { path: installation.path, env,
    input: JSON.stringify({ key: "api code-scanning 28", action: "false-positive", ...falsePositive }) })
  T("github cli: a false positive is never marked without its dismissal", markOnly.status === 1 && markOnly.stderr.includes("--dismiss"), markOnly.stderr)
  const failedDismissal = run("auto-work-github.mjs", ["--dismiss"], { path: installation.path, env: { ...env, DISMISS_FAIL: "1" },
    input: JSON.stringify({ key: "api code-scanning 28", ...falsePositive }) })
  T("github cli: a failed dismissal records no mark", failedDismissal.status === 1 && failedDismissal.stderr.includes(NOT_FOUND) &&
    readRunState(installation.base).intake.alerts.marks["api code-scanning 28"].action === "ticket", `${failedDismissal.status} ${failedDismissal.stderr}`)
  const dismissals = ["api code-scanning 28", "ui dependabot 186", "landing secret-scanning 3"].map((key) =>
    run("auto-work-github.mjs", ["--dismiss"], { path: installation.path, env, input: JSON.stringify({ key, ...falsePositive }) }))
  const body = (name) => { try { return JSON.parse(readFileSync(join(installation.base, `patch-${name}.json`), "utf8")) } catch { return null } }
  const comment = `False positive; the analysis is on ${CLOSED_TICKET_URL}`
  T("github cli: each alert kind is dismissed with its own request and reason", dismissals.every((result) => result.status === 0) &&
    JSON.stringify(body("repos_thomasluizon_orbit-api_code-scanning_alerts_28")) === JSON.stringify({ state: "dismissed", dismissed_reason: "false positive", dismissed_comment: comment }) &&
    JSON.stringify(body("repos_thomasluizon_orbit-ui-mobile_dependabot_alerts_186")) === JSON.stringify({ state: "dismissed", dismissed_reason: "inaccurate", dismissed_comment: comment }) &&
    JSON.stringify(body("repos_thomasluizon_orbit-landing-page_secret-scanning_alerts_3")) === JSON.stringify({ state: "resolved", resolution: "false_positive", resolution_comment: comment }),
  dismissals.map((result) => `${result.status} ${result.stdout}${result.stderr}`).join("\n"))
  const marks = readRunState(installation.base).intake.alerts.marks
  T("github cli: a dismissal records the false positive mark with its ticket and reason", ["api code-scanning 28", "ui dependabot 186", "landing secret-scanning 3"]
    .every((key) => marks[key]?.action === "false-positive" && marks[key].ticket === CLOSED_TICKET_URL && marks[key].reason === falsePositive.reason), JSON.stringify(marks))
  const foreign = run("auto-work-github.mjs", ["--collect"], { path: installation.path, env: { ...env, CLAUDE_CODE_SESSION_ID: "foreign" } })
  T("github cli: another session cannot write the intake", foreign.status === 1 && foreign.stderr.includes("No matching active auto-work run"), foreign.stderr)
}
