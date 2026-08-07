#!/usr/bin/env node
/**
 * One worker prompt = the Linear ticket verbatim + its comments + an orchestrator's brief + the
 * finishing contract.
 *
 * WHY the brief exists: a raw ticket is input to planning, not a task description. Anthropic's
 * multi-agent research writeup measured vague subagent instructions causing duplicated work, one
 * subagent exploring the 2021 chip crisis while two others independently investigated 2025 supply
 * chains. Each worker needs an objective, an output format, a scope, and explicit task boundaries,
 * so the orchestrator expands the ticket into a bounded brief rather than handing over the ticket.
 */

import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { isAbsolute, resolve } from "node:path"
import { effectiveCaps, parseCapsOverride } from "./lib/caps-override.mjs"
import { readOrchestratorConfig } from "./lib/orchestrator-config.mjs"

const USAGE = `usage: compose-prompt.mjs --issue ORB-N --repo <ui|api|landing> --out <absolute path>

  --issue ORB-N     Linear issue whose body and comments to compose (required)
  --repo <key>      target repository key from .claude/orchestrator.json (required)
  --out <path>      absolute prompt path, OUTSIDE every Orbit repository (required)
  --worktree <path> worktree the worker will run in, named in the brief
  --branch <name>   branch already checked out for the worker
  --base <ref>      base branch the pull request targets (default: main)
  --help, -h        print this usage and exit 0

Prints the output path on stdout.
exit codes: 0 prompt written, 2 usage or Linear read error`

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
if (!issue || !/^ORB-\d+$/i.test(issue) || !repoKey || !out || !isAbsolute(out)) fail(2, USAGE)

const config = readOrchestratorConfig()
const repoPath = config.repos?.[repoKey]
if (!repoPath) fail(2, `unknown repo key "${repoKey}"; declared: ${Object.keys(config.repos ?? {}).join(", ")}`)

/** The prompt must not land inside a repository: a worker that finds its own work order in the
 * tree can commit it, and a reviewer would then read instructions written by the change. */
for (const declared of Object.values(config.repos)) {
  if (resolve(out).toLowerCase().startsWith(resolve(declared).toLowerCase())) {
    fail(2, `--out ${out} is inside the ${declared} repository; write the prompt to the scratchpad instead`)
  }
}

const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"
let result
try {
  const raw = execFileSync(ORCA, ["linear", "issue", issue.toUpperCase(), "--comments", "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  const parsed = JSON.parse(raw)
  if (parsed.ok === false) throw new Error(parsed.error?.message ?? "unknown orca error")
  result = parsed.result
} catch (error) {
  fail(2, `failed to compose ${issue.toUpperCase()}: ${error.stderr?.toString().trim() || error.message}`)
}

const comments = result.comments
if (!Array.isArray(comments)) fail(2, `failed to compose ${issue.toUpperCase()}: comments were not an array`)

const renderedComments = comments
  .slice()
  .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  .map((comment) => `### ${comment.user.displayName} - ${comment.createdAt}\n\n${comment.body}`)

const ticket = renderedComments.length
  ? `${result.issue.description}\n\n---\n\n## Comments on this issue (part of the work order)\n\n${renderedComments.join("\n\n")}`
  : result.issue.description

/**
 * The brief promised the worktree path, the checked-out branch and the base branch, and shipped
 * none of them: a worker learned where it was only from its cwd, and learned the base branch not at
 * all, which is how a stacked ticket opens against main. Absent values are omitted rather than
 * printed as "unknown", because a confident wrong value is worse than a missing one.
 */
const worktreeLine = worktree ? `\nWorking tree \`${worktree}\`.` : ""
const branchLine = branch ? `\nBranch \`${branch}\` is ALREADY checked out for you.` : ""

/**
 * The caps the worker is told are the caps it will be MEASURED against, override included. Without
 * this the brief would tell a ticket carrying a lifted file cap that 8 files are hard, and the
 * worker would correctly STOP on the codemod the override exists to let through.
 */
const standingCaps = { files: config.caps.affectedFiles, lines: config.caps.diffLines }
const parsedOverride = parseCapsOverride(result.issue.description, standingCaps)
const override = parsedOverride.found && !parsedOverride.error ? parsedOverride : null
const caps = effectiveCaps(standingCaps, override)
const overrideLine = override
  ? `\nThis ticket carries a caps override authored by the repository owner: ${override.source}\nThe lifted cap above is the real one. The review still reads every line.`
  : ""

/**
 * WHY this block is in EVERY prompt and not just a visible-effect one, measured 2026-08-06. The
 * ticket is quoted verbatim (D2) and a ticket's Evidence section says screenshots are REQUIRED, so a
 * worker that reads only the ticket obeys the ticket and ignores the orchestrator's step 13. ORB-39
 * committed 221 correct lines, then started a dev server on :3920, wrote a Playwright visual test,
 * sat on /login because a worktree has no seeded session, and was killed at the 45 minute ceiling
 * with a dirty tree. ORB-98 committed 145 lines including the exact Vitest spec its ticket asked
 * for, then opened /login?returnUrl=%2Fpreferences and burned the rest of its budget.
 *
 * The first fix scoped this to visible-effect tickets, and the scoping was the defect: ORB-86
 * received it and made 4 browser-related log entries, ORB-98 did not and made 51. A worker cannot
 * know in advance which tickets tempt it, so the prohibition takes no subset. The hook at
 * .claude/hooks/forbid-worker-browser.mjs enforces the same rule at act time, because a prompt is
 * advisory and decays as context fills.
 */
const browserBan = `

**NEVER open a browser and never start a server. This is unconditional and it OVERRIDES the ticket's
own Evidence section.** No \`npm run dev\`, no \`next dev\`, no \`expo start\`, no emulator, no
Playwright, Maestro or Cypress, nothing under \`e2e/\`, no navigating to localhost on any port, no
logging in to the app. If the ticket says screenshots are required, they are required OF A HUMAN,
after your pull request exists.

Only a human grants visual completion (D7), nothing merges unattended, and a fresh worktree has no
seeded session, so the attempt can only ever fail. Two workers finished their tickets correctly and
then lost the delivery to exactly this. Your pull request is complete without visual evidence.`

const brief = `## Orchestrator's brief

**Objective.** Implement ${issue.toUpperCase()} in the ${repoKey} repository, and nothing else. The
ticket above is the specification. Where it is ambiguous, choose the reading a careful colleague
would and say which you chose in the PR body.

**Where you are.** Repository \`${repoKey}\` at \`${repoPath}\`.${worktreeLine}${branchLine}
Base branch \`${baseBranch}\`: open your pull request against it, and do not create another branch.

**Scope.** Only files this ticket names or provably requires. The caps are hard: ${caps.files}
affected files and ${caps.lines} diff lines. If the real change exceeds either, STOP and
report why. Do not deliver a partial change silently, and do not split it into a second PR yourself.${overrideLine}${browserBan}

**Output.** One commit series on your branch, pushed, with exactly one open pull request that links
${issue.toUpperCase()}. Nothing else counts as delivery, and your own exit code counts for nothing:
delivery is verified from git and GitHub artifacts by tools/verify-delivery.mjs.

**Boundaries.** Never merge, in any shape: no gh pr merge, no PUT /repos/{owner}/{repo}/pulls/N/merge,
no GraphQL mergePullRequest, no --admin. Never push to main. Never force-push. Never --no-verify or
--no-gpg-sign. Do not edit the Linear ticket. Do not touch a second repository: cross-repo work is
two tickets. Do not modify the harness under tools/ or .claude/ unless this ticket says to.

**Never create an end-to-end, visual-regression or Playwright file.** The testing rule in CLAUDE.md
is Vitest unit and behaviour tests, and no new end-to-end suite. A worker on ORB-39 wrote
apps/web/e2e/visual/orb-39-evidence.visual.ts on its own initiative to gather evidence nobody asked
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

Then, in order: run the broader suite, push, and open exactly one pull request. Stop there and
report. You do not merge and you do not wait for review.

**The prose you write is gated too, and nothing used to tell you that.** The pull request TITLE and
BODY pass through the Dash Ban and Copy Register jobs exactly as source files do. So: no em dash and
no en dash anywhere in either, no shouted strings, and none of the cliche register those jobs reject.
A red gate on your own PR description blocks the merge just as hard as a failing test.

**Your pull request must be GREEN before you report.** After pushing, read the checks with
\`gh pr checks <number>\`. A red required check means the work is not delivered, whatever your own
test run said, and \`tools/verify-delivery.mjs\` now returns CI_FAILING for it. If a check is red for
a reason your change caused, fix it and push again. If it is red for an infrastructure reason, say so
explicitly and name the step that failed rather than reporting a clean run.`

writeFileSync(resolve(out), `${ticket.replace(/\s*$/, "")}\n\n---\n\n${brief}\n\n---\n\n${finishing}\n`, "utf8")
console.log(resolve(out))
