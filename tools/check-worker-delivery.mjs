#!/usr/bin/env node
/** Check the launcher-authenticated completion receipt used by merge consumers. */

import { workerDeliveryEvidence } from "./lib/worker-launch-provenance.mjs"

const USAGE = "usage: check-worker-delivery.mjs --issue ORB-N --branch <branch> --head <full-commit-sha> [--json]"
const argOf = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1]
}
const fail = (message) => {
  console.error(message)
  process.exit(2)
}
const issue = argOf("--issue")
const branch = argOf("--branch")
const head = argOf("--head")
const asJson = process.argv.includes("--json")
const knownFlags = new Set(["--issue", "--branch", "--head", "--json", "--help", "-h"])
const unknown = process.argv.slice(2).filter((value) => value.startsWith("-") && !knownFlags.has(value))
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}
if (unknown.length) fail(`${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)
if (!issue || !/^[A-Z]+-\d+$/.test(issue)) fail(`${USAGE}\n\n--issue must be a Linear identifier`)
if (!branch) fail(`${USAGE}\n\n--branch is required`)
if (!head || !/^[0-9a-f]{40}$/.test(head)) fail(`${USAGE}\n\n--head must be a lowercase full commit SHA`)

const evidence = workerDeliveryEvidence({ issue, branch, head })
if (asJson) console.log(JSON.stringify(evidence, null, 2))
else console.log(`${evidence.ok ? "OK" : "HELD"} worker-delivery: ${evidence.status}: ${evidence.reason}`)
process.exit(evidence.ok ? 0 : 1)
