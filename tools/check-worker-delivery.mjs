#!/usr/bin/env node
/** Check the launcher-authenticated completion receipt used by merge consumers. */

import { workerDeliveryEvidence, WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY_ENV } from "./lib/worker-launch-provenance.mjs"

const USAGE = "usage: check-worker-delivery.mjs --issue ORB-N --branch <branch> --head <full-commit-sha> [--authority-public-key <base64>] [--json]"
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
const authorityPublicKey = argOf("--authority-public-key") ?? process.env[WORKER_LAUNCH_AUTHORITY_PUBLIC_KEY_ENV] ?? null
const asJson = process.argv.includes("--json")
const knownFlags = new Set(["--issue", "--branch", "--head", "--authority-public-key", "--json", "--help", "-h"])
const unknown = process.argv.slice(2).filter((value) => value.startsWith("-") && !knownFlags.has(value))
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}
if (unknown.length) fail(`${USAGE}\n\nunknown option(s): ${unknown.join(" ")}`)
if (!issue || !/^[A-Z]+-\d+$/.test(issue)) fail(`${USAGE}\n\n--issue must be a Linear identifier`)
if (!branch) fail(`${USAGE}\n\n--branch is required`)
if (!head || !/^[0-9a-f]{40}$/.test(head)) fail(`${USAGE}\n\n--head must be a lowercase full commit SHA`)
if (process.argv.includes("--authority-public-key") && !argOf("--authority-public-key")) fail(`${USAGE}\n\n--authority-public-key requires a value`)

const evidence = workerDeliveryEvidence({ issue, branch, head, authorityPublicKey })
if (asJson) console.log(JSON.stringify(evidence, null, 2))
else console.log(`${evidence.ok ? "OK" : "HELD"} worker-delivery: ${evidence.status}: ${evidence.reason}`)
process.exit(evidence.ok ? 0 : 1)
