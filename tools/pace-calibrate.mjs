#!/usr/bin/env node

import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { NoSpendError, calibrationPath, readCalibration, takeReading, writeCalibration } from "./lib/pace-governor.mjs"

const USAGE = `usage: pace-calibrate.mjs --percent <number> [--at <ISO time>]
       pace-calibrate.mjs --show

Stores the owner reading that gives the pace governor its weekly budget. Read the weekly percentage
that the plan shows, then run this at once. The tool adds the weighted token spend of the main account
since the weekly reset up to that time, from the local Claude transcripts, and divides it by the
percentage. The result is the weekly budget in weighted tokens. A new reading replaces the stored one.
The stored reading lives in the common Git directory, so every worktree reads the same one.

  --percent <n>  the weekly percentage the plan shows, above 0 and up to 100 (required to store)
  --at <time>    when the plan showed it, an ISO time with an offset (default: now)
  --show         print the stored reading and exit 0, or exit 1 when none is stored
  --help, -h     print this usage and exit 0

exit codes: 0 stored or shown, 1 no stored reading to show or no spend to derive a budget from,
            2 usage or config error, 3 the reading could not be stored`

const argv = process.argv.slice(2)
const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}
const valueOf = (flag) => {
  const index = argv.indexOf(flag)
  return index === -1 ? null : argv[index + 1] ?? ""
}
const known = new Set(["--percent", "--at", "--show"])
for (let index = 0; index < argv.length; index++) {
  if (!known.has(argv[index])) fail(2, `${USAGE}\n\nunsupported argument: ${argv[index]}`)
  if (argv[index] !== "--show") index++
}

let config
try {
  config = readOrchestratorConfig()
} catch (error) {
  fail(2, error.message)
}
const path = calibrationPath()

if (argv.includes("--show")) {
  if (argv.length !== 1) fail(2, `${USAGE}\n\n--show takes no other argument`)
  let reading
  try { reading = readCalibration(path) } catch (error) { fail(2, error.message) }
  if (reading === null) fail(1, `no reading is stored at ${path}`)
  console.log(JSON.stringify({ path, ...reading }, null, 2))
  process.exit(0)
}

const percentText = valueOf("--percent")
if (percentText === null || percentText.startsWith("--") || percentText.trim() === "") fail(2, `${USAGE}\n\n--percent is required`)
const atText = valueOf("--at")
if (atText !== null && (atText.startsWith("--") || !/(?:Z|[+-]\d{2}:?\d{2})$/.test(atText))) fail(2, `${USAGE}\n\n--at needs an ISO time with an offset, got "${atText}"`)
const readAtMs = atText === null ? Date.now() : Date.parse(atText)
let reading
try {
  reading = takeReading({ pace: config.pace, percent: Number(percentText), readAtMs })
} catch (error) {
  fail(error instanceof NoSpendError ? 1 : 2, error.message)
}
try {
  writeCalibration(path, reading)
} catch (error) {
  fail(3, `could not store the reading at ${path}: ${error.message}`)
}
console.log(JSON.stringify({ path, ...reading }, null, 2))
