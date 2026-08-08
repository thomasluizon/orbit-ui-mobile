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
 * 2. **Size is planning information, never executability.** Affected modules lists carry tests,
 *    generated output and read-only references. They are not a correctness boundary, so neither
 *    their count nor a codemod, migration, lockfile or generated artifact can defer a ticket.
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

const PHRASES = [
  { reason: "NOT_REPRODUCED", pattern: /NOT REPRODUCED|reproduce on a (?:device|emulator)|unreproduced, evidence below/i },
  { reason: "NOT_CODE_WORK", pattern: /no code in any repo|\bops.only\b|human.only|no agent can execute this/i },
  { reason: "MULTI_PR", pattern: /one PR per|several (?:pull requests|PRs)|multiple (?:pull requests|PRs)|split into \d+ (?:pull requests|PRs)/i },
]

/**
 * @param description the Linear issue description, verbatim
 * @returns `{ deferrals: [{reason, detail}], warnings: [string] }`, deferrals in PHRASES order
 */
export const classifyExecutability = (description) => {
  const scanned = inScopeSections(sectionsOf(description))
  const deferrals = []
  const warnings = []

  for (const { reason, pattern } of PHRASES) {
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

  return { deferrals, warnings }
}
