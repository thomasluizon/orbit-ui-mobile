import { execFileSync } from "node:child_process"
import { cpSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, root, run, toolPath } from "./_harness.mjs"
import { baselineRefFrom } from "../check-suppressions-ratchet.mjs"

const TOOL = "check-suppressions-ratchet.mjs"

/** The shape totalOf() sums: a file map of rule names to counts. */
const baselineWithTotal = (total) => JSON.stringify({ "app/page.tsx": { "local/spacing-scale": total } }, null, 2)

const git = (cwd, ...argv) =>
  execFileSync("git", ["-c", "user.email=gate@orbit.test", "-c", "user.name=gate", ...argv], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()

const writeBaselines = (repo, total) => {
  for (const workspace of ["web", "mobile"]) {
    const directory = join(repo, "apps", workspace)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, "eslint-suppressions.json"), baselineWithTotal(total))
  }
}

/**
 * A real repository with two remote-tracking baselines that DISAGREE, so a run that reads the wrong
 * one cannot accidentally agree with the right one. The tool resolves its repository root from its
 * own location, so the tool is copied in rather than pointed at: that keeps the fixture driving the
 * shipped file byte for byte instead of a re-implementation of it.
 */
const buildFixture = () => {
  const repo = join(root, "ratchet-end-to-end")
  mkdirSync(join(repo, "tools"), { recursive: true })
  cpSync(toolPath(TOOL), join(repo, "tools", TOOL))

  git(repo, "init", "--initial-branch=main")

  writeBaselines(repo, 10)
  git(repo, "add", "-A")
  git(repo, "commit", "-m", "main baseline")
  git(repo, "update-ref", "refs/remotes/origin/main", git(repo, "rev-parse", "HEAD"))

  writeBaselines(repo, 100)
  git(repo, "add", "-A")
  git(repo, "commit", "-m", "redesign baseline")
  git(repo, "update-ref", "refs/remotes/origin/redesign/main", git(repo, "rev-parse", "HEAD"))

  // The working tree sits BETWEEN the two: growth against main, a shrink against redesign/main.
  writeBaselines(repo, 50)

  return join(repo, "tools", TOOL)
}

export const cases = async () => {
  // ---- the mapping, in isolation ------------------------------------------------------------
  T(
    "check-suppressions-ratchet: an absent GITHUB_BASE_REF falls back to origin/main",
    baselineRefFrom({}) === "origin/main",
  )
  T(
    "check-suppressions-ratchet: an empty GITHUB_BASE_REF falls back to origin/main",
    baselineRefFrom({ GITHUB_BASE_REF: "" }) === "origin/main",
  )
  T(
    "check-suppressions-ratchet: a whitespace-only GITHUB_BASE_REF falls back to origin/main",
    baselineRefFrom({ GITHUB_BASE_REF: "   " }) === "origin/main",
  )
  T(
    "check-suppressions-ratchet: a multi-segment base branch keeps every segment",
    baselineRefFrom({ GITHUB_BASE_REF: "release/2026/08" }) === "origin/release/2026/08",
  )
  T(
    "check-suppressions-ratchet: surrounding whitespace is trimmed from the branch name",
    baselineRefFrom({ GITHUB_BASE_REF: " redesign/main\n" }) === "origin/redesign/main",
  )
  // Deliberately NOT normalised: stripping refs/heads/ would be a defensive branch for a field this
  // repository does not own, and it would hide the drift the run log exists to surface.
  T(
    "check-suppressions-ratchet: a full ref is passed through unnormalised rather than silently repaired",
    baselineRefFrom({ GITHUB_BASE_REF: "refs/heads/main" }) === "origin/refs/heads/main",
  )

  // ---- the CLI, end to end, against real git refs --------------------------------------------
  // These are the assertions that would catch baseVersionOf() regressing to a fixed origin/main, or
  // the growth path ceasing to exit 1. The mapping cases above cannot: they only format a string.
  const path = buildFixture()

  const againstMainImplicit = run(TOOL, [], { path, env: { GITHUB_BASE_REF: "" } })
  T(
    "check-suppressions-ratchet: with no base ref the CLI reads origin/main and fails on growth",
    againstMainImplicit.status === 1 && againstMainImplicit.stdout.includes("10 on origin/main -> 50 here (GREW)"),
    `exit ${againstMainImplicit.status}\n     ${againstMainImplicit.stdout.trim()}`,
  )

  const againstMain = run(TOOL, [], { path, env: { GITHUB_BASE_REF: "main" } })
  T(
    "check-suppressions-ratchet: a pull request into main reads main's total and fails on growth",
    againstMain.status === 1 && againstMain.stdout.includes("10 on origin/main -> 50 here (GREW)"),
    `exit ${againstMain.status}\n     ${againstMain.stdout.trim()}`,
  )

  // The whole point of the change: the SAME working tree passes against the branch it merges into.
  const againstRedesign = run(TOOL, [], { path, env: { GITHUB_BASE_REF: "redesign/main" } })
  T(
    "check-suppressions-ratchet: a pull request into redesign/main reads that branch's total and passes",
    againstRedesign.status === 0 && againstRedesign.stdout.includes("100 on origin/redesign/main -> 50 here (ok)"),
    `exit ${againstRedesign.status}\n     ${againstRedesign.stdout.trim()}`,
  )

  T(
    "check-suppressions-ratchet: the failure message names the ref it compared against",
    againstMain.stderr.includes("grew against origin/main"),
    againstMain.stderr.trim(),
  )

  T(
    "check-suppressions-ratchet: the run logs the raw GITHUB_BASE_REF it read",
    againstRedesign.stdout.includes("(GITHUB_BASE_REF=redesign/main)")
      && againstMainImplicit.stdout.includes("(GITHUB_BASE_REF=)"),
    againstRedesign.stdout.trim(),
  )
}
