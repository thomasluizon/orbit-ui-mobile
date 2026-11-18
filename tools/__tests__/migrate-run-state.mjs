import { mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { readRunState } from "../lib/run-state.mjs"

import { T, check, realOrchestratorConfig, root, stage, stageWithConfig } from "./_harness.mjs"

const TOOL = "migrate-run-state.mjs"
const HEAD = "d".repeat(40)

export const cases = () => {
  const staged = stageWithConfig("migrate-run-state", TOOL, realOrchestratorConfig())
  mkdirSync(join(staged.base, ".git"), { recursive: true })
  const runState = stage("migrate-run-state/run.json", JSON.stringify({ sessionId: "live", intake: { gmail: { completed: {}, pending: {}, highWater: "m2" } } }))
  const manifest = stage("migrate-run-state/manifest.json", JSON.stringify([{ kind: "review", file: stage("migrate-run-state/review.md", "Looks fine.\n"), issue: 2152, head: HEAD }]))
  check(TOOL, "an invalid manifest item exits 2 before any GitHub call", ["--run-state", runState, "--manifest", manifest], { status: 2, stderr: /VERDICT/ }, { path: staged.path })
  check(TOOL, "a manifest that is not an array exits 2", ["--manifest", stage("migrate-run-state/object.json", "{}")], { status: 2, stderr: /must be a JSON array/ }, { path: staged.path })
  check(TOOL, "an unreadable manifest exits 2", ["--manifest", join(root, "migrate-run-state", "absent.json")], { status: 2, stderr: /cannot read the manifest/ }, { path: staged.path })
  T(`${TOOL}: a refused run leaves the live run record untouched`, JSON.parse(readFileSync(runState, "utf8")).intake.gmail.highWater === "m2")
  T(`${TOOL}: the test checkout has no run record of its own`, readRunState(staged.base) === null)
}
