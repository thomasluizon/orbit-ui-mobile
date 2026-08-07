import { T } from "./_harness.mjs"

const { classifyExecutability } = await import("../lib/ticket-executability.mjs")

const TOOL = "lib/ticket-executability.mjs"
const OPTIONS = { affectedFilesCap: 8 }

const reasons = (description, options = OPTIONS) => classifyExecutability(description, options).deferrals.map((entry) => entry.reason)
const warnings = (description, options = OPTIONS) => classifyExecutability(description, options).warnings
const affected = (count) => `## Affected modules / files\n\n${Array.from({ length: count }, (unused, index) => `- apps/web/file-${index}.ts`).join("\n")}`

export const cases = () => {
  T(`${TOOL}: an ordinary ticket defers on nothing and warns about nothing`, reasons("## Scope\n\n- Fix the store\n\n## Acceptance\n\n- It works").length === 0 && warnings("## Scope\n\n- Fix the store").length === 0)

  T(`${TOOL}: a body that says NOT REPRODUCED defers`, reasons("## Problem\n\nNOT REPRODUCED on any device yet.")[0] === "NOT_REPRODUCED")
  T(`${TOOL}: a body that asks for a device repro first defers`, reasons("## Technical details\n\nReproduce on a device or emulator first.")[0] === "NOT_REPRODUCED")
  T(
    `${TOOL}: obtaining the repro as the FIRST scope item defers, even with no keyword in prose`,
    reasons("## Scope\n\n- Reproduce the crash on a Pixel 7\n- Then fix it")[0] === "NOT_REPRODUCED",
    JSON.stringify(classifyExecutability("## Scope\n\n- Reproduce the crash on a Pixel 7\n- Then fix it", OPTIONS)),
  )
  T(`${TOOL}: a later scope item mentioning a repro does not defer`, reasons("## Scope\n\n- Change the query\n- Add a repro test").length === 0)

  T(`${TOOL}: HUMAN-ONLY defers as NOT_CODE_WORK`, reasons("## Scope\n\nHUMAN-ONLY: Thomas clicks the branch protection toggle.")[0] === "NOT_CODE_WORK")
  T(`${TOOL}: no code in any repo defers as NOT_CODE_WORK`, reasons("## Scope\n\nThere is no code in any repo for this; it is a Stripe dashboard change.")[0] === "NOT_CODE_WORK")
  T(`${TOOL}: one PR per group defers as MULTI_PR`, reasons("## Scope\n\nShip one PR per group of surfaces.")[0] === "MULTI_PR")
  T(`${TOOL}: a codemod defers as OVER_CAPS`, reasons("## Technical details\n\nA codemod rewrites every icon import.")[0] === "OVER_CAPS")
  T(`${TOOL}: a regenerated lockfile defers as OVER_CAPS`, reasons("## Scope\n\nThe package-lock.json is regenerated from scratch.")[0] === "OVER_CAPS")

  /**
   * A keyword match is EVIDENCE, not a verdict. "no agent can execute this" under Out of scope says
   * the opposite of the same words under Scope, and a naive regex tripped on ORB-223, which is fine.
   */
  T(
    `${TOOL}: the same phrase under Out of scope is not a deferral`,
    reasons("## Scope\n\n- Add the endpoint\n\n## Out of scope\n\n- The dashboard toggle, which is HUMAN-ONLY and no agent can execute this").length === 0,
    JSON.stringify(classifyExecutability("## Scope\n\n- Add the endpoint\n\n## Out of scope\n\n- HUMAN-ONLY, no agent can execute this", OPTIONS)),
  )
  T(`${TOOL}: a bold heading delimits a section just as an ATX heading does`, reasons("**Scope**\n\n- Add the endpoint\n\n**Out of scope**\n\n- Ops-only dashboard work").length === 0)

  /**
   * Counting bullets under Affected modules OVER-counts: the list carries tests and read-only
   * references, and ORB-86 named two orbit-api files it never touched. A marginal count therefore
   * runs and warns; only a count no over-counting explains defers.
   */
  T(`${TOOL}: a marginal affected-modules count warns and still admits`, reasons(affected(12)).length === 0 && /12 entries against a cap of 8/.test(warnings(affected(12))[0] ?? ""), JSON.stringify(classifyExecutability(affected(12), OPTIONS)))
  T(`${TOOL}: a count at the cap says nothing at all`, reasons(affected(8)).length === 0 && warnings(affected(8)).length === 0)
  T(`${TOOL}: a count no over-counting explains defers as OVER_CAPS`, reasons(affected(30))[0] === "OVER_CAPS", JSON.stringify(classifyExecutability(affected(30), OPTIONS)))

  /**
   * An override answers the cap it NAMES and no other. A codemod is a file-count problem and a
   * regenerated lockfile is a line-count problem, so lifting one must not admit the other: the
   * contract is that an unnamed cap stays standing, and a boolean "an override exists" broke it.
   */
  const filesLifted = { ...OPTIONS, capsOverride: { files: 400, lines: null } }
  const linesLifted = { ...OPTIONS, capsOverride: { files: null, lines: 6000 } }
  const codemod = "## Technical details\n\nA codemod rewrites every icon import."
  const lockfile = "## Scope\n\nThe package-lock.json is regenerated from scratch."
  T(`${TOOL}: a files override admits the codemod`, reasons(codemod, filesLifted).length === 0)
  T(`${TOOL}: a LINES override does not admit the codemod`, reasons(codemod, linesLifted)[0] === "OVER_CAPS", JSON.stringify(classifyExecutability(codemod, linesLifted)))
  T(`${TOOL}: a lines override admits the regenerated lockfile`, reasons(lockfile, linesLifted).length === 0)
  T(`${TOOL}: a FILES override does not admit the regenerated lockfile`, reasons(lockfile, filesLifted)[0] === "OVER_CAPS", JSON.stringify(classifyExecutability(lockfile, filesLifted)))
  T(`${TOOL}: a files override admits an over-cap Affected modules list`, reasons(affected(30), filesLifted).length === 0)
  T(`${TOOL}: a lines override leaves the file-count breach standing`, reasons(affected(30), linesLifted)[0] === "OVER_CAPS", JSON.stringify(classifyExecutability(affected(30), linesLifted)))
  T(`${TOOL}: a caps override does not suppress NOT_CODE_WORK`, reasons("## Scope\n\nOps-only, no code in any repo.", filesLifted)[0] === "NOT_CODE_WORK")

  /**
   * Out of scope owns its DESCENDANTS. `## Out of scope` then `### Operations` is one excluded
   * region; filtering only the parent read the child as in-scope and deferred an executable ticket.
   */
  const nested = "## Scope\n\n- Add the endpoint\n\n## Out of scope\n\n### Operations\n\nHUMAN-ONLY: Thomas flips the toggle.\n"
  T(`${TOOL}: a heading nested under Out of scope is excluded with its parent`, reasons(nested).length === 0, JSON.stringify(classifyExecutability(nested, OPTIONS)))
  const resumed = `${nested}\n## Technical details\n\nA codemod rewrites every icon import.\n`
  T(`${TOOL}: a sibling heading after the excluded region is scanned again`, reasons(resumed)[0] === "OVER_CAPS", JSON.stringify(classifyExecutability(resumed, OPTIONS)))

  T(
    `${TOOL}: a deferral quotes the line it fired on, so the evidence travels with the verdict`,
    /says "NOT REPRODUCED on a Pixel 7"/.test(classifyExecutability("## Problem\n\nNOT REPRODUCED on a Pixel 7", OPTIONS).deferrals[0]?.detail ?? ""),
    JSON.stringify(classifyExecutability("## Problem\n\nNOT REPRODUCED on a Pixel 7", OPTIONS)),
  )
}
