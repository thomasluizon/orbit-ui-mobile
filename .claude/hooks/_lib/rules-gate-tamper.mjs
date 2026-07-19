// Tamper guard for the visual completion gate's own state. The gate derives
// "done" from three files; an agent that can rewrite them can fake "done"
// without doing the work, which is the exact failure this gate exists to stop
// (.claude/rules/visual-delivery.md). Protected:
//   .claude/manifests/PAUSED         - human-only disarm switch (any touch blocks)
//   .claude/manifests/surfaces.json  - the denominator; regenerate ONLY via
//                                      tools/surface-manifest.mjs (hand-editing
//                                      it shaves surfaces out of scope)
//   .artifacts/surfaces/verdicts.json- independent-judge verdicts; written ONLY
//                                      by tools/judge-surfaces.mjs
// Honest limit: this stops drift and casual shortcuts, not a determined
// adversarial payload - an agent with a full shell can always find a path
// around a local fence. The point is that faking "done" now requires deliberate
// multi-step tampering instead of one careless sentence.

const PAUSED_RE = /\.claude[\\/]manifests[\\/]PAUSED/i
const MANIFEST_RE = /\.claude[\\/]manifests[\\/]surfaces\.json/i
const VERDICTS_RE = /\.artifacts[\\/]surfaces[\\/]verdicts\.json/i

const MANIFEST_WRITERS = [/^node\s+(\.\/)?tools[\\/]surface-manifest\.mjs\b/, /^npm\s+run\s+surfaces:manifest\b/]
const VERDICT_WRITERS = [/^node\s+(\.\/)?tools[\\/]judge-surfaces\.mjs\b/, /^npm\s+run\s+surfaces:judge\b/]
const READ_ONLY_LEADERS = /^(cat|jq|ls|dir|stat|head|tail|wc|grep|rg|git|type|sha256sum|certutil|node\s+(\.\/)?tools[\\/]check-surface-coverage\.mjs|npm\s+run\s+surfaces:check)\b/

function firstSegmentIsSanctioned(command, writers) {
  const trimmed = String(command).trim()
  return writers.some((writer) => writer.test(trimmed))
}

function looksLikeWrite(command) {
  return /[>]|(\brm\b)|(\bmv\b)|(\bcp\b)|(\bsed\s+-i\b)|(\btee\b)|(\btruncate\b)|(\bdel\b)|(\bRemove-Item\b)|(\bSet-Content\b)|(\bOut-File\b)|(\bgit\s+rm\b)|(\bgit\s+checkout\b)|(\bgit\s+restore\b)/i.test(command)
}

/** Bash-side guard: block shell commands that create PAUSED or rewrite the manifest/verdicts outside their sanctioned tools. Returns { block, message } or null. */
export function checkGateTamperBash(command) {
  const text = String(command ?? "")
  if (!text) return null

  if (PAUSED_RE.test(text)) {
    return {
      block: true,
      message:
        "gate-tamper: .claude/manifests/PAUSED is the HUMAN-ONLY pause switch for the visual completion gate. " +
        "An agent never creates, edits, or reads-to-copy it. If the gate should pause, say so and let Thomas create the file in his own terminal.",
    }
  }

  if (MANIFEST_RE.test(text) && !firstSegmentIsSanctioned(text, MANIFEST_WRITERS)) {
    if (looksLikeWrite(text) || !READ_ONLY_LEADERS.test(text.trim())) {
      return {
        block: true,
        message:
          "gate-tamper: .claude/manifests/surfaces.json is the completion denominator and is derived from the codebase. " +
          "Never edit, overwrite, or delete it by hand - regenerate it with `npm run surfaces:manifest` (tools/surface-manifest.mjs). " +
          "Reading it (cat/jq/git) is fine.",
      }
    }
  }

  if (VERDICTS_RE.test(text) && !firstSegmentIsSanctioned(text, VERDICT_WRITERS)) {
    if (looksLikeWrite(text) || !READ_ONLY_LEADERS.test(text.trim())) {
      return {
        block: true,
        message:
          "gate-tamper: .artifacts/surfaces/verdicts.json holds INDEPENDENT judge verdicts and is written only by " +
          "`npm run surfaces:judge` (tools/judge-surfaces.mjs), which re-runs real judges over the real screenshots. " +
          "Writing it any other way is fabricating a verdict. Reading it (cat/jq) is fine.",
      }
    }
  }

  return null
}

/** Edit/Write-side guard: block direct file edits to any gate-state file. Returns { block, message } or null. */
export function checkGateTamperEdit(filePath) {
  const path = String(filePath ?? "")
  if (!path) return null
  if (PAUSED_RE.test(path)) {
    return {
      block: true,
      message: "gate-tamper: .claude/manifests/PAUSED is human-only. Do not create or edit it from an agent session.",
    }
  }
  if (MANIFEST_RE.test(path)) {
    return {
      block: true,
      message: "gate-tamper: never hand-edit .claude/manifests/surfaces.json - regenerate it with `npm run surfaces:manifest`.",
    }
  }
  if (VERDICTS_RE.test(path)) {
    return {
      block: true,
      message: "gate-tamper: never hand-write .artifacts/surfaces/verdicts.json - verdicts come only from `npm run surfaces:judge`.",
    }
  }
  return null
}
