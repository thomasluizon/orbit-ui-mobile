#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { assertRepositoryLabel, readComments, readTicket, resolveTicket } from "./lib/github-issues.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"
import { CLOUD_FINISHING_CONTRACT } from "./lib/cloud-worker.mjs"
import { parityExemptTerms } from "./lib/parity-scope.mjs"
import { proofOrder, reviewBrief, reviewOrder, selfReviewSection } from "./lib/review-run.mjs"
import { readPullfrogReviewRules } from "./lib/pullfrog-rules.mjs"
import { repositorySlug } from "./lib/github-auth.mjs"
import { REVIEW_BATCH_ORDER_MARKER } from "./lib/run-state.mjs"
import { sealOrder } from "./lib/run-notes.mjs"

const USAGE = `usage: compose-prompt.mjs --issue <ORB-N|#N|N> --repo <ui|api|landing> --out <absolute path>
       compose-prompt.mjs --review --repo <key> --pr <n> --head <sha> [--since <sha>] [--base <ref>] --out <absolute path>
       compose-prompt.mjs --proof --repo <key> --pr <n> --head <sha> --plan <file> --devices <names> --evidence <directory> --out <absolute path>

  --issue <reference> ticket whose body and comments to compose (required)
  --repo <key>      target repository key from .claude/orchestrator.json (required)
  --out <path>      absolute prompt path, OUTSIDE every Orbit repository (required)
  --worktree <path> worktree the worker will run in, named in the brief
  --branch <name>   branch already checked out for the worker
  --base <ref>      base branch the pull request targets (default: main)
  --layout-guard    allow editing only apps/web/e2e/layout/ among e2e files; never run it (ui only)
  --review-batch    stop a local review fix after a tested commit. The order carries the review batch
                    marker, so launch-worker.mjs requires --fix-round for it
  --cloud          compose the container contract instead of local PR delivery
  --help, -h        print this usage and exit 0

  Read-only orders for node tools/launch-worker.mjs --review or --proof. Neither reads the ticket.
  --review          a pre-push review of pull request --pr at --head. It reads the whole diff against
                    the merge base on every pass. With --since, a fix-round review also reads the
                    commits after the reviewed head, to check each fix. Embeds the review brief of
                    .claude/playbooks/review-and-audit.md rule 14, and the live review rules of
                    Pullfrog for the repository (read from the Pullfrog console with the pinned
                    pullfrog CLI; a failed read exits 2). The result opens with
                    VERDICT: CLEAN (no BLOCKING finding) or VERDICT: DEFECTS (<n>), where n counts
                    BLOCKING findings only. A NOTE and a body line never change it
  --proof           a device proof of pull request --pr at --head. The result opens with
                    PROOF: PASS or PROOF: FAIL (<n> defects)
  --pr <n>          the pull request number
  --head <sha>      the commit under review or proof, 7 to 40 hex characters copied from git
  --since <sha>     the head that the previous review read, for the fix check (--review only)
  --plan <file>     the proof steps and the expected result of each, non-empty (--proof only)
  --devices <names> the comma-separated simulators and AVDs the proof may use (--proof only)
  --evidence <dir>  absolute directory outside every repository for screenshots and logs, created
                    when absent and refused when it holds a file (--proof only)
  Both orders forbid every tracked write, commit, branch, push and GitHub write, and end with a
  final message of at most 12 lines.

Every build and fix order (--issue) carries the same brief and the same live Pullfrog rules, and tells the
worker to review its own whole diff with them before it reports. A failed read of the rules exits 2.

A local order ends with a seal line. tools/launch-worker.mjs refuses an order without it, or one whose text
changed after it, so a fix round's note reaches a worker only as a ticket comment
(node tools/post-run-note.mjs --kind round-note --pullfrog-threads <n>) that this tool reads.

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
const readOnlyModes = ["--review", "--proof"].filter((flag) => process.argv.includes(flag))
if (readOnlyModes.length > 1 || (readOnlyModes.length === 1 && (cloud || layoutGuard || reviewBatch || issue !== null))) {
  fail(2, `${USAGE}\n\n--review and --proof compose an order with no ticket: drop --issue, --cloud, --layout-guard and --review-batch`)
}
const readOnlyMode = readOnlyModes[0]?.slice(2) ?? null
if ((readOnlyMode === null && !issue) || !repoKey || !out || !isAbsolute(out)) fail(2, USAGE)

const config = readOrchestratorConfig()
const repoPath = config.repos?.[repoKey]
if (!repoPath) fail(2, `unknown repo key "${repoKey}"; declared: ${Object.keys(config.repos ?? {}).join(", ")}`)
if (cloud && repoKey !== config.cloud.repositoryKey) fail(2, `--cloud is bound to repository ${config.cloud.repositoryKey}; ${repoKey} must run locally`)
if (layoutGuard && repoKey !== "ui") fail(2, "--layout-guard is available only for the ui repository")

/** The prompt must not land inside a repository: a worker that finds its own work order in the
 * tree can commit it, and a reviewer would then read instructions written by the change. */
const insideDeclaredRepository = (path, flag) => {
  for (const declared of Object.values(config.repos)) {
    if (resolve(path).toLowerCase().startsWith(resolve(declared).toLowerCase())) {
      fail(2, `${flag} ${path} is inside the ${declared} repository; keep it in the scratchpad instead`)
    }
  }
}
insideDeclaredRepository(out, "--out")

const COMMIT = /^[0-9a-f]{7,40}$/
const PLAYBOOK = new URL("../.claude/playbooks/review-and-audit.md", import.meta.url)
/** The review brief of rule 14 and the live review rules of Pullfrog for repository `slug`. A failed read stops the compose. */
const reviewMaterial = (slug) => ({ brief: reviewBrief(readFileSync(PLAYBOOK, "utf8")), rules: readPullfrogReviewRules(slug) })
const readOnlyOrder = () => {
  const pullRequest = argOf("--pr")
  const head = argOf("--head")
  const since = argOf("--since")
  if (!/^[1-9]\d*$/.test(pullRequest ?? "")) fail(2, `--${readOnlyMode} needs --pr <n>, a pull request number`)
  if (!COMMIT.test(head ?? "")) fail(2, `--${readOnlyMode} needs --head <sha>, 7 to 40 lowercase hex characters copied from git`)
  let slug
  try { slug = repositorySlug(repoPath) } catch (error) { fail(2, `could not read the GitHub repository of ${repoPath}: ${error.message}`) }
  if (readOnlyMode === "review") {
    if (since !== null && !COMMIT.test(since)) fail(2, "--since needs the reviewed head, 7 to 40 lowercase hex characters copied from git")
    let material
    try { material = reviewMaterial(slug) } catch (error) { fail(2, `could not read the review brief: ${error.message}`) }
    return reviewOrder({ brief: material.brief, pullfrogRules: material.rules, slug, pullRequest, head, since, baseBranch })
  }
  if (since !== null) fail(2, "--since belongs to --review")
  const planArgument = argOf("--plan")
  const devices = (argOf("--devices") ?? "").split(",").map((name) => name.trim()).filter(Boolean)
  const evidenceArgument = argOf("--evidence")
  let plan = ""
  try { plan = readFileSync(resolve(planArgument ?? ""), "utf8") } catch { fail(2, "--proof needs --plan <file>, the proof steps") }
  if (plan.trim() === "") fail(2, `--plan ${planArgument} is empty`)
  if (devices.length === 0) fail(2, "--proof needs --devices <names>, the simulators and AVDs the proof may use")
  if (!evidenceArgument || !isAbsolute(evidenceArgument)) fail(2, "--proof needs --evidence <directory>, an absolute path")
  insideDeclaredRepository(evidenceArgument, "--evidence")
  mkdirSync(evidenceArgument, { recursive: true })
  if (!statSync(evidenceArgument).isDirectory() || readdirSync(evidenceArgument).length > 0) fail(2, `--evidence ${evidenceArgument} must be a new or empty directory`)
  // The proof boots with this checkout's tool, never with the tool of the head under review.
  return proofOrder({ slug, pullRequest, head, plan, devices, evidenceDirectory: resolve(evidenceArgument), emulatorTool: fileURLToPath(new URL("./android-emulator.mjs", import.meta.url)) })
}
if (readOnlyMode !== null) {
  writeFileSync(resolve(out), sealOrder(readOnlyOrder()), "utf8")
  console.log(resolve(out))
  process.exit(0)
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
 * Every local build and fix order carries the review brief and the live Pullfrog rules, so the worker reviews its own whole
 * diff first. A Cloud order has no GitHub access and its container contract forbids `gh`, so it carries neither.
 */
let selfReview = ""
if (!cloud) {
  try {
    const slug = repositorySlug(repoPath)
    selfReview = selfReviewSection({ ...reviewMaterial(slug), slug, baseBranch, singleCommit: reviewBatch })
  } catch (error) {
    fail(2, `failed to compose ${issue}: could not read the review brief: ${error.message}`)
  }
}

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
const localUiParityDelivery = !cloud && !reviewBatch && repoKey === "ui"
  ? `\n\n**UI parity at pull request creation.** If the change touches only one of \`apps/web\` and
\`apps/mobile\` and qualifies for the exemption, open the pull request with
\`--label parity:exempt\` and a one-line \`## Parity\` section naming the platform adapter or
the enumerated layout-shell divergence. The PR Metadata gate accepts the section only when it holds
one of these exact terms: ${parityExemptTerms.join(", ")}. Write the term itself, for example
"BFF vs direct API adapter". A paraphrase fails the gate. Otherwise make the mirror change.`
  : ""

const vitestEvidence = repoKey === "ui"
  ? ` The focused Vitest tests of your change are required evidence, including any headless Chromium geometry test they launch. That Chromium use is permitted within Vitest.`
  : ""

const browserBan = layoutGuard ? `

**NEVER open the app in a browser and never start a dev or production server. This is unconditional
and it OVERRIDES the ticket's own Evidence section.**${vitestEvidence} No \`npm run dev\`, no \`next dev\`, no \`expo start\`, no emulator, no
Playwright, Maestro or Cypress run, no navigating to localhost on any port, no logging in to the app.
The sole exception to the end-to-end file ban is this: the worker may create or edit files under
\`apps/web/e2e/layout/\` only. Nothing else under \`e2e/\` may be created or edited. Never run the
layout guard or Playwright, including local and focused test runs. The \`Layout shard\` jobs of
\`.github/workflows/test.yml\` on the pull request are the only runner and the only evidence. Do not gather screenshots. A fresh
worktree has no seeded session.` : `

**NEVER open the app in a browser and never start a dev or production server. This is unconditional
and it OVERRIDES the ticket's own Evidence section.**${vitestEvidence} No \`npm run dev\`, no \`next dev\`, no \`expo start\`, no emulator, no
Playwright, Maestro or Cypress, nothing under \`e2e/\`, no layout guard, no navigating to localhost
on any port, no logging in to the app. If the ticket says screenshots are required, do not gather
them in this worker. A fresh worktree has no seeded session.`

/** CI runs every full suite on the pull request, so a worker spends its time on the checks its change can break. */
const focusedVerification = `

**Run only the focused checks of your change; CI runs every full suite.** Judge each check by its exit code:
- Vitest: \`npx vitest related <changed source files> --run\` in each changed workspace. Never start Vitest without a file name.
- Tools: \`node tools/test-tools.mjs --only <case module>\` for each case module that covers a changed tool or reads a changed file (\`grep -rl <file name> tools/__tests__\` finds the readers; repeat \`--only\`; \`--list\` prints the names). Never run the complete tools suite.
- Hooks: \`node .claude/hooks/test-hooks.mjs\` after a change to \`.claude/**\`, a tracked \`*.md\` file, or another file the harness reads or imports (\`grep -n <file name> .claude/hooks/test-hooks.mjs\`). It checks the wiring in \`.claude/settings.json\` and scans every tracked doc.
- The type check and the lint of each changed workspace or project, and the focused tests of a changed project in a repository without Vitest.

CI runs the full web and mobile Vitest suites, the complete tools suite and the layout tests on the pull request. Do not run them. To reproduce a flake, run the affected file again or in parallel instances. Spend at most 25 minutes of wall time on verification after your commit, and report each command with its exit code.`

/**
 * The standing rules of every local worker in an unattended run. They lived in a scratchpad file that each launch
 * script appended; now they are part of every composed order, so no order can miss them (thomasluizon/orbit-tickets#2152).
 */
const unattendedRules = cloud ? "" : `

**Nobody answers an approval prompt.** The owner is away, and a held command stalls the run for hours.
- Never run a command that Claude Code can hold for approval: \`rm\` (delete with Node, \`node -e "require('node:fs').rmSync('<literal absolute path>', { recursive: true, force: true })"\`, only inside your own worktree or temporary directory), \`sudo\`, \`chmod -R\`, \`git push --force\`, or \`git reset --hard\` on a branch you did not create. Never write outside your worktree and the system temporary directory.
- Keep each shell command plain. Never put \`$(\`, a backtick, \`eval\` or a variable in a path, a redirect or a grep pattern. For a longer search or text check, write a \`.mjs\` file in the system temporary directory and run it with \`node\`.
- Never comment on GitHub, resolve a review thread, or close a pull request or an issue unless this order says so in words.
- Copy every GitHub identifier (pull request number, SHA, thread id) from command output of this run, never from memory.
- Commit with a plain conventional message: no attribution line and no co-author line.
- ${reviewBatch ? "Your final report is the batch's handoff: the commit SHA, then the complete `## Test evidence`, `## Assumptions` and `## Manual steps` sections of the finishing contract." : "Your final message is at most 12 lines: the verdict, the commit SHAs, each test command with its pass count, and the pull request URL when you opened one. The pull request body carries the full report."}`

/**
 * The approval hook loads only in a checkout that holds it. A worker in another repository gets the same rule
 * with the hook of this repository as its source, so no brief names a file that its worker cannot find.
 */
const APPROVAL_HOOK = ".claude/hooks/forbid-approval-prompt.mjs"
const toolRepository = dirname(dirname(fileURLToPath(import.meta.url)))
const approvalInstruction = [worktree, repoPath].some((checkout) => checkout && existsSync(join(checkout, APPROVAL_HOOK)))
  ? `Run no command that Claude Code holds for an approval:
\`${APPROVAL_HOOK}\` refuses each one and gives the rewrite. Follow that rewrite.`
  : `Run no command that Claude Code holds for an approval. The ${repoKey} repository does not load the hook that refuses them,
so nothing stops such a command before Claude Code holds it. Before you run \`rm\` or \`rmdir\`, read the rules and each rewrite in
\`${join(toolRepository, ".claude", "hooks", "_lib", "rules-approval.mjs")}\`, the rule source of the hook
\`${join(toolRepository, APPROVAL_HOOK)}\`.`

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
model change, generated Designer or contract output with its source/schema, and required lockfiles
or codemod output in this pull request. Do not split required generated output away to make the diff look smaller, and
do not deliver partial behaviour silently.${browserBan}${focusedVerification}${unattendedRules}${selfReview === "" ? "" : `\n\n${selfReview}`}

**Output.** ${outputInstruction}${localUiParityDelivery}

**Boundaries.** Never merge, in any shape: no gh pr merge, no PUT /repos/{owner}/{repo}/pulls/N/merge,
no GraphQL mergePullRequest, no --admin. Never push to main. Never force-push. Never --no-verify or
--no-gpg-sign. Do not edit the ticket. Public pull request bodies reference a ticket with Tracks, never an
automatic closing keyword: the orchestrator closes tickets. Do not touch a second repository: cross-repo work is
two tickets. Do not modify the harness under tools/ or .claude/ unless this ticket says to.

**Dependencies.** Never edit installed files by hand inside \`node_modules\`, under any path, in any
worktree. Read installed source to confirm an external interface, then change your own code. Never
run \`patch-package\` or an equivalent, and never stage or commit a path under \`node_modules\`.
\`npm ci\` is allowed and expected when an installed package is missing; it installs the tree from
the lockfile. Do not run \`npm install\` or change the lockfile unless the ticket says to.

${cloud ? "" : `**No person answers a prompt.** ${approvalInstruction}
Call no tool that waits for a person to answer, such as \`AskUserQuestion\`: take the best option and record it in
${assumptionDestination}.

`}**Stage only named paths.** Never run \`git add -A\`, \`git add --all\`, \`git add -u\`, \`git add
--update\`, a dot path, a wildcard, or a non-literal magic pathspec. Inspect \`git status --short\`,
then pass every intended path explicitly to \`git --literal-pathspecs add\`. Tracked \`.orca/\` changes
are source and must never be discarded; only untracked \`.orca/\` runtime residue is disposable.

${layoutGuard ? `**The only end-to-end file exception is \`apps/web/e2e/layout/\`.** Playwright files
there may be created or edited, but never run by the worker. Never create a visual-regression file
or another end-to-end or Playwright file. The pull request's \`Layout shard\` jobs in \`.github/workflows/test.yml\` are the
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

You may run \`node tools/arch-map.mjs\` to read the generated map. Never stage or commit \`architecture.json\`, \`architecture.html\` or \`architecture.mmd\`.

For each piece, compile and run the focused tests of the piece, then commit.

Then, in order: push, and open or update exactly one pull request. Stop there
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

const reviewBatchFinishing = `${REVIEW_BATCH_ORDER_MARKER}

## Finishing contract

You may run \`node tools/arch-map.mjs\` to read the generated map. Never stage or commit \`architecture.json\`, \`architecture.html\` or \`architecture.mmd\`.

**Fix every instance of each defect class in one commit.** The round note lists each class and each instance.
Fix every one of them. Give each class one table test, with a row for each instance that a test can see, proven red with its guard removed. An instance that no test can see (a comment, a doc or an unused export) has no guard: make the edit and name it in your report. Do not stop at the
first instance of a class, and do not leave one for the next review: the next review reads the whole diff. When a
class comes from a word list or a regex that guesses at natural-language input in code, replace the guess with a
structured input or delete it. Never add one more pattern. A test assertion that pins doc text is not such code.

**Commit as soon as the code compiles and the focused tests pass.** CI runs the full suites after the push.

Stop after the tested commit. Do not push or open a pull request. Report the commit SHA, then end
your final report with these literal sections, each one present even when it is empty:
\`## Test evidence\`, \`## Assumptions\` and \`## Manual steps\`. In \`## Manual steps\`: every action outside the repository
your change needs before it takes effect (an environment variable, a dashboard or console setting,
a secret, a store listing, a manual migration or backfill),
each naming the exact key, the exact console or screen, and what proves it took effect.
The orchestrator
copies those sections into the pull request body, replies to and resolves every identified thread on
this commit, then pushes once to start review.`

const finishingContract = cloud
  ? CLOUD_FINISHING_CONTRACT
  : reviewBatch ? reviewBatchFinishing : finishing

const order = cloud ? `${brief}\n\n---\n\n${finishingContract}` : `${finishingContract}\n\n---\n\n${brief}`
const composed = `${ticket.replace(/\s*$/, "")}\n\n---\n\n${order}\n`
// A Cloud order goes to tools/submit-cloud-worker.mjs, which appends its own contract; only a local launch checks the seal.
writeFileSync(resolve(out), cloud ? composed : sealOrder(composed), "utf8")
console.log(resolve(out))
