#!/usr/bin/env node
/**
 * Launch one ticket's Orca worktree + worker end to end, and be the single
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

import { execFileSyncHidden as execFileSync, spawnHidden as spawn, spawnSyncHidden as spawnSync } from "./lib/subprocess-options.mjs"
import { generateKeyPairSync, randomUUID } from "node:crypto"
import {
  appendFileSync,
  existsSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { homedir, tmpdir } from "node:os"
import { basename, delimiter, dirname, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { readOrchestratorConfig, resolveWorkerInvocation } from "./lib/orchestrator-config.mjs"
import {
  cancelBudgetReservation as cancelAutomationBudgetReservation,
  claimBudgetReservation,
  reserveAutomationBudget,
} from "./lib/automation-launch-budget.mjs"
import { FINDING_SCOPE, STRIKES_BEFORE_ESCALATION, recordStrike, strikeCount, strikeLedgerPath } from "./lib/strike-ledger.mjs"
import { acquireWorktreeLifecycleLock } from "./lib/worktree-lifecycle-lock.mjs"
import { minimalChildEnvironment } from "./lib/child-environment.mjs"
import {
  signWorkerLaunchRecord,
  readWorkerLaunchRecords,
  recordWorkerLaunch,
  sameWorkerLaunch,
  WORKER_SUPERVISOR_ENVELOPE_VERSION,
  WORKER_TIMEOUTS_MS,
  workerLaunchLedgerPath,
} from "./lib/worker-launch-provenance.mjs"
const pause = (milliseconds) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)

const USAGE = `usage: launch-worker.mjs --issue ORB-N --prompt-file <path> [options]

  --issue ORB-N          Linear issue whose worker to launch (required)
  --prompt-file <path>   the composed worker prompt: ticket body verbatim (D2) then the
                         finishing contract. MUST live outside every Orbit repo and outside
                         the worktree (an in-worktree prompt gets committed). Only its path
                         is sent to the worker, never its text. The standing worker contract
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
  --repair                launch an existing-worktree repair owned by the same implementation worker
  --finding <id>         relaunch identifier for ONE unresolved review finding. Each launch under
                         the same --issue and --finding is one cycle of worker-contract clause 4,
                         counted in a durable ledger outside this process; the third refuses and
                         tells the caller to escalate instead of retrying
  --dry-run              resolve everything and print the plan; run no mutating orca or git command
  --help, -h             print this usage and exit 0

Wave mode launches every LAUNCHABLE ticket of wave 1 whose affected-file sets are pairwise
disjoint, and defers the rest behind the ticket they collide with. It consumes
tools/wave-plan.mjs --json and re-invokes THIS script once per ticket, so every per-ticket gate
(the budget fuse, the concurrency reservation, maxParallelWorktrees, the injected contract) is
enforced exactly once, here:

  --wave-all             launch wave 1 of \`wave-plan.mjs --all\`
  --wave-label <label>   launch wave 1 of \`wave-plan.mjs --label <label>\`
  --wave-project <name>  launch wave 1 of \`wave-plan.mjs --project <name>\`
  --prompt-dir <path>    directory holding one <ORB-N>.md work order per launched ticket (required
                         in wave mode). A ticket with no file there refuses the whole wave

Those three selectors partition identically: wave-plan reports each wave's collisions over the
whole wave. Its fourth selector, --issues, filters every wave down to the requested identifiers
FIRST, so a collision with a ticket you did not name is invisible in that mode; --wave-issues is
therefore refused rather than silently partitioning differently. Disjointness is evaluated WITHIN
a repo, and a ticket with no parseable path list collides with every other ticket in its repo,
because silence must not buy parallelism. Deferred tickets are named with what they collide on;
they are not launched, because only a merge advances a wave (D3).

Prints one JSON object on stdout: issue, repo, repoPath, worktreePath, worktreeSelector,
branch, baseBranch, terminal, engine, command, promptFile, workerContract, trustPromptAnswered,
waitAttempts, pointerSends. Headless results also carry launchId and authorityPublicKey so Sol
can authenticate the implementation handoff. In wave mode: selector, wave, launchable, concurrent,
serialised, launches.
Progress goes to stderr, so stdout stays pipeable.

Headless mode exits 0 after the supervisor launch is issued, the launch record is signed, and the
start gate is published. The worker's later completion is reported by worker-status, not this
launcher. Interactive compatibility mode exits 0 only after the prompt pointer is accepted as a
user turn and verified by reading it back from the TUI, never merely because Orca accepted the
send.

exit codes: 0 headless supervisor launch issued with signed provenance and a published start gate,
            or interactive compatibility accepted the prompt pointer as a user turn, 1 interactive
            delivery never reached tui-idle or took the prompt pointer as a turn, or the concurrency
            cap was reached,
            2 usage or config error,
            3 an orca, git, quota reader or budget command failed,
            4 the proposed invocation would cross the engine token budget,
            5 this finding has already burned its cycles; escalate it instead of relaunching

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
 *
 * The measured facts behind each engine's REQUIRED run-permitting policy, which used to live in
 * .claude/orchestrator.json's per-worker `notes` and belong next to the guard that enforces them:
 *
 * claude: the mode must be `bypassPermissions`, never `acceptEdits`. `acceptEdits` auto-approves
 * file writes only, so every shell command still prompts and a worker with nobody at the keyboard
 * is stuck. Measured on the 2026-07-24 ORB-75 run, where git switch, dotnet build/test/format, gh
 * and orca were all denied and the worker delivered files with zero gates run, zero commit, no PR.
 *
 * codex: the policy is the single `--dangerously-bypass-approvals-and-sandbox`, not the equivalent
 * pair `-a never --sandbox danger-full-access`, and never `--full-auto`. `--full-auto` is
 * `-a on-request --sandbox workspace-write`, and `on-request` lets the MODEL decide when to ask a
 * human who is not there. The single flag beats the pair because the pair has a half-state: an
 * edit dropping `-a never` while keeping the sandbox flag silently restores approval prompts. The
 * containment story is the disposable Orca worktree, the same one that justifies bypassPermissions.
 *
 * codex, measured 2026-07-27 against codex-cli 0.145.0 on Windows 11: `-c windows.sandbox="unelevated"`
 * is load-bearing. The default Windows sandbox is elevated, its setup needs Administrator rights,
 * and the first run paints "Setting up sandbox... Input disabled until setup completes" forever in
 * a PTY with no desktop to raise UAC on. The unelevated fallback needs no elevation, and the worker
 * never executes inside it anyway because the bypass flag runs commands unsandboxed.
 *
 * codex auth: CODEX_HOME DECIDES WHETHER A WORKER IS LOGGED IN, and it is the first thing to check
 * before believing any auth verdict. Orca redirects codex's home for the terminals it spawns, so on
 * this machine the real credential is
 * C:\\Users\\thoma\\AppData\\Roaming\\orca\\codex-runtime-home\\home\\auth.json, not ~/.codex/auth.json.
 * Measured 2026-07-27: a shell that had lost CODEX_HOME reported "Not logged in" while the same CLI
 * in an Orca terminal in the same worktree reported "Logged in using ChatGPT" minutes earlier. Never
 * diagnose codex auth from an ad hoc shell without printing CODEX_HOME first.
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
const REPAIR_CONTRACT_MARKER = "## Repair worker contract (injected by tools/launch-worker.mjs)"
const WORKER_CONTRACT = `

---

${WORKER_CONTRACT_MARKER}

These clauses come from the launcher, not from whoever composed the work order above. Where they
conflict with anything above, these win.

1. **Never ask a question.** Decide from the unchanged ticket, the Sol execution brief, and the
   repository rules. If the ticket and brief disagree, stop with a consistency failure. Do not
   invent a missing requirement or fixture.
2. **Implement only the approved work order.** Luna is the headless implementation worker. Do not
   plan the DAG, mutate Linear, open or edit a pull request, publish a review, push any branch, or
   merge. Do not run a coordinator or review loop. A returned review finding may be repaired only
   when Sol passes its stable identifier and evidence back in the existing worktree.
3. **A blocked criterion is explicit.** Finish every safe in-scope part, record an unmet criterion
   with evidence in the local completion report, and leave the worktree for Sol. Do not claim that
   a gate or external interface was verified when it was not.
4. **Escalate instead of guessing.** Escalate when a returned finding is disputed, when you are
   blocked on a decision reserved for Sol or Thomas, or when two consecutive repair cycles fail on
   the same finding. Do not try that finding a third time.
5. **Your job ends at a local implementation handoff.** Run the relevant local gates, commit through
   normal hooks with a concise ORB message, verify \`git show --stat HEAD\`, and report the exact
   commit and outcomes. Do not claim that the branch was pushed, that a pull request is ready, or
   that review is clear.
6. **Never arm a detached background monitor, watcher or wait loop that outlives this contract.** A foreground blocking wait is permitted.
7. **Never merge any PR, never push any branch, never use \`--no-verify\`, never edit a gate
   baseline, never run \`gh pr merge --admin\`, never directly call \`PUT /repos/{owner}/{repo}/pulls/{number}/merge\`, and never directly call the GraphQL \`mergePullRequest\` mutation.**
8. **Stage explicitly.** Commit only the paths you edited yourself. \`git add -A\`, \`git add .\`
   and \`git commit -a\` are forbidden. A worktree is a shared filesystem that sibling workers,
   dev servers and tooling all write into, so a blanket stage turns any of their runtime
   artifacts into your diff.
9. **Verify before handoff.** Run \`git show --stat HEAD\` and confirm every path in it is one
   you meant to change. A path you cannot explain is a defect to resolve, never a file to hand off.
10. **Never write into another worktree.** A live sibling worktree is another worker's working
    tree, and a file you leave there can land in that worker's PR. If your proof genuinely needs
    a second worktree, create a disposable one for it and remove it afterwards.
11. **Own implementation sequencing directly.** Luna owns the implementation work in this
    worktree and decides its internal file and test sequencing. Do not create planning, review, or
    coordinator roles or extra agents; Sol owns those boundaries and the worker implements the
    approved brief directly.
12. **Do not create planning or approval loops.** Sol owns the DAG and the substantive pull request
    boundary. This worker consumes the brief and implements it.
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

const repairWorkerContract = (finding) => `

---

${REPAIR_CONTRACT_MARKER}

This is a repair launch in the existing worktree, owned by the same implementation worker. Repair
only the stable finding \`${finding}\` from the current review. Inspect the current diff and the
finding evidence before changing code. Run the affected gates, commit the repair, and hand the
changed local head back to Sol. Do not invoke or authorize \`tools/launch-pr-review.mjs\`, push,
edit the pull request, merge, change Linear, or modify files outside this finding's repair. Stage
only paths you edited. Never ask a question; record blocked work locally and report it.
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
let lifecycleLock = null

const releaseConcurrencyReservation = () => {
  if (!lifecycleLock) return
  const held = lifecycleLock
  lifecycleLock = null
  try {
    held.release()
  } catch (error) {
    console.error(`could not release worktree lifecycle lock ${held.path}: ${error.message}`)
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
     * which is `npm install` here). Worktree removal can fail with "Failed to physically stop
     * every PTY" while one of those is still alive, so stop them first and give a slow one a
     * second chance before giving up. Measured on this branch: the first rollback attempt
     * failed exactly this way with npm install still running. Removal stays ordinary because a
     * forced removal can follow a Windows junction into the linked checkout target.
     */
    spawnSync(ORCA, ["terminal", "stop", "--worktree", selector, "--json"], { encoding: "utf8" })
    let removal = spawnSync(ORCA, ["worktree", "rm", "--worktree", selector, "--json"], { encoding: "utf8" })
    if (removal.status !== 0) {
      pause(5000)
      spawnSync(ORCA, ["terminal", "stop", "--worktree", selector, "--json"], { encoding: "utf8" })
      removal = spawnSync(ORCA, ["worktree", "rm", "--worktree", selector, "--json"], { encoding: "utf8" })
    }
    if (removal.status !== 0) {
      console.error(`could not remove the worktree: ${(removal.stdout || removal.stderr || "").trim().slice(0, 300)}`)
      console.error(`remove it by hand before relaunching: orca worktree rm --worktree ${selector}`)
    } else {
      cleanupConfirmed = true
    }
    for (const branchToDrop of [contractBranch, orcaBranch].filter(Boolean)) {
      const stillThere = spawnSync("git", ["-C", rollbackRepo, "rev-parse", "--verify", "--quiet", `refs/heads/${branchToDrop}`], { encoding: "utf8" })
      if (stillThere.status !== 0) continue
    const dropped = spawnSync("git", ["-C", rollbackRepo, "branch", "--delete", branchToDrop], { encoding: "utf8" })
      if (dropped.status !== 0) console.error(`left the branch ${branchToDrop} behind: ${(dropped.stderr || "").trim().slice(0, 200)}`)
    }
  }
  if (budgetReservation && !reservationMaySpend && cleanupConfirmed) {
    const cancelled = cancelAutomationBudgetReservation(budgetReservation)
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
let workerLaunchLedger
try {
  workerLaunchLedger = workerLaunchLedgerPath()
} catch (error) {
  fail(2, error.message)
}

const acquireConcurrencyReservation = (repoPath) => {
  const gitCommonDirectory = resolve(
    repoPath,
    git(["-C", repoPath, "rev-parse", "--git-common-dir"]),
  )
  try {
    lifecycleLock = acquireWorktreeLifecycleLock(gitCommonDirectory)
  } catch (error) {
    fail(error.message.includes("timed out") ? 1 : 3, error.message)
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
const findingArg = argOf("--finding")
const repairMode = process.argv.includes("--repair")
const dryRun = process.argv.includes("--dry-run")

/**
 * wave-plan.mjs has FOUR selectors and they do not all partition the same way. --project, --label
 * and --all report each wave's collisions over the whole wave; --issues filters every wave down to
 * the requested identifiers before collisions are computed, so a collision with a ticket the
 * caller did not name never appears. Consuming that mode here would buy parallelism with silence,
 * which is the defect this whole ticket exists to remove, so it is refused by name rather than
 * quietly accepted.
 */
const WAVE_SELECTORS = [
  ["--wave-all", "--all", false],
  ["--wave-label", "--label", true],
  ["--wave-project", "--project", true],
]
if (process.argv.includes("--wave-issues")) {
  fail(
    2,
    "--wave-issues is refused: wave-plan.mjs's --issues mode filters every wave down to the identifiers you named BEFORE computing collisions, so a collision with a ticket outside that set is invisible and two tickets sharing a path could launch together. Use --wave-all, --wave-label or --wave-project.",
  )
}
const selectedWaveSelectors = WAVE_SELECTORS.filter(([flag]) => process.argv.includes(flag))
if (selectedWaveSelectors.length > 1) {
  fail(2, `wave mode takes exactly one selector; got ${selectedWaveSelectors.map(([flag]) => flag).join(", ")}`)
}

if (selectedWaveSelectors.length === 1) {
  const [waveFlag, planFlag, takesValue] = selectedWaveSelectors[0]
  const selectorValue = takesValue ? argOf(waveFlag) : null
  if (takesValue && (!selectorValue || selectorValue.startsWith("--"))) fail(2, `${waveFlag} requires a value`)
  if (issue || promptFileArg || existingWorktreeArg) {
    fail(2, "wave mode selects its own tickets; --issue, --prompt-file and --existing-worktree are per-ticket flags and cannot be combined with it")
  }
  const promptDirectoryArgument = argOf("--prompt-dir")
  if (!promptDirectoryArgument) {
    fail(2, "wave mode requires --prompt-dir naming a directory that holds one <ORB-N>.md work order per ticket")
  }
  const promptDirectory = resolve(promptDirectoryArgument)

  let waveConfig
  try {
    waveConfig = readOrchestratorConfig(undefined, baseBranch)
  } catch (error) {
    fail(2, error.message)
  }
  const waveCap = maxParallelOverride === null ? waveConfig.maxParallelWorktrees : Number(maxParallelOverride)

  const planArgs = [planFlag, ...(selectorValue === null ? [] : [selectorValue]), "--json"]
  const planned = spawnSync(process.execPath, [fileURLToPath(new URL("./wave-plan.mjs", import.meta.url)), ...planArgs], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
  if (planned.error) fail(3, `could not run wave-plan.mjs: ${planned.error.message}`)
  if (planned.status !== 0) {
    fail(3, `wave-plan.mjs ${planArgs.join(" ")} exited ${planned.status}: ${(planned.stderr || planned.stdout || "").trim().slice(0, 600)}`)
  }
  let wavePlan
  try {
    wavePlan = JSON.parse(planned.stdout)
  } catch {
    fail(3, `wave-plan.mjs ${planArgs.join(" ")} returned unparseable JSON: ${planned.stdout.slice(0, 400)}`)
  }
  const firstWave = wavePlan.waves?.[0]
  const candidates = (wavePlan.launchable ?? []).filter((identifier) =>
    (firstWave?.issues ?? []).some((waveIssue) => waveIssue.identifier === identifier),
  )
  if (candidates.length === 0) {
    fail(1, `wave-plan.mjs ${planArgs.join(" ")} reports nothing launchable in wave 1; there is no wave to launch`)
  }

  const waveIssueOf = new Map((firstWave.issues ?? []).map((waveIssue) => [waveIssue.identifier, waveIssue]))
  const repoLabelOf = (identifier) =>
    (waveIssueOf.get(identifier)?.labels ?? []).find((label) => label.startsWith("repo:")) ?? null
  const unknownAffected = new Set(firstWave.unknownAffected ?? [])
  const pairKey = (left, right) => [left, right].sort().join("|")
  const reportedCollisions = new Map((firstWave.collisions ?? []).map(({ a, b, files }) => [pairKey(a, b), files]))
  /**
   * Disjointness is a property of a repo, not of raw path strings: wave-plan already skips a pair
   * whose repo:* labels differ, and the same rule has to hold for the silence case or two tickets
   * in different repositories would serialise for naming nothing.
   */
  const sharedPathsBetween = (left, right) => {
    const reported = reportedCollisions.get(pairKey(left, right))
    if (reported?.length) return reported
    if (!unknownAffected.has(left) && !unknownAffected.has(right)) return null
    const leftRepo = repoLabelOf(left)
    const rightRepo = repoLabelOf(right)
    if (leftRepo && rightRepo && leftRepo !== rightRepo) return null
    return ["(no parseable path list in Affected modules / files)"]
  }

  const concurrent = []
  const serialised = []
  for (const identifier of candidates) {
    const conflict = concurrent
      .map((other) => ({ other, files: sharedPathsBetween(identifier, other) }))
      .find(({ files }) => files)
    if (conflict) {
      serialised.push({ issue: identifier, behind: conflict.other, sharedPaths: conflict.files })
      continue
    }
    if (concurrent.length >= waveCap) {
      serialised.push({ issue: identifier, behind: null, sharedPaths: [], reason: `maxParallelWorktrees cap ${waveCap}` })
      continue
    }
    concurrent.push(identifier)
  }

  const missingPrompts = concurrent.filter((identifier) => !existsSync(join(promptDirectory, `${identifier}.md`)))
  if (missingPrompts.length) {
    fail(2, `no work order for ${missingPrompts.join(", ")} in ${promptDirectory}; a wave with a missing prompt refuses rather than skipping a ticket`)
  }

  const passthrough = [
    ...(argOf("--base-branch") === null ? [] : ["--base-branch", baseBranch]),
    ...(argOf("--branch-prefix") === null ? [] : ["--branch-prefix", branchPrefix]),
    ...(argOf("--workspace-status") === null ? [] : ["--workspace-status", workspaceStatus]),
    ...(maxParallelOverride === null ? [] : ["--max-parallel-worktrees", maxParallelOverride]),
    ...(dryRun ? ["--dry-run"] : []),
  ]
  const launches = []
  let waveStatus = 0
  for (const identifier of concurrent) {
    if (waveStatus !== 0) {
      serialised.push({ issue: identifier, behind: null, sharedPaths: [], reason: `an earlier launch in this wave exited ${waveStatus}` })
      continue
    }
    const launch = spawnSync(
      process.execPath,
      [fileURLToPath(import.meta.url), "--issue", identifier, "--prompt-file", join(promptDirectory, `${identifier}.md`), ...passthrough],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    )
    const status = launch.error ? 3 : launch.status
    launches.push({ issue: identifier, status, stderr: (launch.stderr || launch.error?.message || "").trim().split("\n").slice(-3).join("\n") })
    if (status !== 0) waveStatus = status
  }

  console.log(
    JSON.stringify(
      {
        mode: "wave",
        selector: { flag: waveFlag, value: selectorValue },
        wave: firstWave.wave,
        maxParallelWorktrees: waveCap,
        launchable: candidates,
        concurrent,
        serialised,
        launches,
        ...(dryRun ? { dryRun: true } : {}),
      },
      null,
      2,
    ),
  )
  process.exit(waveStatus)
}

if (argOf("--prompt-dir") !== null) fail(2, "--prompt-dir belongs to wave mode; a single-ticket launch takes --prompt-file")
if (!issue || !/^[A-Z]+-\d+$/.test(issue)) fail(2, `${USAGE}\n\n--issue must be a Linear identifier such as ORB-75`)
if (!promptFileArg) fail(2, `${USAGE}\n\n--prompt-file is required`)
if (repairMode && !existingWorktreeArg) fail(2, "--repair requires --existing-worktree")
if (repairMode && findingArg === null) fail(2, "--repair requires --finding with the stable finding identity")
if (repairMode && !/^finding-[0-9a-f]{32}$/.test(findingArg ?? "")) fail(2, "--repair --finding must be a stable finding identity such as finding-0123456789abcdef0123456789abcdef")
if (branchPrefix !== "feature" && branchPrefix !== "fix") fail(2, "--branch-prefix must be feature or fix")
if (maxParallelOverride !== null && !/^[1-9]\d*$/.test(maxParallelOverride)) {
  fail(2, "--max-parallel-worktrees must be a positive integer")
}

const promptFile = resolve(promptFileArg)
if (!existsSync(promptFile)) fail(2, `prompt file not found: ${promptFile}`)
if (statSync(promptFile).size === 0) fail(2, `prompt file is empty: ${promptFile}`)

/**
 * Clause 4's counter, read before anything is created and BEFORE the account is charged, because
 * the failure it prevents is spending a cycle at all. It lives in a durable ledger rather than in
 * the prompt: the clause used to be a sentence in a file every relaunch rewrote, so the count it
 * describes reset to zero on every launch and "escalate on the third" never happened once.
 */
let findingStrikeLedger = null
let findingStrikes = null
if (findingArg !== null) {
  if (findingArg.trim().length === 0 || findingArg.startsWith("--")) fail(2, "--finding requires a non-empty identifier")
  try {
    findingStrikeLedger = strikeLedgerPath()
    findingStrikes = strikeCount({ ledgerPath: findingStrikeLedger, scope: FINDING_SCOPE, issue, key: findingArg })
  } catch (error) {
    fail(2, error.message)
  }
  if (findingStrikes >= STRIKES_BEFORE_ESCALATION) {
    fail(
      5,
      `${issue} finding "${findingArg}" has already failed ${findingStrikes} cycles, which is worker-contract clause 4's limit of ${STRIKES_BEFORE_ESCALATION}. A third attempt is the unbounded retry that clause forbids; escalate the finding with your reasoning instead. Strike ledger: ${findingStrikeLedger}`,
    )
  }
}

let config
try {
  config = readOrchestratorConfig(undefined, baseBranch)
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
/** The only figure that refuses a launch while the provider reading is available, so a worker
 * that omits it must not launch at all: a fuse whose authoritative input can be silently left out
 * is the same defect as a gate that reports green over a condition it never checked. */
if (
  !Number.isFinite(automationBudget.accountUsedPercentCeiling) ||
  automationBudget.accountUsedPercentCeiling < 0 ||
  automationBudget.accountUsedPercentCeiling > 100
) {
  fail(2, `.claude/orchestrator.json worker "${engineName}" must declare automationBudget.accountUsedPercentCeiling as a number from 0 to 100; it is the only figure that refuses a launch while the provider reading is available`)
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
/**
 * The one instruction that closes this launch's reservation. It must reach the HEADLESS pointer as
 * well as the interactive one: headless is the default engine shape, and a headless worker that is
 * never told to record leaves a pending row nothing ever closes, which is the stranded reservation
 * measured in the production ledger on 2026-07-30.
 */
const measurementCommand = `node "${budgetToolPath}" record --identity "${invocationIdentity}" --engine ${engineName} --tier ${budgetTier} --started-at "${invocationStartedAt}" --ended-at <provider-observation-time> --input-tokens <provider-raw-input-tokens> --cached-input-tokens <provider-cache-read-input-tokens> --output-tokens <provider-output-tokens> --ledger "${automationLedgerPath}"`
const measurementInstruction = `Before finishing, replace this launch's pending ledger record with an append carrying provider-authoritative token totals: ${measurementCommand}. --input-tokens is the provider's RAW input count and --cached-input-tokens is its cache-read share of that same count; the fuse charges the difference, so omit --cached-input-tokens only when the provider reports no cache read at all. Add --provider-estimated-cost only when the provider supplies its own estimate. If the token measurement is unavailable, leave the pending record unchanged so the next launch fails closed; never record zero or infer tokens from account usedPercent.`
const workerPointer = (worktreePath, branch) => `Read ${promptFile} and execute it in full. That file is your complete work order for ${issue}. You are on branch ${branch} in ${worktreePath}. Do not summarise the file back to me, start the work now. ${measurementInstruction}`
/**
 * Resolve a bare command the way the platform's launcher does, so the result is a real file rather
 * than a name Node will refuse. On win32 only PATHEXT candidates count: npm also drops an
 * extensionless shell script next to the shim, and Windows cannot execute it.
 */
const resolveOnPath = (command) => {
  if (command.includes("/") || command.includes("\\")) {
    return existsSync(command) ? resolve(command) : null
  }
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""]
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = join(directory, `${command}${extension}`)
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
    }
  }
  return null
}

/**
 * Node has refused to spawn a `.cmd` or `.bat` without `shell: true` since the CVE-2024-27980 fix,
 * and `spawn("codex.cmd", ...)` throws EINVAL before codex ever starts. `shell: true` avoids the
 * errno but hands the worker pointer to cmd.exe to re-parse, and that pointer is a positional
 * prompt carrying spaces and quotes, which is the ORB-88 mangled-prompt class. So resolve the npm
 * shim to the script it execs and spawn Node on that: the argv array survives with no shell in the
 * path. Verified against the installed codex.cmd, whose last line is
 * `"%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*`. A shim that does not match
 * that shape fails closed here rather than falling through to a spawn known to throw.
 */
const NPM_SHIM_SCRIPT = /"%dp0%\\+([^"]+\.js)"/i
const headlessInvocation = () => {
  const resolved = resolveOnPath(engine.command)
  if (!resolved) {
    fail(3, `could not resolve the ${engineName} worker executable "${engine.command}" on PATH; a headless launch has no shell to resolve it later`)
  }
  if (!/\.(?:cmd|bat)$/i.test(resolved)) return { executable: resolved, scriptArgs: [] }
  let shim
  try {
    shim = readFileSync(resolved, "utf8")
  } catch (error) {
    fail(3, `could not read the ${engineName} shim ${resolved}: ${error.message}`)
  }
  const match = shim.match(NPM_SHIM_SCRIPT)
  if (!match) {
    fail(3, `${resolved} is a ${extname(resolved)} shim that tools/launch-worker.mjs cannot run headlessly: Node refuses to spawn it without a shell, and no "%dp0%...js" script line was found to spawn directly. Point .claude/orchestrator.json at the executable or the script itself.`)
  }
  const script = resolve(dirname(resolved), match[1])
  if (!existsSync(script)) {
    fail(3, `${resolved} names the script ${script}, which does not exist`)
  }
  return { executable: process.execPath, scriptArgs: [script] }
}

const startHeadlessWorker = (worktreePath, branch, launchMode) => {
  const { executable, scriptArgs } = headlessInvocation()
  const launchId = randomUUID()
  const startedAt = new Date().toISOString()
  const invocation = { command: engine.command, args: [...engineArgs] }
  const { publicKey, privateKey } = generateKeyPairSync("ed25519")
  const authorityPublicKey = publicKey.export({ format: "der", type: "spki" }).toString("base64")
  const workerPath = resolve(worktreePath)
  const startingHead = launchMode === "repair" ? git(["-C", worktreePath, "rev-parse", "HEAD"]) : null
  const gitDirectory = resolve(worktreePath, git(["-C", worktreePath, "rev-parse", "--git-dir"]))
  const markerPath = join(gitDirectory, "orbit-worker-pids.jsonl")
  const supervisorPath = resolve(dirname(fileURLToPath(import.meta.url)), "worker-supervisor.mjs")
  const payloadPath = join(tmpdir(), `orbit-worker-${launchId}.json`)
  const startGate = join(tmpdir(), `orbit-worker-${launchId}.ready`)
  const pointer = workerPointer(worktreePath, branch)
  const timeoutMs = WORKER_TIMEOUTS_MS[launchMode]
  if (!Number.isSafeInteger(timeoutMs)) fail(2, `unknown headless worker launch mode: ${launchMode}`)
  const deadlineAt = new Date(Date.now() + timeoutMs).toISOString()
  const supervisorEnvelope = {
    version: WORKER_SUPERVISOR_ENVELOPE_VERSION,
    payloadPath,
    executable,
    scriptArgs,
    engineArgs,
    pointer,
    worktreePath: workerPath,
    markerPath,
    ledgerPath: workerLaunchLedger,
    startGate,
    timeoutMs,
    deadlineAt,
  }
  let launchRecord = {
    version: 1,
    launchId,
    issue,
    worktreePath: workerPath,
    pid: 0,
    startedAt,
    launchMode,
    ...(startingHead ? { startingHead } : {}),
    engine: engineName,
    invocation,
    branch,
    launcherPid: process.pid,
    issuedAt: new Date().toISOString(),
    completionAttestation: {
      algorithm: "ed25519",
      publicKey: authorityPublicKey,
    },
    supervisorEnvelope,
  }
  const writeSupervisorPayload = () => writeFileSync(
    payloadPath,
    JSON.stringify({
      payloadPath,
      launchRecord,
      executable,
      scriptArgs,
      engineArgs,
      pointer,
      worktreePath: workerPath,
      markerPath,
      ledgerPath: workerLaunchLedger,
      startGate,
      timeoutMs,
      deadlineAt,
    }),
    { encoding: "utf8", mode: 0o600 },
  )
  writeSupervisorPayload()
  let child
  const workerEnvironment = minimalChildEnvironment("supervisor", {
    ...process.env,
    ORBIT_LAUNCH_WORKER: "1",
    ORBIT_WORKER_LAUNCH_ID: launchId,
  })
  try {
    child = spawn(process.execPath, [supervisorPath, payloadPath], {
      cwd: workerPath,
      detached: true,
      stdio: ["ignore", "ignore", "ignore", "pipe"],
      windowsHide: true,
      env: workerEnvironment,
    })
  } catch (error) {
    unlinkSync(payloadPath)
    fail(3, `could not start headless ${engineName} supervisor: ${error.message}`)
  }
  if (!child.pid) {
    unlinkSync(payloadPath)
    fail(3, `could not start headless ${engineName} supervisor`)
  }
  launchRecord.pid = child.pid
  // The supervisor waits for the gate, so rewrite its payload after the spawn supplies the
  // authoritative supervisor PID. A completion row carrying pid 0 is not a launch receipt and
  // would make the central delivery ledger reject the worker that actually ran.
  launchRecord = signWorkerLaunchRecord(launchRecord, privateKey)
  writeSupervisorPayload()
  child.stdio[3].end(privateKey.export({ format: "pem", type: "pkcs8" }))
  try {
    recordWorkerLaunch(launchRecord, workerLaunchLedger, authorityPublicKey)
    appendFileSync(markerPath, `${JSON.stringify(launchRecord)}\n`)
    if (budgetReservation) claimBudgetReservation(budgetReservation, projectedTokens, child.pid)
    writeFileSync(startGate, "ready\n", { encoding: "utf8", mode: 0o600 })
  } catch (error) {
    try {
      process.kill(child.pid)
    } catch {
      /* the child may have exited before provenance failed */
    }
    try {
      unlinkSync(payloadPath)
      unlinkSync(startGate)
    } catch {
      /* cleanup must not mask the provenance failure */
    }
    fail(3, `could not issue worker launch provenance: ${error.message}`)
  }
  child.unref()
  return { workerPid: child.pid, launchId, authorityPublicKey }
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

/**
 * Held by BOTH launch modes, for different caps that race the same way. A new worktree races
 * `maxParallelWorktrees` against `orca worktree list`; an additional slice races
 * `maxSlicesPerWorker` against `orbit-worker-pids.jsonl`, which it reads, counts, checks, and
 * only then appends to after spawning. Two slice launches into one worktree is the mode's whole
 * purpose, so unlocked they both read before either appends and both pass a cap of one.
 */
if (!dryRun) acquireConcurrencyReservation(repoPath)
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
const contractMarker = repairMode
  ? REPAIR_CONTRACT_MARKER
  : existingWorktreeArg
    ? SLICE_CONTRACT_MARKER
    : WORKER_CONTRACT_MARKER
const originalPrompt = readFileSync(promptFile, "utf8")
const hasInjectedContract = [WORKER_CONTRACT_MARKER, SLICE_CONTRACT_MARKER, REPAIR_CONTRACT_MARKER]
  .some((marker) => originalPrompt.includes(marker))
const contractText = repairMode ? repairWorkerContract(findingArg) : existingWorktreeArg ? SLICE_CONTRACT : WORKER_CONTRACT
const workerContract = repairMode
  ? originalPrompt.includes(contractText.trim()) ? "already present" : hasInjectedContract ? "replaced" : "appended"
  : originalPrompt.includes(contractMarker) ? "already present" : "appended"

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
    accountCeilingPercent: automationBudget.accountUsedPercentCeiling,
    projectedTokens,
    ledgerPath: automationLedgerPath,
  },
  promptFile,
  workerContract,
  labels,
  ...(findingArg === null
    ? {}
    : { finding: { id: findingArg, strikes: findingStrikes, limit: STRIKES_BEFORE_ESCALATION, ledgerPath: findingStrikeLedger } }),
}

if (dryRun) {
  console.log(JSON.stringify({ ...plan, dryRun: true }, null, 2))
  process.exit(0)
}

try {
  budgetReservation = reserveAutomationBudget({
    engineName,
    identity: invocationIdentity,
    tier: budgetTier,
    startedAt: invocationStartedAt,
    warningTokens: automationBudget.warningTokens,
    tokenBudget: automationBudget.tokenBudget,
    accountCeilingPercent: automationBudget.accountUsedPercentCeiling,
    projectedTokens,
    ledgerPath: automationLedgerPath,
    quotaToolPath,
    budgetToolPath,
  })
} catch (error) {
  fail(error.exitCode ?? 3, error.message)
}

/** Recorded once the launch is committed (the fuse passed and the account is charged), so a run
 * the budget refused never burns one of clause 4's two cycles. */
if (findingArg !== null) {
  try {
    recordStrike({ ledgerPath: findingStrikeLedger, scope: FINDING_SCOPE, issue, key: findingArg })
  } catch (error) {
    fail(3, error.message)
  }
}

/** Before anything is created, so a launch that fails later still leaves the work order complete
 * for the relaunch. A dry run resolves this decision but writes nothing. */
if (workerContract === "appended") {
  try {
    appendFileSync(promptFile, contractText, "utf8")
  } catch (error) {
    fail(3, `could not append the worker contract to ${promptFile}: ${error.message}`)
  }
} else if (workerContract === "replaced") {
  try {
    let prompt = readFileSync(promptFile, "utf8")
    for (const marker of [WORKER_CONTRACT_MARKER, SLICE_CONTRACT_MARKER, REPAIR_CONTRACT_MARKER]) {
      const markerIndex = prompt.indexOf(marker)
      if (markerIndex === -1) continue
      const separatorIndex = prompt.lastIndexOf("\n---\n", markerIndex)
      prompt = prompt.slice(0, separatorIndex === -1 ? markerIndex : separatorIndex).trimEnd()
    }
    writeFileSync(promptFile, `${prompt}${contractText}`, "utf8")
  } catch (error) {
    fail(3, `could not replace the worker contract in ${promptFile}: ${error.message}`)
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
  let issuedLaunches
  try {
    issuedLaunches = readWorkerLaunchRecords(workerLaunchLedger)
  } catch (error) {
    fail(3, error.message)
  }
  const activeSlices = existsSync(marker)
    ? readFileSync(marker, "utf8").trim().split(/\r?\n/).filter(Boolean).flatMap((line) => {
      try {
        const row = JSON.parse(line)
        return row.issue === issue && issuedLaunches.some((issued) => sameWorkerLaunch(row, issued)) && Number.isInteger(row.pid) && (() => { try { process.kill(row.pid, 0); return true } catch (error) { return error.code !== "ESRCH" } })() ? [row] : []
      } catch {
        return []
      }
    })
    : []
  if (activeSlices.length >= maxSlicesPerWorker) fail(1, `maxSlicesPerWorker cap ${maxSlicesPerWorker} reached for ${issue}`)
  const branch = git(["-C", worktreePath, "rev-parse", "--abbrev-ref", "HEAD"])
  const launch = startHeadlessWorker(worktreePath, branch, repairMode ? "repair" : "existing-worktree")
  /** Only once the new PID is in the marker file, so the next launcher counts this slice. */
  releaseConcurrencyReservation()
  rollback = null
  console.log(JSON.stringify({ ...plan, launchMode: repairMode ? "repair" : "existing-worktree", worktreePath, worktreeSelector: `path:${worktreePath}`, branch, workerPid: launch.workerPid, launchId: launch.launchId, authorityPublicKey: launch.authorityPublicKey }, null, 2))
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
  const launch = startHeadlessWorker(worktreePath, branch, "new-worktree")
  orca(["worktree", "set", "--worktree", worktreeSelector, "--comment", comment, "--workspace-status", workspaceStatus])
  releaseConcurrencyReservation()
  rollback = null
  console.log(JSON.stringify({ ...plan, launchMode: "new-worktree", worktreePath, worktreeSelector, workerPid: launch.workerPid, launchId: launch.launchId, authorityPublicKey: launch.authorityPublicKey }, null, 2))
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

const pointer = `Read ${promptFile} and execute it in full. That file is your complete work order for ${issue}: the ticket body verbatim, then the finishing contract. You are on branch ${branch} in ${worktreePath}. Do not summarise the file back to me, start the work now. ${measurementInstruction}`

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
