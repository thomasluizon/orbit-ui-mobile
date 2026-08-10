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

export const sectionsOf = (description) => {
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
export const inScopeSections = (sections) => {
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
 * @param description the ticket body, verbatim
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

/**
 * Can this ticket be executed correctly WITHOUT talking to Thomas first?
 *
 * A different question from the one above, and the reason it needs its own answer: everything above
 * asks whether a headless worker can execute the ticket AT ALL. This asks whether it can execute it
 * CORRECTLY by guessing. ORB-30 (#36) is the worked example: 34,709 characters, an acceptance
 * criterion that is a human grant no agent can satisfy, and a body that says Pencil is retired in one
 * section while instructing the worker to build the prototype in Pencil in another. A headless worker
 * produces a confident pull request against the retired tool and a verdict that fails however good
 * the work is.
 *
 * The step 2b question gate is one batch asked before the first worktree, which is right for "should
 * this ticket run at all" and wrong for "design this with me". A design ticket needs a conversation,
 * one topic at a time, before any code is written.
 *
 * This is OUTPUT, not a gate. Attended, it produces questions to ask. Under `--sleep` it produces a
 * NEEDS_CONVERSATION deferral with those questions attached, so Thomas wakes to a decision list
 * instead of a confidently wrong pull request. It never halts a healthy run.
 */
export const CONVERSATION_LABEL_ON = "needs:conversation"
export const CONVERSATION_LABEL_OFF = "needs:no-conversation"

const CONVERSATION_SIGNALS = [
  {
    kind: "HUMAN_GRANT",
    pattern: /human grant|no gate and no agent may substitute|only a human (?:can|may|grants)|Thomas has (?:opened|read|reviewed|seen).{0,40}\bapproved\b/i,
    question: (quote, heading) =>
      `${heading} carries a human grant no agent can satisfy: "${quote}". Split the grant into its own ticket, or accept this one stopping short of it?`,
  },
  {
    kind: "DELEGATED_CHOICE",
    pattern: /\bpick (?:a|an|the|one)\b(?![^.]*\bup\b)|either approach (?:works|is fine|is acceptable)|implementer(?:'s|s')? (?:choice|discretion)|\byour call\b|up to the implementer|whichever you prefer|open (?:acceptance )?(?:question|criterion)|decide (?:which|between|whether)\b/i,
    question: (quote, heading) => `${heading} leaves a choice to the implementer: "${quote}". Which option, and why?`,
  },
  {
    kind: "PRODUCT_CALL",
    pattern: /(?:needs|requires|awaiting|pending|unresolved|open)\s+(?:a\s+)?(?:product|brand|copy|pricing|price|design)\s+(?:call|decision|direction|choice)|Thomas (?:must )?(?:decides|decide|chooses|choose|picks|pick)\b/i,
    question: (quote, heading) => `${heading} needs a call the repository cannot supply: "${quote}". What is the answer?`,
  },
]

/** "<Name> is retired" and friends. The captured name is a candidate, never yet a verdict. */
const RETIRED_TOOL = /\b([A-Z][\w.+-]{1,24})\b\s+(?:is|are|was|were)\s+(?:retired|deprecated|dead|gone|no longer\b)/

/**
 * A sentence-initial pronoun is not a tool. "It is dead debt, not a break" on #234 captured `It`,
 * and a loose instruction match then found `It` somewhere else and reported a contradiction that
 * does not exist. A decision identifier is not a tool either: #78's "D28 is dead" is a superseded
 * decision, and nobody is ever told to build in D28.
 */
const NOT_A_TOOL = /^(?:it|this|that|the|they|there|he|she|we|you|everything|nothing|which|what|both|all|one|each|some|most|none|d\d+)$/i

/**
 * The same name used as the thing to work IN or WITH, which is what makes the retirement a
 * contradiction. Deliberately NARROW. The first version also accepted `design`, `create` and
 * `compose` within 60 characters, which matched ordinary prose about a decision and produced two
 * false contradictions out of three hits on the live board.
 */
const instructionFor = (name) => new RegExp(`\\b(?:use|using|via|build|prototype|export|draw|open|run)\\b[^.]{0,40}\\b${name}\\b|\\bin\\s+(?:the\\s+)?${name}\\b`, "i")

/**
 * Test scenarios describe steps a TEST takes, not a choice anyone is asking for. "Manually pick the
 * grandchild, then deselect childA" (#178) and "Pick one existing callsite of each" (#210) are
 * mechanical instructions, and reading them as delegated choices flagged two ordinary bug tickets.
 */
const TEST_HEADING = /^test (?:scenarios?|cases?|plan)\b/i

const firstMatch = (sections, pattern) => {
  for (const section of sections) {
    const hit = section.lines.find((line) => pattern.test(line))
    if (hit) return { heading: section.heading || "The body", quote: hit.trim().replace(/\s+/g, " ").slice(0, 160) }
  }
  return null
}

/**
 * @param description the ticket body, verbatim
 * @param options.labels the ticket's label names, which override the body in both directions
 * @returns `{ conversationFirst, source, signals: [{kind, heading, quote}], questions: [string] }`
 */
export const classifyConversationFirst = (description, { labels = [] } = {}) => {
  const names = new Set((labels ?? []).map((label) => (typeof label === "string" ? label : label?.name)).filter(Boolean))
  if (names.has(CONVERSATION_LABEL_ON)) {
    return {
      conversationFirst: true,
      source: "label",
      signals: [{ kind: "LABEL", heading: "Labels", quote: CONVERSATION_LABEL_ON }],
      questions: [`${CONVERSATION_LABEL_ON} is set on this ticket. What has to be decided before a worker starts?`],
    }
  }
  if (names.has(CONVERSATION_LABEL_OFF)) {
    return { conversationFirst: false, source: "label", signals: [], questions: [] }
  }

  const scanned = inScopeSections(sectionsOf(description)).filter((section) => !TEST_HEADING.test(section.heading))
  const signals = []
  const questions = []

  for (const { kind, pattern, question } of CONVERSATION_SIGNALS) {
    const hit = firstMatch(scanned, pattern)
    if (!hit) continue
    signals.push({ kind, heading: hit.heading, quote: hit.quote })
    questions.push(question(hit.quote, hit.heading))
  }

  /**
   * The contradiction takes TWO lines to establish, which is the whole point: "D28 is dead" also
   * matches the retirement shape, and nothing anywhere instructs a worker to build in D28, so it is
   * correctly silent. Pencil is named retired in one section and used in another, so it is not.
   */
  for (const section of scanned) {
    const retired = section.lines.map((line) => RETIRED_TOOL.exec(line)).find((match) => match && !NOT_A_TOOL.test(match[1]))
    if (!retired) continue
    const name = retired[1]
    /** A different LINE, so the retirement sentence cannot satisfy its own instruction test. */
    const used = firstMatch(
      scanned.map((other) => ({ ...other, lines: other.lines.filter((line) => line !== retired.input) })),
      instructionFor(name),
    )
    if (!used) continue
    /** Centred on the match, because ORB-30 buries "(Pencil is retired)" 150 characters into its line. */
    const quote = retired.input
      .slice(Math.max(0, retired.index - 40), retired.index + 120)
      .trim()
      .replace(/\s+/g, " ")
    signals.push({ kind: "TOOL_CONTRADICTION", heading: section.heading || "The body", quote })
    questions.push(
      `The body calls ${name} retired ("${quote}") and still instructs using it ("${used.quote}"). Which one is current?`,
    )
    break
  }

  return { conversationFirst: signals.length > 0, source: signals.length > 0 ? "body" : null, signals, questions }
}
