#!/usr/bin/env node
// The handle on the spacing ratchet (REBUILD.md 6.1.2 gap 3): the two
// eslint-suppressions.json baselines may only SHRINK. Before this job existed,
// zero CI read the suppression files, so a baseline edit could absorb a new
// violation silently. Compares each workspace's total suppressed-violation
// count in the working tree against the same file on origin/main; exits 1 on
// growth. New-rule adoption that legitimately grows a baseline (a rule newly
// registered, like spacing-scale landing) must regenerate on the SAME PR that
// registers the rule, and gets reviewed as such.

import { execFileSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const BASELINES = ["apps/web/eslint-suppressions.json", "apps/mobile/eslint-suppressions.json"]

const totalOf = (json) => {
  let total = 0
  for (const rules of Object.values(json)) {
    for (const entry of Object.values(rules)) total += typeof entry === "number" ? entry : (entry?.count ?? 0)
  }
  return total
}

const mainVersionOf = (path) => {
  try {
    return JSON.parse(execFileSync("git", ["show", `origin/main:${path}`], { cwd: REPO_ROOT, encoding: "utf8" }))
  } catch {
    return {}
  }
}

let failed = false
for (const path of BASELINES) {
  const absolute = join(REPO_ROOT, path)
  const current = existsSync(absolute) ? JSON.parse(readFileSync(absolute, "utf8")) : {}
  const currentTotal = totalOf(current)
  const mainTotal = totalOf(mainVersionOf(path))
  const verdict = currentTotal > mainTotal ? "GREW" : "ok"
  console.log(`${path}: ${mainTotal} on main -> ${currentTotal} here (${verdict})`)
  if (currentTotal > mainTotal) failed = true
}

if (failed) {
  console.error(
    "\nA suppressions baseline grew. The ratchet only shrinks: fix the new violation instead of absorbing it.\n" +
      "If this PR deliberately registers a NEW rule and seeds its baseline, say so in the PR body; a reviewer\n" +
      "override (re-running with the label ratchet:reseed) is the only sanctioned path.",
  )
  process.exit(1)
}
