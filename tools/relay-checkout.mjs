#!/usr/bin/env node
import { relayHarnessDifferences, syncRelayCheckout } from "./lib/relay-checkout.mjs"
import { REPO_ROOT } from "./lib/run-state.mjs"

const USAGE = `usage: relay-checkout.mjs [--check]

  Fetch origin/main and merge it into the checked-out relay branch after a clean
  merge-tree preflight. Refuses main and detached HEAD. Never pushes or rewrites history.
  --check     fetch and print a JSON array of every differing path under tools/,
    .claude/skills/, .claude/hooks/ and .claude/rules/. Does not merge or inspect relay docs.
  --help, -h  print usage and exit 0

exit codes: 0 refreshed or no differences; 1 differences or git failure; 2 usage error`

const argv = process.argv.slice(2)
if (argv.includes("--help") || argv.includes("-h")) {
  process.stdout.write(`${USAGE}\n`)
} else if (argv.length > 1 || argv.length === 1 && argv[0] !== "--check") {
  process.stderr.write(`${USAGE}\n`)
  process.exitCode = 2
} else {
  try {
    if (argv[0] === "--check") {
      const paths = relayHarnessDifferences(REPO_ROOT)
      process.stdout.write(`${JSON.stringify(paths, null, 2)}\n`)
      process.exitCode = paths.length > 0 ? 1 : 0
    } else {
      syncRelayCheckout(REPO_ROOT)
      process.stdout.write("Relay checkout refreshed from origin/main.\n")
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
