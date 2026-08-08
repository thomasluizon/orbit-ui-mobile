import { readFileSync } from "node:fs"

import { T } from "./_harness.mjs"

const { classifyExecutability } = await import("../lib/ticket-executability.mjs")

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
}
