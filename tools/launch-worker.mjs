#!/usr/bin/env node
/**
 * Launch one ticket's Orca worktree + TUI worker end to end, and be the single
 * place the four launch gotchas measured on 2026-07-24 (the ORB-75 Phase 7 run)
 * are handled: `orca worktree create` exits 1 without --name, a fresh checkout
 * blocks forever on the worker CLI's workspace-trust prompt, Orca's
 * <gituser>/<name> branch is not the worker contract's feature/fix branch, and a
 * multi-line prompt pushed through `terminal send --text` submits early and
 * arrives mangled. A fifth, measured on the 2026-07-27 ORB-88 run, is the reason
 * this script now READS THE POINTER BACK off the TUI before exiting 0: orca
 * accepted the send, the cold composer swallowed it, and the launcher reported a
 * running worker that was in fact idle with no work at all. Engine, model routing
 * and repo paths come from
 * .claude/orchestrator.json; what each engine CLI spells differently (its headless
 * shape, its trust screen and the keystroke that answers it) lives in
 * ENGINE_PROFILES below. This script launches a worker; it never merges,
 * reviews, or moves a Linear issue.
 */

import { execFileSync, spawn, spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  appendFileSync,
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { readOrchestratorConfig, resolveWorkerInvocation } from "./lib/orchestrator-config.mjs"
const pause = (milliseconds) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)

const USAGE = `usage: launch-worker.mjs --issue ORB-N --prompt-file <path> [options]

  --issue ORB-N          Linear issue whose worker to launch (required)
  --prompt-file <path>   the composed worker prompt: ticket body verbatim (D2) then the
                         finishing contract. MUST live outside every Orbit repo and outside
                         the worktree (an in-worktree prompt gets committed). Only its path
                         is sent to the TUI, never its text. The standing worker contract
                         (never ask a question, never watch your own PR, stage explicitly,
                         never merge) is APPENDED to this file at launch, so it does not
                         depend on the caller having remembered it (required)
  --repo ui|api|landing  override the repo the ticket's repo:* label names
  --base-branch <ref>    base branch for the worktree (default: main)
  --branch-prefix <p>    contract branch prefix, feature or fix (default: feature)
  --max-parallel-worktrees <n>
                         override the configured concurrency cap for this invocation
  --comment "<text>"     worktree card comment (default: "<ORB-N> launched: worker running")
  --workspace-status <s> Orca board status id (default: in-progress)
  --existing-worktree <path> launch an additional headless worker in this existing Orca worktree
  --dry-run              resolve everything and print the plan; run no mutating orca or git command
  --help, -h             print this usage and exit 0

Prints one JSON object on stdout: issue, repo, repoPath, worktreePath, worktreeSelector,
branch, baseBranch, terminal, engine, command, promptFile, workerContract, trustPromptAnswered,
waitAttempts, pointerSends.
Progress goes to stderr, so stdout stays pipeable.

exit 0 means the worker ACCEPTED the prompt as a user turn, verified by reading the pointer back
off the TUI, never merely that orca accepted the send.

exit codes: 0 worker launched and holding the work order, 1 the worker never reached tui-idle or
            never took the prompt pointer as a turn, or the concurrency cap was reached,
            2 usage or config error,
            3 an orca, git, quota reader or budget command failed,
            4 the proposed invocation would cross the engine token budget

Any non-zero exit after the worktree exists stops its terminals and removes that worktree and
the branches this run created, so a relaunch starts clean instead of piling up orb-N-slug-2.
If orca still refuses to remove it (a wedged setup PTY), the exact removal command is printed
on stderr; run it before relaunching.`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const ORCA = process.env.ORCA_BIN || "C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca"

/** How long one tui-idle wait may block, and how many waits a launch gets before it fails. */
const WAIT_TIMEOUT_MS = 60000
const MAX_WAIT_ATTEMPTS = 6
// Conservative: two observations establish that 178 fails and 42 succeeds, not the boundary.
const MAX_INTERACTIVE_PROMPT_PATH_LENGTH = 120

/**
 * What each worker CLI does that this script has to know, keyed by the binary it runs.
 * All four facts are properties of the CLI, not of the harness, so a shared list cannot
 * hold them: codex's `-p` is `--profile`, a legitimate interactive flag, while claude's
 * `-p` is `--print`, the headless mode this guard exists for. One flat token list
 * rejected every valid `codex --profile` invocation as headless.
 *
 * `trustOnScreen` matches the tail with ALL whitespace removed, because `orca terminal
 * read` flattens a TUI repaint and swallows spacing unevenly ("Doyoutrustthecontents...").
 * `trustAnswer` is the keystroke that answers that gate, and it differs per CLI for the
 * reason each CLI prints on the screen itself: Claude Code takes the digit, codex paints
 * a preselected list saying "Press enter to continue" and takes Enter alone. Both
 * measured; sending codex the digit left its process exited (-1).
 */
const ENGINE_PROFILES = {
  claude: {
    headlessTokens: ["-p", "--print"],
    runPermissionTokens: ["--permission-mode", "bypassPermissions"],
    permissionModeToken: "--permission-mode",
    trustOnScreen: /isthisaprojectyoucreatedoroneyoutrust|doyoutrustthefiles|trustthisfolder/,
    trustAnswer: "1",
  },
  codex: {
    headlessTokens: ["exec", "e"],
    runPermissionTokens: ["--dangerously-bypass-approvals-and-sandbox"],
    trustOnScreen: /doyoutrustthecontentsofthisdirectory/,
    trustAnswer: "",
  },
}

/** Orca's own signal is not reliably one string: a genuine codex trust gate normally reports
 * `codex-interactive-prompt`, but Orca 1.4.156 retained `codex-trust-workspace` on an idle codex
 * terminal that never saw a trust gate. Only the screen text is precise, so this stays a
 * corroborating signal and never the sole trigger for a keystroke.
 * WHY: PR #629 owner adjudication makes the live capture authoritative over the older reason mapping. https://github.com/thomasluizon/orbit-ui-mobile/pull/629 */
const TRUST_BLOCKED_REASON = /trust/i
const flatten = (text) => text.replace(/\s+/g, "").toLowerCase()

// Orca WORKTREES remain required for isolation, concurrency accounting, and cleanup. Only
// Orca TERMINALS are optional now that headless workers are ordinary child processes.

/**
 * How many times the pointer may be sent before the launch is a failure, and how long the TUI
 * gets to paint the sent text before it is read back. Measured on the 2026-07-27 ORB-88 launch:
 * `terminal send` was accepted by orca, the launcher printed a full plan and exited 0, and the
 * pointer never became a user turn at all. The TUI sat at an empty composer with its
 * `Try "how do I log an error?"` placeholder still painted, alive and idle with no work, and
 * nobody at the keyboard to notice. `waitAttempts: 1` was the clue: the launch reached
 * tui-idle on its first wait, which on a cold TUI means the composer had not finished mounting,
 * and then sent into it. So an exit code may never again assert delivery it did not verify.
 */
const MAX_POINTER_SENDS = 3
const POINTER_PAINT_MS = 4000
const MAX_TERMINAL_CREATE_ATTEMPTS = 3
const TERMINAL_CREATE_BACKOFF_MS = 1000
/** How many settle windows a painting TUI gets before the launch gives up. A TUI that is still
 * repainting after all of them is never re-sent to: there is no safe moment, and a queued send
 * would cut its running turn short. */
const MAX_POINTER_SETTLES = 3
const SETTLE_MS = 1000
const terminalIsRepainting = (terminal) => {
  const first = orca(["terminal", "show", "--terminal", terminal]).terminal?.lastOutputAt
  pause(SETTLE_MS)
  const second = orca(["terminal", "show", "--terminal", terminal]).terminal?.lastOutputAt
  return Number.isFinite(first) && Number.isFinite(second) && second > first
}

/**
 * The standing worker contract, owned HERE rather than by whoever composed the prompt file.
 * Every failure it closes was measured on the ORB-88 run itself: a worker ENDED A TURN ON A
 * QUESTION and stalled until a human happened to look at its terminal; a worker armed a monitor
 * on another ticket's PR, burning 34 minutes and 105k tokens re-deriving state the orchestrator
 * already had; and a `git add -A` swept a SIBLING worker's runtime artifact (`.orca/web-port`,
 * written into the ORB-88 worktree by the ORB-90 worker) into an unrelated PR, because a
 * worktree is a shared filesystem and a blanket stage does not know whose file it is. Each
 * clause existed, if at all, as prose in a prompt an orchestrating session composes by hand:
 * prose is advisory and one forgetful session away from shipping the same failure again. The
 * launch APPENDS this to the prompt file before pointing the worker at it, so the guarantee is
 * structural and does not depend on the caller remembering. Idempotent via the marker, so a
 * relaunch against the same file does not stack copies. Note the staging clauses cover the
 * CLASS: a .gitignore entry only ever covers the one artifact somebody already got burned by.
 */
const WORKER_CONTRACT_MARKER = "## Standing worker contract (injected by tools/launch-worker.mjs)"
const SLICE_CONTRACT_MARKER = "## Slice worker contract (injected by tools/launch-worker.mjs)"
const WORKER_CONTRACT = `

---

${WORKER_CONTRACT_MARKER}

These clauses come from the launcher, not from whoever composed the work order above. Where they
conflict with anything above, these win.

1. **Never ask a question.** Nobody is at your keyboard, so a question is not a safe default, it
   is a silent stall: the run stops until a human notices your terminal by accident. Never
   present a menu, never wait for a choice, never end a turn on a question. Decide every fork
   yourself, the way this repo's CLAUDE.md and the ticket body point, and record each decision
   and its reasoning in the PR body under a \`## Decisions taken unattended\` heading.
2. **A blocked sub-step never blocks the PR.** If one step is genuinely impossible, finish every
   other part in full, mark that criterion explicitly UNMET in the PR body with the evidence,
   and still complete the contract: gates, commit, push, PR, attach, In Review. Unmet and stated
   is acceptable; unmentioned is not. The pull request must be ready for review, never a draft.
   Never silently drop a criterion.
3. **Own the automated review cycle.** After the PR is open, attached, and In Review, poll its
   review transitions with a foreground blocking \`node tools/pr-watch.mjs --repo <owner/name> --pr <number>\`.
   Every wait must state \`yield_time_ms\` explicitly, at or above the whole expected wait. After every call and before waiting or reporting
   completion, run \`node tools/worker-status.mjs --worktree <path> --issue ORB-N --json\`.
   That full-surface completion poll inventories review submissions, review threads and their
   nested comments, and PR conversation comments, and fails closed on an incomplete inventory.
   Read unmet item bodies through GitHub's read APIs, reconcile them against the diff, then poll
   again. For each valid finding, fix it, run the affected gates, commit and push, reply on that
   thread naming the fix commit, then resolve it.
   An informational automated finding that needs no code change may be resolved after replying
   \`No code change required: <reason>. Evidence: <PR commit>\`; the named commit must be on the
   PR and change the reviewed path. Never resolve a thread opened by a human account. Repeat until
   the review decision is approved with zero unresolved threads; approval with an unresolved
   thread is not done. For an automated finding in a review body or PR conversation comment with
   no thread, post a PR comment naming that activity ID and the PR commit that addresses it.
4. **Escalate instead of guessing.** Escalate when you disagree with a finding, when you are
   blocked on a decision you may not make, or when two consecutive cycles fail on the same
   finding. Do not try that finding a third time. Send one escalation carrying the disputed
   finding and your reasoning.
5. **Your job ends on one report.** Report completion once the PR is approved with zero
   unresolved threads, or send the escalation from clause 4. An earlier instruction to stop
   after opening or attaching the PR does not replace this endpoint. If your work order tells you
   both to watch something and to stop, STOP wins. Never watch another ticket, worktree, or PR.
6. **Never arm a detached background monitor, watcher or wait loop that outlives this contract.** A foreground blocking wait is permitted.
7. **Never merge any PR, never push to \`main\`, never use \`--no-verify\`, never edit a gate
   baseline, never run \`gh pr merge --admin\`, never directly call \`PUT /repos/{owner}/{repo}/pulls/{number}/merge\`, and never directly call the GraphQL \`mergePullRequest\` mutation. If a merge genuinely needs an admin override, STOP and ask Thomas to merge it himself; never perform the override.**
8. **Stage explicitly.** Commit only the paths you edited yourself. \`git add -A\`, \`git add .\`
   and \`git commit -a\` are forbidden. A worktree is a shared filesystem that sibling workers,
   dev servers and tooling all write into, so a blanket stage turns any of their runtime
   artifacts into your diff.
9. **Verify before pushing.** Run \`git show --stat HEAD\` and confirm every path in it is one
   you meant to change. A path you cannot explain is a defect to resolve, never a file to push.
10. **Never write into another worktree.** A live sibling worktree is another worker's working
    tree, and a file you leave there can land in that worker's PR. If your proof genuinely needs
    a second worktree, create a disposable one for it and remove it afterwards.
11. **Delegate independent slices.** A work order spanning more than one independent file or
    slice is executed by spawning parallel subagents, one per slice, each with an explicit output
    contract, then reconciling their output. Keep edits landing in the SAME file inline, and keep
    the final gate run inline because its raw output ships in the PR body. A review round with
    more than one independent finding is dispatched one subagent per finding, not fixed inline.
`

const SLICE_CONTRACT = `

---

${SLICE_CONTRACT_MARKER}

This process is one slice in a coordinator-owned worktree. Make only the requested change and run
the relevant checks. Do not commit, push, open or edit a pull request, merge, change the Linear
issue, or modify files outside the requested slice. Report the changed paths and raw check output
to the coordinator when finished. Never ask a question: decide from the work order and repository
rules, and record any blocked sub-step in the report.
`

/**
 * Everything created after `orca worktree create` succeeds has to come back out on any later
 * failure, or a failed launch leaves a full checkout, its terminals and an `npm install`
 * behind. Orca then de-duplicates the NAME on the next attempt (orb-N-slug-2) while the
 * contract branch survives, so `git switch -c` fails again and the retry the skill tells the
 * operator to run compounds the mess instead of clearing it. Measured on this branch.
 */
let rollback = null
let budgetReservation = null
let reservationMaySpend = false
let cancelBudgetReservation = null
let concurrencyReservation = null

const releaseConcurrencyReservation = () => {
  if (!concurrencyReservation) return
  const { path, token } = concurrencyReservation
  concurrencyReservation = null
  try {
    if (readFileSync(path, "utf8") === token) unlinkSync(path)
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(`could not release launch reservation ${path}: ${error.message}`)
    }
  }
}

process.on("exit", releaseConcurrencyReservation)

const fail = (code, message) => {
  console.error(message)
  releaseConcurrencyReservation()
  let cleanupConfirmed = rollback === null
  if (rollback) {
    const { selector, contractBranch, orcaBranch, repoPath: rollbackRepo } = rollback
    rollback = null
    console.error(`rolling back ${selector} so a relaunch starts clean`)
    /**
     * `orca worktree create` spawns its own startup PTYs (a shell, plus the repo's setup hook,
     * which is `npm install` here). `worktree rm --force` fails with "Failed to physically stop
     * every PTY" while one of those is still alive, so stop them first and give a slow one a
     * second chance before giving up. Measured on this branch: the first rollback attempt
     * failed exactly this way with npm install still running.
     */
    spawnSync(ORCA, ["terminal", "stop", "--worktree", selector, "--json"], { encoding: "utf8" })
    let removal = spawnSync(ORCA, ["worktree", "rm", "--worktree", selector, "--force", "--json"], { encoding: "utf8" })
    if (removal.status !== 0) {
      pause(5000)
      spawnSync(ORCA, ["terminal", "stop", "--worktree", selector, "--json"], { encoding: "utf8" })
      removal = spawnSync(ORCA, ["worktree", "rm", "--worktree", selector, "--force", "--json"], { encoding: "utf8" })
    }
    if (removal.status !== 0) {
      console.error(`could not remove the worktree: ${(removal.stdout || removal.stderr || "").trim().slice(0, 300)}`)
      console.error(`remove it by hand before relaunching: orca worktree rm --worktree ${selector} --force`)
    } else {
      cleanupConfirmed = true
    }
    for (const branchToDrop of [contractBranch, orcaBranch].filter(Boolean)) {
      const stillThere = spawnSync("git", ["-C", rollbackRepo, "rev-parse", "--verify", "--quiet", `refs/heads/${branchToDrop}`], { encoding: "utf8" })
      if (stillThere.status !== 0) continue
      const dropped = spawnSync("git", ["-C", rollbackRepo, "branch", "-D", branchToDrop], { encoding: "utf8" })
      if (dropped.status !== 0) console.error(`left the branch ${branchToDrop} behind: ${(dropped.stderr || "").trim().slice(0, 200)}`)
    }
  }
  if (budgetReservation && !reservationMaySpend && cleanupConfirmed && cancelBudgetReservation) {
    const cancelled = cancelBudgetReservation(budgetReservation)
    if (!cancelled) {
      console.error(`left budget reservation "${budgetReservation.identity}" pending because its cancellation could not be recorded`)
    }
    budgetReservation = null
  }
  process.exit(code)
}

const argOf = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? null : process.argv[index + 1]
}

/** orca prints its `ok: false` payload on STDOUT and leaves stderr empty, so a failed call whose
 * reason is only read off stderr reports "Command failed" and nothing else. Read stdout first. */
const orcaFailureReason = (error) => {
  const payload = error.stdout?.toString() ?? ""
  try {
    const parsed = JSON.parse(payload)
    if (parsed.error?.message) return parsed.error.message
  } catch {
    if (payload.trim()) return payload.trim().slice(0, 400)
  }
  return error.stderr?.toString().trim() || error.message
}

const orca = (args) => {
  let raw
  try {
    raw = execFileSync(ORCA, [...args, "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
  } catch (error) {
    fail(3, `orca ${args.join(" ")} failed: ${orcaFailureReason(error)}`)
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    fail(3, `orca ${args.join(" ")} returned unparseable output: ${raw.slice(0, 400)}`)
  }
  if (parsed.ok === false) fail(3, `orca ${args.join(" ")} failed: ${parsed.error?.message ?? "unknown orca error"}`)
  return parsed.result ?? parsed
}

const createTerminal = (worktreeSelector, command) => {
  const args = ["terminal", "create", "--worktree", worktreeSelector, "--command", command]
  for (let attempt = 1; attempt <= MAX_TERMINAL_CREATE_ATTEMPTS; attempt += 1) {
    const result = spawnSync(ORCA, [...args, "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
    if (result.error) fail(3, `orca terminal create failed: ${result.error.message}`)

    let parsed
    try {
      parsed = JSON.parse(result.stdout)
    } catch {
      fail(3, `orca ${args.join(" ")} returned unparseable output: ${(result.stdout || result.stderr || "").slice(0, 400)}`)
    }

    const failureMessage = parsed.error?.message || result.stderr?.trim() || "unknown orca error"
    const timedOut = parsed.error?.code === "timeout" || /terminal creation timed out/i.test(failureMessage)
    if (parsed.ok !== false && result.status === 0) {
      const handle = (parsed.result ?? parsed).terminal?.handle
      if (!handle) fail(3, "orca terminal create returned no handle")
      return handle
    }
    if (!timedOut) fail(3, `orca ${args.join(" ")} failed: ${failureMessage}`)
    if (attempt === MAX_TERMINAL_CREATE_ATTEMPTS) {
      fail(3, `orca ${args.join(" ")} failed after ${attempt} attempts: ${failureMessage}`)
    }

    const backoff = TERMINAL_CREATE_BACKOFF_MS * attempt
    console.error(`orca terminal create timed out (attempt ${attempt} of ${MAX_TERMINAL_CREATE_ATTEMPTS}); retrying in ${backoff}ms`)
    pause(backoff)
  }
}

/**
 * `orca terminal wait` reports "not yet" two different ways, and neither is a tool failure:
 * a condition it cannot meet in time exits 1 with ok:false and error.code timeout, while a
 * TUI gate such as the trust prompt exits 0 with satisfied:false and a blockedReason. Both
 * are normal polling outcomes, so read the payload rather than trusting the exit code.
 */
const waitForIdle = (handle) => {
  const result = spawnSync(
    ORCA,
    ["terminal", "wait", "--terminal", handle, "--for", "tui-idle", "--timeout-ms", String(WAIT_TIMEOUT_MS), "--json"],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  )
  if (result.error) fail(3, `orca terminal wait failed: ${result.error.message}`)
  let parsed
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    fail(3, `orca terminal wait returned unparseable output: ${(result.stdout || result.stderr || "").slice(0, 400)}`)
  }
  if (parsed.ok === false) {
    if (parsed.error?.code === "timeout") return { satisfied: false, status: "timeout" }
    fail(3, `orca terminal wait failed: ${parsed.error?.message ?? "unknown orca error"}`)
  }
  return parsed.result?.wait ?? {}
}

const git = (args) => {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim()
  } catch (error) {
    fail(3, `git ${args.join(" ")} failed: ${error.stderr?.toString().trim() || error.message}`)
  }
}

const quotaToolPath = fileURLToPath(new URL("./ai-quota.mjs", import.meta.url))
const budgetToolPath = fileURLToPath(new URL("./automation-budget.mjs", import.meta.url))
const automationLedgerOverride = process.env.ORBIT_AUTOMATION_BUDGET_LEDGER
if (automationLedgerOverride !== undefined && automationLedgerOverride.trim().length === 0) {
  fail(2, "ORBIT_AUTOMATION_BUDGET_LEDGER must not be empty")
}
const automationLedgerPath = resolve(
  automationLedgerOverride ?? resolve(homedir(), ".orbit", "automation-budget.jsonl"),
)

const parseClaudeResetAt = (resetsIn) => {
  if (typeof resetsIn !== "string") {
    fail(3, "ai-quota returned no Claude weekly reset duration; refusing to launch unattended automation")
  }
  const match = resetsIn.match(/^(?:(\d+)d(?: (\d+)h)?(?: (\d+)m)?|(\d+)h(?: (\d+)m)?|(\d+)m)$/)
  if (!match) {
    fail(3, `ai-quota returned unsupported Claude reset duration "${resetsIn}"; expected compact d/h/m units such as "6d 4h"`)
  }
  const days = Number(match[1] ?? 0)
  const hours = Number(match[2] ?? match[4] ?? 0)
  const minutes = Number(match[3] ?? match[5] ?? match[6] ?? 0)
  const durationMilliseconds = ((days * 24 + hours) * 60 + minutes) * 60 * 1000
  if (!Number.isSafeInteger(durationMilliseconds) || durationMilliseconds <= 0) {
    fail(3, `ai-quota returned invalid Claude reset duration "${resetsIn}"; refusing to launch unattended automation`)
  }
  return new Date(Date.now() + durationMilliseconds).toISOString()
}

const parseCodexResetAt = (resetsAt) => {
  const milliseconds = typeof resetsAt === "number" ? resetsAt * 1000 : Date.parse(resetsAt)
  if (!Number.isFinite(milliseconds) || milliseconds <= Date.now()) {
    fail(3, `ai-quota returned invalid Codex reset timestamp "${resetsAt}"; refusing to launch unattended automation`)
  }
  return new Date(milliseconds).toISOString()
}

const runBudgetCommand = (argumentsList, blockedExit = false) => {
  const budgetResult = spawnSync(process.execPath, [budgetToolPath, ...argumentsList], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
  if (budgetResult.error) fail(3, `automation-budget could not start: ${budgetResult.error.message}`)
  if (budgetResult.status === 0) {
    if (budgetResult.stderr) process.stderr.write(budgetResult.stderr)
    return
  }
  const reason = (budgetResult.stderr || budgetResult.stdout || "automation-budget failed").trim()
  fail(blockedExit && budgetResult.status === 4 ? 4 : 3, reason)
}

const reserveAutomationBudget = (
  engineName,
  identity,
  tier,
  startedAt,
  warningTokens,
  tokenBudget,
  projectedTokens,
  ledgerPath,
) => {
  const quotaResult = spawnSync(process.execPath, [quotaToolPath, "--json"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
  if (quotaResult.error) fail(3, `ai-quota could not start: ${quotaResult.error.message}`)
  let quota
  try {
    quota = JSON.parse(quotaResult.stdout)
  } catch {
    fail(3, `ai-quota returned unparseable output: ${(quotaResult.stdout || quotaResult.stderr || "").slice(0, 400)}`)
  }
  const selectedQuota = quota?.[engineName]
  if (selectedQuota?.status !== "OK") {
    fail(3, `ai-quota could not read ${engineName} quota; refusing to launch unattended automation`)
  }
  const accountObservedAt = new Date().toISOString()
  const accountUsedPercent = engineName === "claude"
    ? selectedQuota.weeklyPercent
    : selectedQuota.usedPercent
  const resetAt = engineName === "claude"
    ? parseClaudeResetAt(selectedQuota.resetsIn)
    : parseCodexResetAt(selectedQuota.resetsAt)
  const argumentsList = [
    "reserve",
    "--engine",
    engineName,
    "--identity",
    identity,
    "--tier",
    tier,
    "--started-at",
    startedAt,
    "--ended-at",
    accountObservedAt,
    "--reset-at",
    resetAt,
    "--warning-tokens",
    String(warningTokens),
    "--budget-tokens",
    String(tokenBudget),
    "--invocation-tokens",
    String(projectedTokens),
    "--ledger",
    ledgerPath,
  ]
  if (Number.isFinite(accountUsedPercent) && typeof accountObservedAt === "string") {
    argumentsList.push(
      "--account-used-percent",
      String(accountUsedPercent),
      "--account-observed-at",
      accountObservedAt,
    )
  }
  argumentsList.push("--json")
  runBudgetCommand(argumentsList, true)
  return { identity, engineName, tier, startedAt, ledgerPath }
}

cancelBudgetReservation = ({ identity, engineName, tier, startedAt, ledgerPath }) => {
  const result = spawnSync(process.execPath, [
    budgetToolPath,
    "cancel",
    "--identity",
    identity,
    "--engine",
    engineName,
    "--tier",
    tier,
    "--started-at",
    startedAt,
    "--ended-at",
    new Date().toISOString(),
    "--ledger",
    ledgerPath,
    "--json",
  ], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
  if (!result.error && result.status === 0) return true
  console.error(`automation-budget cancellation failed: ${(result.stderr || result.stdout || result.error?.message || "unknown error").trim()}`)
  return false
}

const processIsAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code !== "ESRCH"
  }
}

const unlinkReservation = (path) => {
  try {
    unlinkSync(path)
    return true
  } catch (error) {
    if (error.code === "ENOENT") return false
    throw error
  }
}

const acquireConcurrencyReservation = (repoPath) => {
  const gitCommonDirectory = resolve(
    repoPath,
    git(["-C", repoPath, "rev-parse", "--git-common-dir"]),
  )
  const path = join(gitCommonDirectory, "orbit-launch-worker.lock")
  const token = JSON.stringify({ pid: process.pid, startedAt: Date.now() })
  const deadline = Date.now() + 5 * 60 * 1000

  while (true) {
    let descriptor
    try {
      descriptor = openSync(path, "wx")
      writeFileSync(descriptor, token, "utf8")
      closeSync(descriptor)
      concurrencyReservation = { path, token }
      return
    } catch (error) {
      if (descriptor !== undefined) {
        try {
          closeSync(descriptor)
        } catch {
          // The descriptor may already have closed before a later setup step failed.
        }
        unlinkReservation(path)
      }
      if (error.code !== "EEXIST") {
        fail(3, `could not reserve a concurrency slot for ${repoPath}: ${error.message}`)
      }
    }

    try {
      const owner = JSON.parse(readFileSync(path, "utf8"))
      if (Number.isInteger(owner.pid) && !processIsAlive(owner.pid)) {
        unlinkReservation(path)
        continue
      }
    } catch (error) {
      if (error.code === "ENOENT") continue
      let stale = false
      try {
        stale = Date.now() - statSync(path).mtimeMs > 5000
      } catch (statError) {
        if (statError.code === "ENOENT") continue
        fail(3, `could not inspect launch reservation ${path}: ${statError.message}`)
      }
      if (stale) {
        unlinkReservation(path)
        continue
      }
    }

    if (Date.now() >= deadline) {
      fail(1, `timed out waiting for another launch reservation in ${repoPath}`)
    }
    pause(100)
  }
}

const issue = argOf("--issue")
const promptFileArg = argOf("--prompt-file")
const existingWorktreeArg = argOf("--existing-worktree")
const repoOverride = argOf("--repo")
const baseBranch = argOf("--base-branch") ?? "main"
const branchPrefix = argOf("--branch-prefix") ?? "feature"
const maxParallelOverride = argOf("--max-parallel-worktrees")
const workspaceStatus = argOf("--workspace-status") ?? "in-progress"
const dryRun = process.argv.includes("--dry-run")

if (!issue || !/^[A-Z]+-\d+$/.test(issue)) fail(2, `${USAGE}\n\n--issue must be a Linear identifier such as ORB-75`)
if (!promptFileArg) fail(2, `${USAGE}\n\n--prompt-file is required`)
if (branchPrefix !== "feature" && branchPrefix !== "fix") fail(2, "--branch-prefix must be feature or fix")
if (maxParallelOverride !== null && !/^[1-9]\d*$/.test(maxParallelOverride)) {
  fail(2, "--max-parallel-worktrees must be a positive integer")
}

const promptFile = resolve(promptFileArg)
if (!existsSync(promptFile)) fail(2, `prompt file not found: ${promptFile}`)
if (statSync(promptFile).size === 0) fail(2, `prompt file is empty: ${promptFile}`)

let config
try {
  config = readOrchestratorConfig()
} catch (error) {
  fail(2, error.message)
}
const maxParallelWorktrees = maxParallelOverride === null
  ? config.maxParallelWorktrees
  : Number(maxParallelOverride)
const engineName = config.worker
const engine = config.workers?.[engineName]
if (!engine?.command) fail(2, `.claude/orchestrator.json names worker "${engineName}" but carries no command for it`)
if (!Array.isArray(engine.args)) fail(2, `.claude/orchestrator.json worker "${engineName}" carries no args array; give it one (use [] for none)`)
if (!["claude", "codex"].includes(engineName)) {
  fail(2, `.claude/orchestrator.json worker "${engineName}" has no quota reader; expected claude or codex`)
}
const automationBudget = engine.automationBudget
if (!automationBudget || !["routine", "reserved"].includes(automationBudget.tier)) {
  fail(2, `.claude/orchestrator.json worker "${engineName}" must declare automationBudget.tier as routine or reserved`)
}
if (!Number.isSafeInteger(automationBudget.tokenBudget) || automationBudget.tokenBudget <= 0) {
  fail(2, `.claude/orchestrator.json worker "${engineName}" must declare automationBudget.tokenBudget as a positive integer`)
}
if (
  !Number.isSafeInteger(automationBudget.warningTokens) ||
  automationBudget.warningTokens < 0 ||
  automationBudget.warningTokens >= automationBudget.tokenBudget
) {
  fail(2, `.claude/orchestrator.json worker "${engineName}" must declare automationBudget.warningTokens as a nonnegative integer below tokenBudget`)
}
const invocationTokenTiers =
  engine.models && typeof engine.models === "object" && !Array.isArray(engine.models)
    ? Object.keys(engine.models)
    : []
if (
  !automationBudget.invocationTokens ||
  typeof automationBudget.invocationTokens !== "object" ||
  Array.isArray(automationBudget.invocationTokens) ||
  invocationTokenTiers.some(
    (tier) =>
      !Number.isSafeInteger(automationBudget.invocationTokens[tier]) ||
      automationBudget.invocationTokens[tier] <= 0,
  )
) {
  fail(2, `.claude/orchestrator.json worker "${engineName}" must declare positive integer automationBudget.invocationTokens for every declared model tier: ${invocationTokenTiers.join(", ")}`)
}
if (typeof engine.interactive !== "boolean") {
  fail(
    2,
    `.claude/orchestrator.json worker "${engineName}" must explicitly declare interactive as true or false; silence must not select a launch mode.`,
  )
}
if (engine.interactive && promptFile.length > MAX_INTERACTIVE_PROMPT_PATH_LENGTH) {
  fail(2, `prompt file path is ${promptFile.length} characters; interactive terminal delivery can swallow long paths. Use a shorter path or a headless worker.`)
}
if (!config.repos || typeof config.repos !== "object") {
  fail(2, ".claude/orchestrator.json carries no repos map; add one keyed by the repo:* label ids (ui, api, landing)")
}

const normalize = (path) => path.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase()
const isInside = (child, parent) => normalize(child) === normalize(parent) || normalize(child).startsWith(`${normalize(parent)}/`)

for (const [key, path] of Object.entries(config.repos)) {
  if (isInside(promptFile, path)) {
    fail(2, `prompt file lives inside the ${key} repo (${path}); it would be committed. Write it to the session scratchpad instead`)
  }
}

const detail = orca(["linear", "issue", issue])
const linearIssue = detail.issue ?? detail
const labels = (linearIssue.labels ?? []).map((label) => (typeof label === "string" ? label : label.name))
const title = linearIssue.title ?? ""
if (!title) fail(3, `orca returned no title for ${issue}; cannot derive a branch slug`)

const repoKey = repoOverride ?? labels.find((label) => label.startsWith("repo:"))?.slice("repo:".length)
if (!repoKey) fail(2, `${issue} carries no repo:* label and no --repo was given`)
const repoPath = config.repos[repoKey]
if (!repoPath) fail(2, `no repo path for "${repoKey}" in .claude/orchestrator.json (known: ${Object.keys(config.repos).join(", ")})`)

const slug = title
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .split("-")
  .slice(0, 6)
  .join("-")
  .slice(0, 40)
  .replace(/-$/, "")
const worktreeName = `${issue.toLowerCase()}-${slug}`
const branch = `${branchPrefix}/${worktreeName}`
const comment = argOf("--comment") ?? `${issue} launched: worker running`

let resolvedInvocation
try {
  resolvedInvocation = resolveWorkerInvocation(engineName, engine, labels)
} catch (error) {
  fail(2, error.message)
}
const engineArgs = resolvedInvocation.args
const budgetTier = automationBudget.tier
const projectedTokens = automationBudget.invocationTokens[resolvedInvocation.tier]
const invocationStartedAt = new Date().toISOString()
const invocationIdentity = `${issue}:${invocationStartedAt}:${randomUUID()}`
const command = [engine.command, ...engineArgs].join(" ")
const workerPointer = (worktreePath, branch) => `Read ${promptFile} and execute it in full. That file is your complete work order for ${issue}. You are on branch ${branch} in ${worktreePath}. Do not summarise the file back to me, start the work now.`
const startHeadlessWorker = (worktreePath, branch) => {
  const executable = process.platform === "win32" && !/\.(?:cmd|bat|exe)$/i.test(engine.command)
    ? `${engine.command}.cmd`
    : engine.command
  const child = spawn(executable, [...engineArgs, workerPointer(worktreePath, branch)], {
    cwd: worktreePath,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env, ORBIT_LAUNCH_WORKER: "1" },
  })
  if (!child.pid) fail(3, `could not start headless ${engineName} worker`)
  child.unref()
  const gitDirectory = resolve(worktreePath, git(["-C", worktreePath, "rev-parse", "--git-dir"]))
  appendFileSync(join(gitDirectory, "orbit-worker-pids.jsonl"), `${JSON.stringify({ issue, worktreePath, pid: child.pid, startedAt: new Date().toISOString() })}\n`)
  return child.pid
}

/**
 * Second level, for an entry that declares interactive: true while carrying a headless
 * invocation anyway. It scans the WHOLE invocation, command included: "command": "codex exec"
 * and "command": "claude --print" are the same headless launch as the same token sitting in
 * args, and a guard that only reads args is one field move from passing them. This is an
 * assertion on each CLI's known headless shape, not a blocklist to extend flag by flag: the
 * interactive declaration above is the gate. A binary with no profile is refused rather than
 * waved through, so adding a third engine means declaring what headless looks like for it.
 */
const invocationTokens = command.split(/\s+/).filter(Boolean)
const binary = invocationTokens[0].split(/[\\/]/).pop().replace(/\.(exe|cmd|bat|ps1)$/i, "").toLowerCase()
const profile = ENGINE_PROFILES[binary]
if (!profile) {
  fail(2, `worker "${engineName}" runs "${binary}", which tools/launch-worker.mjs has no engine profile for. Add one to ENGINE_PROFILES naming that CLI's headless tokens (the subcommand or flag that runs it with no TUI), its first-run trust screen and the keystroke that answers it. Known: ${Object.keys(ENGINE_PROFILES).join(", ")}`)
}
const headless = invocationTokens.slice(1).find((token) => profile.headlessTokens.includes(token))
if (engine.interactive === true && headless) {
  fail(2, `worker "${engineName}" declares interactive: true but its invocation "${command}" carries "${headless}", which is a headless invocation of ${binary}. Fix the command or args, or the declaration, in .claude/orchestrator.json`)
}
if (engine.interactive === false && !headless) {
  fail(2, `worker "${engineName}" declares interactive: false but its invocation "${command}" has no known headless token for ${binary}`)
}
const runPermissionIndex = invocationTokens.findIndex((token, index) => token === profile.runPermissionTokens[0] && profile.runPermissionTokens.every((expected, offset) => invocationTokens[index + offset] === expected))
if (runPermissionIndex === -1) {
  const modeIndex = profile.permissionModeToken ? invocationTokens.indexOf(profile.permissionModeToken) : -1
  const mode = modeIndex === -1 ? "" : `; resolved permission mode is "${invocationTokens[modeIndex + 1] ?? "missing"}"`
  fail(2, `worker "${engineName}" invocation "${command}" does not carry ${binary}'s required run-permitting policy "${profile.runPermissionTokens.join(" ")}"${mode}. A worker without that policy can stop for approval with nobody at the keyboard. Fix the command or args in .claude/orchestrator.json`)
}

if (!dryRun && !existingWorktreeArg) acquireConcurrencyReservation(repoPath)
const listedWorktrees = orca(["worktree", "list", "--repo", `path:${repoPath}`]).worktrees
if (!Array.isArray(listedWorktrees)) {
  fail(3, "orca worktree list returned no worktrees array")
}
/** WHY: Measured on 2026-07-28, Orca's live JSON carries both canonical flat fields and
 * mirrored `git.path` / `git.isMainWorktree` fields. Accept either shape so a wrapper that
 * omits the flat mirror cannot count main as a child or hide an occupying path. */
const occupyingWorktrees = listedWorktrees.filter(
  (worktree) =>
    worktree.isMainWorktree !== true
    && worktree.git?.isMainWorktree !== true
    && worktree.isArchived !== true,
)
const maxSlicesPerWorker = config.maxSlicesPerWorker
if (!Number.isSafeInteger(maxSlicesPerWorker) || maxSlicesPerWorker < 1) {
  fail(2, ".claude/orchestrator.json must declare maxSlicesPerWorker as a positive integer")
}
if (!existingWorktreeArg && occupyingWorktrees.length >= maxParallelWorktrees) {
  const paths = occupyingWorktrees.map((worktree) => worktree.path ?? worktree.git?.path ?? worktree.id)
  fail(
    1,
    `maxParallelWorktrees cap ${maxParallelWorktrees} reached for ${repoKey}; current count ${occupyingWorktrees.length}. Occupying worktrees:\n${paths.map((path) => `- ${path}`).join("\n")}`,
  )
}

/** Reported in the plan so a dry run shows whether this launch would inject the contract, and a
 * relaunch against an already-injected file is visibly a no-op rather than a silent second copy. */
const contractMarker = existingWorktreeArg ? SLICE_CONTRACT_MARKER : WORKER_CONTRACT_MARKER
const workerContract = readFileSync(promptFile, "utf8").includes(contractMarker) ? "already present" : "appended"

const plan = {
  issue,
  repo: repoKey,
  repoPath,
  worktreeName,
  branch,
  baseBranch,
  maxParallelWorktrees,
  occupiedWorktrees: occupyingWorktrees.length,
  engine: engineName,
  command,
  automationBudget: {
    tier: budgetTier,
    identity: invocationIdentity,
    tokenBudget: automationBudget.tokenBudget,
    warningTokens: automationBudget.warningTokens,
    projectedTokens,
    ledgerPath: automationLedgerPath,
  },
  promptFile,
  workerContract,
  labels,
}

if (dryRun) {
  console.log(JSON.stringify({ ...plan, dryRun: true }, null, 2))
  process.exit(0)
}

budgetReservation = reserveAutomationBudget(
  engineName,
  invocationIdentity,
  budgetTier,
  invocationStartedAt,
  automationBudget.warningTokens,
  automationBudget.tokenBudget,
  projectedTokens,
  automationLedgerPath,
)

/** Before anything is created, so a launch that fails later still leaves the work order complete
 * for the relaunch. A dry run resolves this decision but writes nothing. */
if (workerContract === "appended") {
  try {
    appendFileSync(promptFile, existingWorktreeArg ? SLICE_CONTRACT : WORKER_CONTRACT, "utf8")
  } catch (error) {
    fail(3, `could not append the worker contract to ${promptFile}: ${error.message}`)
  }
}

if (existingWorktreeArg) {
  const worktreePath = resolve(existingWorktreeArg)
  if (!existsSync(worktreePath)) fail(2, `existing worktree not found: ${worktreePath}`)
  if (isInside(promptFile, worktreePath)) fail(2, `prompt file lives inside the existing worktree (${worktreePath})`)
  const actualRoot = git(["-C", worktreePath, "rev-parse", "--show-toplevel"])
  if (normalize(actualRoot) !== normalize(worktreePath)) fail(2, `--existing-worktree must name a Git worktree root: ${worktreePath}`)
  const existing = listedWorktrees.find((worktree) => normalize(worktree.path) === normalize(worktreePath))
  if (!existing || existing.isMainWorktree || existing.isArchived || existing.linkedLinearIssue !== issue) {
    fail(2, `--existing-worktree must be an active Orca worktree linked to ${issue}`)
  }
  const marker = join(resolve(worktreePath, git(["-C", worktreePath, "rev-parse", "--git-dir"])), "orbit-worker-pids.jsonl")
  const activeSlices = existsSync(marker)
    ? readFileSync(marker, "utf8").trim().split(/\r?\n/).filter(Boolean).flatMap((line) => { try { const row = JSON.parse(line); return row.issue === issue && Number.isInteger(row.pid) && (() => { try { process.kill(row.pid, 0); return true } catch (error) { return error.code !== "ESRCH" } })() ? [row] : [] } catch { return [] } })
    : []
  if (activeSlices.length >= maxSlicesPerWorker) fail(1, `maxSlicesPerWorker cap ${maxSlicesPerWorker} reached for ${issue}`)
  const branch = git(["-C", worktreePath, "rev-parse", "--abbrev-ref", "HEAD"])
  const workerPid = startHeadlessWorker(worktreePath, branch)
  rollback = null
  console.log(JSON.stringify({ ...plan, launchMode: "existing-worktree", worktreePath, worktreeSelector: `path:${worktreePath}`, branch, workerPid }, null, 2))
  process.exit(0)
}

console.error(`creating worktree ${worktreeName} in ${repoKey} from ${baseBranch}`)
const created = orca([
  "worktree", "create",
  "--repo", `path:${repoPath}`,
  "--name", worktreeName,
  "--base-branch", baseBranch,
  "--linear-issue", issue,
  "--no-parent",
  "--comment", comment,
])
releaseConcurrencyReservation()
const worktreePath = created.worktree?.path
if (!worktreePath) fail(3, `orca worktree create returned no path: ${JSON.stringify(created).slice(0, 400)}`)
const worktreeSelector = `path:${worktreePath}`
rollback = {
  selector: worktreeSelector,
  repoPath,
  orcaBranch: (created.worktree?.branch ?? "").replace(/^refs\/heads\//, "") || null,
  contractBranch: null,
}

if (isInside(promptFile, worktreePath)) {
  fail(3, `prompt file lives inside the new worktree (${worktreePath}); write the prompt to the session scratchpad instead`)
}

console.error(`switching ${worktreePath} onto the contract branch ${branch}`)
git(["-C", worktreePath, "switch", "-c", branch])
rollback.contractBranch = branch
const actualBranch = git(["-C", worktreePath, "rev-parse", "--abbrev-ref", "HEAD"])
if (actualBranch !== branch) fail(3, `expected the worktree on ${branch}, found ${actualBranch}`)

if (engine.interactive === false) {
  const workerPid = startHeadlessWorker(worktreePath, branch)
  rollback = null
  orca(["worktree", "set", "--worktree", worktreeSelector, "--comment", comment, "--workspace-status", workspaceStatus])
  console.log(JSON.stringify({ ...plan, launchMode: "new-worktree", worktreePath, worktreeSelector, workerPid }, null, 2))
  process.exit(0)
}

console.error(`starting the ${engineName} TUI: ${command}`)
const terminal = createTerminal(worktreeSelector, command)

let trustPromptAnswered = false
let waitAttempts = 0
let idle = false
while (waitAttempts < MAX_WAIT_ATTEMPTS && !idle) {
  waitAttempts += 1
  const wait = waitForIdle(terminal)
  /**
   * Idle first: the terminal tail keeps the answered trust screen forever (a TUI repaint
   * has no scrollback to fall off), so a trust check that ran first would keep matching
   * text from a gate that is long gone and type into the worker's live composer.
   */
  if (wait.satisfied) {
    if (!terminalIsRepainting(terminal)) {
      idle = true
      break
    }
    console.error(`attempt ${waitAttempts}: orca reports tui-idle but the TUI is still repainting, so the engine is still working`)
    if (waitAttempts < MAX_WAIT_ATTEMPTS) pause(SETTLE_MS)
    continue
  }
  const tail = (orca(["terminal", "read", "--terminal", terminal, "--limit", "60"]).terminal?.tail ?? []).join("\n")
  const trustBlocking = profile.trustOnScreen.test(flatten(tail)) || TRUST_BLOCKED_REASON.test(wait.blockedReason ?? "")
  /** Answered at most once. The keystroke is deterministic and the gate is definitely on
   * screen, so a second send would be spraying input at an unknown screen rather than
   * retrying; a gate that survives one correct answer is a launch failure worth reading. */
  if (trustBlocking && !trustPromptAnswered) {
    console.error(`attempt ${waitAttempts}: ${binary} workspace-trust prompt detected, answering it with ${profile.trustAnswer === "" ? "Enter" : `"${profile.trustAnswer}" then Enter`}`)
    orca(["terminal", "send", "--terminal", terminal, "--text", profile.trustAnswer, "--enter"])
    trustPromptAnswered = true
    continue
  }
  console.error(`attempt ${waitAttempts}: not idle yet (${wait.blockedReason ?? wait.status ?? "unknown"})`)
}
if (!idle) {
  fail(1, `${terminal} never reached tui-idle after ${waitAttempts} waits; the worker is not running. Inspect it with: orca terminal read --terminal ${terminal}`)
}

const measurementCommand = `node "${budgetToolPath}" record --identity "${invocationIdentity}" --engine ${engineName} --tier ${budgetTier} --started-at "${invocationStartedAt}" --ended-at <provider-observation-time> --input-tokens <provider-input-tokens> --output-tokens <provider-output-tokens> --ledger "${automationLedgerPath}"`
const pointer = `Read ${promptFile} and execute it in full. That file is your complete work order for ${issue}: the ticket body verbatim, then the finishing contract. You are on branch ${branch} in ${worktreePath}. Do not summarise the file back to me, start the work now. Before finishing, replace this launch's pending ledger record with an append carrying provider-authoritative token totals: ${measurementCommand}. Add --provider-estimated-cost only when the provider supplies its own estimate. If the token measurement is unavailable, leave the pending record unchanged so the next launch fails closed; never record zero or infer tokens from account usedPercent.`

/**
 * What a DELIVERED pointer looks like on screen: a send that became a user turn makes the TUI
 * paint the sent text as a user line and clears the composer placeholder. Two fingerprints
 * rather than the whole pointer, because a TUI wraps a long line and the flatten below rejoins
 * the wrap: the prompt file's basename, which no other screen carries, plus the instruction
 * that follows it. Matched with all whitespace stripped for the same reason the trust screens
 * are: `orca terminal read` flattens a repaint and swallows spacing unevenly.
 */
const POINTER_FINGERPRINTS = [flatten(basename(promptFile)), flatten("and execute it in full")]
const pointerOnScreen = () => {
  const tail = (orca(["terminal", "read", "--terminal", terminal, "--limit", "80"]).terminal?.tail ?? []).join("\n")
  const painted = flatten(tail)
  return POINTER_FINGERPRINTS.every((fingerprint) => painted.includes(fingerprint))
}

let pointerSends = 0
let pointerDelivered = false
let painting = false
while (pointerSends < MAX_POINTER_SENDS && !pointerDelivered) {
  pointerSends += 1
  console.error(`sending the prompt pointer (send ${pointerSends} of ${MAX_POINTER_SENDS})`)
  orca(["terminal", "send", "--terminal", terminal, "--text", pointer, "--enter"])
  reservationMaySpend = true
  pause(POINTER_PAINT_MS)
  pointerDelivered = pointerOnScreen()
  /**
   * A repainting TUI with no pointer on screen is ambiguous: it may be a worker that took the
   * turn and has already scrolled the line away, or an engine still starting up. Either way a
   * second send into a busy TUI is the ORB-75 corruption (queued, never a user turn, running
   * turn cut short), so settle and re-read rather than sending again.
   *
   * The paint state is re-measured on EVERY iteration, exactly as the tui-idle wait above does,
   * because an agent turn runs for minutes and a single settle expires long before it ends. A
   * shape that settled once and then fell through to the top of this loop resent into a busy TUI
   * in precisely the case this branch exists to prevent (PR #616 review round 1).
   */
  painting = !pointerDelivered && terminalIsRepainting(terminal)
  let settles = 0
  while (painting && settles < MAX_POINTER_SETTLES) {
    settles += 1
    console.error(`the pointer is not on screen and the TUI is painting, so settling instead of sending again (${settles} of ${MAX_POINTER_SETTLES})`)
    pause(SETTLE_MS)
    pointerDelivered = pointerOnScreen()
    painting = !pointerDelivered && terminalIsRepainting(terminal)
  }
  /** Still painting past the bound: there is no safe moment to re-send, so this launch is over. */
  if (painting) break
}
if (!pointerDelivered) {
  fail(
    1,
    `${terminal} never showed the prompt pointer as a user turn after ${pointerSends} send(s)${painting ? ", and the TUI never went quiet, so re-sending would have queued into a running turn" : ", and the worker is alive, idle and has NO work"}. This is the 2026-07-27 ORB-88 failure: orca accepts the send, the TUI's composer swallows it, and an exit 0 here would report a launch that delivered nothing. Inspect it with: orca terminal read --terminal ${terminal}`,
  )
}

rollback = null
orca(["terminal", "switch", "--terminal", terminal])
orca(["worktree", "set", "--worktree", worktreeSelector, "--comment", comment, "--workspace-status", workspaceStatus])

console.log(
  JSON.stringify(
    { ...plan, worktreePath, worktreeSelector, terminal, trustPromptAnswered, waitAttempts, pointerSends },
    null,
    2,
  ),
)
