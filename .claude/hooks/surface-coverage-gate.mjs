#!/usr/bin/env node
// Stop hook: blocks the end of a turn while a visual pass still has unverified
// surfaces. ARMED BY DEFAULT whenever .claude/manifests/surfaces.json exists -
// the manifest IS the declaration that a visual pass is in flight, and it is
// git-tracked, so arming survives every session and machine. The old opt-in
// ACTIVE file is gone: four straight sessions proved a gate the agent must arm
// itself never gets armed (#539 post-mortem, 2026-07-19). Disarm is HUMAN-ONLY:
// Thomas creates .claude/manifests/PAUSED in his own terminal (agents are
// blocked from creating it by forbid-gate-tamper); the pass itself disarms the
// gate the honest way, by completing. Completion is derived from screenshots +
// independent judge verdicts on disk by tools/check-surface-coverage.mjs -
// never from a status field or a sentence (.claude/rules/visual-delivery.md).
// Exits 0 or 2 + stderr; an internal error while armed refuses to end the turn
// (UNKNOWN is never clean). Contract: https://code.claude.com/docs/en/hooks

import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readStdinJson } from "./_lib/io.mjs"
import { evaluateManifest, loadManifest } from "../../tools/check-surface-coverage.mjs"

const REPO_ROOT = process.env.ORBIT_SURFACE_ROOT
  ? resolve(process.env.ORBIT_SURFACE_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const PAUSED_PATH = join(REPO_ROOT, ".claude", "manifests", "PAUSED")
const MANIFEST_PATH = join(REPO_ROOT, ".claude", "manifests", "surfaces.json")
const MAX_LISTED = 25

function shortfallMessage(verdict) {
  const byReason = verdict.failures.reduce((acc, failure) => {
    acc[failure.reason] = (acc[failure.reason] ?? 0) + 1
    return acc
  }, {})
  const lines = [
    `Visual completion gate: ${verdict.verified}/${verdict.total} cells verified (${Object.entries(byReason)
      .sort()
      .map(([reason, count]) => `${reason}: ${count}`)
      .join(", ")}).`,
    "",
    "A cell is done only when its screenshot exists (>5KB, newer than its source file)",
    "AND an independent judge marked the surface \"transformed\" with a matching hash.",
    "The loop: npm run surfaces:capture -> npm run surfaces:judge -> npm run surfaces:check",
    "",
    "Unverified (first " + MAX_LISTED + "):",
  ]
  for (const failure of verdict.failures.slice(0, MAX_LISTED)) {
    lines.push(`  [${failure.reason}] ${failure.artifact} <- ${failure.sourceFile}`)
  }
  if (verdict.failures.length > MAX_LISTED) {
    lines.push(`  ... and ${verdict.failures.length - MAX_LISTED} more (npm run surfaces:check for the full list)`)
  }
  lines.push("")
  lines.push(
    "NEVER report the visual pass complete while cells remain unverified; state the ratio honestly. " +
      "If your task is unrelated to the visual pass, finish it and simply include the honest ratio in your report.",
  )
  return lines.join("\n") + "\n"
}

try {
  const input = readStdinJson()
  if (input?.stop_hook_active) process.exit(0)
  if (!existsSync(MANIFEST_PATH)) process.exit(0)
  if (existsSync(PAUSED_PATH)) process.exit(0)

  const manifest = loadManifest()
  if (!manifest) {
    process.stderr.write(
      "Visual completion gate: .claude/manifests/surfaces.json exists but is unreadable.\nRun: npm run surfaces:manifest\n",
    )
    process.exit(2)
  }

  const verdict = evaluateManifest(manifest)
  if (verdict.complete) process.exit(0)

  process.stderr.write(shortfallMessage(verdict))
  process.exit(2)
} catch (error) {
  if (existsSync(MANIFEST_PATH) && !existsSync(PAUSED_PATH)) {
    process.stderr.write(
      `Visual completion gate is armed (manifest present) but errored while checking coverage: ${error?.message ?? error}\n` +
        "A gate that cannot confirm completion is UNKNOWN, not clean. Refusing to end the turn.\n" +
        "Fix the error; pausing the gate is a human-only action (.claude/manifests/PAUSED).\n",
    )
    process.exit(2)
  }
  process.exit(0)
}
