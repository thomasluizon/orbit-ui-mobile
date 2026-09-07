#!/usr/bin/env node
// The handle on the spacing ratchet: the two
// eslint-suppressions.json baselines may only SHRINK. Before this job existed,
// zero CI read the suppression files, so a baseline edit could absorb a new
// violation silently. Compares each workspace's total suppressed-violation
// count in the working tree against the same file on THE BRANCH THIS MERGES
// INTO, taken from GITHUB_BASE_REF or an explicit --base; exits 1 on growth
// and refuses to run when neither is supplied. The base ref is load-bearing: `redesign/main`
// carries about 950 more suppressions than `main`, so a fixed origin/main
// baseline would fail every redesign pull request against an unrelated total
// and the ratchet would gate nothing on that branch. New-rule adoption that legitimately grows a baseline (a rule newly
// registered, like spacing-scale landing) must regenerate on the SAME PR that
// registers the rule, and gets reviewed as such.

import { execFileSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: check-suppressions-ratchet.mjs [--base <ref>]

  Compares each workspace's eslint-suppressions.json total against the branch this
  merges into: origin/$GITHUB_BASE_REF when non-blank, otherwise the explicit --base.
  Refuses when neither is supplied. For a redesign branch run:
  GITHUB_BASE_REF=redesign/main node tools/check-suppressions-ratchet.mjs

  --base <ref>  base branch on origin (redesign/main or origin/redesign/main)
  --help, -h  print this usage and exit 0

exit codes: 0 every baseline held or shrank, 1 a baseline grew, 2 usage error`

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain && (process.argv.includes("--help") || process.argv.includes("-h"))) {
  console.log(USAGE)
  process.exit(0)
}

const args = isMain ? process.argv.slice(2) : []
if (args.length && (args.length !== 2 || args[0] !== "--base" || !args[1].trim() || args[1].startsWith("-"))) {
  console.error(`check-suppressions-ratchet: expected --base <ref>, got: ${args.join(" ")}\n`)
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

// GITHUB_BASE_REF carries the base BRANCH NAME on a pull_request event. Local runs require an
// explicit base because a feature branch's upstream identifies its own remote copy, not a PR base.
//
// The value is NOT normalised beyond trimming, deliberately. Stripping a `refs/heads/` prefix
// "just in case" would be a defensive branch for a field this repository does not own, and it
// would hide the very drift worth seeing. The run log below prints the raw field on every run
// instead, so a shape that is not a bare branch name shows up as a named baseline miss rather
// than as silent behaviour.
export const baselineRefFrom = (env = process.env, explicitBase) => {
  const pullRequestBase = env.GITHUB_BASE_REF?.trim()
  if (pullRequestBase) return `origin/${pullRequestBase}`

  const base = explicitBase?.trim()
  if (base) return base.startsWith("origin/") ? base : `origin/${base}`

  throw new Error(
    "supply GITHUB_BASE_REF or --base <ref>; for a redesign branch run: "
      + "GITHUB_BASE_REF=redesign/main node tools/check-suppressions-ratchet.mjs",
  )
}

let BASE_REF
if (isMain) {
  try {
    BASE_REF = baselineRefFrom(process.env, args[1])
  } catch (error) {
    console.error(`check-suppressions-ratchet: ${error.message}`)
    process.exit(2)
  }
}

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
