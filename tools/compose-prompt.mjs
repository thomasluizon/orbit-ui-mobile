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

const brief = `## Orchestrator's brief

**Objective.** Implement ${issue.toUpperCase()} in the ${repoKey} repository, and nothing else. The
ticket above is the specification. Where it is ambiguous, choose the reading a careful colleague
would and say which you chose in the PR body.

**Where you are.** Repository \`${repoKey}\` at \`${repoPath}\`.${worktreeLine}${branchLine}
Base branch \`${baseBranch}\`: open your pull request against it, and do not create another branch.

**Scope.** Only files this ticket names or provably requires. The caps are hard: ${config.caps.affectedFiles}
affected files and ${config.caps.diffLines} diff lines. If the real change exceeds either, STOP and
report why. Do not deliver a partial change silently, and do not split it into a second PR yourself.

**Output.** One commit series on your branch, pushed, with exactly one open pull request that links
${issue.toUpperCase()}. Nothing else counts as delivery, and your own exit code counts for nothing:
delivery is verified from git and GitHub artifacts by tools/verify-delivery.mjs.

**Boundaries.** Never merge, in any shape: no gh pr merge, no PUT /repos/{owner}/{repo}/pulls/N/merge,
no GraphQL mergePullRequest, no --admin. Never push to main. Never force-push. Never --no-verify or
--no-gpg-sign. Do not edit the Linear ticket. Do not touch a second repository: cross-repo work is
two tickets. Do not modify the harness under tools/ or .claude/ unless this ticket says to.

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
