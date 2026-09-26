#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: check-suppressions-ratchet.mjs

  Compares each workspace's eslint-suppressions.json total against the branch this
  merges into: origin/$GITHUB_BASE_REF when set, otherwise origin/main.
  Takes no arguments.

  --help, -h  print this usage and exit 0

exit codes: 0 every baseline held or shrank, 1 a baseline grew, 2 usage error`

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain && (process.argv.includes("--help") || process.argv.includes("-h"))) {
  console.log(USAGE)
  process.exit(0)
}

if (isMain && process.argv.length > 2) {
  console.error(`check-suppressions-ratchet: takes no arguments, got: ${process.argv.slice(2).join(" ")}\n`)
  console.error(USAGE)
  process.exit(2)
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const BASELINES = ["apps/web/eslint-suppressions.json", "apps/mobile/eslint-suppressions.json"]

const totalOf = (json) => {
  let total = 0
  for (const rules of Object.values(json)) {
    for (const entry of Object.values(rules)) total += typeof entry === "number" ? entry : (entry?.count ?? 0)
  }
  return total
}

export const baselineRefFrom = (env = process.env) => `origin/${env.GITHUB_BASE_REF?.trim() || "main"}`

const BASE_REF = baselineRefFrom()

const baseVersionOf = (path) => {
  try {
    return JSON.parse(execFileSync("git", ["show", `${BASE_REF}:${path}`], { cwd: REPO_ROOT, encoding: "utf8" }))
  } catch {
    return {}
  }
}

// Printed on every run so the resolved baseline and the raw field that produced it are both in the
// job log. A pull_request build that reported `GITHUB_BASE_REF=<unset>` would mean the field is not
// supplied the way this script assumes, and that is worth seeing in the log rather than inferring.
if (isMain) {
  console.log(`baseline: ${BASE_REF}  (GITHUB_BASE_REF=${process.env.GITHUB_BASE_REF ?? "<unset>"})`)

  let failed = false
  for (const path of BASELINES) {
    const absolute = join(REPO_ROOT, path)
    const current = existsSync(absolute) ? JSON.parse(readFileSync(absolute, "utf8")) : {}
    const currentTotal = totalOf(current)
    const baseTotal = totalOf(baseVersionOf(path))
    const verdict = currentTotal > baseTotal ? "GREW" : "ok"
    console.log(`${path}: ${baseTotal} on ${BASE_REF} -> ${currentTotal} here (${verdict})`)
    if (currentTotal > baseTotal) failed = true
  }

  if (failed) {
    console.error(
      `\nA suppressions baseline grew against ${BASE_REF}. The ratchet only shrinks: fix the new violation instead of absorbing it.\n` +
        "If this PR deliberately registers a NEW rule and seeds its baseline, say so in the PR body; a reviewer\n" +
        "override (re-running with the label ratchet:reseed) is the only sanctioned path.",
    )
    process.exit(1)
  }
}
