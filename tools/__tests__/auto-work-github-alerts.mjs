/*
 * The alert cases of lib/auto-work-github.mjs: the rule of each alert kind when its carrying ticket closes, the waiter wakes that a closed,
 * not planned or missing ticket causes, and the 24 hour deadline of a Dependabot alert. The pull request cases stay in auto-work-github.mjs.
 */
import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { alertCheck, alertsWithClosedTickets, closeAlert, listedWakeKeys, listOpenAlerts, markItem, recordListing, recordTicketClosedAlerts } from "../lib/auto-work-github.mjs"
import { readIntake } from "../lib/auto-work-intake.mjs"
import { evaluateChecks } from "../lib/auto-work-wake.mjs"
import { T, TOOLS_DIR } from "./_harness.mjs"
import { ALERT_COMMIT, CODE_SCANNING_ALERT, DEPENDABOT_ALERT, fakeReader, fresh, NOT_FOUND, refusal, REPOSITORIES, TICKET } from "./auto-work-github.mjs"

/*
 * GitHub closes the alerts of each kind on its own terms, so the run's rule for an alert whose ticket completed differs by kind: a code scanning alert
 * carries the commit that its own category analyzed last, a secret scanning alert goes to the owner and is then resolved as revoked, and a Dependabot alert waits.
 */
const alertKindCases = async () => {
  const secretListed = { number: 3, rule: "github_personal_access_token", path: "src/config.ts", line: 4, message: "GitHub Personal Access Token",
    url: "https://github.com/thomasluizon/orbit-landing-page/security/secret-scanning/3" }
  const reader = fakeReader({ "repos/thomasluizon/orbit-api/code-scanning": [CODE_SCANNING_ALERT], "repos/thomasluizon/orbit-landing-page/secret-scanning": [secretListed],
    "repos/thomasluizon/orbit-ui-mobile/dependabot": [DEPENDABOT_ALERT] })
  const listing = await listOpenAlerts({ repositories: REPOSITORIES, readPages: reader.readPages })
  const codeKey = "api code-scanning 28"
  const secretKey = "landing secret-scanning 3"
  const dependabotKey = "ui dependabot 186"
  const analysesReads = reader.calls.filter((call) => call.path.includes("analyses"))
  const codeRead = reader.calls.find((call) => call.path.includes("/code-scanning/alerts"))
  T("github: the code scanning read projects the commit of the alert's own last analysis and reads no repository analysis",
    codeRead.projection.includes("commit: .most_recent_instance.commit_sha") && analysesReads.length === 0 &&
    listing.items.find((alert) => alert.key === codeKey).commit === ALERT_COMMIT, JSON.stringify(reader.calls))
  const checkout = fresh("alert-kinds")
  // Every kind carries a commit here, so only the kind check in comparesScan keeps it off the secret and Dependabot alerts.
  recordListing("alerts", { ...listing, items: listing.items.map((alert) => ({ ...alert, commit: ALERT_COMMIT })) }, checkout)
  const cause = "The test fixture sets Secure false on purpose."
  for (const key of [codeKey, secretKey, dependabotKey]) markItem("alerts", { key, action: "ticket", ticket: TICKET, cause }, checkout)
  const completed = await alertsWithClosedTickets(readIntake(checkout).alerts, { readTicketState: async (number) => ({ number, state: "CLOSED", stateReason: "COMPLETED" }) })
  T("github: only a completed code scanning alert carries a scanned commit, and it is the commit of its own category",
    JSON.stringify(Object.fromEntries(completed.items.map((alert) => [alert.key, alert.scannedCommit ?? null]))) ===
      JSON.stringify({ [dependabotKey]: null, [codeKey]: ALERT_COMMIT, [secretKey]: null }) &&
    completed.failures.length === 0, JSON.stringify(completed))
  recordTicketClosedAlerts(completed.items, checkout)
  const reportOf = (key) => refusal(() => markItem("alerts", { key, action: "reported" }, checkout))
  const outcomes = { code: reportOf(codeKey), dependabot: reportOf(dependabotKey) }
  T("github: a completed code scanning alert and a completed Dependabot alert are never reported", outcomes.code.startsWith("only an alert whose carrying ticket closed as not planned") &&
    outcomes.dependabot.startsWith("only an alert whose carrying ticket closed as not planned"), JSON.stringify(outcomes))
  const secretTicket = refusal(() => markItem("alerts", { key: secretKey, action: "ticket", ticket: TICKET, cause }, checkout))
  T("github: a completed secret scanning alert goes to the owner and takes no new ticket", secretTicket.includes("goes to the owner") && reportOf(secretKey) === "" &&
    readIntake(checkout).alerts.marks[secretKey].action === "reported" && readIntake(checkout).alerts.marks[secretKey].stateReason === "COMPLETED", secretTicket)

  /* A revoked secret resolves on GitHub and records its mark in one step, only for a secret scanning alert that the owner heard of. */
  const writes = []
  const write = async (...call) => { writes.push(call) }
  const revoke = (key, receipt = {}) => closeAlert("revoked", { key, ticket: TICKET, reason: "The owner rotated the token on 2026-11-19.", ...receipt }, { repositories: REPOSITORIES, write, repoRoot: checkout })
  const attempt = async (change) => { try { await change(); return "" } catch (error) { return error.message } }
  const unreported = fresh("alert-kinds-unreported")
  recordListing("alerts", listing, unreported)
  markItem("alerts", { key: secretKey, action: "ticket", ticket: TICKET, cause }, unreported)
  const beforeReport = await attempt(() => closeAlert("revoked", { key: secretKey, ticket: TICKET, reason: "The owner rotated the token." }, { repositories: REPOSITORIES, write, repoRoot: unreported }))
  const wrongKind = await attempt(() => revoke(codeKey))
  const noReason = await attempt(() => revoke(secretKey, { reason: "" }))
  const viaMark = refusal(() => markItem("alerts", { key: secretKey, action: "revoked", ticket: TICKET, reason: "The owner rotated the token." }, checkout))
  T("github: a revoked secret is refused before any GitHub write unless a secret scanning alert was reported and the owner confirmed", writes.length === 0 &&
    beforeReport === "a secret is revoked only after the owner heard of it: record reported first" && wrongKind === "only a secret scanning alert is revoked" &&
    noReason === "a revoked secret needs its carrying ticket and the owner's confirmation of the rotation" &&
    viaMark === "revoked is recorded only by --revoke, which closes the alert first", JSON.stringify({ beforeReport, wrongKind, noReason, viaMark, writes }))
  const failedWrite = await attempt(() => closeAlert("revoked", { key: secretKey, ticket: TICKET, reason: "The owner rotated the token." },
    { repositories: REPOSITORIES, write: async () => { throw new Error(NOT_FOUND) }, repoRoot: checkout }))
  T("github: a failed revoke write records no mark", failedWrite === NOT_FOUND && readIntake(checkout).alerts.marks[secretKey].action === "reported", failedWrite)
  const revoked = await revoke(secretKey)
  T("github: a revoked secret resolves the alert as revoked with its ticket and records the revoked mark", JSON.stringify(writes) === JSON.stringify([["PATCH",
    "repos/thomasluizon/orbit-landing-page/secret-scanning/alerts/3", { state: "resolved", resolution: "revoked", resolution_comment: `Revoked; the owner confirmed the rotation on ${TICKET}` }]]) &&
    revoked.marks[secretKey].action === "revoked" && revoked.marks[secretKey].ticket === TICKET && revoked.marks[secretKey].reason === "The owner rotated the token on 2026-11-19.", JSON.stringify({ writes, revoked }))
}

/* An open alert whose carrying ticket closes wakes the idle waiter once, and the next analysis of its own category that still finds it wakes it once more. */
const closedTicketAlertWakeCases = async () => {
  let listing = await listOpenAlerts({ repositories: REPOSITORIES, readPages: fakeReader({ "repos/thomasluizon/orbit-api/code-scanning": [CODE_SCANNING_ALERT] }).readPages })
  const state = { intake: { alerts: { marks: { "api code-scanning 28": { action: "ticket", ticket: TICKET, cause: "The test fixture sets Secure false on purpose." } } } } }
  let ticket = { state: "OPEN", stateReason: null }
  const ticketReads = []
  const check = { source: "alerts", run: alertCheck({ list: async () => listing, readIntakeMarks: () => state.intake,
    readTicketState: async (number) => { ticketReads.push(number); if (ticket instanceof Error) throw ticket; return { number, ...ticket } } }) }
  let marks = { seen: { alerts: ["api code-scanning 28"] }, failures: {}, sentryListedAt: new Date(0).toISOString() }
  const interval = async () => {
    const evaluated = evaluateChecks([check], await Promise.allSettled([check.run()]), marks, 0)
    marks = evaluated.marks
    return evaluated.wakes
  }
  const open = await interval()
  ticket = { state: "CLOSED", stateReason: "COMPLETED" }
  const closed = await interval()
  const again = await interval()
  ticket = new Error("GitHub read failed at repos/thomasluizon/orbit-tickets/issues/2149: timed out")
  const failed = await interval()
  ticket = { state: "CLOSED", stateReason: "COMPLETED" }
  const recovered = await interval()
  listing = { ...listing, items: [{ ...listing.items[0], commit: "a".repeat(40) }] }
  const rescanned = await interval()
  T("github: an open ticketed alert wakes nothing while its ticket is open", open.length === 0 && ticketReads[0] === 2149, JSON.stringify(open))
  T("github: the close of the carrying ticket of an open alert wakes the waiter once with alerts", JSON.stringify(closed) ===
    JSON.stringify([{ source: "alerts", kind: "new", items: [`api code-scanning 28 ticket-closed ${ALERT_COMMIT}`] }]) && again.length === 0, JSON.stringify({ closed, again }))
  T("github: a failed ticket read wakes once as a failure and its recovery wakes nothing", failed.length === 1 && failed[0].kind === "failure" &&
    recovered.length === 0, JSON.stringify({ failed, recovered }))
  T("github: a newer analysis of the alert's own category that still finds it wakes the waiter once more", JSON.stringify(rescanned) ===
    JSON.stringify([{ source: "alerts", kind: "new", items: [`api code-scanning 28 ticket-closed ${"a".repeat(40)}`] }]), JSON.stringify(rescanned))
}

/* Only a ticket closed as completed leads to the scan comparison: the owner decides a ticket closed as not planned once, and a new analysis asks nothing again. */
const notPlannedAlertWakeCases = async () => {
  let listing = await listOpenAlerts({ repositories: REPOSITORIES, readPages: fakeReader({ "repos/thomasluizon/orbit-api/code-scanning": [CODE_SCANNING_ALERT] }).readPages })
  const cause = "The test fixture sets Secure false on purpose."
  let state = { intake: { alerts: { marks: { "api code-scanning 28": { action: "ticket", ticket: TICKET, cause } } } } }
  let ticket = { state: "CLOSED", stateReason: "NOT_PLANNED" }
  const readers = { readTicketState: async (number) => ({ number, ...ticket }) }
  const check = { source: "alerts", run: alertCheck({ list: async () => listing, readIntakeMarks: () => state.intake, ...readers }) }
  let marks = { seen: { alerts: ["api code-scanning 28"] }, failures: {}, sentryListedAt: new Date(0).toISOString() }
  const interval = async () => {
    const evaluated = evaluateChecks([check], await Promise.allSettled([check.run()]), marks, 0)
    marks = evaluated.marks
    return evaluated.wakes
  }
  const closed = await alertsWithClosedTickets({ open: listing.items.reduce((open, alert) => ({ ...open, [alert.key]: alert }), {}), marks: state.intake.alerts.marks }, readers)
  T("github: a closed-ticket alert carries the close reason of its ticket, and only a completed ticket carries the scanned commit",
    JSON.stringify(closed.items.map((alert) => [alert.key, alert.ticket, alert.stateReason, alert.scannedCommit ?? null])) ===
      JSON.stringify([["api code-scanning 28", TICKET, "NOT_PLANNED", null]]), JSON.stringify(closed))
  const notPlanned = await interval()
  listing = { ...listing, items: [{ ...listing.items[0], commit: "c".repeat(40) }] }
  const rescanned = await interval()
  state = { intake: { alerts: { marks: { "api code-scanning 28": { action: "reported", ticket: TICKET, stateReason: "NOT_PLANNED" } } } } }
  const reported = await interval()
  listing = { ...listing, items: [{ ...listing.items[0], commit: "d".repeat(40) }] }
  const reportedRescan = await interval()
  ticket = { state: "CLOSED", stateReason: "COMPLETED" }
  const completed = await interval()
  T("github: the close of a carrying ticket as not planned wakes the waiter once, and a new analysis wakes nothing", JSON.stringify(notPlanned) ===
    JSON.stringify([{ source: "alerts", kind: "new", items: ["api code-scanning 28 ticket-closed"] }]) && rescanned.length === 0, JSON.stringify({ notPlanned, rescanned }))
  T("github: a reported not planned alert stays quiet at every later analysis", reported.length === 0 && reportedRescan.length === 0, JSON.stringify({ reported, reportedRescan }))
  T("github: a reported alert wakes again when the close reason of its ticket changes", JSON.stringify(completed) ===
    JSON.stringify([{ source: "alerts", kind: "new", items: [`api code-scanning 28 ticket-closed ${"d".repeat(40)}`] }]), JSON.stringify(completed))
}

/*
 * A carrying ticket that no longer exists (404) or was deleted (410 Gone) reads as closed with no reason, so the owner decides its alert once.
 * Any other failed read (502) stays a named failure that keeps the alert quiet.
 */
const missingTicketAlertCases = async () => {
  const listing = await listOpenAlerts({ repositories: REPOSITORIES, readPages: fakeReader({ "repos/thomasluizon/orbit-api/code-scanning": [CODE_SCANNING_ALERT] }).readPages })
  const open = listing.items.reduce((items, alert) => ({ ...items, [alert.key]: alert }), {})
  const cause = "The test fixture sets Secure false on purpose."
  const failing = (status, text) => async () => { throw new Error(`gh api repos/thomasluizon/orbit-tickets/issues/2149 failed: gh: ${text} (HTTP ${status})`) }
  for (const [status, text] of [[404, "Not Found"], [410, "Gone"]]) {
    const ticketed = { open, marks: { "api code-scanning 28": { action: "ticket", ticket: TICKET, cause } } }
    const missing = await alertsWithClosedTickets(ticketed, { readTicketState: failing(status, text) })
    T(`github: an alert whose carrying ticket answers ${status} is in ticketClosed once with no reason and no failure`, JSON.stringify(missing.items.map((alert) => [alert.key, alert.stateReason])) ===
      JSON.stringify([["api code-scanning 28", null]]) && missing.failures.length === 0 && missing.unreadKeys.length === 0, JSON.stringify(missing))
    const reported = await alertsWithClosedTickets({ open, marks: { "api code-scanning 28": { action: "reported", ticket: TICKET, stateReason: null } } },
      { readTicketState: failing(status, text) })
    T(`github: a reported alert whose carrying ticket answers ${status} stays quiet and names no failure`, reported.items.length === 0 && reported.failures.length === 0 &&
      reported.unreadKeys.length === 0, JSON.stringify(reported))
  }
  const gateway = await alertsWithClosedTickets({ open, marks: { "api code-scanning 28": { action: "ticket", ticket: TICKET, cause } } }, { readTicketState: failing(502, "Bad Gateway") })
  T("github: an alert whose carrying ticket answers 502 stays a named failure that keeps the alert quiet", gateway.items.length === 0 && gateway.failures.length === 1 &&
    gateway.failures[0].message.includes("HTTP 502") && JSON.stringify(gateway.unreadKeys) === JSON.stringify(["api code-scanning 28"]), JSON.stringify(gateway))
}

/**
 * A Dependabot alert whose ticket closed as completed waits for the dependency graph for 24 hours. After that the fix left a vulnerable version, so
 * the collection gives the alert `overdue`, its waiter key gains `overdue` once, and a new mark ends the state. The clock is an argument.
 */
const dependabotDeadlineCases = async () => {
  const closedAt = "2026-11-19T00:00:00Z"
  const hoursAfterClose = (hours) => () => Date.parse(closedAt) + hours * 60 * 60 * 1000
  const reader = fakeReader({ "repos/thomasluizon/orbit-ui-mobile/dependabot": [DEPENDABOT_ALERT], "repos/thomasluizon/orbit-api/code-scanning": [CODE_SCANNING_ALERT] })
  const listing = await listOpenAlerts({ repositories: REPOSITORIES, readPages: reader.readPages })
  const open = Object.fromEntries(listing.items.map((alert) => [alert.key, alert]))
  const dependabotKey = "ui dependabot 186"
  const codeKey = "api code-scanning 28"
  const cause = "The lockfile pins the vulnerable version."
  const marks = { [dependabotKey]: { action: "ticket", ticket: TICKET, cause }, [codeKey]: { action: "ticket", ticket: TICKET, cause } }
  const closedBy = (stateReason) => async (number) => ({ number, state: "CLOSED", stateReason, closedAt })
  const overdueAfter = async (hours, stateReason = "COMPLETED") => {
    const closed = await alertsWithClosedTickets({ open, marks }, { readTicketState: closedBy(stateReason), now: hoursAfterClose(hours) })
    return Object.fromEntries(closed.items.map((alert) => [alert.key, alert.overdue ?? false]))
  }
  const before = await overdueAfter(23)
  const at = await overdueAfter(24)
  const notPlanned = await overdueAfter(25, "NOT_PLANNED")
  T("github: a Dependabot alert of a ticket closed 23 hours ago is not overdue, and at 24 hours it is",
    JSON.stringify(before) === JSON.stringify({ [dependabotKey]: false, [codeKey]: false }) && at[dependabotKey] === true, JSON.stringify({ before, at }))
  T("github: a code scanning alert of the same age and a Dependabot alert of a ticket closed as not planned are never overdue",
    at[codeKey] === false && notPlanned[dependabotKey] === false && notPlanned[codeKey] === false, JSON.stringify({ at, notPlanned }))

  let hours = 23
  const check = { source: "alerts", run: alertCheck({ list: async () => ({ ...listing, items: listing.items.filter((alert) => alert.key === dependabotKey) }),
    readIntakeMarks: () => ({ alerts: { marks } }), readTicketState: closedBy("COMPLETED"), now: () => hoursAfterClose(hours)() }) }
  let waiterMarks = { seen: { alerts: [dependabotKey] }, failures: {}, sentryListedAt: new Date(0).toISOString() }
  const interval = async () => {
    const evaluated = evaluateChecks([check], await Promise.allSettled([check.run()]), waiterMarks, 0)
    waiterMarks = evaluated.marks
    return evaluated.wakes
  }
  const first = await interval()
  hours = 24
  const deadline = await interval()
  hours = 25
  const later = await interval()
  T("github: the waiter wakes once at the deadline of a Dependabot alert, with a new key, and never again for it",
    JSON.stringify(first) === JSON.stringify([{ source: "alerts", kind: "new", items: [`${dependabotKey} ticket-closed`] }]) &&
    JSON.stringify(deadline) === JSON.stringify([{ source: "alerts", kind: "new", items: [`${dependabotKey} ticket-closed overdue`] }]) && later.length === 0,
    JSON.stringify({ first, deadline, later }))

  const checkout = fresh("dependabot-deadline")
  recordListing("alerts", listing, checkout)
  for (const key of [dependabotKey, codeKey]) markItem("alerts", { key, action: "ticket", ticket: TICKET, cause }, checkout)
  const overdue = await alertsWithClosedTickets(readIntake(checkout).alerts, { readTicketState: closedBy("COMPLETED"), now: hoursAfterClose(24) })
  recordTicketClosedAlerts(overdue.items, checkout)
  const recorded = readIntake(checkout)
  T("github: the recorded overdue key is listed, so the waiter does not wake for it again",
    recorded.alerts.ticketClosed.includes(`${dependabotKey} ticket-closed overdue`) && listedWakeKeys(recorded).alerts.includes(`${dependabotKey} ticket-closed overdue`),
    JSON.stringify(recorded.alerts.ticketClosed))
  const second = TICKET.replace("2149", "2150")
  const remarked = refusal(() => markItem("alerts", { key: dependabotKey, action: "ticket", ticket: second, cause: "The nested lockfile still pins the vulnerable version." }, checkout))
  const reopened = await alertsWithClosedTickets(readIntake(checkout).alerts, { readTicketState: async (number) => ({ number, state: "OPEN", stateReason: null, closedAt: null }), now: hoursAfterClose(48) })
  T("github: an overdue alert takes a new ticket mark, and its open ticket ends the closed-ticket state",
    remarked === "" && readIntake(checkout).alerts.marks[dependabotKey].ticket === second && reopened.items.length === 0, JSON.stringify({ remarked, reopened }))
  const usage = spawnSync(process.execPath, [join(TOOLS_DIR, "auto-work-github.mjs"), "--help"], { encoding: "utf8" }).stdout
  T("github: the usage text names the overdue field and its 24 hour deadline", usage.includes("overdue") && usage.includes("24 hours") && usage.includes("closedAt"), usage)
}

export const cases = async () => {
  await alertKindCases()
  await closedTicketAlertWakeCases()
  await notPlannedAlertWakeCases()
  await missingTicketAlertCases()
  await dependabotDeadlineCases()
}
