#!/usr/bin/env node
/**
 * One worker prompt = the ticket body verbatim + its comments + an orchestrator's brief + the
 * finishing contract.
 *
 * WHY the comments are here, added 2026-08-13: three places claimed this file already passed them
 * through, and it did not. It read `liveTicket.body` alone. That silently broke the conversation
 * -first path in /orchestrate step 2b, whose whole design is to answer a ticket's open questions in
 * a comment BEFORE composing the prompt. Those answers reached Thomas and the reviewer and never
 * reached the implementer, which is the one reader that had to act on them.
 *
 * WHY the brief exists: a raw ticket is input to planning, not a task description. Anthropic's
 * multi-agent research writeup measured vague subagent instructions causing duplicated work, one
 * subagent exploring the 2021 chip crisis while two others independently investigated 2025 supply
 * chains. Each worker needs an objective, an output format, a scope, and explicit task boundaries,
 * so the orchestrator expands the ticket into a bounded brief rather than handing over the ticket.
 */

import { writeFileSync } from "node:fs"
import { isAbsolute, resolve } from "node:path"
import { assertRepositoryLabel, readComments, readTicket, resolveTicket } from "./lib/github-issues.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { CLOUD_FINISHING_CONTRACT } from "./lib/cloud-worker.mjs"

const USAGE = `usage: compose-prompt.mjs --issue <ORB-N|#N|N> --repo <ui|api|landing> --out <absolute path>

  --issue <reference> ticket whose body and comments to compose (required)
  --repo <key>      target repository key from .claude/orchestrator.json (required)
  --out <path>      absolute prompt path, OUTSIDE every Orbit repository (required)
  --worktree <path> worktree the worker will run in, named in the brief
  --branch <name>   branch already checked out for the worker
  --base <ref>      base branch the pull request targets (default: main)
  --cloud          compose the container contract instead of local PR delivery
  --help, -h        print this usage and exit 0

Prints the output path on stdout.
exit codes: 0 prompt written, 2 usage or ticket read error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

const argOf = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1]
}

const issue = argOf("--issue")
const repoKey = argOf("--repo")
const out = argOf("--out")
const worktree = argOf("--worktree")
const branch = argOf("--branch")
const baseBranch = argOf("--base") ?? "main"
const cloud = process.argv.includes("--cloud")
if (!issue || !repoKey || !out || !isAbsolute(out)) fail(2, USAGE)

const config = readOrchestratorConfig()
const repoPath = config.repos?.[repoKey]
if (!repoPath) fail(2, `unknown repo key "${repoKey}"; declared: ${Object.keys(config.repos ?? {}).join(", ")}`)
if (cloud && repoKey !== config.cloud.repositoryKey) fail(2, `--cloud is bound to repository ${config.cloud.repositoryKey}; ${repoKey} must run locally`)

/** The prompt must not land inside a repository: a worker that finds its own work order in the
 * tree can commit it, and a reviewer would then read instructions written by the change. */
for (const declared of Object.values(config.repos)) {
  if (resolve(out).toLowerCase().startsWith(resolve(declared).toLowerCase())) {
    fail(2, `--out ${out} is inside the ${declared} repository; write the prompt to the scratchpad instead`)
  }
}

let resolvedTicket
let liveTicket
let liveComments
try {
  resolvedTicket = resolveTicket(issue)
  /** Only the body, the comments and the labels reach the worker prompt. */
  liveTicket = await readTicket(resolvedTicket.number, { withProjectItem: false })
  assertRepositoryLabel(liveTicket, repoKey)
  liveComments = await readComments(resolvedTicket.number)
} catch (error) {
  fail(2, `failed to compose ${issue}: ${error.message}`)
}

const ticketReference = resolvedTicket.identifier ?? `#${resolvedTicket.number}`

/**
 * Oldest first, each one attributed and dated, because /orchestrate's rule is that the LATER
 * comment wins over both the body and every earlier comment. A worker cannot apply that rule
 * without the order and cannot weigh a decision without knowing who made it and when.
 */
const commentSection = liveComments.length === 0
  ? ""
  : `\n\n---\n\n## Comments on ${ticketReference}, oldest first\n\nA comment is part of the work order, not commentary on it. Where a comment and the body above disagree, the LATER comment wins.\n\n${liveComments
      .map((comment) => `### ${comment.author} on ${comment.createdAt}\n\n${comment.body.replace(/\s*$/, "")}`)
      .join("\n\n")}`

const ticket = `${liveTicket.body.replace(/\s*$/, "")}${commentSection}`

/**
 * The brief promised the worktree path, the checked-out branch and the base branch, and shipped
 * none of them: a worker learned where it was only from its cwd, and learned the base branch not at
 * all, which is how a stacked ticket opens against main. Absent values are omitted rather than
 * printed as "unknown", because a confident wrong value is worse than a missing one.
 */
const worktreeLine = worktree ? `\nWorking tree \`${worktree}\`.` : ""
const branchLine = branch ? `\nBranch \`${branch}\` is ALREADY checked out for you.` : ""
const locationInstruction = cloud
  ? `Use the current container checkout for repository \`${repoKey}\`. Local materialization paths belong to the orchestrator.`
  : `Repository \`${repoKey}\` at \`${repoPath}\`.${worktreeLine}${branchLine}`
const decisionDelivery = cloud ? "commit" : "commit and push"
const baseInstruction = cloud
  ? `Base branch \`${baseBranch}\`: the orchestrator owns pull request delivery outside the container.`
  : `Base branch \`${baseBranch}\`: open your pull request against it, and do not create another branch.`
const outputInstruction = cloud
  ? `Committed implementation in the container, with the commit and test results in your final report. Include ${ticketReference}, \`## Assumptions\` and \`## Manual steps\` when applicable so the orchestrator can carry them into the pull request. Never push or open a pull request.`
  : `One commit series on your branch, pushed, with exactly one open pull request that links
${ticketReference}. The orchestrator verifies delivery from git and GitHub artifacts with
tools/verify-delivery.mjs; your own exit code counts for nothing. It owns CI waiting after handoff.`

/**
 * WHY this block is in EVERY prompt, measured 2026-08-06. The ticket is quoted verbatim (D2), and a
 * ticket's Evidence section can require screenshots. A worker that reads only the ticket may start
 * a dev server even though its fresh worktree has no seeded session. ORB-39 committed 221 correct
 * lines, then started a dev server on :3920, wrote a Playwright visual test, sat on /login, and was
 * killed at the 45 minute ceiling with a dirty tree. ORB-98 committed 145 lines including the exact
 * Vitest spec its ticket asked for, then opened /login?returnUrl=%2Fpreferences and burned the rest
 * of its budget. A worker cannot know in advance which tickets tempt it, so the prohibition takes
 * no subset. The hook at .claude/hooks/forbid-worker-browser.mjs enforces the same rule at act time,
 * because a prompt is advisory and decays as context fills.
 */
const browserBan = `

**NEVER open a browser and never start a server. This is unconditional and it OVERRIDES the ticket's
own Evidence section.** No \`npm run dev\`, no \`next dev\`, no \`expo start\`, no emulator, no
Playwright, Maestro or Cypress, nothing under \`e2e/\`, no navigating to localhost on any port, no
logging in to the app. If the ticket says screenshots are required, do not gather them in this
worker. A fresh worktree has no seeded session, so the attempt can only fail. Two workers finished
their tickets correctly and then lost the delivery to exactly this.`

/**
 * WHY ambiguity is two-tiered, added 2026-08-13. The previous sentence told the worker to "choose
 * the reading a careful colleague would", which made silent assumptions the instructed behaviour:
 * a headless worker has no human channel, so a decision belonging to Thomas was guessed and the
 * guess surfaced only when the pull request existed. NEEDS_DECISION is the worker's half of the
 * channel; /orchestrate step 7 reads it from the worker log and carries the question to Thomas.
 */
const brief = `## Orchestrator's brief

**Objective.** Implement ${ticketReference} in the ${repoKey} repository, and nothing else. The
ticket above is the specification.

**Ambiguity has two tiers, and only one of them is yours.** A mechanical ambiguity (a file name, an
import shape, where a test lives) you resolve yourself and record in ${cloud ? "your final report" : "the PR body"} under
\`## Assumptions\`, one line per assumption naming the alternative you rejected. A decision that is
Thomas's is NEVER yours to guess: a product, brand, copy, price or design call; a tool or process
the ticket names two contradictory ways; a dependency or capability the ticket presumes that turns
out not to exist. Hitting one of those, stop: ${decisionDelivery} whatever is already safe and
coherent, and make the LAST line of your output exactly
\`NEEDS_DECISION: <one question, with your recommended answer>\`. The orchestrator carries that
question to Thomas. The question costs a minute; a confidently wrong pull request costs the night.

**Where you are.** ${locationInstruction}
${baseInstruction}

**Scope.** Only files this ticket names or provably requires. File and line counts are advisory
review information, never delivery gates. Keep one atomic behaviour complete: migrations with their
model change, generated Designer or contract output with its source/schema, architecture artifacts
with the module or route change that requires regeneration, and required lockfiles or codemod output
in this pull request. Do not split required generated output away to make the diff look smaller, and
do not deliver partial behaviour silently.${browserBan}

**Output.** ${outputInstruction}

**Boundaries.** Never merge, in any shape: no gh pr merge, no PUT /repos/{owner}/{repo}/pulls/N/merge,
no GraphQL mergePullRequest, no --admin. Never push to main. Never force-push. Never --no-verify or
--no-gpg-sign. Do not edit the ticket. Do not touch a second repository: cross-repo work is
two tickets. Do not modify the harness under tools/ or .claude/ unless this ticket says to.

**Stage only named paths.** Never run \`git add -A\`, \`git add --all\`, \`git add -u\`, \`git add
--update\`, a dot path, a wildcard, or a non-literal magic pathspec. Inspect \`git status --short\`,
then pass every intended path explicitly to \`git --literal-pathspecs add\`. Tracked \`.orca/\` changes
are source and must never be discarded; only untracked \`.orca/\` runtime residue is disposable.

**Never create an end-to-end, visual-regression or Playwright file.** The testing rule in CLAUDE.md
is Vitest unit and behaviour tests, and no new end-to-end suite. A worker on ORB-39 wrote
apps/web/e2e/orb-39-evidence.spec.ts on its own initiative to gather evidence nobody asked
it for. If a behaviour genuinely cannot be covered by a Vitest test, say so in the PR body and leave
it uncovered rather than starting a browser.

**Never assume an external interface.** Confirm any field, flag, exit code, or response shape from a
CLI, API, or library you did not write by reading the real response or the installed source. Not
memory, not --help, not what it should obviously be. Never write the fixture that agrees with a
guess. Two measured failures in this repository were a worker inventing a field while the same
commit added a mock that agreed with the guess, so the harness stayed green over a defect.`

const finishing = `## Finishing contract

**Commit as soon as the code compiles and the focused tests pass. Run the broader suite after.**

That order is the contract, not a preference. Measured: one worker spent its entire 45-minute
deadline running and rerunning tests, passed every check, and timed out without ever committing. The
work was lost. Committing first means a timeout can only ever cost you the last verification step,
never the work itself.

Then, in order: run the broader suite, push, and open or update exactly one pull request. Stop there
and report its URL and test results. Do not wait on CI or poll GitHub Actions. The orchestrator owns
CI waiting, review fixes and final readiness verification. You do not merge or wait for review.

**The pull request must NOT be a draft.** Never pass \`--draft\` to \`gh pr create\`, and if your
tooling opened one anyway, run \`gh pr ready <number>\` before you report. Confirm it with
\`gh pr view <number> --json isDraft\`, which must print \`false\`.

Pullfrog reads a draft pull request exactly like any other one, so the review is not the reason. A
draft still stops the run: nobody can merge it, and tools/record-readiness.mjs reports the verdict
DRAFT until somebody marks it ready. Measured 2026-08-08, three of five pull requests opened as
drafts (ORB-7 #464, ORB-214 #57, ORB-188 #465) and each one needed a human to mark it ready.

**The prose you write is gated too, and nothing used to tell you that.** The pull request TITLE and
BODY pass through the Dash Ban and Copy Register jobs exactly as source files do. So: no em dash and
no en dash anywhere in either, no shouted strings, and none of the cliche register those jobs reject.
A red gate on your own PR description blocks the merge just as hard as a failing test.

**Your PR body carries two structured sections when they apply, and omits them when empty.**
\`## Assumptions\`: every reading you chose where the ticket was ambiguous, one line each with the
rejected alternative, so the orchestrator can put them to Thomas instead of discovering them in
review. \`## Manual steps\`: every action outside the repository your change needs before it takes
effect (an environment variable, a dashboard or console setting, a secret, a store listing, a manual
migration or backfill), each naming the exact key, the exact console or screen, and what proves it
took effect. The harness reads both sections mechanically at handover; prose elsewhere in the body
does not reach it.`

writeFileSync(resolve(out), `${ticket.replace(/\s*$/, "")}\n\n---\n\n${brief}\n\n---\n\n${cloud ? CLOUD_FINISHING_CONTRACT : finishing}\n`, "utf8")
console.log(resolve(out))
