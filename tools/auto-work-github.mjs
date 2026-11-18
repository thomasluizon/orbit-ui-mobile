#!/usr/bin/env node
import { alertsWithClosedTickets, autoWorkRepositories, closedTicketPullRequests, dismissAlert, githubPageReader, githubWriter, INTAKE_GITHUB_SOURCES, listOpenAlerts,
  listOpenPullRequests, markItem, newestScanCommit, otherLiveRuns, pendingItems, pullRequestsWithClosedTickets, recordClosedTicketPullRequests, recordListing,
  recordTicketClosedAlerts, unreportedPullRequests } from "./lib/auto-work-github.mjs"
import { intakeRun } from "./lib/auto-work-intake.mjs"
import { readTicket } from "./lib/github-issues.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: auto-work-github.mjs <--collect | --mark <pullRequests|alerts> | --dismiss>
Lists every open pull request and every open alert (code scanning, secret scanning and Dependabot)
of the ui, api and landing repositories, every author and every page, for auto-work steps 7 and 8.
--collect      writes intake.pullRequests and intake.alerts, reads them back and prints
               {pullRequests, alerts}, each with open, pending (items with no mark, or a pull
               request whose head moved) and failures. pullRequests adds runOwned (the owner
               pull requests that the run recorded or whose branch or title names a ticket in
               remaining, each name resolved to its GitHub issue number), otherRun (the
               owner pull requests that the run state of another live Claude session's
               checkout records or names the same way; every owner pull request the run does
               not own when the live runs cannot be read, with the failure "live runs") and
               unexpectedAuthor: the pull requests whose author is not a configured bot of its
               repository or the repository owner, and that have no reported mark. pullRequests also adds ticketClosed: the owner pull requests
               with no mark that holds at their head whose every named ticket (ticket-<N>-, (#N) or
               ORB-N in the branch or the title) is closed, each with closedTickets
               [{number, stateReason}]. Neither list is pending. A reported mark holds at
               every head; collect drops it when the closed tickets or a close reason change. A pull request whose ticket
               read failed is not pending in that collection. alerts adds ticketClosed: the
               open alerts whose carrying ticket is closed, each with its ticket, its
               stateReason and, for code scanning of a ticket closed as COMPLETED,
               scannedCommit (the commit of the newest scan of main); they are pending again.
               A reported alert stays out of ticketClosed while its ticket stays closed with
               the reported stateReason. A failed read, also a failed ticket or scan read, is named in
               failures; a failed list read keeps its previous items, and it is never an empty
               source.
--mark <source> stdin JSON receipt for one open item:
               pullRequests {key, head, action: merged|fix|closed|reported, ticket?, reason?}
                 fix needs ticket (an orbit-tickets issue URL); closed needs reason; head must be
                 the current head. reported is the only action for an unexpected author. A
                 pull request in ticketClosed takes only closed or reported, and its reported mark
                 keeps its closedTickets. No other pull request is reported. A pull request in
                 otherRun takes no mark.
               alerts {key, action: ticket|reported, ticket?, cause?}
                 ticket needs ticket and cause. reported is the only action for an alert in
                 ticketClosed whose stateReason is NOT_PLANNED or null, and its mark keeps
                 that ticket and stateReason; no other alert is reported.
--dismiss      stdin JSON receipt {key, ticket, reason} for one open alert that the analysis on
               its ticket proves a false positive. Dismisses it on GitHub with the request of its
               kind (code scanning "false positive", Dependabot "inaccurate", secret scanning
               resolved "false_positive"), then records the false-positive mark. A failed
               dismissal records nothing.
--help, -h     print usage
exit codes: 0 success; 1 run state, configuration, receipt or GitHub write failure; 2 invalid
arguments; 3 collected and written, with at least one named read failure`

const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) { console.log(USAGE); process.exit(0) }
const collect = args.length === 1 && args[0] === "--collect"
const mark = args.length === 2 && args[0] === "--mark" && INTAKE_GITHUB_SOURCES.includes(args[1])
const dismiss = args.length === 1 && args[0] === "--dismiss"
if (!collect && !mark && !dismiss) { console.error(USAGE); process.exit(2) }
let receipt
if (mark || dismiss) {
  try { let input = ""; for await (const chunk of process.stdin) input += chunk; receipt = JSON.parse(input) } catch { console.error("Expected JSON on stdin"); process.exit(2) }
}
try {
  if (mark) {
    const written = markItem(args[1], receipt)
    console.log(JSON.stringify({ marked: receipt.key, mark: written.marks[receipt.key] }))
    process.exit(0)
  }
  const config = readOrchestratorConfig()
  const repositories = autoWorkRepositories(config)
  if (dismiss) {
    const written = await dismissAlert(receipt, { repositories, write: githubWriter({ config }) })
    console.log(JSON.stringify({ dismissed: receipt.key, mark: written.marks[receipt.key] }))
    process.exit(0)
  }
  const reading = { repositories, readPages: githubPageReader({ config }) }
  const readTicketState = (number) => readTicket(number, { withProjectItem: false })
  const [pullListing, alertListing] = await Promise.all([listOpenPullRequests({ ...reading, readTicketState }), listOpenAlerts(reading)])
  const otherRuns = otherLiveRuns(intakeRun())
  const pullTickets = await pullRequestsWithClosedTickets(recordListing("pullRequests", pullListing, undefined, { otherRuns }), readTicketState)
  const pulls = recordClosedTicketPullRequests(pullTickets)
  const openPulls = Object.values(pulls.open)
  const alerts = recordListing("alerts", alertListing)
  const closedTickets = await alertsWithClosedTickets(alerts, { readTicketState, readNewestScan: (key) => newestScanCommit(reading, key) })
  recordTicketClosedAlerts(closedTickets.items)
  const result = {
    pullRequests: { open: openPulls.length, pending: pendingItems("pullRequests", pulls).filter((pull) => !pullTickets.unreadKeys.includes(pull.key)),
      runOwned: openPulls.filter((pull) => pull.runOwned).map((pull) => pull.key), otherRun: openPulls.filter((pull) => pull.otherRun).map((pull) => pull.key),
      unexpectedAuthor: unreportedPullRequests(pulls), ticketClosed: closedTicketPullRequests(pulls),
      failures: [...pullListing.failures, ...(otherRuns.failure ? [otherRuns.failure] : []), ...pullTickets.failures] },
    alerts: { open: Object.keys(alerts.open).length, pending: [...pendingItems("alerts", alerts), ...closedTickets.items], ticketClosed: closedTickets.items,
      failures: [...alertListing.failures, ...closedTickets.failures] },
  }
  console.log(JSON.stringify(result))
  process.exit(result.pullRequests.failures.length || result.alerts.failures.length ? 3 : 0)
} catch (error) { console.error(error.message); process.exit(1) }
