#!/usr/bin/env node
import { autoWorkRepositories, githubPageReader, INTAKE_GITHUB_SOURCES, listOpenAlerts, listOpenPullRequests, markItem, pendingItems, recordListing } from "./lib/auto-work-github.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: auto-work-github.mjs <--collect | --mark <pullRequests|alerts>>
Lists every open pull request and every open alert (code scanning, secret scanning and Dependabot)
of the ui, api and landing repositories, every author and every page, for auto-work steps 7 and 8.
--collect      writes intake.pullRequests and intake.alerts, reads them back and prints
               {pullRequests, alerts}, each with open, pending (items with no mark, or a pull
               request whose head moved), runOwned for pull requests, and failures. A failed read
               keeps its previous items and is named in failures; it is never an empty source.
--mark <source> stdin JSON receipt for one open item:
               pullRequests {key, head, action: merged|fix|closed, ticket?, reason?}
                 fix needs ticket (an orbit-tickets issue URL); closed needs reason; head must be
                 the current head.
               alerts {key, action: ticket|false-positive, ticket, cause?, reason?}
                 ticket needs cause; false-positive needs reason, written on the ticket first.
--help, -h     print usage
exit codes: 0 success; 1 run state, configuration or receipt failure; 2 invalid arguments;
3 collected and written, with at least one named read failure`

const args = process.argv.slice(2)
if (args.includes("--help") || args.includes("-h")) { console.log(USAGE); process.exit(0) }
const collect = args.length === 1 && args[0] === "--collect"
const mark = args.length === 2 && args[0] === "--mark" && INTAKE_GITHUB_SOURCES.includes(args[1])
if (!collect && !mark) { console.error(USAGE); process.exit(2) }
let receipt
if (mark) {
  try { let input = ""; for await (const chunk of process.stdin) input += chunk; receipt = JSON.parse(input) } catch { console.error("Expected JSON on stdin"); process.exit(2) }
}
try {
  if (mark) {
    const written = markItem(args[1], receipt)
    console.log(JSON.stringify({ marked: receipt.key, mark: written.marks[receipt.key] }))
    process.exit(0)
  }
  const config = readOrchestratorConfig()
  const reading = { repositories: autoWorkRepositories(config), readPages: githubPageReader({ config }) }
  const [pullListing, alertListing] = await Promise.all([listOpenPullRequests(reading), listOpenAlerts(reading)])
  const summary = (source, listing) => {
    const written = recordListing(source, listing)
    const open = Object.values(written.open)
    return { open: open.length, pending: pendingItems(source, written),
      ...(source === "pullRequests" ? { runOwned: open.filter((pull) => pull.runOwned).map((pull) => pull.key) } : {}),
      failures: listing.failures }
  }
  const result = { pullRequests: summary("pullRequests", pullListing), alerts: summary("alerts", alertListing) }
  console.log(JSON.stringify(result))
  process.exit(result.pullRequests.failures.length || result.alerts.failures.length ? 3 : 0)
} catch (error) { console.error(error.message); process.exit(1) }
