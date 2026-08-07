/**
 * The one parser of the human-authored caps override.
 *
 * WHY it exists, measured 2026-08-06: `caps.affectedFiles` (8) and `caps.diffLines` (400) were
 * absolute, and two legitimate tickets died on them. ORB-204 is a 355-file icon codemod, which under
 * an 8-file cap becomes 45 pull requests, which is worse than the problem it splits. ORB-84 needs a
 * regenerated `package-lock.json`, thousands of lines by construction and not reviewable line by
 * line either way.
 *
 * WHY a marker line in the ticket DESCRIPTION and not a Linear label: a label is one API call away
 * for any agent in this harness, so a label would let the thing being capped lift its own cap. The
 * description is where Thomas writes and the comments are where the machines write, so a line in the
 * description is the strongest "he typed this" signal available without leaving Linear. `/ticket`
 * never emits one and the orchestrator never adds one; both prohibitions are written down in their
 * own skills.
 *
 * The grammar is one line, anywhere in the description:
 *
 *   CAPS-OVERRIDE: files=400 reason=one mechanical icon codemod, reviewed as a transform
 *   CAPS-OVERRIDE: lines=6000 reason=regenerated package-lock.json
 *   CAPS-OVERRIDE: files=40 lines=6000 reason=both, and here is why
 *
 * It names WHICH cap moves and to what, because lifting the file cap for a codemod is not the same
 * decision as lifting the line cap for a lockfile, and a blanket "ignore the caps" is how an
 * exemption becomes the default. A cap it does not name is not lifted.
 */

export const CAPS_OVERRIDE_MARKER = "CAPS-OVERRIDE:"

const CAP_KEYS = { files: "affectedFiles", lines: "diffLines" }

/**
 * @param description the Linear issue description, verbatim
 * @param standingCaps `{ files, lines }`, the caps the override has to beat to mean anything
 * @returns `{found: false}` | `{found: true, error}` | `{found: true, files, lines, reason, source}`
 */
export const parseCapsOverride = (description, standingCaps) => {
  const lines = String(description ?? "").split(/\r?\n/)
  const markers = lines.map((line) => line.trim()).filter((line) => line.startsWith(CAPS_OVERRIDE_MARKER))
  if (markers.length === 0) return { found: false }
  if (markers.length > 1) {
    return { found: true, error: `${markers.length} ${CAPS_OVERRIDE_MARKER} lines; exactly one is allowed, so which caps apply is never a guess` }
  }

  const body = markers[0].slice(CAPS_OVERRIDE_MARKER.length)
  const reasonAt = body.indexOf("reason=")
  if (reasonAt === -1) return { found: true, error: `${CAPS_OVERRIDE_MARKER} names no reason=; an exemption with no reason is a blanket exemption` }
  const reason = body.slice(reasonAt + "reason=".length).trim()
  if (reason.length === 0) return { found: true, error: `${CAPS_OVERRIDE_MARKER} carries an empty reason=` }

  const lifted = { files: null, lines: null }
  const tokens = body.slice(0, reasonAt).trim().split(/\s+/).filter(Boolean)
  for (const token of tokens) {
    const pair = /^(files|lines)=(\d+)$/.exec(token)
    if (!pair) {
      return { found: true, error: `${CAPS_OVERRIDE_MARKER} carries "${token}"; the only caps are files=<n> and lines=<n>, both before reason=` }
    }
    const [, key, raw] = pair
    if (lifted[key] !== null) return { found: true, error: `${CAPS_OVERRIDE_MARKER} names ${key} twice` }
    const value = Number(raw)
    const standing = standingCaps?.[key]
    /** A value at or under the standing cap lifts nothing, and is a typo far more often than a
     * deliberate tightening. Refusing it is how the typo is seen rather than silently obeyed. */
    if (!Number.isInteger(standing) || value <= standing) {
      return { found: true, error: `${CAPS_OVERRIDE_MARKER} ${key}=${value} does not lift the standing caps.${CAP_KEYS[key]} of ${standing}` }
    }
    lifted[key] = value
  }
  if (lifted.files === null && lifted.lines === null) {
    return { found: true, error: `${CAPS_OVERRIDE_MARKER} lifts no cap; name files=<n>, lines=<n>, or both before reason=` }
  }
  return { found: true, files: lifted.files, lines: lifted.lines, reason, source: markers[0] }
}

/** The caps actually in force for one ticket. An override that failed to parse lifts nothing. */
export const effectiveCaps = (standingCaps, override) => ({
  files: override?.files ?? standingCaps.files,
  lines: override?.lines ?? standingCaps.lines,
})
