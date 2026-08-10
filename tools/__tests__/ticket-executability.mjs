import { readFileSync } from "node:fs"

import { T } from "./_harness.mjs"

const { classifyConversationFirst, classifyExecutability, CONVERSATION_LABEL_OFF, CONVERSATION_LABEL_ON } = await import("../lib/ticket-executability.mjs")

const TOOL = "lib/ticket-executability.mjs"
const reasons = (description) => classifyExecutability(description).deferrals.map((entry) => entry.reason)
const warnings = (description) => classifyExecutability(description).warnings
const affected = (count) => `## Affected modules / files\n\n${Array.from({ length: count }, (unused, index) => `- apps/web/file-${index}.ts`).join("\n")}`

export const cases = () => {
  const ticketContract = readFileSync(new URL("../../.claude/skills/ticket/SKILL.md", import.meta.url), "utf8")
  const rootContract = readFileSync(new URL("../../CLAUDE.md", import.meta.url), "utf8")
  const plannerContract = readFileSync(new URL("../../.claude/agents/product-manager.md", import.meta.url), "utf8")
  const auditTicketContract = readFileSync(new URL("../../.claude/skills/_shared/audit-to-tickets.md", import.meta.url), "utf8")
  const orchestrateContract = readFileSync(new URL("../../.claude/skills/orchestrate/SKILL.md", import.meta.url), "utf8")
  T(
    `${TOOL}: ticket policy recommends coherent smaller tickets at separable behavior boundaries`,
    /split separable behavior or deployment\s+boundaries/.test(ticketContract),
    "the canonical ticket contract lost its coherent-splitting guidance",
  )
  T(
    `${TOOL}: ticket policy keeps atomic behavior and mandatory generated output together without a numeric gate`,
    /Do not split one atomic behavior merely to satisfy a numeric threshold/.test(ticketContract) &&
      /Never split those artifacts\s+away from the change that requires them/.test(ticketContract) &&
      !/CAPS-OVERRIDE/.test(ticketContract),
    "the canonical ticket contract permits a numeric or generated-artifact split",
  )
  T(
    `${TOOL}: every always-loaded ticket planner treats counts as advisory`,
    [rootContract, plannerContract, auditTicketContract].every((contract) => !/(?:under|target under)\s+~?400\s+lines/i.test(contract)) &&
      [rootContract, plannerContract, auditTicketContract].every((contract) => /(?:advisory|planning signals)/i.test(contract)),
    "an always-loaded planner still imposes a numeric PR-size policy",
  )
  T(
    `${TOOL}: a failed worker remains owned by the bounded readiness loop`,
    /failed worker attempt is recorded, but its ticket is not silently skipped/.test(orchestrateContract) &&
      /keep the PR in\s+the bounded readiness loop/.test(orchestrateContract) &&
      !/A failed ticket is recorded and skipped/.test(orchestrateContract),
    "the queue contract can still abandon final-head readiness debt",
  )
  T(`${TOOL}: an ordinary ticket defers on nothing and warns about nothing`, reasons("## Scope\n\n- Fix the store\n\n## Acceptance\n\n- It works").length === 0 && warnings("## Scope\n\n- Fix the store").length === 0)

  T(`${TOOL}: a body that says NOT REPRODUCED defers`, reasons("## Problem\n\nNOT REPRODUCED on any device yet.")[0] === "NOT_REPRODUCED")
  T(`${TOOL}: a body that asks for a device repro first defers`, reasons("## Technical details\n\nReproduce on a device or emulator first.")[0] === "NOT_REPRODUCED")
  T(
    `${TOOL}: obtaining the repro as the FIRST scope item defers, even with no keyword in prose`,
    reasons("## Scope\n\n- Reproduce the crash on a Pixel 7\n- Then fix it")[0] === "NOT_REPRODUCED",
    JSON.stringify(classifyExecutability("## Scope\n\n- Reproduce the crash on a Pixel 7\n- Then fix it")),
  )
  T(`${TOOL}: a later scope item mentioning a repro does not defer`, reasons("## Scope\n\n- Change the query\n- Add a repro test").length === 0)

  T(`${TOOL}: HUMAN-ONLY defers as NOT_CODE_WORK`, reasons("## Scope\n\nHUMAN-ONLY: Thomas clicks the branch protection toggle.")[0] === "NOT_CODE_WORK")
  T(`${TOOL}: no code in any repo defers as NOT_CODE_WORK`, reasons("## Scope\n\nThere is no code in any repo for this; it is a Stripe dashboard change.")[0] === "NOT_CODE_WORK")
  T(`${TOOL}: one PR per group defers as MULTI_PR`, reasons("## Scope\n\nShip one PR per group of surfaces.")[0] === "MULTI_PR")
  T(`${TOOL}: a codemod is admitted without an override`, reasons("## Technical details\n\nA codemod rewrites every icon import.").length === 0)
  T(`${TOOL}: a regenerated lockfile is admitted without an override`, reasons("## Scope\n\nThe package-lock.json is regenerated from scratch.").length === 0)
  T(`${TOOL}: an EF migration and generated Designer output stay executable together`, reasons("## Scope\n\n- Add the EF migration\n- Commit its generated Designer.cs output with the model change").length === 0)

  /**
   * A keyword match is EVIDENCE, not a verdict. "no agent can execute this" under Out of scope says
   * the opposite of the same words under Scope, and a naive regex tripped on ORB-223, which is fine.
   */
  T(
    `${TOOL}: the same phrase under Out of scope is not a deferral`,
    reasons("## Scope\n\n- Add the endpoint\n\n## Out of scope\n\n- The dashboard toggle, which is HUMAN-ONLY and no agent can execute this").length === 0,
    JSON.stringify(classifyExecutability("## Scope\n\n- Add the endpoint\n\n## Out of scope\n\n- HUMAN-ONLY, no agent can execute this")),
  )
  T(`${TOOL}: a bold heading delimits a section just as an ATX heading does`, reasons("**Scope**\n\n- Add the endpoint\n\n**Out of scope**\n\n- Ops-only dashboard work").length === 0)

  T(`${TOOL}: a 30-file affected-modules list is advisory and never defers`, reasons(affected(30)).length === 0 && warnings(affected(30)).length === 0)
  T(`${TOOL}: absence of any override marker never causes rejection`, reasons(`${affected(30)}\n\n## Scope\n\n- Implement one atomic behavior`).length === 0)

  /**
   * Out of scope owns its DESCENDANTS. `## Out of scope` then `### Operations` is one excluded
   * region; filtering only the parent read the child as in-scope and deferred an executable ticket.
   */
  const nested = "## Scope\n\n- Add the endpoint\n\n## Out of scope\n\n### Operations\n\nHUMAN-ONLY: Thomas flips the toggle.\n"
  T(`${TOOL}: a heading nested under Out of scope is excluded with its parent`, reasons(nested).length === 0, JSON.stringify(classifyExecutability(nested)))
  const resumed = `${nested}\n## Technical details\n\nNo code in any repo.\n`
  T(`${TOOL}: a sibling heading after the excluded region is scanned again`, reasons(resumed)[0] === "NOT_CODE_WORK", JSON.stringify(classifyExecutability(resumed)))

  T(
    `${TOOL}: a deferral quotes the line it fired on, so the evidence travels with the verdict`,
    /says "NOT REPRODUCED on a Pixel 7"/.test(classifyExecutability("## Problem\n\nNOT REPRODUCED on a Pixel 7").deferrals[0]?.detail ?? ""),
    JSON.stringify(classifyExecutability("## Problem\n\nNOT REPRODUCED on a Pixel 7")),
  )

  /**
   * Conversation-first. A DIFFERENT question from everything above: those ask whether a headless
   * worker can execute the ticket at all, this asks whether it can execute it CORRECTLY by guessing.
   * ORB-30 (#36) is the worked case and every fixture below is its real shape.
   */
  const conversation = (description, labels = []) => classifyConversationFirst(description, { labels })
  const kinds = (description, labels = []) => conversation(description, labels).signals.map((signal) => signal.kind)

  T(`${TOOL}: an ordinary code ticket is not conversation-first`, conversation("## Scope\n\n- Inject the recorder\n- Add one migration\n\n## Acceptance criteria\n\n- A chat round writes a row").conversationFirst === false)
  T(
    `${TOOL}: an acceptance criterion carrying a human grant is conversation-first`,
    kinds("## Acceptance criteria\n\n* Thomas has opened the page and approved the direction. This is a human grant (D13); no gate and no agent may substitute for it.").includes("HUMAN_GRANT"),
  )
  T(
    `${TOOL}: a choice left to the implementer is conversation-first`,
    kinds("## Scope\n\n* Decide the stacked-CTA width-matching convention (open question from 2026-07-19).").includes("DELEGATED_CHOICE"),
  )
  T(
    `${TOOL}: a call the repository cannot supply is conversation-first`,
    kinds("## Technical details\n\nThis needs a brand decision before any copy is written.").includes("PRODUCT_CALL"),
  )

  /**
   * The contradiction takes TWO lines to establish, and that is the point. "D28 is dead" matches the
   * retirement shape too, and nothing instructs a worker to build in D28, so it stays silent.
   */
  const pencil = "## Scope\n\n* Then build the prototype in Pencil (`pencil.dev`, via the `pencil` MCP server).\n\n## Technical details\n\n* Claude Design is the prototyping path with `design/reference.html` (Pencil is retired).\n"
  T(`${TOOL}: a tool named retired while still being instructed is a contradiction`, kinds(pencil).includes("TOOL_CONTRADICTION"), JSON.stringify(conversation(pencil)))
  T(
    `${TOOL}: a retired thing nobody is told to use is not a contradiction`,
    !kinds("## Rescope\n\n**The design direction changed. D28 is dead.**\n\n## Scope\n\n- Rewrite the token table\n").includes("TOOL_CONTRADICTION"),
  )

  T(
    `${TOOL}: every signal produces exactly one question, so nothing fires silently`,
    conversation(pencil).questions.length === conversation(pencil).signals.length && conversation(pencil).questions.every((question) => question.length > 0),
  )
  T(`${TOOL}: a question carries the evidence line it fired on`, /Pencil is retired/.test(conversation(pencil).questions.join(" ")), JSON.stringify(conversation(pencil).questions))

  /** Thomas overrides the heuristic in both directions, and the label always wins over the body. */
  T(`${TOOL}: the label forces conversation-first onto an ordinary ticket`, conversation("## Scope\n\n- Fix the selector", [CONVERSATION_LABEL_ON]).conversationFirst === true)
  T(`${TOOL}: the label reports itself as the source, not the body`, conversation("## Scope\n\n- Fix the selector", [CONVERSATION_LABEL_ON]).source === "label")
  T(`${TOOL}: the off label forces it off even when the body trips every signal`, conversation(pencil, [CONVERSATION_LABEL_OFF]).conversationFirst === false)
  T(`${TOOL}: labels are accepted as GitHub objects as well as bare names`, conversation("## Scope\n\n- Fix it", [{ name: CONVERSATION_LABEL_ON }]).conversationFirst === true)

  /** Out of scope is excluded here for the same reason it is excluded above. */
  T(
    `${TOOL}: a human grant under Out of scope is not conversation-first`,
    conversation("## Scope\n\n- Add the endpoint\n\n## Out of scope\n\n- The visual approval, which is a human grant no agent may substitute for").conversationFirst === false,
  )

  /** The queue contract has to name the reason, or the deferral arrives at 03:00 with no meaning. */
  T(
    `${TOOL}: the orchestrate contract documents NEEDS_CONVERSATION as a sleep-only deferral`,
    /NEEDS_CONVERSATION/.test(orchestrateContract) && /--sleep.{0,20}only/i.test(orchestrateContract),
    "the queue contract lost the conversation-first deferral row",
  )
  T(
    `${TOOL}: the orchestrate contract writes the conversation decisions back to the ticket`,
    /comment-ticket\.mjs/.test(orchestrateContract) && /one topic at a time/i.test(orchestrateContract),
    "the conversation-first protocol lost its durable output or its one-topic rule",
  )
}
