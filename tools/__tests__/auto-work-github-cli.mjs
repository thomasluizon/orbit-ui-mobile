import { spawnSync } from "node:child_process"
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { readIntake } from "../lib/auto-work-intake.mjs"
import { writeRunState } from "../lib/run-state.mjs"
import { T, realOrchestratorConfig, run, seedIntake, stageWithConfig } from "./_harness.mjs"
import { ALERT_COMMIT, CODE_SCANNING_ALERT, DEPENDABOT_ALERT, DEPENDABOT_PULL, NOT_FOUND, UNEXPECTED_PULL } from "./auto-work-github.mjs"

const CLOSED_TICKET_URL = "https://github.com/thomasluizon/orbit-tickets/issues/2140"
/** The ticket that survives a duplicate close; no collection reads it. */
const TICKET_2149_URL = "https://github.com/thomasluizon/orbit-tickets/issues/2149"
/** The live output of the REST issue filter in tools/lib/github-issues.mjs for a closed ticket, with its body left out. */
const ISSUE_2140 = { body: "", html_url: CLOSED_TICKET_URL, labels: [{ name: "repo:ui" }, { name: "Improvement" }, { name: "parity:no" }, { name: "needs:no-conversation" }],
  number: 2140, state: "CLOSED", state_reason: "COMPLETED", title: "Lay out borders in the mobile Yoga test helpers, so a geometry test sees the device size" }
/** An owner pull request from an earlier run whose branch and title name ticket #2140 (label repo:ui), projected from the live ui#1115 with its repository, branch and title changed. */
const CLOSED_TICKET_PULL = { number: 1115, author: "thomasluizon", authorType: "User", head: "fcfcc2d215a0eca16b43935efd77635bec167183", branch: "fix/ticket-2140-part-2", base: "main",
  draft: false, title: "fix(test): lay out borders in the Yoga test helpers, part 2 (#2140)", url: "https://github.com/thomasluizon/orbit-ui-mobile/pull/1115" }
/** A revert of a squash merge subject: its one `(#2481)` is the pull request number of ui#2481, and no such issue exists in orbit-tickets. */
const SQUASH_SUFFIX_PULL = { number: 2501, author: "thomasluizon", authorType: "User", head: "c".repeat(40), branch: "revert-next-bump", base: "main", draft: false,
  title: 'Revert "chore(deps): bump next from 16.4.3 to 16.4.5 (#2481)"', url: "https://github.com/thomasluizon/orbit-ui-mobile/pull/2501" }
/** The gh failure line of a gateway error, in the form of NOT_FOUND. */
const BAD_GATEWAY = "gh: Bad Gateway (HTTP 502)"
/** The gh failure line of a deleted issue; the tool reads only the status code, which the REST description lists as the 410 response of Get an issue. */
const GONE = "gh: Gone (HTTP 410)"
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
  "api repos/thomasluizon/orbit-tickets/issues/2140 --jq "*) printf '%s\\n' '${quoted(ISSUE_2140)}' | sed "s/\\"CLOSED\\"/\\"\${ISSUE_STATE:-OPEN}\\"/; s/\\"COMPLETED\\"/\\"\${ISSUE_REASON:-COMPLETED}\\"/";;
  "api --method PATCH --input - repos/"*)
    if [ -n "\${DISMISS_FAIL:-}" ]; then echo '${NOT_FOUND}' >&2; exit 1; fi
    cat > "${installation.base}/patch-\$(echo "$6" | tr '/' '_').json"; echo '{}';;
  *"repos/thomasluizon/orbit-api/pulls?"*) printf '%s\\n' '${JSON.stringify(DEPENDABOT_PULL)}';;
  "api repos/thomasluizon/orbit-tickets/issues/2481 --jq "*) if [ -n "\${TICKET_READ_FAILS:-}" ]; then echo '${BAD_GATEWAY}' >&2; elif [ -n "\${TICKET_GONE:-}" ]; then echo '${GONE}' >&2; else echo '${NOT_FOUND}' >&2; fi; exit 1;;
  *"repos/thomasluizon/orbit-ui-mobile/pulls?"*)
    if [ -n "\${SUFFIX_PULL:-}" ]; then printf '%s\\n' '${quoted(SQUASH_SUFFIX_PULL)}'; fi
    if [ -n "\${OWNER_PULL:-}" ]; then printf '%s\\n' '${quoted(CLOSED_TICKET_PULL)}' | sed "s/${CLOSED_TICKET_PULL.head}/\${OWNER_HEAD:-${CLOSED_TICKET_PULL.head}}/"; fi;;
  *"repos/thomasluizon/orbit-landing-page/pulls?"*) printf '%s\\n' '${JSON.stringify(UNEXPECTED_PULL)}';;
  *"repos/thomasluizon/orbit-api/code-scanning/alerts?"*) printf '%s\\n' '${quoted(CODE_SCANNING_ALERT)}' | sed "s/${ALERT_COMMIT}/\${SCAN_COMMIT:-${ALERT_COMMIT}}/";;
  *"repos/thomasluizon/orbit-ui-mobile/dependabot/alerts?"*) printf '%s\\n' '${quoted(DEPENDABOT_ALERT)}';;
  *"repos/thomasluizon/orbit-landing-page/secret-scanning/alerts?"*) echo '${NOT_FOUND}' >&2; exit 1;;
  "api --paginate "*) ;;
  *) echo "gh stand-in refuses" >&2; exit 1;;
esac
`)
  chmodSync(gh, 0o755)
  writeRunState({ sessionId: "cli", sleep: true, autoWork: true, remaining: [] }, installation.base)
  /* The Claude session records of the run and of another live run, in the shape of a live record; this test process stands in for both sessions. */
  const claudeDirectory = join(installation.base, "claude")
  const sessionRecord = (sessionId, cwd) => writeFileSync(join(claudeDirectory, "sessions", `${sessionId}.json`), JSON.stringify({ pid: process.pid, sessionId, cwd }))
  mkdirSync(join(claudeDirectory, "sessions"), { recursive: true })
  sessionRecord("cli", installation.base)
  const env = { GH_BIN: gh, CLAUDE_CODE_SESSION_ID: "cli", CLAUDE_CONFIG_DIR: claudeDirectory }
  const collected = run("auto-work-github.mjs", ["--collect"], { path: installation.path, env })
  let result = {}
  try { result = JSON.parse(collected.stdout) } catch { /* the assertion below reports the raw output */ }
  T("github cli: a collection with a failed read writes the rest and exits 3", collected.status === 3 && result.pullRequests?.open === 2 &&
    JSON.stringify(result.pullRequests.pending.map((pull) => pull.key)) === JSON.stringify(["api#1106"]) &&
    JSON.stringify(result.pullRequests.unexpectedAuthor.map((pull) => pull.key)) === JSON.stringify(["landing#20"]) && JSON.stringify(result.alerts.pending.map((alert) => alert.key)) === JSON.stringify(["ui dependabot 186", "api code-scanning 28"]) &&
    result.alerts.failures[0]?.read === "landing secret-scanning", `${collected.status} ${collected.stdout}${collected.stderr}`)
  const calls = readFileSync(log, "utf8").trim().split("\n")
  T("github cli: twelve paginated reads cover three repositories and four sources", calls.filter((line) => line.startsWith("api --paginate ")).length === 12, calls.join("\n"))
  T("github cli: the listing reads back from the intake file", readIntake(installation.base).alerts.open["api code-scanning 28"].rule === "cs/web/cookie-secure-not-set")
  const marked = run("auto-work-github.mjs", ["--mark", "pullRequests"], { path: installation.path, env,
    input: JSON.stringify({ key: "api#1106", head: DEPENDABOT_PULL.head, action: "closed", reason: "Superseded by api#1107." }) })
  T("github cli: a mark from stdin persists", marked.status === 0 && readIntake(installation.base).pullRequests.marks["api#1106"].reason === "Superseded by api#1107.",
    `${marked.status} ${marked.stdout}${marked.stderr}`)
  const unexpectedMerge = run("auto-work-github.mjs", ["--mark", "pullRequests"], { path: installation.path, env,
    input: JSON.stringify({ key: "landing#20", head: UNEXPECTED_PULL.head, action: "merged" }) })
  const unexpectedReport = run("auto-work-github.mjs", ["--mark", "pullRequests"], { path: installation.path, env,
    input: JSON.stringify({ key: "landing#20", head: UNEXPECTED_PULL.head, action: "reported" }) })
  T("github cli: a pull request from an unexpected author takes only the reported mark", unexpectedMerge.status === 1 &&
    unexpectedMerge.stderr.includes("never merged, fixed or closed") && unexpectedReport.status === 0 &&
    readIntake(installation.base).pullRequests.marks["landing#20"].action === "reported", `${unexpectedMerge.stderr}${unexpectedReport.stderr}`)
  const refused = run("auto-work-github.mjs", ["--mark", "alerts"], { path: installation.path, env, input: JSON.stringify({ key: "api code-scanning 28", action: "ticket" }) })
  T("github cli: an incomplete alert mark exits 1 and names the requirement", refused.status === 1 && refused.stderr.includes("verified cause"), refused.stderr)

  const collectWith = (issueState, issueReason = "COMPLETED", scanCommit = ALERT_COMMIT) => {
    const again = run("auto-work-github.mjs", ["--collect"], { path: installation.path, env: { ...env, ISSUE_STATE: issueState, ISSUE_REASON: issueReason, SCAN_COMMIT: scanCommit } })
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
  T("github cli: a closed-ticket code scanning alert names the commit that its own category analyzed last, and its waiter key is recorded",
    ticketClosed.result.alerts?.ticketClosed?.[0]?.scannedCommit === ALERT_COMMIT &&
    JSON.stringify(readIntake(installation.base).alerts.ticketClosed) === JSON.stringify([`api code-scanning 28 ticket-closed ${ALERT_COMMIT}`]),
  `${ticketClosed.stdout}${ticketClosed.stderr}`)
  T("github cli: a collection reads no code scanning analysis of the repository", !readFileSync(log, "utf8").split("\n").some((line) => line.includes("analyses")), readFileSync(log, "utf8"))
  const rescanned = collectWith("CLOSED", "COMPLETED", "f".repeat(40))
  T("github cli: the analysis of the alert's own category moves its scanned commit and its waiter key", rescanned.result.alerts?.ticketClosed?.[0]?.scannedCommit === "f".repeat(40) &&
    JSON.stringify(readIntake(installation.base).alerts.ticketClosed) === JSON.stringify([`api code-scanning 28 ticket-closed ${"f".repeat(40)}`]),
  `${rescanned.stdout}${rescanned.stderr}`)
  /* A carrying ticket closed as not planned goes to the owner once: the run neither files a new ticket for its alert nor asks again. */
  const alertMark = () => readIntake(installation.base).alerts.marks["api code-scanning 28"]
  const markAlert = (receipt) => run("auto-work-github.mjs", ["--mark", "alerts"], { path: installation.path, env, input: JSON.stringify({ key: "api code-scanning 28", ...receipt }) })
  const notPlanned = collectWith("CLOSED", "NOT_PLANNED")
  T("github cli: an alert whose carrying ticket closed as not planned is listed with the close reason and no scanned commit",
    JSON.stringify((notPlanned.result.alerts?.ticketClosed ?? []).map((alert) => [alert.key, alert.stateReason, alert.scannedCommit ?? null])) ===
      JSON.stringify([["api code-scanning 28", "NOT_PLANNED", null]]) && notPlanned.result.alerts.pending.some((alert) => alert.key === "api code-scanning 28"),
  `${notPlanned.status} ${notPlanned.stdout}${notPlanned.stderr}`)
  const newTicket = markAlert({ action: "ticket", ticket: TICKET_2149_URL, cause: "The test fixture sets Secure false on purpose." })
  const ownerReport = markAlert({ action: "reported" })
  T("github cli: the alert of a ticket closed as not planned takes no new ticket and is reported with its ticket and close reason",
    newTicket.status === 1 && newTicket.stderr.includes("goes to the owner") && ownerReport.status === 0 &&
    JSON.stringify([alertMark()?.action, alertMark()?.ticket, alertMark()?.stateReason]) === JSON.stringify(["reported", CLOSED_TICKET_URL, "NOT_PLANNED"]),
  `${newTicket.status} ${newTicket.stderr} ${ownerReport.status} ${ownerReport.stderr}`)
  const afterAlertReport = collectWith("CLOSED", "NOT_PLANNED", "e".repeat(40))
  T("github cli: a reported not planned alert is not pending and is not asked again after a new analysis",
    afterAlertReport.result.alerts?.ticketClosed?.length === 0 && !afterAlertReport.result.alerts.pending.some((alert) => alert.key === "api code-scanning 28") &&
    JSON.stringify(readIntake(installation.base).alerts.ticketClosed) === "[]" && alertMark()?.action === "reported",
  `${afterAlertReport.status} ${afterAlertReport.stdout}${afterAlertReport.stderr}`)
  const duplicate = collectWith("CLOSED", "DUPLICATE")
  const reported = markAlert({ action: "reported" })
  const surviving = markAlert({ action: "ticket", ticket: TICKET_2149_URL, cause: "The test fixture sets Secure false on purpose." })
  T("github cli: the alert of a ticket closed as a duplicate is asked again, is never reported and is marked with the surviving ticket",
    JSON.stringify((duplicate.result.alerts?.ticketClosed ?? []).map((alert) => [alert.key, alert.stateReason])) === JSON.stringify([["api code-scanning 28", "DUPLICATE"]]) &&
    reported.status === 1 && reported.stderr.includes("not planned or with no reason") && surviving.status === 0 && alertMark()?.ticket === TICKET_2149_URL,
  `${duplicate.stdout}${duplicate.stderr} ${reported.stderr} ${surviving.stderr}`)

  /* The secret scanning item is seeded in the intake file: no repository has had a secret scanning alert to record. */
  const seeded = readIntake(installation.base)
  seedIntake(installation.base, { ...seeded, alerts: { ...seeded.alerts, open: { ...seeded.alerts.open,
    "landing secret-scanning 3": { key: "landing secret-scanning 3", read: "landing secret-scanning", repository: "landing", kind: "secret-scanning", number: 3 } } } })
  const falsePositive = { ticket: CLOSED_TICKET_URL, reason: "The alert names a test fixture value." }
  const markOnly = run("auto-work-github.mjs", ["--mark", "alerts"], { path: installation.path, env,
    input: JSON.stringify({ key: "api code-scanning 28", action: "false-positive", ...falsePositive }) })
  T("github cli: a false positive is never marked without its dismissal", markOnly.status === 1 && markOnly.stderr.includes("--dismiss"), markOnly.stderr)
  const failedDismissal = run("auto-work-github.mjs", ["--dismiss"], { path: installation.path, env: { ...env, DISMISS_FAIL: "1" },
    input: JSON.stringify({ key: "api code-scanning 28", ...falsePositive }) })
  T("github cli: a failed dismissal records no mark", failedDismissal.status === 1 && failedDismissal.stderr.includes(NOT_FOUND) &&
    readIntake(installation.base).alerts.marks["api code-scanning 28"].action === "ticket", `${failedDismissal.status} ${failedDismissal.stderr}`)
  const dismissals = ["api code-scanning 28", "ui dependabot 186", "landing secret-scanning 3"].map((key) =>
    run("auto-work-github.mjs", ["--dismiss"], { path: installation.path, env, input: JSON.stringify({ key, ...falsePositive }) }))
  const body = (name) => { try { return JSON.parse(readFileSync(join(installation.base, `patch-${name}.json`), "utf8")) } catch { return null } }
  const comment = `False positive; the analysis is on ${CLOSED_TICKET_URL}`
  T("github cli: each alert kind is dismissed with its own request and reason", dismissals.every((result) => result.status === 0) &&
    JSON.stringify(body("repos_thomasluizon_orbit-api_code-scanning_alerts_28")) === JSON.stringify({ state: "dismissed", dismissed_reason: "false positive", dismissed_comment: comment }) &&
    JSON.stringify(body("repos_thomasluizon_orbit-ui-mobile_dependabot_alerts_186")) === JSON.stringify({ state: "dismissed", dismissed_reason: "inaccurate", dismissed_comment: comment }) &&
    JSON.stringify(body("repos_thomasluizon_orbit-landing-page_secret-scanning_alerts_3")) === JSON.stringify({ state: "resolved", resolution: "false_positive", resolution_comment: comment }),
  dismissals.map((result) => `${result.status} ${result.stdout}${result.stderr}`).join("\n"))
  const marks = readIntake(installation.base).alerts.marks
  T("github cli: a dismissal records the false positive mark with its ticket and reason", ["api code-scanning 28", "ui dependabot 186", "landing secret-scanning 3"]
    .every((key) => marks[key]?.action === "false-positive" && marks[key].ticket === CLOSED_TICKET_URL && marks[key].reason === falsePositive.reason), JSON.stringify(marks))
  /* A secret scanning alert whose ticket completed is reported to the owner, who confirms the rotation; --revoke then resolves it as revoked and records the mark. */
  const secretKey = "landing secret-scanning 4"
  const before = readIntake(installation.base)
  seedIntake(installation.base, { ...before, alerts: { ...before.alerts,
    open: { ...before.alerts.open, [secretKey]: { key: secretKey, read: "landing secret-scanning", repository: "landing", kind: "secret-scanning", number: 4 } },
    marks: { ...before.alerts.marks, [secretKey]: { action: "reported", ticket: CLOSED_TICKET_URL, stateReason: "COMPLETED" } } } })
  const rotation = { key: secretKey, ticket: CLOSED_TICKET_URL, reason: "The owner rotated the token." }
  const revokeCode = run("auto-work-github.mjs", ["--revoke"], { path: installation.path, env, input: JSON.stringify({ ...rotation, key: "api code-scanning 28" }) })
  const failedRevoke = run("auto-work-github.mjs", ["--revoke"], { path: installation.path, env: { ...env, DISMISS_FAIL: "1" }, input: JSON.stringify(rotation) })
  const noMarkYet = readIntake(installation.base).alerts.marks[secretKey].action
  const revoke = run("auto-work-github.mjs", ["--revoke"], { path: installation.path, env, input: JSON.stringify(rotation) })
  T("github cli: --revoke refuses another kind, records nothing after a failed write, then resolves the secret as revoked and records the mark",
    revokeCode.status === 1 && revokeCode.stderr.includes("only a secret scanning alert is revoked") && failedRevoke.status === 1 && failedRevoke.stderr.includes(NOT_FOUND) &&
    noMarkYet === "reported" && revoke.status === 0 && JSON.parse(revoke.stdout).revoked === secretKey &&
    JSON.stringify(JSON.parse(readFileSync(join(installation.base, "patch-repos_thomasluizon_orbit-landing-page_secret-scanning_alerts_4.json"), "utf8"))) ===
      JSON.stringify({ state: "resolved", resolution: "revoked", resolution_comment: `Revoked; the owner confirmed the rotation on ${CLOSED_TICKET_URL}` }) &&
    readIntake(installation.base).alerts.marks[secretKey].action === "revoked", `${revokeCode.stderr} ${failedRevoke.stderr} ${revoke.status} ${revoke.stdout}${revoke.stderr}`)
  /* An owner pull request that names a closed ticket has its own list, and the tool refuses to merge or fix it. */
  const collectOwner = (issueState, issueReason) => {
    const again = run("auto-work-github.mjs", ["--collect"], { path: installation.path, env: { ...env, OWNER_PULL: "1", ISSUE_STATE: issueState, ISSUE_REASON: issueReason } })
    try { return { ...again, result: JSON.parse(again.stdout) } } catch { return { ...again, result: {} } }
  }
  /* A pull request number in a title names no ticket: its read answers 404, and the collection neither fails on it nor drops the pull request. */
  const suffixed = run("auto-work-github.mjs", ["--collect"], { path: installation.path, env: { ...env, SUFFIX_PULL: "1" } })
  const suffixedResult = (() => { try { return JSON.parse(suffixed.stdout) } catch { return {} } })()
  T("github cli: a pull request number in a title is no ticket: its 404 is no failure and the pull request is pending", suffixedResult.pullRequests?.failures.length === 0 &&
    suffixedResult.pullRequests.pending.some((pull) => pull.key === "ui#2501") && suffixedResult.pullRequests.ticketClosed.length === 0, `${suffixed.status} ${suffixed.stdout}${suffixed.stderr}`)
  /* A deleted ticket answers 410 and names no ticket, as a missing one answers 404: the pull request is listed and pending, never withheld for good. */
  const deleted = run("auto-work-github.mjs", ["--collect"], { path: installation.path, env: { ...env, SUFFIX_PULL: "1", TICKET_GONE: "1" } })
  const deletedResult = (() => { try { return JSON.parse(deleted.stdout) } catch { return {} } })()
  T("github cli: a pull request that names a deleted ticket is listed and pending, with no failure of its own", deletedResult.pullRequests?.failures.length === 0 &&
    deletedResult.pullRequests.pending.some((pull) => pull.key === "ui#2501") && readIntake(installation.base).pullRequests.open["ui#2501"]?.unread === undefined,
  `${deleted.status} ${deleted.stdout}${deleted.stderr}`)
  /* A ticket read that fails for another reason withholds only its pull request: the others are listed, and the collection exits 3 and names it. */
  const withheld = run("auto-work-github.mjs", ["--collect"], { path: installation.path, env: { ...env, SUFFIX_PULL: "1", TICKET_READ_FAILS: "1" } })
  const withheldResult = (() => { try { return JSON.parse(withheld.stdout) } catch { return {} } })()
  T("github cli: a failed ticket read withholds only its pull request, names it and exits 3", withheld.status === 3 &&
    JSON.stringify(withheldResult.pullRequests?.failures.map(({ read, key }) => [read, key])) === JSON.stringify([["ui pulls", "ui#2501"]]) &&
    withheldResult.pullRequests.failures[0].message.includes(BAD_GATEWAY) && withheldResult.pullRequests.open === 3 &&
    readIntake(installation.base).pullRequests.open["api#1106"] !== undefined && readIntake(installation.base).pullRequests.open["ui#2501"]?.unread === true &&
    !withheldResult.pullRequests.pending.some((pull) => pull.key === "ui#2501"), `${withheld.status} ${withheld.stdout}${withheld.stderr}`)
  const withheldMark = run("auto-work-github.mjs", ["--mark", "pullRequests"], { path: installation.path, env,
    input: JSON.stringify({ key: "ui#2501", head: SQUASH_SUFFIX_PULL.head, action: "closed", reason: "Superseded." }) })
  T("github cli: a withheld pull request takes no mark", withheldMark.status === 1 && withheldMark.stderr.includes("could not be read"), `${withheldMark.stdout}${withheldMark.stderr}`)
  const ownerOpen = collectOwner("OPEN", "COMPLETED")
  T("github cli: an owner pull request whose ticket is open stays pending for adoption", ownerOpen.result.pullRequests?.pending.some((pull) => pull.key === "ui#1115") &&
    ownerOpen.result.pullRequests.ticketClosed?.length === 0, `${ownerOpen.status} ${ownerOpen.stdout}${ownerOpen.stderr}`)
  /* The ticket of an owner pull request is read once in a collection: the issue reads of one collection with the pull request exceed those without it by one. */
  const issueReads = () => readFileSync(log, "utf8").split("\n").filter((line) => line.startsWith("api repos/thomasluizon/" + "orbit-tickets/issues/2140 --jq")).length
  writeFileSync(log, "")
  run("auto-work-github.mjs", ["--collect"], { path: installation.path, env })
  const readsWithout = issueReads()
  writeFileSync(log, "")
  collectOwner("OPEN", "COMPLETED")
  T("github cli: a collection reads the ticket of an owner pull request once", issueReads() - readsWithout === 1, `${readsWithout} ${issueReads()}`)
  const ownerClosed = collectOwner("CLOSED", "NOT_PLANNED")
  T("github cli: an owner pull request whose ticket closed is listed in ticketClosed with the close reason and is not pending",
    !ownerClosed.result.pullRequests?.pending.some((pull) => pull.key === "ui#1115") &&
    JSON.stringify((ownerClosed.result.pullRequests?.ticketClosed ?? []).map((pull) => [pull.key, pull.closedTickets])) ===
      JSON.stringify([["ui#1115", [{ number: 2140, stateReason: "NOT_PLANNED" }]]]), `${ownerClosed.status} ${ownerClosed.stdout}${ownerClosed.stderr}`)
  const closedMerge = run("auto-work-github.mjs", ["--mark", "pullRequests"], { path: installation.path, env,
    input: JSON.stringify({ key: "ui#1115", head: CLOSED_TICKET_PULL.head, action: "merged" }) })
  const closedReport = run("auto-work-github.mjs", ["--mark", "pullRequests"], { path: installation.path, env,
    input: JSON.stringify({ key: "ui#1115", head: CLOSED_TICKET_PULL.head, action: "reported" }) })
  const afterReport = collectOwner("CLOSED", "NOT_PLANNED")
  T("github cli: a pull request of a closed ticket is never merged, is reported once and leaves the list", closedMerge.status === 1 &&
    closedMerge.stderr.includes("never merged or fixed") && closedReport.status === 0 && afterReport.result.pullRequests?.ticketClosed?.length === 0 &&
    !afterReport.result.pullRequests.pending.some((pull) => pull.key === "ui#1115"), `${closedMerge.stderr}${closedReport.stderr}${afterReport.stdout}`)
  /* One reported decision holds at every later head, until a ticket or its close reason changes. */
  const movedHead = "b".repeat(40)
  const collectMoved = (issueState, issueReason) => {
    const again = run("auto-work-github.mjs", ["--collect"], { path: installation.path,
      env: { ...env, OWNER_PULL: "1", OWNER_HEAD: movedHead, ISSUE_STATE: issueState, ISSUE_REASON: issueReason } })
    try { return { ...again, result: JSON.parse(again.stdout) } } catch { return { ...again, result: {} } }
  }
  const ownerMark = () => readIntake(installation.base).pullRequests.marks["ui#1115"]
  const reportedMoved = collectMoved("CLOSED", "NOT_PLANNED")
  T("github cli: a reported pull request of a closed ticket is not asked again at a new head", reportedMoved.result.pullRequests?.ticketClosed?.length === 0 &&
    !reportedMoved.result.pullRequests.pending.some((pull) => pull.key === "ui#1115") && ownerMark()?.action === "reported",
  `${reportedMoved.status} ${reportedMoved.stdout}${reportedMoved.stderr}`)
  const reasonChanged = collectMoved("CLOSED", "DUPLICATE")
  T("github cli: a reported pull request of a closed ticket is asked again when a close reason changes", ownerMark() === undefined &&
    JSON.stringify((reasonChanged.result.pullRequests?.ticketClosed ?? []).map((pull) => [pull.key, pull.closedTickets])) ===
      JSON.stringify([["ui#1115", [{ number: 2140, stateReason: "DUPLICATE" }]]]), `${reasonChanged.status} ${reasonChanged.stdout}${reasonChanged.stderr}`)
  run("auto-work-github.mjs", ["--mark", "pullRequests"], { path: installation.path, env, input: JSON.stringify({ key: "ui#1115", head: movedHead, action: "reported" }) })
  const reopened = collectMoved("OPEN", "COMPLETED")
  T("github cli: a reopened ticket ends the report, and the pull request is pending for adoption", ownerMark() === undefined &&
    reopened.result.pullRequests?.pending.some((pull) => pull.key === "ui#1115") && reopened.result.pullRequests.ticketClosed?.length === 0,
  `${reopened.status} ${reopened.stdout}${reopened.stderr}`)

  /* Another live run in its own checkout names ticket #2140 in remaining, so ui#1115 has a live driver and is never adopted here. */
  const otherCheckout = join(installation.base, "other-run")
  mkdirSync(join(otherCheckout, ".git"), { recursive: true })
  writeRunState({ sessionId: "other", sleep: true, autoWork: true, remaining: ["#2140"] }, otherCheckout)
  sessionRecord("other", otherCheckout)
  const driven = collectOwner("OPEN", "COMPLETED")
  const drivenMerge = run("auto-work-github.mjs", ["--mark", "pullRequests"], { path: installation.path, env,
    input: JSON.stringify({ key: "ui#1115", head: CLOSED_TICKET_PULL.head, action: "merged" }) })
  T("github cli: an owner pull request whose ticket another live run names is in otherRun, is not pending and takes no mark",
    JSON.stringify(driven.result.pullRequests?.otherRun) === JSON.stringify(["ui#1115"]) && !driven.result.pullRequests.pending.some((pull) => pull.key === "ui#1115") &&
    drivenMerge.status === 1 && drivenMerge.stderr.includes("another live run drives this pull request"), `${driven.stdout}${driven.stderr} ${drivenMerge.stderr}`)
  rmSync(join(claudeDirectory, "sessions", "other.json"))
  const ended = collectOwner("OPEN", "COMPLETED")
  T("github cli: when the other run's session ends, its owner pull request is pending for adoption", ended.result.pullRequests?.otherRun?.length === 0 &&
    ended.result.pullRequests.pending.some((pull) => pull.key === "ui#1115"), `${ended.stdout}${ended.stderr}`)
  rmSync(join(claudeDirectory, "sessions", "cli.json"))
  const blind = collectOwner("OPEN", "COMPLETED")
  T("github cli: without the run's own session record the live runs are a named failure, and no owner pull request is pending", blind.status === 3 &&
    blind.result.pullRequests?.failures.some((failure) => failure.read === "live runs" && failure.message.includes("session cli of this run")) &&
    JSON.stringify(blind.result.pullRequests.otherRun) === JSON.stringify(["ui#1115"]) && !blind.result.pullRequests.pending.some((pull) => pull.key === "ui#1115"),
  `${blind.status} ${blind.stdout}${blind.stderr}`)
  sessionRecord("cli", installation.base)

  const foreign = run("auto-work-github.mjs", ["--collect"], { path: installation.path, env: { ...env, CLAUDE_CODE_SESSION_ID: "foreign" } })
  T("github cli: another session cannot write the intake", foreign.status === 1 && foreign.stderr.includes("No matching active auto-work run"), foreign.stderr)
}
