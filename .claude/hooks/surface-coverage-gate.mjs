#!/usr/bin/env node
// Stop hook: an HONESTY gate on the visual pass, not a completion nag.
//
// It blocks exactly one thing: a turn that CLAIMS the visual work is done
// without stating the machine-computed ratio alongside the claim. A turn that
// makes no such claim ends silently, whatever the ratio is.
//
// Why it is not a "block until every cell verifies" gate (#539 post-mortem,
// 2026-07-19): the old version exited 2 on ANY shortfall, i.e. every turn. In
// a headless `claude -p` drive child that is fatal - the hook rejects the
// child's final message, the child is forced to continue, and the
// {"status":...} line the driver greps for is gone. Three bundles were
// recorded `unknown` that way in one night; one had already committed, pushed
// and reported honestly. The gate built to prevent a false "done" was
// manufacturing false failures instead.
//
// Why the claim-detection regex is NOT the honesty mechanism: a regex over
// prose is a guess about wording, and the previous rebuild's own review found
// its only measured effect was destroying a status line. The real mechanical
// enforcement lives in the TOOL: tools/check-surface-coverage.mjs prints its
// three axis counts and its platform scope on every single run, and
// test-hooks asserts it cannot print a completion number without them. This
// hook is the backstop for the one case a tool cannot cover - a model
// asserting completion in prose without running the tool at all.
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

// Tracked outside the try so the catch can tell a FIRST error (block, so the
// error is seen) from a re-entry after a block (allow, so a broken gate cannot
// wedge the session). Claude Code also overrides a Stop hook after 8 consecutive
// blocks, so this is bounded twice over.
let alreadyBlockedOnce = false

try {
  const input = readStdinJson()
  alreadyBlockedOnce = Boolean(input?.stop_hook_active)
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

  process.stderr.write(
    `Visual completion gate: you claimed the visual work is done, but it is ${verdict.verified}/${verdict.total} cells.\n\n` +
      `  touched      ${verdict.touched}/${verdict.total}   an owned file's visual signature moved since the baseline\n` +
      `  defect-clear ${verdict.defectClear}/${verdict.total}   independent judge report on file, no blocker\n` +
      `  human-signed ${verdict.signed}/${verdict.total}   the ONLY axis that can grant a cell\n\n` +
      `State "${verdict.verified}/${verdict.total}" in the same message as the claim, or drop the claim.\n` +
      "No automatic check can mark a surface done: completion is granted only by a human tick in\n" +
      ".claude/manifests/signoff.json, which agents cannot write. If you believe surfaces are ready,\n" +
      "say which ones and ask Thomas to look at the contact sheet.\n",
  )
  process.exit(2)
} catch (error) {
  // A verifier that errors is UNKNOWN, never a clean pass. This exited 0 on any
  // internal error, so a broken gate was indistinguishable from a satisfied one -
  // exactly what the "Fail-closed the completion gate" ADR forbids, in the file
  // that ADR was written about.
  process.stderr.write(
    `Visual completion gate ERRORED, so your completion claim is UNVERIFIED: ${error?.message ?? error}\n` +
      "An error is not a pass. Either fix the gate, or drop the completion claim and say the gate is broken.\n",
  )
  process.exit(alreadyBlockedOnce ? 0 : 2)
}
