import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { check, orcaEnv, realOrchestratorConfig, root, stage, stageWithConfig, T } from "./_harness.mjs"

const TOOL = "compose-prompt.mjs"
const REPO_PATH = join(root, "compose-prompt", "repo-ui")
const projectItems = JSON.stringify({ items: [], totalCount: 0 })
const ticket = (overrides = {}) => ({
  blockedBy: { nodes: [], totalCount: 0 },
  blocking: { nodes: [], totalCount: 0 },
  body: "# Ticket body\n\nKeep this verbatim.",
  labels: [{ name: "repo:ui" }],
  number: 221,
  state: "OPEN",
  stateReason: null,
  title: "Ticket title",
  url: "https://github.com/thomasluizon/orbit-tickets/issues/221",
  ...overrides,
})
const ticketPlan = (value = ticket()) => [
  { match: "issue view 221 --repo thomasluizon/orbit-tickets", stdout: JSON.stringify(value) },
  { match: "project item-list 2 --owner thomasluizon", stdout: projectItems },
]
const composed = (path) => (existsSync(path) ? readFileSync(path, "utf8") : "")

export const cases = () => {
  mkdirSync(join(root, "compose-prompt"), { recursive: true })
  const real = realOrchestratorConfig()
  const staged = stageWithConfig("compose-prompt", TOOL, { ...real, repos: { ui: REPO_PATH } })
  stage("staged/compose-prompt/.claude/linear-to-github-map.json", JSON.stringify({ issues: { "ORB-215": { number: 221 } } }))
  const options = (plan) => ({ path: staged.path, env: plan ? orcaEnv(plan) : undefined })
  const out = join(root, "compose-prompt", "orb-215.md")

  check(TOOL, "refuses a missing repo key", ["--issue", "ORB-215", "--out", out], { status: 2, stderr: /usage: compose-prompt\.mjs/ }, options())
  check(TOOL, "refuses a relative output path", ["--issue", "ORB-215", "--repo", "ui", "--out", "prompts/orb-215.md"], { status: 2, stderr: /usage: compose-prompt\.mjs/ }, options())
  check(TOOL, "refuses a repo key the config does not declare", ["--issue", "ORB-215", "--repo", "ghost", "--out", out], { status: 2, stderr: /unknown repo key "ghost"; declared: ui/ }, options())
  check(
    TOOL,
    "refuses an output path inside a declared repository",
    ["--issue", "ORB-215", "--repo", "ui", "--out", join(REPO_PATH, "prompt.md")],
    { status: 2, stderr: /is inside the .* repository/ },
    options(),
  )

  const written = check(
    TOOL,
    "composes the mapped ticket body through the adapter",
    ["--issue", "orb-215", "--repo", "ui", "--out", out],
    { status: 0, stdout: /orb-215\.md/ },
    options(ticketPlan()),
  )
  const prompt = composed(out)
  T(`${TOOL}: the ticket body survives composition verbatim`, prompt.startsWith("# Ticket body\n\nKeep this verbatim."), prompt.slice(0, 200) || written.stderr)
  T(
    `${TOOL}: size is advisory and mandatory generated artifacts stay with their source change`,
    /File and line counts are advisory\s+review information, never delivery gates/.test(prompt) && /migrations with their\s+model change/.test(prompt) && /architecture artifacts\s+with the module or route change/.test(prompt),
    prompt,
  )
  T(
    `${TOOL}: every prompt bans broad staging and permits named paths`,
    prompt.includes("Never run `git add -A`, `git add --all`, `git add -u`") && /pass every intended path explicitly to `git --literal-pathspecs add`/.test(prompt),
    prompt,
  )
  T(
    `${TOOL}: the brief keeps delivery and browser boundaries`,
    /your own exit code counts for nothing[\s\S]*tools\/verify-delivery\.mjs/.test(prompt) && /NEVER open a browser and never start a server/.test(prompt) && /Playwright, Maestro or Cypress/.test(prompt),
    prompt,
  )

  const wrongTarget = join(root, "compose-prompt", "wrong-target.md")
  check(
    TOOL,
    "a wrong repository label is refused before the prompt file is written",
    ["--issue", "ORB-215", "--repo", "ui", "--out", wrongTarget],
    { status: 2, stderr: /expected exactly repo:ui/ },
    options(ticketPlan(ticket({ labels: [{ name: "repo:api" }] }))),
  )
  T(`${TOOL}: repository refusal writes no prompt`, !existsSync(wrongTarget))

  check(
    TOOL,
    "an ORB identifier absent from the map is refused without a raw-number retry",
    ["--issue", "ORB-999999", "--repo", "ui", "--out", join(root, "compose-prompt", "unknown.md")],
    { status: 2, stderr: /Unknown migrated ticket ORB-999999/ },
    options([]),
  )

  check(
    TOOL,
    "a ticket read error is refused rather than composed",
    ["--issue", "ORB-215", "--repo", "ui", "--out", join(root, "compose-prompt", "read-error.md")],
    { status: 2, stderr: /failed to compose ORB-215: gh issue view .* failed: issue not found/ },
    options([
      { match: "issue view 221 --repo thomasluizon/orbit-tickets", stdout: "", stderr: "issue not found", exit: 1 },
      { match: "project item-list 2 --owner thomasluizon", stdout: projectItems },
    ]),
  )
}
