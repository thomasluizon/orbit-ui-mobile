#!/usr/bin/env node
// Stop hook: blocks the end of a turn while an ARMED visual pass still has
// unverified surfaces. Armed only when .claude/manifests/ACTIVE exists, so the
// gate is inert in every unrelated session. Completion is derived from
// screenshots on disk by tools/check-surface-coverage.mjs -- never from a status
// field, which is exactly the checklist an agent could otherwise edit to look
// done (.claude/rules/visual-delivery.md). Exits 0 or 2 + stderr; any error
// exits 0. Contract: https://code.claude.com/docs/en/hooks

import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readStdinJson } from "./_lib/io.mjs"
import { evaluateManifest, loadManifest } from "../../tools/check-surface-coverage.mjs"

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const ARMED_PATH = join(REPO_ROOT, ".claude", "manifests", "ACTIVE")
const MAX_LISTED = 25

function shortfallMessage(verdict) {
  const lines = [
    `Visual completion gate: ${verdict.verified}/${verdict.total} cells verified. ${verdict.failures.length} still unverified.`,
    "",
    "A surface is done only when .artifacts/surfaces/<surfaceId>--<theme>--<locale>.png exists,",
    "exceeds 5KB, and is newer than its source file. Capture the remaining cells:",
    "  npm run surfaces:capture   then   npm run surfaces:check",
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
  lines.push("Do not report this task complete while cells remain unverified; report the ratio honestly.")
  return lines.join("\n") + "\n"
}

try {
  const input = readStdinJson()
  if (input?.stop_hook_active) process.exit(0)
  if (!existsSync(ARMED_PATH)) process.exit(0)

  const manifest = loadManifest()
  if (!manifest) {
    process.stderr.write(
      "Visual completion gate is armed (.claude/manifests/ACTIVE) but the surface manifest is missing.\nRun: npm run surfaces:manifest\n",
    )
    process.exit(2)
  }

  const verdict = evaluateManifest(manifest)
  if (verdict.complete) process.exit(0)

  process.stderr.write(shortfallMessage(verdict))
  process.exit(2)
} catch (error) {
  if (existsSync(ARMED_PATH)) {
    process.stderr.write(
      `Visual completion gate is ARMED (.claude/manifests/ACTIVE) but errored while checking coverage: ${error?.message ?? error}\n` +
        "A gate that cannot confirm completion is UNKNOWN, not clean. Refusing to end the turn.\n" +
        "Fix the error, or disarm intentionally by deleting .claude/manifests/ACTIVE.\n",
    )
    process.exit(2)
  }
  process.exit(0)
}
