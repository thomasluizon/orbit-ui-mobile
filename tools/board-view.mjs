#!/usr/bin/env node
/**
 * List the configured board's saved views, or set one view's filter.
 *
 * A view is the only part of the board no other tool reaches. The raw-mutation hook blocks
 * `updateProjectV2View` from a session, correctly, because a GraphQL mutation cannot prove which
 * board it targets. That left a lost filter repairable only by hand: measured 2026-08-22, the Orca
 * table view on board 2 had an empty filter and nothing in the repository could restore it.
 */

import { listProjectViews, setProjectViewFilter } from "./lib/github-issues.mjs"

const USAGE = `usage: board-view.mjs --list
       board-view.mjs --view <name> --filter <query|"">

  --list           print every saved view on the configured board with its current filter
  --view <name>    the saved view to change, matched by exact name
  --filter <query> the filter to write, in GitHub's board filter syntax; pass "" to clear it
  --help, -h       print this usage and exit 0

The view is resolved by name from the live list before the write, so a typo fails here rather than
silently doing nothing, and the resulting filter is read back from the mutation's own response. A
view whose filter already matches is a no-op. It never changes a ticket, a Status, or a layout.

exit codes: 0 read or write succeeded, 1 board read or write failed, 2 usage error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const VALUE_FLAGS = new Set(["--view", "--filter"])
const KNOWN_FLAGS = new Set([...VALUE_FLAGS, "--list", "--help", "-h"])
const argv = process.argv.slice(2)
const unknown = argv.filter((value, index) => value.startsWith("-") && !KNOWN_FLAGS.has(value) && !VALUE_FLAGS.has(argv[index - 1]))
if (unknown.length > 0) fail(2, `${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)

const valueOf = (flag) => {
  const index = argv.indexOf(flag)
  if (index === -1) return null
  const value = argv[index + 1]
  if (value === undefined || (value.startsWith("--") && value !== "")) fail(2, `${USAGE}\n\n${flag} requires a value`)
  return value
}

const listing = argv.includes("--list")
const viewName = valueOf("--view")
const filter = valueOf("--filter")

if (listing && (viewName !== null || filter !== null)) fail(2, `${USAGE}\n\n--list takes no other option`)
if (!listing) {
  if (viewName === null) fail(2, `${USAGE}\n\n--view is required, or pass --list`)
  if (filter === null) fail(2, `${USAGE}\n\n--filter is required with --view; pass "" to clear it`)
}

try {
  if (listing) {
    console.log(JSON.stringify(await listProjectViews(), null, 2))
  } else {
    console.log(JSON.stringify(await setProjectViewFilter(viewName, filter), null, 2))
  }
} catch (error) {
  fail(1, `board-view: ${error.message}`)
}
