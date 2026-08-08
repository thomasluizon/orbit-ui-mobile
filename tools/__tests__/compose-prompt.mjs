import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { T, check, orcaEnv, realOrchestratorConfig, root, stage, stageWithConfig } from "./_harness.mjs"

const TOOL = "compose-prompt.mjs"
const REPO_PATH = join(root, "compose-prompt", "repo-ui")

const issuePlan = (identifier, result) => [{ match: `linear issue ${identifier} --comments`, stdout: JSON.stringify(result) }]

const comments = [
  { user: { displayName: "Later reviewer" }, createdAt: "2026-07-28T10:00:00.000Z", body: "Later comment" },
  { user: { displayName: "First reviewer" }, createdAt: "2026-07-27T10:00:00.000Z", body: "First comment with ```ts\nconst answer = 42\n```" },
]

/** A prompt that was never written reads as an empty one, so a composition failure fails its own
 * case rather than crashing the module before the remaining cases run. */
const composed = (path) => (existsSync(path) ? readFileSync(path, "utf8") : "")

export const cases = () => {
  mkdirSync(join(root, "compose-prompt"), { recursive: true })
  const real = realOrchestratorConfig()
  const staged = stageWithConfig("compose-prompt", TOOL, { ...real, repos: { ui: REPO_PATH } })
  const options = (plan) => ({ path: staged.path, env: plan ? orcaEnv(plan) : undefined })
  const out = join(root, "compose-prompt", "orb-125.md")
  check(TOOL, "refuses a malformed issue", ["--issue", "ORB", "--repo", "ui", "--out", out], { status: 2, stderr: /usage: compose-prompt\.mjs/ }, options())
  check(TOOL, "refuses a missing repo key", ["--issue", "ORB-125", "--out", out], { status: 2, stderr: /usage: compose-prompt\.mjs/ }, options())
  check(TOOL, "refuses a relative output path", ["--issue", "ORB-125", "--repo", "ui", "--out", "prompts/orb-125.md"], { status: 2, stderr: /usage: compose-prompt\.mjs/ }, options())
  check(TOOL, "refuses a repo key the config does not declare, naming the ones it does", ["--issue", "ORB-125", "--repo", "ghost", "--out", out], { status: 2, stderr: /unknown repo key "ghost"; declared: ui/ }, options())

  /** A work order written into a repository can be committed by the worker it instructs, and then
   * the reviewer reads instructions authored by the change under review. */
  check(
    TOOL,
    "refuses an output path inside a declared repository",
    ["--issue", "ORB-125", "--repo", "ui", "--out", join(REPO_PATH, "prompt.md")],
    { status: 2, stderr: /is inside the .* repository; write the prompt to the scratchpad instead/ },
    options(),
  )

  const issue = { identifier: "ORB-125", description: "# Ticket body\n\nKeep this verbatim." }
  const written = check(
    TOOL,
    "composes the body and chronological, attributed comments and upcases the identifier",
    ["--issue", "orb-125", "--repo", "ui", "--out", out],
    { status: 0, stdout: /orb-125\.md/ },
    options(issuePlan("ORB-125", { ok: true, result: { issue, comments } })),
  )
  const prompt = composed(out)
  T(
    `${TOOL}: the ticket body survives composition verbatim`,
    prompt.startsWith("# Ticket body\n\nKeep this verbatim."),
    prompt.slice(0, 200) || written.stderr,
  )
  T(
    `${TOOL}: comment order, attribution, and fenced Markdown survive composition`,
    prompt.indexOf("First reviewer - 2026-07-27T10:00:00.000Z") > 0 &&
      prompt.indexOf("First reviewer - 2026-07-27T10:00:00.000Z") < prompt.indexOf("Later reviewer - 2026-07-28T10:00:00.000Z") &&
      prompt.includes("```ts\nconst answer = 42\n```"),
    prompt,
  )
  T(
    `${TOOL}: size is advisory and mandatory generated artifacts stay with their source change`,
    /File and line counts are advisory\s+review information, never delivery gates/.test(prompt) &&
      /migrations with their\s+model change/.test(prompt) &&
      /architecture artifacts\s+with the module or route change/.test(prompt),
    prompt.slice(prompt.indexOf("**Scope.**"), prompt.indexOf("**Scope.**") + 700),
  )
  T(
    `${TOOL}: every prompt bans broad staging and permits named paths`,
    prompt.includes("Never run `git add -A`, `git add --all`, `git add -u`") &&
      /pass every intended path explicitly to `git --literal-pathspecs add`/.test(prompt),
    prompt,
  )
  T(
    `${TOOL}: the brief tells the worker its own exit code is not delivery`,
    /your own exit code counts for nothing[\s\S]*tools\/verify-delivery\.mjs/.test(prompt) && prompt.includes("Never write the fixture that agrees with a"),
    prompt,
  )
  /**
   * The browser ban is in EVERY prompt, and the scoping is the whole point: the first version fired
   * only on visible-effect tickets, ORB-86 received it and made 4 browser-related log entries while
   * ORB-98 did not and made 51. This ticket carries no visible-effect label at all.
   */
  T(
    `${TOOL}: every prompt forbids a dev server, a browser and an e2e file, whatever the labels say`,
    /NEVER open a browser and never start a server/.test(prompt) && /OVERRIDES the ticket's\nown Evidence section/.test(prompt) && /Playwright, Maestro or Cypress/.test(prompt),
    prompt.slice(prompt.indexOf("**NEVER open"), prompt.indexOf("**NEVER open") + 400),
  )
  T(
    `${TOOL}: the ban says who owes the visual check instead of merely refusing`,
    /required OF A HUMAN,\nafter your pull request exists/.test(prompt) && /Only a human grants visual completion \(D7\)/.test(prompt),
    prompt,
  )

  const bare = join(root, "compose-prompt", "orb-126.md")
  check(
    TOOL,
    "omits the comments heading when the issue has none",
    ["--issue", "ORB-126", "--repo", "ui", "--out", bare],
    { status: 0 },
    options(issuePlan("ORB-126", { ok: true, result: { issue: { identifier: "ORB-126", description: "# Body" }, comments: [] } })),
  )
  T(`${TOOL}: zero comments add no empty heading`, composed(bare).length > 0 && !composed(bare).includes("Comments on this issue"), composed(bare))

  check(
    TOOL,
    "a Linear read error is refused rather than composed into a prompt",
    ["--issue", "ORB-127", "--repo", "ui", "--out", join(root, "compose-prompt", "orb-127.md")],
    { status: 2, stderr: /failed to compose ORB-127: issue not found/ },
    options([{ match: "linear issue ORB-127 --comments", stdout: JSON.stringify({ ok: false, error: { code: "not_found", message: "issue not found" } }) }]),
  )
  check(
    TOOL,
    "a response carrying no comments array is refused rather than composed",
    ["--issue", "ORB-128", "--repo", "ui", "--out", join(root, "compose-prompt", "orb-128.md")],
    { status: 2, stderr: /comments were not an array/ },
    options(issuePlan("ORB-128", { ok: true, result: { issue: { identifier: "ORB-128", description: "# Body" } } })),
  )
}
