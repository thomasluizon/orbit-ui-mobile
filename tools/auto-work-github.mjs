#!/usr/bin/env node
import { alertsWithClosedTickets, autoWorkRepositories, dismissAlert, githubPageReader, githubWriter, INTAKE_GITHUB_SOURCES, listOpenAlerts, listOpenPullRequests, markItem,
  pendingItems, recordListing, unreportedPullRequests } from "./lib/auto-work-github.mjs"
import { readTicket } from "./lib/github-issues.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: auto-work-github.mjs <--collect | --mark <pullRequests|alerts> | --dismiss>
Lists every open pull request and every open alert (code scanning, secret scanning and Dependabot)
of the ui, api and landing repositories, every author and every page, for auto-work steps 7 and 8.
--collect      writes intake.pullRequests and intake.alerts, reads them back and prints
               {pullRequests, alerts}, each with open, pending (items with no mark, or a pull
               request whose head moved) and failures. pullRequests adds runOwned (the pull
               requests the run recorded, and the owner pull requests whose branch or title
               names a ticket in remaining) and unexpectedAuthor: the pull requests whose author
               is not a configured bot of its repository or the repository owner, and that have
               no reported mark. They are never pending. alerts adds ticketClosed: the open
               alerts whose carrying ticket is closed, each with its ticket; they are pending
               again. A failed read, also a failed ticket read, is named in failures; a failed
               list read keeps its previous items, and it is never an empty source.
--mark <source> stdin JSON receipt for one open item:
               pullRequests {key, head, action: merged|fix|closed|reported, ticket?, reason?}
                 fix needs ticket (an orbit-tickets issue URL); closed needs reason; head must be
                 the current head. reported is the only action for an unexpected author, and
                 only for one.
               alerts {key, action: ticket, ticket, cause}
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
  const [pullListing, alertListing] = await Promise.all([listOpenPullRequests(reading), listOpenAlerts(reading)])
  const pulls = recordListing("pullRequests", pullListing)
  const openPulls = Object.values(pulls.open)
  const alerts = recordListing("alerts", alertListing)
  const closedTickets = await alertsWithClosedTickets(alerts, async (number) => (await readTicket(number, { withProjectItem: false })).state)
  const result = {
    pullRequests: { open: openPulls.length, pending: pendingItems("pullRequests", pulls), runOwned: openPulls.filter((pull) => pull.runOwned).map((pull) => pull.key),
      unexpectedAuthor: unreportedPullRequests(pulls), failures: pullListing.failures },
    alerts: { open: Object.keys(alerts.open).length, pending: [...pendingItems("alerts", alerts), ...closedTickets.items], ticketClosed: closedTickets.items,
      failures: [...alertListing.failures, ...closedTickets.failures] },
  }
  console.log(JSON.stringify(result))
  process.exit(result.pullRequests.failures.length || result.alerts.failures.length ? 3 : 0)
} catch (error) { console.error(error.message); process.exit(1) }
