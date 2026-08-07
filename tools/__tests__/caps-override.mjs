import { T } from "./_harness.mjs"

const { CAPS_OVERRIDE_MARKER, effectiveCaps, parseCapsOverride } = await import("../lib/caps-override.mjs")

const TOOL = "lib/caps-override.mjs"
const CAPS = { files: 8, lines: 400 }
const body = (line) => `## Problem\n\nSomething is wrong.\n\n${line}\n\n## Scope\n\nFix it.`

export const cases = () => {
  T(`${TOOL}: a description with no marker finds nothing`, parseCapsOverride(body("Nothing special here."), CAPS).found === false)
  T(`${TOOL}: an absent description is not an error`, parseCapsOverride(undefined, CAPS).found === false)

  const files = parseCapsOverride(body(`${CAPS_OVERRIDE_MARKER} files=400 reason=one mechanical icon codemod`), CAPS)
  T(
    `${TOOL}: a file-cap override names the cap, the value and the reason`,
    files.found === true && files.error === undefined && files.files === 400 && files.lines === null && files.reason === "one mechanical icon codemod",
    JSON.stringify(files),
  )

  const lines = parseCapsOverride(body(`${CAPS_OVERRIDE_MARKER} lines=6000 reason=regenerated package-lock.json`), CAPS)
  T(`${TOOL}: a line-cap override lifts only the line cap`, lines.files === null && lines.lines === 6000, JSON.stringify(lines))

  const both = parseCapsOverride(body(`${CAPS_OVERRIDE_MARKER} files=40 lines=6000 reason=both, and here is why`), CAPS)
  T(`${TOOL}: both caps can move on one line`, both.files === 40 && both.lines === 6000 && both.reason === "both, and here is why", JSON.stringify(both))

  /**
   * THE case the whole design turns on: an override that names one cap must not lift the other. Lifting
   * the file cap for a codemod is a different decision from lifting the line cap for a lockfile, and a
   * blanket exemption is how this becomes the default.
   */
  const partial = effectiveCaps(CAPS, parseCapsOverride(body(`${CAPS_OVERRIDE_MARKER} files=400 reason=codemod`), CAPS))
  T(`${TOOL}: a cap the override does not name stays where it was`, partial.files === 400 && partial.lines === 400, JSON.stringify(partial))
  T(`${TOOL}: no override at all leaves both caps standing`, JSON.stringify(effectiveCaps(CAPS, null)) === JSON.stringify(CAPS))

  const errorOf = (line) => parseCapsOverride(body(line), CAPS).error ?? ""
  T(`${TOOL}: a marker with no reason is refused`, /names no reason=/.test(errorOf(`${CAPS_OVERRIDE_MARKER} files=400`)), errorOf(`${CAPS_OVERRIDE_MARKER} files=400`))
  T(`${TOOL}: an empty reason is refused`, /empty reason=/.test(errorOf(`${CAPS_OVERRIDE_MARKER} files=400 reason=   `)))
  T(`${TOOL}: a marker that lifts nothing is refused`, /lifts no cap/.test(errorOf(`${CAPS_OVERRIDE_MARKER} reason=please just let it through`)))
  T(`${TOOL}: an unknown cap key is refused by name`, /the only caps are files=/.test(errorOf(`${CAPS_OVERRIDE_MARKER} everything=1 reason=why not`)))
  T(
    `${TOOL}: a value that does not beat the standing cap is a typo, not an override`,
    /does not lift the standing caps\.affectedFiles of 8/.test(errorOf(`${CAPS_OVERRIDE_MARKER} files=8 reason=codemod`)),
    errorOf(`${CAPS_OVERRIDE_MARKER} files=8 reason=codemod`),
  )
  T(
    `${TOOL}: two marker lines are refused rather than resolved by picking one`,
    /exactly one is allowed/.test(parseCapsOverride(`${CAPS_OVERRIDE_MARKER} files=400 reason=a\n${CAPS_OVERRIDE_MARKER} lines=6000 reason=b`, CAPS).error ?? ""),
  )
  T(`${TOOL}: the same key twice is refused`, /names files twice/.test(errorOf(`${CAPS_OVERRIDE_MARKER} files=40 files=400 reason=which one`)))

  /** A refused override lifts nothing, so a malformed line can never read as a lifted cap. */
  const refused = parseCapsOverride(body(`${CAPS_OVERRIDE_MARKER} files=8 reason=codemod`), CAPS)
  T(`${TOOL}: a refused override still leaves the standing caps in force`, JSON.stringify(effectiveCaps(CAPS, refused.error ? null : refused)) === JSON.stringify(CAPS))
}
