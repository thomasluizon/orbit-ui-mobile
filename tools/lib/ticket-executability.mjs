/**
 * Can a headless agent execute this ticket AT ALL?
 *
 * plan-queue.mjs used to defer on graph facts alone (blocked, unstackable, no repo label, closed), so
 * a ticket no agent could ever finish was admitted and failed one at a time during the night.
 * Measured on the Onda 1 queue, 2026-08-06: 71 admitted, 0 deferred, ELEVEN of them not executable,
 * each burning a worker slot or a scope-gate cycle before that became visible.
 *
 * Two rules this file is built around, both learned by running the heuristic by hand:
 *
 * 1. **A keyword match is evidence, not a verdict.** "no agent can execute this" inside an Out of
 *    scope section means the opposite of the same words in Scope, and a naive regex tripped on
 *    ORB-223, which is probably fine. So the scan is section-aware and skips the sections that
 *    describe what the ticket is NOT.
 * 2. **Counting bullets under Affected modules OVER-counts.** That list carries test files and
 *    read-only references; ORB-86 listed two orbit-api files it never touched. A marginal count is
 *    therefore a WARNING on an admitted ticket, never a deferral. Only a count far past the cap,
 *    which no miscounting explains, defers.
 */

const OUT_OF_SCOPE_HEADING = /out of scope|non.?goals?|not in scope/i

/**
 * Markdown sections, by ATX heading or a whole-line bold heading, which both appear in 6.2 bodies.
 * The LEVEL is carried because Out of scope owns its descendants: `## Out of scope` followed by
 * `### Operations` is one excluded region, and a parser that filtered only the parent read the child
 * as an independent in-scope section and deferred an executable ticket on it. A bold heading has no
 * level of its own, so it takes the deepest one and any real heading ends it.
 */
const BOLD_HEADING_LEVEL = 6

const sectionsOf = (description) => {
  const sections = [{ heading: "", level: 0, lines: [] }]
  for (const line of String(description ?? "").split(/\r?\n/)) {
    const atx = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line)
    const bold = atx ? null : /^\s*\*\*(.+?)\*\*:?\s*$/.exec(line)
    if (atx) sections.push({ heading: atx[2].trim(), level: atx[1].length, lines: [] })
    else if (bold) sections.push({ heading: bold[1].trim(), level: BOLD_HEADING_LEVEL, lines: [] })
    else sections[sections.length - 1].lines.push(line)
  }
  return sections
}

/** Every section that is not Out of scope, and not nested UNDER an Out of scope heading. */
const inScopeSections = (sections) => {
  const kept = []
  let excludedAbove = null
  for (const section of sections) {
    if (excludedAbove !== null && section.level <= excludedAbove) excludedAbove = null
    if (excludedAbove !== null) continue
    if (OUT_OF_SCOPE_HEADING.test(section.heading)) {
      excludedAbove = section.level
      continue
    }
    kept.push(section)
  }
  return kept
}

const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/

/**
 * `liftedBy` names WHICH cap answers the finding, never "an override exists". A codemod is a
 * file-count problem and a regenerated lockfile is a line-count problem, so a lines-only override
 * must not admit the codemod and a files-only override must not admit the lockfile. Suppressing both
 * on any override contradicts the contract that an unnamed cap stays standing.
 */
const PHRASES = [
  { reason: "NOT_REPRODUCED", pattern: /NOT REPRODUCED|reproduce on a (?:device|emulator)|unreproduced, evidence below/i },
  { reason: "NOT_CODE_WORK", pattern: /no code in any repo|\bops.only\b|human.only|no agent can execute this/i },
  { reason: "MULTI_PR", pattern: /one PR per|several (?:pull requests|PRs)|multiple (?:pull requests|PRs)|split into \d+ (?:pull requests|PRs)/i },
  { reason: "OVER_CAPS", pattern: /\bcodemod\b/i, liftedBy: "files" },
  /** Both orders, because "regenerate the lockfile" and "the lockfile is regenerated" are one fact. */
  { reason: "OVER_CAPS", pattern: /regenerat\w*[^\n]{0,40}(?:package-)?lock(?:file|\.json)|(?:package-)?lock(?:file|\.json)[^\n]{0,40}regenerat/i, liftedBy: "lines" },
]

/**
 * @param description the Linear issue description, verbatim
 * @param options `{ affectedFilesCap, capsOverride }` where capsOverride is `{files, lines}` or null
 * @returns `{ deferrals: [{reason, detail}], warnings: [string] }`, deferrals in PHRASES order
 */
export const classifyExecutability = (description, { affectedFilesCap, capsOverride = null } = {}) => {
  const scanned = inScopeSections(sectionsOf(description))
  const deferrals = []
  const warnings = []
  const lifted = { files: Number.isInteger(capsOverride?.files), lines: Number.isInteger(capsOverride?.lines) }

  for (const { reason, pattern, liftedBy } of PHRASES) {
    if (liftedBy && lifted[liftedBy]) continue
    for (const section of scanned) {
      const hit = section.lines.find((line) => pattern.test(line))
      if (!hit) continue
      deferrals.push({ reason, detail: `${section.heading || "the body"} says "${hit.trim().slice(0, 120)}", which no headless worker can satisfy in one pull request` })
      break
    }
  }

  /** Obtaining the repro being the FIRST thing in Scope is the same fact stated as work, not prose. */
  const scope = scanned.find((section) => /^scope\b/i.test(section.heading))
  const firstScopeItem = scope?.lines.map((line) => BULLET.exec(line)?.[1]).find(Boolean)
  if (firstScopeItem && /\brepro(?:duce|duction|)\b/i.test(firstScopeItem) && !deferrals.some((entry) => entry.reason === "NOT_REPRODUCED")) {
    deferrals.push({ reason: "NOT_REPRODUCED", detail: `the first Scope item is "${firstScopeItem.trim().slice(0, 120)}", so the ticket starts with work only a device can do` })
  }

  const affected = scanned.find((section) => /affected modules|affected files/i.test(section.heading))
  const listed = affected ? affected.lines.filter((line) => BULLET.test(line)).length : 0
  // A file-count breach is answered by the FILE cap only; a lines override leaves it standing.
  if (Number.isInteger(affectedFilesCap) && listed > affectedFilesCap && !lifted.files) {
    /** Twice the cap is the line no miscounting explains. Between the cap and that, the ticket runs
     * and the count is printed, because ORB-86's list was wrong in exactly that band. */
    if (listed > affectedFilesCap * 2) {
      deferrals.push({ reason: "OVER_CAPS", detail: `Affected modules lists ${listed} entries against a cap of ${affectedFilesCap}, which no over-counting explains` })
    } else {
      warnings.push(`Affected modules lists ${listed} entries against a cap of ${affectedFilesCap}; that list over-counts (it carries tests and read-only references), so this runs and the scope gate decides`)
    }
  }

  return { deferrals, warnings }
}
