#!/usr/bin/env node
// Stop hook: an HONESTY gate on the visual pass, not a completion nag.
//
// It blocks exactly one thing: a turn that CLAIMS the visual work is done
// without stating the machine-computed ratio alongside the claim. A turn that
// makes no such claim ends silently, whatever the ratio is.
//
// Why it is no longer a "block until every cell verifies" gate (#539
// post-mortem, 2026-07-19): the old version exited 2 on ANY epic-wide
// shortfall, which is true on every turn, including turns that never touched a
// surface. Interactively that is a harmless nag. In a headless `claude -p`
// drive child it is fatal - the hook rejects the child's final message, the
// child is forced to continue, its reply to the hook becomes the NEW final
// message, and the {"status":...} line the driver greps for is gone. Three
// bundles were recorded `unknown` that way in a single night; one of them
// (`social`) had already committed, pushed, and reported honestly. The
// driver's circuit breaker then halted a healthy run. The gate built to
// prevent a false "done" was manufacturing false failures instead.
//
// A gate cannot make work happen; it can only make the CLAIM honest. So that
// is all this does, and it does it mechanically: claim + no ratio = blocked.
// Completion itself stays derived from screenshots + independent judge
// verdicts on disk (tools/check-surface-coverage.mjs), never from a sentence.
//
// ARMED whenever .claude/manifests/surfaces.json exists. Disarm is HUMAN-ONLY:
// Thomas creates .claude/manifests/PAUSED in his own terminal (agents are
// blocked from creating it by forbid-gate-tamper).
// Contract: https://code.claude.com/docs/en/hooks

import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readStdinJson } from "./_lib/io.mjs"
import { evaluateManifest, loadManifest } from "../../tools/check-surface-coverage.mjs"

const REPO_ROOT = process.env.ORBIT_SURFACE_ROOT
  ? resolve(process.env.ORBIT_SURFACE_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const PAUSED_PATH = join(REPO_ROOT, ".claude", "manifests", "PAUSED")
const MANIFEST_PATH = join(REPO_ROOT, ".claude", "manifests", "surfaces.json")

const VISUAL_TOPIC = /\b(surfaces?|cells?|visual pass|design pass|redesign|de-?slop|transformed|DESIGN\.md|#539)\b/i
const COMPLETION_CLAIM =
  /\b(all (?:surfaces|cells)|fully (?:done|complete)|now (?:done|complete)|is complete|are complete|completed the|finished the|(?:design|visual) (?:pass|work|transformation)[^.]{0,20}(?:done|complete|landed)|ready to merge)\b/i

/** The concatenated text of the transcript's last assistant message, or "" when it cannot be read. */
function finalAssistantText(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return ""
  let lines
  try {
    lines = readFileSync(transcriptPath, "utf8").trim().split("\n")
  } catch {
    return ""
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry
    try {
      entry = JSON.parse(lines[i])
    } catch {
      continue
    }
    if (entry?.type !== "assistant" || !Array.isArray(entry.message?.content)) continue
    const text = entry.message.content
      .filter((block) => block?.type === "text")
      .map((block) => block.text)
      .join("")
    if (text.trim()) return text
  }
  return ""
}

function claimsCompletion(text) {
  return VISUAL_TOPIC.test(text) && COMPLETION_CLAIM.test(text)
}

function statesRatio(text, total) {
  return new RegExp(`\\b\\d+\\s*/\\s*${total}\\b`).test(text)
}

try {
  const input = readStdinJson()
  if (input?.stop_hook_active) process.exit(0)
  if (!existsSync(MANIFEST_PATH)) process.exit(0)
  if (existsSync(PAUSED_PATH)) process.exit(0)

  const finalText = finalAssistantText(input?.transcript_path)
  if (!claimsCompletion(finalText)) process.exit(0)

  const manifest = loadManifest()
  if (!manifest) {
    process.stderr.write(
      "Visual completion gate: the surface manifest is unreadable, so your completion claim cannot be checked.\n" +
        "A claim that cannot be verified is UNKNOWN, not true. Run: npm run surfaces:manifest\n",
    )
    process.exit(2)
  }

  const verdict = evaluateManifest(manifest)
  if (verdict.complete) process.exit(0)
  if (statesRatio(finalText, verdict.total)) process.exit(0)

  const byReason = verdict.failures.reduce((acc, failure) => {
    acc[failure.reason] = (acc[failure.reason] ?? 0) + 1
    return acc
  }, {})
  process.stderr.write(
    `Visual completion gate: you claimed the visual work is done, but it is ${verdict.verified}/${verdict.total} ` +
      `(${Object.entries(byReason)
        .sort()
        .map(([reason, count]) => `${reason}: ${count}`)
        .join(", ")}).\n\n` +
      `State "${verdict.verified}/${verdict.total}" in the same message as the claim, or drop the claim.\n` +
      'A cell counts only with a fresh screenshot AND an independent judge verdict of "transformed" whose hash still matches.\n' +
      "The loop: npm run surfaces:capture -> npm run surfaces:judge -> npm run surfaces:check\n",
  )
  process.exit(2)
} catch (error) {
  process.stderr.write(`Visual completion gate errored and allowed the turn to end: ${error?.message ?? error}\n`)
  process.exit(0)
}
