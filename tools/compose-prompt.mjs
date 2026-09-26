#!/usr/bin/env node

import { writeFileSync } from "node:fs"
import { isAbsolute, resolve } from "node:path"
import { assertRepositoryLabel, readComments, readTicket, resolveTicket } from "./lib/github-issues.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { CLOUD_FINISHING_CONTRACT } from "./lib/cloud-worker.mjs"
import { UI_SCOPE, composedOrderNeedsUiReview, renderUiReviewSweepContract } from "./lib/review-harness.mjs"

const USAGE = `usage: compose-prompt.mjs --issue <ORB-N|#N|N> --repo <ui|api|landing> --out <absolute path>

  --issue <reference> ticket whose body and comments to compose (required)
  --repo <key>      target repository key from .claude/orchestrator.json (required)
  --out <path>      absolute prompt path, OUTSIDE every Orbit repository (required)
  --worktree <path> worktree the worker will run in, named in the brief
  --branch <name>   branch already checked out for the worker
  --base <ref>      base branch the pull request targets (default: main)
  --layout-guard    allow editing only apps/web/e2e/layout/ among e2e files; never run it (ui only)
  --review-batch    stop a local review fix after a tested commit
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
const layoutGuard = process.argv.includes("--layout-guard")
const reviewBatch = !cloud && process.argv.includes("--review-batch")
if (!issue || !repoKey || !out || !isAbsolute(out)) fail(2, USAGE)

const config = readOrchestratorConfig()
const repoPath = config.repos?.[repoKey]
if (!repoPath) fail(2, `unknown repo key "${repoKey}"; declared: ${Object.keys(config.repos ?? {}).join(", ")}`)
if (cloud && repoKey !== config.cloud.repositoryKey) fail(2, `--cloud is bound to repository ${config.cloud.repositoryKey}; ${repoKey} must run locally`)
if (layoutGuard && repoKey !== "ui") fail(2, "--layout-guard is available only for the ui repository")

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
const decisionDelivery = cloud || reviewBatch ? "commit" : "commit and push"
const baseInstruction = cloud
  ? `Base branch \`${baseBranch}\`: the orchestrator owns pull request delivery outside the container.`
  : reviewBatch
    ? `Base branch \`${baseBranch}\`: the existing pull request targets it. Do not create another branch.`
    : `Base branch \`${baseBranch}\`: open your pull request against it, and do not create another branch.`
const outputInstruction = cloud
  ? `Committed implementation in the container, including \`.claude/cloud-handoff.json\` as specified by the Cloud finishing contract. The orchestrator preserves that artifact in the receipt and reads it before delivery, carrying its assumptions and manual steps into the PR for ${ticketReference}. Also report the commit and tests in your final output. Never push or open a pull request.`
  : reviewBatch
    ? `One tested commit on your branch. Report the commit SHA and test results, then stop. The orchestrator replies to and resolves the review threads before it pushes once to start review. Do not push or open a pull request.`
    : `One commit series on your branch, pushed, with exactly one open pull request that links
${ticketReference}. The orchestrator verifies delivery from git and GitHub artifacts with
tools/verify-delivery.mjs; your own exit code counts for nothing. It owns CI waiting after handoff.`

const uiReviewSweepOwed = composedOrderNeedsUiReview(repoKey, baseBranch)
const reviewSweepContract = renderUiReviewSweepContract()
const uiReviewScope = reviewBatch
  ? `After implementation, inspect only paths changed by this batch's commit. This sweep applies only
when a path changed by this batch's commit matches \`${UI_SCOPE}\`. If no changed path matches, skip this sweep and omit the Review harness block.`
  : `After implementation, inspect the complete diff. This sweep applies only when at least one changed
path matches \`${UI_SCOPE}\`. If no changed path matches, skip this sweep and omit the Review harness block.`
const uiReviewSweep = !cloud && uiReviewSweepOwed
  ? `## UI review sweep

${uiReviewScope}

${reviewSweepContract}`
  : ""

const cloudUiReviewHandoff = cloud && uiReviewSweepOwed
  ? `## UI review sweep ownership

The Cloud container must not run or claim this sweep because it cannot fetch the required sources.
If the locally materialized diff contains a path matching \`${UI_SCOPE}\`, the sweep is still owed.
The orchestrator runs it locally after materialization and before opening the pull request. The exact
local obligation is:

${reviewSweepContract}`
  : ""

const browserBan = layoutGuard ? `

**NEVER open a browser and never start a server. This is unconditional and it OVERRIDES the ticket's
own Evidence section.** No \`npm run dev\`, no \`next dev\`, no \`expo start\`, no emulator, no
Playwright, Maestro or Cypress run, no navigating to localhost on any port, no logging in to the app.
The sole exception to the end-to-end file ban is this: the worker may create or edit files under
\`apps/web/e2e/layout/\` only. Nothing else under \`e2e/\` may be created or edited. Never run the
layout guard or Playwright, including local and focused test runs. \`.github/workflows/layout.yml\`
on the pull request is the only runner and the only evidence. Do not gather screenshots. A fresh
worktree has no seeded session.` : `

**NEVER open a browser and never start a server. This is unconditional and it OVERRIDES the ticket's
own Evidence section.** No \`npm run dev\`, no \`next dev\`, no \`expo start\`, no emulator, no
Playwright, Maestro or Cypress, nothing under \`e2e/\`, no navigating to localhost on any port, no
logging in to the app. If the ticket says screenshots are required, do not gather them in this
worker. A fresh worktree has no seeded session.`

const assumptionDestination = cloud
  ? "the committed handoff's `assumptions` array"
  : reviewBatch ? "your final report's `## Assumptions` section" : "the PR body's `## Assumptions` section"
const testEvidenceDestination = cloud
  ? "Record both observations in the committed handoff's `testResults` for the orchestrator to carry into the PR body's `## Test evidence` section."
  : reviewBatch
    ? "Put both observations in your final report's `## Test evidence` section for the orchestrator to carry into the pull request body."
    : "Put both observations in the PR body's `## Test evidence` section."
const brief = `## Orchestrator's brief

**Objective.** Implement ${ticketReference} in the ${repoKey} repository, and nothing else. The
ticket above is the specification.

**Ambiguity has two tiers, and only one of them is yours.** A mechanical ambiguity (a file name, an
import shape, where a test lives) you resolve yourself and record in ${assumptionDestination},
one line per assumption naming the alternative you rejected. A decision that is
the owner's is NEVER yours to guess: a product, brand, copy, price or design call; a tool or process
the ticket names two contradictory ways; a dependency or capability the ticket presumes that turns
out not to exist. Hitting one of those, stop: ${cloud ? "record the question in the handoff's `needsDecision` field, then " : ""}${decisionDelivery} whatever is already safe and
coherent, and make the LAST line of your output exactly
\`NEEDS_DECISION: <one question, with your recommended answer>\`. The orchestrator carries that
question to the owner. The question costs a minute; a confidently wrong pull request costs the night.

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

**Dependencies.** Never edit installed files by hand inside \`node_modules\`, under any path, in any
worktree. Read installed source to confirm an external interface, then change your own code. Never
run \`patch-package\` or an equivalent, and never stage or commit a path under \`node_modules\`.
\`npm ci\` is allowed and expected when an installed package is missing; it installs the tree from
the lockfile. Do not run \`npm install\` or change the lockfile unless the ticket says to.

**Stage only named paths.** Never run \`git add -A\`, \`git add --all\`, \`git add -u\`, \`git add
--update\`, a dot path, a wildcard, or a non-literal magic pathspec. Inspect \`git status --short\`,
then pass every intended path explicitly to \`git --literal-pathspecs add\`. Tracked \`.orca/\` changes
are source and must never be discarded; only untracked \`.orca/\` runtime residue is disposable.

${layoutGuard ? `**The only end-to-end file exception is \`apps/web/e2e/layout/\`.** Playwright files
there may be created or edited, but never run by the worker. Never create a visual-regression file
or another end-to-end or Playwright file. The pull request's \`.github/workflows/layout.yml\` is the
only evidence for the layout guard.` : `**Never create an end-to-end, visual-regression or Playwright file.** The testing rule in CLAUDE.md
is Vitest unit and behaviour tests, and no new end-to-end suite. If a behaviour genuinely cannot be
covered by a Vitest test, say so in the PR body and leave
it uncovered rather than starting a browser.`}

**Never assume an external interface.** Confirm any field, flag, exit code, or response shape from a
CLI, API, or library you did not write by reading the real response or the installed source. Not
memory, not --help, not what it should obviously be. Never write the fixture that agrees with a
guess. A mock derived from an unverified field can keep the harness green over a defect.

**File findings through the repository adapter.** When this work exposes a finding that belongs in
a separate ticket, file every finding through \`node tools/create-ticket.mjs\`. Never use \`gh issue
create\`: only the repository tool also creates the configured Projects card that later completion
requires.

**Prove the regression test catches the defect.** When a round fixes a defect that an existing test did not catch:
1. Before changing the test or implementation, run that existing test unchanged and report whether it passes with the defect present.
2. Then strengthen the test to exercise the real failing path and run it with the defect still present. Observe it fail for the intended reason before fixing the implementation.
3. After the fix, rerun it and confirm it passes.

Drive the production path: advance replay timers, enter the affected mode, assert accepted destinations as well as rejected ones, mount the owning composition, and derive fixtures from the real producer where applicable.

Both observations must reach the pull request body: unchanged test with the defect present, and strengthened test failing before the fix. Name the test, exact commands, and observed outcomes, including the passing result after the fix. If either observation cannot be obtained, report why; never claim an unobserved result.
${testEvidenceDestination}`

const finishing = `## Finishing contract

**Commit after each coherent piece of work, even if imperfect: a ceiling kill keeps commits and loses an uncommitted index. If unsure, commit the piece and fix it forward. A pushed branch without a pull request is invisible to review; open the pull request and correct its body, which becomes \`main\`'s squash commit message, before reporting success.**

Before committing, if your change alters routes, endpoints, or module structure,
run \`node tools/arch-map.mjs\`. Stage \`architecture.json\` and \`architecture.html\` only if the generator changed them;
include the changed artifacts in the same commit as the source change.

For each piece, compile and run focused tests, then commit before broader verification.

Then, in order: run the broader suite, push, and open or update exactly one pull request. Stop there
and report its URL and test results. Do not wait on CI or poll GitHub Actions. The orchestrator owns
CI waiting, review fixes and final readiness verification. You do not merge or wait for review.

**The pull request must NOT be a draft.** Never pass \`--draft\` to \`gh pr create\`, and if your
tooling opened one anyway, run \`gh pr ready <number>\` before you report. Confirm it with
\`gh pr view <number> --json isDraft\`, which must print \`false\`.

Pullfrog reads a draft pull request exactly like any other one, so the review is not the reason. A
draft still stops the run: nobody can merge it, and tools/record-readiness.mjs reports the verdict
DRAFT until somebody marks it ready.

**The prose you write is gated too, and nothing used to tell you that.** The pull request TITLE and
BODY pass through the Dash Ban and Copy Register jobs exactly as source files do. So: no em dash and
no en dash anywhere in either, no shouted strings, and none of the cliche register those jobs reject.
A red gate on your own PR description blocks the merge just as hard as a failing test.

**Your PR body carries two structured sections when they apply, and omits them when empty.**
\`## Assumptions\`: every reading you chose where the ticket was ambiguous, one line each with the
rejected alternative, so the orchestrator can put them to the owner instead of discovering them in
review. \`## Manual steps\`: every action outside the repository your change needs before it takes
effect (an environment variable, a dashboard or console setting, a secret, a store listing, a manual
migration or backfill), each naming the exact key, the exact console or screen, and what proves it
took effect. The harness reads both sections mechanically at handover; prose elsewhere in the body
does not reach it.`

const reviewBatchFinishing = `## Finishing contract

Before committing, if your change alters routes, endpoints, or module structure,
run \`node tools/arch-map.mjs\`. Stage \`architecture.json\` and \`architecture.html\` only if the generator changed them;
include the changed artifacts in the same commit as the source change.

**Commit as soon as the code compiles and the focused tests pass. Run the broader suite after.**

Stop after the tested commit. Do not push or open a pull request. Report the commit SHA, then end
your final report with these literal sections, each one present even when it is empty:
\`## Test evidence\`, \`## Assumptions\` and \`## Manual steps\`. In \`## Manual steps\`: every action outside the repository
your change needs before it takes effect (an environment variable, a dashboard or console setting,
a secret, a store listing, a manual migration or backfill),
each naming the exact key, the exact console or screen, and what proves it took effect.
Include \`## Review harness\` only when this order carries the UI review sweep and a changed path matches its UI_SCOPE pattern.
When a changed path matches, include the complete \`## Review harness\` block. Otherwise omit it.
The orchestrator
copies those sections into the pull request body, replies to and resolves every identified thread on
this commit, then pushes once to start review.`

const finishingContract = cloud
  ? [cloudUiReviewHandoff, CLOUD_FINISHING_CONTRACT].filter(Boolean).join("\n\n")
  : [reviewBatch ? reviewBatchFinishing : finishing, uiReviewSweep].filter(Boolean).join("\n\n")

const order = cloud ? `${brief}\n\n---\n\n${finishingContract}` : `${finishingContract}\n\n---\n\n${brief}`
writeFileSync(resolve(out), `${ticket.replace(/\s*$/, "")}\n\n---\n\n${order}\n`, "utf8")
console.log(resolve(out))
