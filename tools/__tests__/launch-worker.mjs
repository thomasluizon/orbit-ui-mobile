import { spawnSync } from "node:child_process"
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { delimiter, join, resolve } from "node:path"

import { TOOLS_DIR, REPO_ROOT, T, root, stage, orcaEnv, orchestratorConfig, run, runAsync, check, DEFAULT_AUTOMATION_BUDGET, CLAUDE_MODELS, CODEX_MODELS, INTERACTIVE_WORKER, INTERACTIVE_CODEX, stageLaunchWorker, launchWorktreeStub, linearIssueStub, WORKER_CONTRACT_MARKER, FULL_SURFACE_POLL, NO_DRAFT_PULL_REQUEST_CLAUSE, REQUIRED_CONTRACT_CLAUSES, contractClauseBlocks, missingContractClauses, TRUST_SCREENS, stageCheckout, budgetRecord, runTrustScreen } from "./_harness.mjs"

const trustScreenCases = () => {
  for (const [engineName, { screens }] of Object.entries(TRUST_SCREENS)) {
    screens.forEach(({ label, tail }, index) => {
      const name = `launch-worker.mjs: answers ${engineName}'s trust screen on ${label}, from the terminal text alone`
      const outcome = runTrustScreen(`trust-${engineName}-${index}`, engineName, tail)
      if (!outcome) {
        T(name, false, "could not stage a git checkout for the launch; git is required for this case")
        return
      }
      /** node resolves the shim's argv[0] to an absolute path, so the subcommand is its basename. */
      const send = outcome.calls.find((argv) => argv[0].split(/[\\/]/).pop() === "terminal" && argv[1] === "send")
      const sent = send ? send[send.indexOf("--text") + 1] : null
      T(
        name,
        Boolean(send) && sent === outcome.answer && send.includes("--enter"),
        `with no blockedReason the screen text is the ONLY signal, so this is the path a drifted regex breaks.\n     expected a terminal send of ${JSON.stringify(outcome.answer)} + Enter, got ${send ? JSON.stringify(send) : "no terminal send at all"}\n     launcher stderr: ${(outcome.result.stderr || "").trim().split("\n").slice(0, 5).join("\n     ")}`,
      )
    })
  }
}

/**
 * The empty composer a swallowed pointer leaves behind, verbatim from the 2026-07-27 ORB-88
 * launch: the worker alive, idle, holding no work, with orca having reported the send accepted.
 */
const EMPTY_COMPOSER = ' (logo)   Claude Code v2.1.220\n> Try "how do I log an error?"\n  Opus 5@high  ctx [..........] --%'

/**
 * Drives a launch to the prompt pointer, with `terminal read` answering `tails` in order:
 * "delivered" is a tail carrying the pointer as a user line, anything else is a tail without it.
 * Returns the orca calls, because the assertion that matters is how many sends really happened.
 */
const runPointerLaunch = (label, tails, { repainting = false } = {}) => {
  const staged = stageLaunchWorker(label, INTERACTIVE_WORKER)
  const checkout = stageCheckout(staged.base)
  if (!checkout) return null
  const log = join(staged.base, "orca-calls.log")
  const ledger = join(staged.base, "automation-budget.jsonl")
  const promptFile = stage(`${label}-prompt.md`, "the ticket body verbatim\n")
  const painted = `> Read ${promptFile} and execute it in full. That file is your complete work order for ORB-75:`
  const plan = [
    ...linearIssueStub(["repo:ui"]),
    { match: "worktree create", stdout: JSON.stringify({ ok: true, result: { worktree: { path: checkout, branch: "refs/heads/thomasluizon/orb-75" } } }) },
    { match: "terminal create", stdout: JSON.stringify({ ok: true, result: { terminal: { handle: "t1" } } }) },
    { match: "terminal wait", stdout: JSON.stringify({ ok: true, result: { wait: { satisfied: true } } }) },
    /**
     * Frozen lastOutputAt is a settled TUI, so the launch sends instead of waiting out a repaint.
     *
     * `repainting` has to be a SEQUENCE, not a fresh stamp on every call: the tui-idle wait
     * before the pointer uses the same repaint check, so a terminal that paints from the first
     * call never gets past it and the pointer branch stays unreached. Measured: the first version
     * of this stub died at "never reached tui-idle after 6 waits". The first two calls are the
     * idle wait's own before/after pair and must be equal; every call after them is stamped
     * fresh, which is a TUI that starts painting once the pointer has been sent.
     */
    repainting
      ? {
          match: "terminal show",
          sequence: [
            JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1785168487585 } } }),
            JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1785168487585 } } }),
            '{"ok":true,"result":{"terminal":{"lastOutputAt":__NOW__}}}',
          ],
        }
      : { match: "terminal show", stdout: JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1785168487585 } } }) },
    {
      match: "terminal read",
      sequence: tails.map((tail) => JSON.stringify({ ok: true, result: { terminal: { tail: [tail === "delivered" ? painted : tail] } } })),
    },
    { match: "terminal send", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "terminal switch", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "worktree set", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "terminal stop", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "worktree rm", stdout: JSON.stringify({ ok: true, result: {} }) },
  ]
  const result = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile], {
    path: staged.path,
    env: {
      ...orcaEnv(plan),
      ORBIT_AUTOMATION_BUDGET_LEDGER: ledger,
      ORBIT_ORCA_LOG: log,
    },
  })
  const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []
  const sends = calls.filter((argv) => argv[0].split(/[\\/]/).pop() === "terminal" && argv[1] === "send").length
  const records = existsSync(ledger)
    ? readFileSync(ledger, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    : []
  return { staged, result, calls, sends, records }
}

/**
 * The ORB-88 defect: `terminal send` succeeded, the launcher exited 0 printing a full plan, and
 * the pointer never became a user turn. An exit code may not assert a state it never verified,
 * so these three cases pin the read-back: it lands, it lands on a retry, it never lands.
 */
const pointerDeliveryCases = () => {
  const first = runPointerLaunch("pointer-first", ["delivered"])
  if (!first) {
    T("launch-worker.mjs: a delivered pointer exits 0", false, "could not stage a git checkout for the launch; git is required for this case")
    return
  }
  T(
    "launch-worker.mjs: a pointer that lands on the first send exits 0 with the plan unchanged",
    first.result.status === 0 && /"pointerSends": 1/.test(first.result.stdout) && /"terminal": "t1"/.test(first.result.stdout) && /"branch": "feature\/orb-75-/.test(first.result.stdout),
    `exit ${first.result.status}, ${first.sends} send(s)\n     stdout: ${first.result.stdout.trim().slice(0, 300)}\n     stderr: ${first.result.stderr.trim().split("\n").slice(-3).join("\n     ")}`,
  )
  T("launch-worker.mjs: a pointer that lands is sent exactly once", first.sends === 1, `sent ${first.sends} time(s)`)
  const firstSend = first.calls.find((argv) => argv[0].split(/[\\/]/).pop() === "terminal" && argv[1] === "send")
  const firstPointer = firstSend?.[firstSend.indexOf("--text") + 1] ?? ""
  const firstPlan = first.result.status === 0 ? JSON.parse(first.result.stdout) : null
  T(
    "launch-worker.mjs: the worker receives its launcher-owned authoritative completion-record command",
    firstPointer.includes(`node "${join(first.staged.base, "tools", "automation-budget.mjs")}" record`) &&
      !firstPointer.includes("node tools/automation-budget.mjs record") &&
      /automation-budget\.mjs" record[\s\S]*--identity "ORB-75:[^"]+"[\s\S]*--input-tokens <provider-raw-input-tokens> --cached-input-tokens <provider-cache-read-input-tokens>[\s\S]*--ledger "[^"]+"[\s\S]*the fuse charges the difference[\s\S]*never record zero or infer tokens from account usedPercent/.test(firstPointer) &&
      firstPointer.includes(`--ledger "${firstPlan?.automationBudget?.ledgerPath}"`),
    firstPointer,
  )
  const firstRecord = first.records[0]
  T(
    "launch-worker.mjs: an invocation reserves a pending token record before worktree mutation",
    first.records.length === 1 &&
      /^ORB-75:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(firstRecord?.identity ?? "") &&
      firstRecord?.engine === "claude" &&
      firstRecord?.tier === "routine" &&
      !Object.hasOwn(firstRecord ?? {}, "inputTokens") &&
      !Object.hasOwn(firstRecord ?? {}, "outputTokens") &&
      firstRecord?.accountContext?.scope === "account" &&
      firstRecord?.accountContext?.attributed === false &&
      firstRecord?.accountContext?.usedPercent === 10,
    JSON.stringify(first.records),
  )

  const second = runPointerLaunch("pointer-second", [EMPTY_COMPOSER, "delivered"])
  T(
    "launch-worker.mjs: a pointer the composer swallowed is re-sent, and the plan reports how many sends it took",
    second.result.status === 0 && /"pointerSends": 2/.test(second.result.stdout) && second.sends === 2,
    `exit ${second.result.status}, ${second.sends} send(s)\n     stdout: ${second.result.stdout.trim().slice(0, 300)}\n     stderr: ${second.result.stderr.trim().split("\n").slice(-3).join("\n     ")}`,
  )

  const never = runPointerLaunch("pointer-never", [EMPTY_COMPOSER])
  T(
    "launch-worker.mjs: a pointer that never becomes a user turn is a launch FAILURE, not a success",
    never.result.status === 1 && /never showed the prompt pointer/.test(never.result.stderr),
    `exit ${never.result.status}, expected 1\n     stderr: ${never.result.stderr.trim().split("\n").slice(-4).join("\n     ")}`,
  )
  T("launch-worker.mjs: the undelivered launch is bounded, not retried forever", never.sends === 3, `sent ${never.sends} time(s), expected the 3-send bound`)
  T(
    "launch-worker.mjs: any accepted send keeps its reservation pending even after a quiet read-back",
    never.records.length === 1 &&
      never.records[0]?.cancelled !== true,
    JSON.stringify(never.records),
  )

  /**
   * The branch every other case misses, because they all freeze lastOutputAt: a TUI that keeps
   * repainting past the settle window. The first shape of this loop settled ONCE and then fell
   * through to another send, which queues into a running turn and cuts it short (ORB-75). The
   * assertion is the send COUNT: one send, then settle, then give up. Never a second send.
   */
  const busyThroughout = runPointerLaunch("pointer-busy", [EMPTY_COMPOSER], { repainting: true })
  T(
    "launch-worker.mjs: a TUI that keeps painting is never sent to a second time",
    busyThroughout.sends === 1,
    `sent ${busyThroughout.sends} time(s); a re-send into a repainting TUI is the ORB-75 corruption\n     stderr: ${busyThroughout.result.stderr.trim().split("\n").slice(-4).join("\n     ")}`,
  )
  T(
    "launch-worker.mjs: a TUI that never goes quiet is a launch failure naming that cause",
    busyThroughout.result.status === 1 && /never went quiet/.test(busyThroughout.result.stderr),
    `exit ${busyThroughout.result.status}\n     stderr: ${busyThroughout.result.stderr.trim().split("\n").slice(-4).join("\n     ")}`,
  )
  T(
    "launch-worker.mjs: an ambiguous prompt send keeps its reservation pending",
    busyThroughout.records.length === 1 &&
      busyThroughout.records[0]?.cancelled !== true,
    JSON.stringify(busyThroughout.records),
  )
  T(
    "launch-worker.mjs: the undelivered launch leaves no orphaned worktree",
    never.calls.some((argv) => argv[0].split(/[\\/]/).pop() === "worktree" && argv[1] === "rm"),
    `no worktree rm in: ${never.calls.map((argv) => argv.slice(0, 2).join(" ")).join(" | ")}`,
  )
}

const runTerminalCreateLaunch = (label, terminalCreateSequence) => {
  const staged = stageLaunchWorker(label, INTERACTIVE_WORKER)
  const checkout = join(staged.base, "checkout")
  const git = (args) => spawnSync("git", ["-C", staged.repoPath, ...args], { encoding: "utf8" })
  for (const args of [
    ["init", "-q", "--initial-branch=main"],
    ["config", "user.email", "gate@orbit.test"],
    ["config", "user.name", "Orbit Gate"],
    ["commit", "-q", "--allow-empty", "-m", "base"],
    ["worktree", "add", "-q", "-b", "thomasluizon/orb-75", checkout],
  ]) {
    if (git(args).status !== 0) return null
  }

  const log = join(staged.base, "orca-calls.log")
  const promptFile = stage(`${label}-prompt.md`, "the ticket body verbatim\n")
  const painted = `> Read ${promptFile} and execute it in full. That file is your complete work order for ORB-75:`
  const plan = [
    ...linearIssueStub(["repo:ui"]),
    { match: "worktree create", stdout: JSON.stringify({ ok: true, result: { worktree: { path: checkout, branch: "refs/heads/thomasluizon/orb-75" } } }) },
    { match: "terminal create", sequence: terminalCreateSequence },
    { match: "terminal wait", stdout: JSON.stringify({ ok: true, result: { wait: { satisfied: true } } }) },
    { match: "terminal show", stdout: JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1785168487585 } } }) },
    { match: "terminal read", stdout: JSON.stringify({ ok: true, result: { terminal: { tail: [painted] } } }) },
    { match: "terminal send", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "terminal switch", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "worktree set", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "terminal stop", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "worktree rm", stdout: JSON.stringify({ ok: true, result: {} }), removePath: checkout, pruneRepo: staged.repoPath },
  ]
  const result = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile], {
    path: staged.path,
    env: {
      ...orcaEnv(plan),
      ORBIT_AUTOMATION_BUDGET_LEDGER: join(staged.base, "automation-budget.jsonl"),
      ORBIT_ORCA_LOG: log,
    },
  })
  const calls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []
  const count = (first, second) => calls.filter((argv) => argv[0].split(/[\\/]/).pop() === first && argv[1] === second).length
  const branches = git(["branch", "--list", "feature/orb-75-prove-the-harness-gate", "thomasluizon/orb-75"]).stdout.trim()
  return { result, terminalCreates: count("terminal", "create"), worktreeCreates: count("worktree", "create"), checkout, branches }
}

const terminalCreateRetryCases = () => {
  const timeout = { stdout: JSON.stringify({ ok: false, error: { code: "timeout", message: "Terminal creation timed out" } }), exit: 1 }
  const success = { stdout: JSON.stringify({ ok: true, result: { terminal: { handle: "t1" } } }), exit: 0 }
  const recovered = runTerminalCreateLaunch("terminal-create-recovers", [timeout, success])
  if (!recovered) {
    T("launch-worker.mjs: terminal create retries can be staged", false, "could not stage a linked git worktree")
    return
  }
  T(
    "launch-worker.mjs: a terminal create timeout retries inside the same worktree and then succeeds",
    recovered.result.status === 0 && recovered.terminalCreates === 2 && recovered.worktreeCreates === 1 && /"terminal": "t1"/.test(recovered.result.stdout),
    `exit ${recovered.result.status}, terminal creates ${recovered.terminalCreates}, worktree creates ${recovered.worktreeCreates}\n     ${recovered.result.stderr.trim().split("\n").slice(-5).join("\n     ")}`,
  )

  const exhausted = runTerminalCreateLaunch("terminal-create-exhausted", [timeout, timeout, timeout])
  T(
    "launch-worker.mjs: terminal create timeout retries are bounded and preserve the timeout cause",
    exhausted.result.status === 3 && exhausted.terminalCreates === 3 && /failed after 3 attempts: Terminal creation timed out/.test(exhausted.result.stderr),
    `exit ${exhausted.result.status}, terminal creates ${exhausted.terminalCreates}\n     ${exhausted.result.stderr.trim().split("\n").slice(-6).join("\n     ")}`,
  )
  T(
    "launch-worker.mjs: exhausting terminal create retries rolls back the one worktree and both branches",
    exhausted.worktreeCreates === 1 && !existsSync(exhausted.checkout) && exhausted.branches === "",
    `worktree creates ${exhausted.worktreeCreates}, checkout exists ${existsSync(exhausted.checkout)}, branches ${JSON.stringify(exhausted.branches)}`,
  )
}

const launchConcurrencyCases = async (promptFile) => {
  const atCap = stageLaunchWorker("concurrency-at-cap", INTERACTIVE_WORKER, "claude", 2)
  const firstPath = join(atCap.base, "workspaces", "orb-1")
  const secondPath = join(atCap.base, "workspaces", "orb-2")
  const refusalLog = stage("concurrency-at-cap.log", "")
  const refusal = run(
    "launch-worker.mjs",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    {
      path: atCap.path,
      env: {
        ...orcaEnv(linearIssueStub(
          ["repo:ui"],
          [launchWorktreeStub(firstPath), launchWorktreeStub(secondPath)],
        )),
        ORBIT_ORCA_LOG: refusalLog,
      },
    },
  )
  T(
    "launch-worker.mjs: refuses at the configured cap with the cap, current count, and every occupying path",
    refusal.status === 1
      && /maxParallelWorktrees cap 2/.test(refusal.stderr)
      && /current count 2/.test(refusal.stderr)
      && refusal.stderr.includes(firstPath)
      && refusal.stderr.includes(secondPath),
    `exit ${refusal.status}\n     ${refusal.stderr.trim()}`,
  )
  const refusalCalls = readFileSync(refusalLog, "utf8").split("\n").filter(Boolean).map(JSON.parse)
  T(
    "launch-worker.mjs: cap refusal happens before any worktree or branch creation",
    !refusalCalls.some((argv) => argv.join(" ").includes("worktree create")),
    refusalCalls.map((argv) => argv.join(" ")).join("\n"),
  )

  const boundary = stageLaunchWorker("concurrency-boundary", INTERACTIVE_WORKER, "claude", 2)
  const boundaryResult = check(
    "launch-worker.mjs",
    "allows a dry run with one slot remaining",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 0, stdout: /"maxParallelWorktrees": 2[\s\S]*"occupiedWorktrees": 1/ },
    {
      path: boundary.path,
      env: orcaEnv(linearIssueStub(
        ["repo:ui"],
        [launchWorktreeStub(join(boundary.base, "workspaces", "orb-1"))],
      )),
    },
  )
  T(
    "launch-worker.mjs: below-cap dry run creates nothing",
    boundaryResult.status === 0 && !existsSync(join(boundary.base, "workspaces")),
    `exit ${boundaryResult.status}; workspaces directory exists: ${existsSync(join(boundary.base, "workspaces"))}`,
  )

  const serial = stageLaunchWorker("concurrency-serial", INTERACTIVE_WORKER, "claude", 1)
  const serialPath = join(serial.base, "workspaces", "orb-1")
  const serialLog = stage("concurrency-serial.log", "")
  const [serialIssue] = linearIssueStub(["repo:ui"])
  const serialPlan = [
    serialIssue,
    {
      match: "worktree list",
      sequence: [
        JSON.stringify({ ok: true, result: { worktrees: [] } }),
        JSON.stringify({ ok: true, result: { worktrees: [launchWorktreeStub(serialPath)] } }),
      ],
    },
  ]
  const serialOptions = {
    path: serial.path,
    env: { ...orcaEnv(serialPlan), ORBIT_ORCA_LOG: serialLog },
  }
  const firstSerial = run(
    "launch-worker.mjs",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    serialOptions,
  )
  const secondSerial = run(
    "launch-worker.mjs",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    serialOptions,
  )
  T(
    "launch-worker.mjs: cap 1 accepts the first launch and refuses the second concurrent launch",
    firstSerial.status === 0
      && secondSerial.status === 1
      && /maxParallelWorktrees cap 1/.test(secondSerial.stderr)
      && /current count 1/.test(secondSerial.stderr)
      && secondSerial.stderr.includes(serialPath),
    `first exit ${firstSerial.status}; second exit ${secondSerial.status}\n     ${secondSerial.stderr.trim()}`,
  )

  const mainOnly = stageLaunchWorker("concurrency-main-only", INTERACTIVE_WORKER, "claude", 1)
  check(
    "launch-worker.mjs",
    "does not count the repository main worktree toward cap 1",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 0, stdout: /"occupiedWorktrees": 0/ },
    {
      path: mainOnly.path,
      env: orcaEnv(linearIssueStub(
        ["repo:ui"],
        [launchWorktreeStub(mainOnly.repoPath, true)],
      )),
    },
  )

  const archivedOnly = stageLaunchWorker("concurrency-archived-only", INTERACTIVE_WORKER, "claude", 1)
  check(
    "launch-worker.mjs",
    "does not count an archived child worktree toward cap 1",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 0, stdout: /"occupiedWorktrees": 0/ },
    {
      path: archivedOnly.path,
      env: orcaEnv(linearIssueStub(
        ["repo:ui"],
        [{ ...launchWorktreeStub(join(archivedOnly.base, "workspaces", "archived")), isArchived: true }],
      )),
    },
  )

  const gone = stageLaunchWorker("concurrency-orca-authority", INTERACTIVE_WORKER, "claude", 1)
  const residuePath = join(gone.base, "workspaces", "removed-but-on-disk")
  mkdirSync(residuePath, { recursive: true })
  check(
    "launch-worker.mjs",
    "does not count disk residue that Orca no longer reports",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 0, stdout: /"occupiedWorktrees": 0/ },
    { path: gone.path, env: orcaEnv(linearIssueStub(["repo:ui"], [])) },
  )

  const override = stageLaunchWorker("concurrency-override", INTERACTIVE_WORKER, "claude", 8)
  check(
    "launch-worker.mjs",
    "uses the invocation cap override for serial orchestration",
    [
      "--issue", "ORB-75",
      "--prompt-file", promptFile,
      "--max-parallel-worktrees", "1",
      "--dry-run",
    ],
    { status: 1, stderr: /maxParallelWorktrees cap 1[\s\S]*current count 1/ },
    {
      path: override.path,
      env: orcaEnv(linearIssueStub(
        ["repo:ui"],
        [launchWorktreeStub(join(override.base, "workspaces", "orb-1"))],
      )),
    },
  )
  check(
    "launch-worker.mjs",
    "refuses a non-positive invocation cap",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--max-parallel-worktrees", "0", "--dry-run"],
    { status: 2, stderr: /positive integer/ },
    { path: override.path },
  )

  const invalidConfig = stageLaunchWorker("concurrency-invalid-config", INTERACTIVE_WORKER, "claude", 0)
  check(
    "launch-worker.mjs",
    "refuses a non-positive configured cap",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /maxParallelWorktrees must be a positive integer/ },
    { path: invalidConfig.path },
  )

  const reservationRecoveryCase = (label, lockBody, lockAgeMs) => {
    const fixture = stageLaunchWorker(`concurrency-reservation-${label}`, INTERACTIVE_WORKER, "claude", 1)
    const checkout = stageCheckout(fixture.base)
    if (!checkout) {
      T(`launch-worker.mjs: reclaims a ${label} reservation`, false, "could not stage a linked Git worktree")
      return
    }
    const lockPath = join(fixture.repoPath, ".git", "orbit-launch-worker.lock")
    writeFileSync(lockPath, lockBody)
    if (lockAgeMs) {
      const staleAt = new Date(Date.now() - lockAgeMs)
      utimesSync(lockPath, staleAt, staleAt)
    }
    const result = run(
      "launch-worker.mjs",
      ["--issue", "ORB-75", "--prompt-file", promptFile],
      {
        path: fixture.path,
        env: orcaEnv(linearIssueStub(["repo:ui"], [launchWorktreeStub(checkout)])),
      },
    )
    T(
      `launch-worker.mjs: reclaims a ${label} reservation`,
      result.status === 1
        && /maxParallelWorktrees cap 1[\s\S]*current count 1/.test(result.stderr)
        && !existsSync(lockPath),
      `exit ${result.status}; lock exists: ${existsSync(lockPath)}\n     ${result.stderr.trim()}`,
    )
  }
  reservationRecoveryCase(
    "dead-owner",
    JSON.stringify({ pid: 2147483647, startedAt: Date.now() - 1000 }),
    0,
  )
  reservationRecoveryCase("stale-corrupt", "{not-json", 10000)

  const timeout = stageLaunchWorker("concurrency-reservation-timeout", INTERACTIVE_WORKER, "claude", 1)
  const timeoutCheckout = stageCheckout(timeout.base)
  if (!timeoutCheckout) {
    T("launch-worker.mjs: times out on a live reservation owner", false, "could not stage a linked Git worktree")
  } else {
    const timeoutLock = join(timeout.repoPath, ".git", "orbit-launch-worker.lock")
    writeFileSync(timeoutLock, JSON.stringify({ pid: process.pid, startedAt: Date.now() }))
    const timeoutSource = readFileSync(timeout.path, "utf8")
    const productionDeadline = "const deadline = Date.now() + 5 * 60 * 1000"
    if (!timeoutSource.includes(productionDeadline)) {
      T(
        "launch-worker.mjs: stages a bounded reservation timeout",
        false,
        "production reservation deadline expression drifted",
      )
    } else {
      writeFileSync(
        timeout.path,
        timeoutSource.replace(productionDeadline, "const deadline = Date.now() + 200"),
      )
      const timeoutLog = stage("concurrency-reservation-timeout.log", "")
      const timeoutResult = run(
        "launch-worker.mjs",
        ["--issue", "ORB-75", "--prompt-file", promptFile],
        {
          path: timeout.path,
          env: {
            ...orcaEnv(linearIssueStub(["repo:ui"], [])),
            ORBIT_ORCA_LOG: timeoutLog,
          },
        },
      )
      const timeoutCalls = readFileSync(timeoutLog, "utf8").split("\n").filter(Boolean).map(JSON.parse)
      T(
        "launch-worker.mjs: times out on a live reservation owner before listing or creating worktrees",
        timeoutResult.status === 1
          && /timed out waiting for another launch reservation/.test(timeoutResult.stderr)
          && !timeoutCalls.some((argv) => argv.join(" ").includes("worktree list"))
          && !timeoutCalls.some((argv) => argv.join(" ").includes("worktree create")),
        `exit ${timeoutResult.status}\n     ${timeoutResult.stderr.trim()}\n     ${timeoutCalls.map((argv) => argv.join(" ")).join("\n     ")}`,
      )
    }
    rmSync(timeoutLock, { force: true })
  }

  const concurrent = stageLaunchWorker("concurrency-atomic-last-slot", INTERACTIVE_WORKER, "claude", 1)
  const concurrentCheckout = stageCheckout(concurrent.base)
  if (!concurrentCheckout) {
    T(
      "launch-worker.mjs: concurrent launch reservation can be staged",
      false,
      "could not stage a linked Git worktree",
    )
    return
  }
  const concurrentLog = stage("concurrency-atomic-last-slot.log", "")
  const concurrentTimingLog = stage("concurrency-atomic-last-slot-timing.log", "")
  const concurrentPrompt = stage("concurrency-atomic-last-slot-prompt.md", "the ticket body verbatim\n")
  const painted = `> Read ${concurrentPrompt} and execute it in full. That file is your complete work order for ORB-75:`
  const [concurrentIssue] = linearIssueStub(["repo:ui"])
  const concurrentPlan = [
    concurrentIssue,
    {
      match: "worktree list",
      sequence: [
        JSON.stringify({ ok: true, result: { worktrees: [] } }),
        JSON.stringify({ ok: true, result: { worktrees: [launchWorktreeStub(concurrentCheckout)] } }),
      ],
    },
    {
      match: "worktree create",
      delayMs: 750,
      stdout: JSON.stringify({
        ok: true,
        result: { worktree: { path: concurrentCheckout, branch: "refs/heads/thomasluizon/orb-75" } },
      }),
    },
    { match: "terminal create", stdout: JSON.stringify({ ok: true, result: { terminal: { handle: "t1" } } }) },
    { match: "terminal wait", stdout: JSON.stringify({ ok: true, result: { wait: { satisfied: true } } }) },
    { match: "terminal show", stdout: JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1785168487585 } } }) },
    { match: "terminal read", stdout: JSON.stringify({ ok: true, result: { terminal: { tail: [painted] } } }) },
    { match: "terminal send", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "terminal switch", stdout: JSON.stringify({ ok: true, result: {} }) },
    { match: "worktree set", stdout: JSON.stringify({ ok: true, result: {} }) },
  ]
  const concurrentOptions = {
    path: concurrent.path,
    env: {
      ...orcaEnv(concurrentPlan),
      ORBIT_AUTOMATION_BUDGET_LEDGER: join(concurrent.base, "automation-budget.jsonl"),
      ORBIT_ORCA_LOG: concurrentLog,
      ORBIT_ORCA_TIMING_LOG: concurrentTimingLog,
    },
  }
  const concurrentArguments = ["--issue", "ORB-75", "--prompt-file", concurrentPrompt]
  const concurrentResults = await Promise.all([
    runAsync("launch-worker.mjs", concurrentArguments, concurrentOptions),
    runAsync("launch-worker.mjs", concurrentArguments, concurrentOptions),
  ])
  const concurrentCalls = readFileSync(concurrentLog, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse)
  const createCalls = concurrentCalls.filter(
    (argv) => argv[0].split(/[\\/]/).pop() === "worktree" && argv[1] === "create",
  )
  const statuses = concurrentResults.map((result) => result.status).sort()
  const concurrentRefusal = concurrentResults.find((result) => result.status === 1)
  T(
    "launch-worker.mjs: two concurrent launchers cannot both claim the last slot",
    statuses.length === 2
      && statuses[0] === 0
      && statuses[1] === 1
      && createCalls.length === 1
      && /maxParallelWorktrees cap 1[\s\S]*current count 1/.test(concurrentRefusal?.stderr ?? ""),
    `statuses ${JSON.stringify(statuses)}, worktree creates ${createCalls.length}\n     ${concurrentResults.map((result) => result.stderr.trim()).join("\n     ")}`,
  )
}

/**
 * A4. The clause assertions used to be `pattern.test(launcherSource)` over the whole
 * launch-worker.mjs file as a string, so nothing they claimed was ever driven. Demonstrated:
 * clause 3 could be deleted from the injected contract entirely and parked in a dead comment
 * while every assertion passed. Second defect: clause 3's terminator recurs in clause 5, so
 * `[\s\S]*` let two tokens twenty lines apart satisfy one clause.
 *
 * These cases drive the path the clauses govern instead. A real launch appends the contract to
 * a real prompt file (a dry run returns before the append, so this one runs for real and fails
 * at `worktree create`, which the launcher reaches only AFTER appending), and every pattern is
 * matched inside its own clause block of the artifact the worker would actually read.
 */
const contractClauseCases = () => {
  const staged = stageLaunchWorker("contract-clauses", INTERACTIVE_WORKER)
  const promptFile = stage("contract-clauses-prompt.md", "the ticket body verbatim\n")
  const result = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile], {
    path: staged.path,
    env: {
      ...orcaEnv([
        ...linearIssueStub(["repo:ui"]),
        { match: "worktree create", stdout: JSON.stringify({ ok: false, error: { code: "fixture", message: "stop after the contract append" } }), exit: 1 },
      ]),
      ORBIT_AUTOMATION_BUDGET_LEDGER: join(staged.base, "automation-budget.jsonl"),
    },
  })
  const promptBody = readFileSync(promptFile, "utf8")
  const markerIndex = promptBody.indexOf(WORKER_CONTRACT_MARKER)
  T(
    "launch-worker.mjs: a real launch appends the standing worker contract to the prompt file",
    markerIndex !== -1,
    `exit ${result.status}; the prompt the worker would read carries no contract marker\n     ${result.stderr.trim()}`,
  )
  const injected = markerIndex === -1 ? "" : promptBody.slice(markerIndex)
  const blocks = contractClauseBlocks(injected)
  const clauseNumbers = Object.keys(blocks).map(Number).sort((left, right) => left - right)
  T(
    "launch-worker.mjs: the injected contract carries a contiguous run of numbered clauses",
    clauseNumbers.length > 0 && clauseNumbers.every((number, index) => number === index + 1),
    `the appended contract split into clauses ${JSON.stringify(clauseNumbers)}; a gap means a clause was deleted or renumbered without updating REQUIRED_CONTRACT_CLAUSES`,
  )
  const missing = missingContractClauses(injected)
  for (const [name, { clause }] of Object.entries(REQUIRED_CONTRACT_CLAUSES)) {
    T(
      `launch-worker.mjs: injected clause ${clause} enforces ${name}`,
      !missing.includes(name),
      `clause ${clause} of the contract the launcher appended no longer matches its pattern. A worker without this clause repeats the failure it was written for; restore the clause rather than relaxing this check.\n     clause ${clause} as injected: ${JSON.stringify((blocks[clause] ?? "").slice(0, 240))}`,
    )
  }

  // Gate proof 1: the demonstrated hole. Deleting a clause from what the worker reads must
  // fail, and must name the clauses it carried. Source-string matching could not see this at
  // all, because the deleted text stayed in the file as a comment.
  const clauseThreeDeleted = injected.replace(blocks[3], "3. **Own the automated review cycle.** (see the comment in the launcher)\n")
  const deletedVerdict = missingContractClauses(clauseThreeDeleted)
  T(
    "launch-worker.mjs: deleting clause 3 from the injected contract fails, naming its clauses",
    deletedVerdict.includes("owning its automated review cycle") &&
      deletedVerdict.includes("polling every review activity surface") &&
      deletedVerdict.includes("leaving human threads unresolved"),
    `a gutted clause 3 reported ${JSON.stringify(deletedVerdict)}`,
  )

  // Gate proof 2: cross-clause spanning. Clause 3's terminator is written a second time in
  // clause 5, so an unscoped `[\s\S]*` can be satisfied by two tokens twenty lines apart.
  // Measured on the shipped contract: the phrase occurs twice, but clause 5's copy is
  // line-wrapped ("approved with zero\n   unresolved threads"), so the hazard is LATENT rather
  // than live today. The fixture plants an unwrapped copy in clause 5 to exercise it, and the
  // second assertion pins that whole-text matching really would accept what this refuses;
  // without it, the first assertion could pass for the wrong reason.
  const terminator = "approved with zero unresolved threads"
  const spanning = injected
    .replace(blocks[3], () => blocks[3].replace(terminator, () => "settled"))
    .replace(blocks[5], () => `${blocks[5].trimEnd()} The PR must end ${terminator}.\n`)
  const spanningPattern = REQUIRED_CONTRACT_CLAUSES["owning its automated review cycle"].pattern
  T(
    "launch-worker.mjs: a clause satisfied only by a phrase from a later clause is refused",
    missingContractClauses(spanning).includes("owning its automated review cycle"),
    "clause 3 lost its terminator and the block-scoped check still passed",
  )
  T(
    "launch-worker.mjs: the same contract passes whole-text matching, which is the defect",
    spanningPattern.test(spanning),
    "whole-text matching rejected the spanning fixture too, so this proof demonstrates nothing; rebuild the fixture",
  )

  /**
   * F2. The plan goes to the reviewer BEFORE the code exists, because changing a plan is free and
   * changing a merged design costs rounds. Asserted the same way PR3a converted the other eleven:
   * inside clause 12's own block of the artifact the launcher really appended, never against the
   * launcher file as a string.
   */
  const approachFirst = /Post the approach before you write the code[\s\S]*pull request comment[\s\S]*files it will land in[\s\S]*Only then start writing/
  T(
    "launch-worker.mjs: injected clause 12 makes the worker post its approach before writing code",
    approachFirst.test(blocks[12] ?? ""),
    `clause 12 as injected: ${JSON.stringify((blocks[12] ?? "").slice(0, 320))}`,
  )
  T(
    "launch-worker.mjs: gutting clause 12 in what the worker reads fails, so a text-only clause cannot pass",
    !approachFirst.test((blocks[12] ?? "").replace("Only then start writing", "carry on")),
    "clause 12 still matched after its terminator was removed, so this assertion proves nothing",
  )
  T(
    "launch-worker.mjs: the injected contract carries clause 12, so it was appended and not merely written",
    Object.hasOwn(blocks, 12) && injected.indexOf(blocks[12]) > injected.indexOf(blocks[11] ?? ""),
    `clauses present: ${Object.keys(blocks).join(", ")}`,
  )
}

/**
 * C3. wave-plan.mjs already computes the launchable set and reports collisions, and it refuses to
 * act; the launch belongs here. These cases drive the REAL wave-plan as a child with orca stubbed,
 * so the two halves are proved against each other rather than against a canned plan that agrees
 * with whatever the launcher expects. Children run --dry-run: no worktree, no worker, no clock.
 */
const stageWaveLauncher = (label, maxParallelWorktrees = 8) => {
  const staged = stageLaunchWorker(label, INTERACTIVE_WORKER, "claude", maxParallelWorktrees)
  cpSync(join(TOOLS_DIR, "wave-plan.mjs"), join(staged.base, "tools", "wave-plan.mjs"))
  /** A wave spans repositories, so the fixture has to as well: without an api repo the launcher
   * would refuse the api ticket for the wrong reason and the within-a-repo case would prove
   * nothing about disjointness. */
  const configPath = join(staged.base, ".claude", "orchestrator.json")
  const config = JSON.parse(readFileSync(configPath, "utf8"))
  config.repos.api = join(staged.base, "repos", "api")
  mkdirSync(config.repos.api, { recursive: true })
  writeFileSync(configPath, JSON.stringify(config))
  return staged
}

const waveTicketStub = ({ identifier, files, labels = ["repo:ui"] }) => ({
  match: `linear issue ${identifier}`,
  stdout: JSON.stringify({
    ok: true,
    result: {
      issue: {
        identifier,
        title: `wave ticket ${identifier.toLowerCase()}`,
        description: `## Affected modules / files\n\n${files.map((file) => `\`${file}\``).join("\n")}\n`,
        state: { name: "Todo", type: "unstarted" },
        labels: labels.map((name) => ({ name })),
      },
      relations: [],
    },
  }),
})

const runWave = (label, tickets, waveArguments, { maxParallelWorktrees = 8, withoutPromptFor = [] } = {}) => {
  const staged = stageWaveLauncher(label, maxParallelWorktrees)
  const promptDirectory = join(staged.base, "prompts")
  mkdirSync(promptDirectory, { recursive: true })
  for (const { identifier } of tickets) {
    if (withoutPromptFor.includes(identifier)) continue
    writeFileSync(join(promptDirectory, `${identifier}.md`), "the ticket body verbatim\n")
  }
  const result = run("launch-worker.mjs", [...waveArguments, "--prompt-dir", promptDirectory, "--dry-run"], {
    path: staged.path,
    env: orcaEnv([
      { match: "linear list-issues", stdout: JSON.stringify({ ok: true, result: { issues: tickets.map(({ identifier }) => ({ identifier })) } }) },
      ...tickets.map(waveTicketStub),
      { match: "worktree list", stdout: JSON.stringify({ ok: true, result: { worktrees: [] } }) },
    ]),
  })
  let plan = null
  try {
    plan = JSON.parse(result.stdout)
  } catch {
    plan = null
  }
  return { result, plan }
}

const DISJOINT_PAIR = [
  { identifier: "ORB-301", files: ["tools/launch-worker.mjs"] },
  { identifier: "ORB-302", files: ["tools/wave-plan.mjs"] },
]
const COLLIDING_PAIR = [
  { identifier: "ORB-301", files: ["tools/launch-worker.mjs", "tools/README.md"] },
  { identifier: "ORB-302", files: ["tools/wave-plan.mjs", "tools/README.md"] },
]

const waveLaunchCases = () => {
  const disjoint = runWave("wave-disjoint", DISJOINT_PAIR, ["--wave-label", "harness"])
  T(
    "launch-worker.mjs: a wave of pairwise disjoint tickets launches every one of them together",
    disjoint.result.status === 0 &&
      JSON.stringify(disjoint.plan?.concurrent) === JSON.stringify(["ORB-301", "ORB-302"]) &&
      disjoint.plan?.serialised.length === 0 &&
      disjoint.plan?.launches.length === 2 &&
      disjoint.plan.launches.every((launch) => launch.status === 0),
    `exit ${disjoint.result.status}\n     ${(disjoint.result.stdout || disjoint.result.stderr).trim().slice(0, 700)}`,
  )

  const colliding = runWave("wave-colliding", COLLIDING_PAIR, ["--wave-label", "harness"])
  T(
    "launch-worker.mjs: two tickets sharing a path are never launched concurrently",
    colliding.result.status === 0 &&
      JSON.stringify(colliding.plan?.concurrent) === JSON.stringify(["ORB-301"]) &&
      colliding.plan?.serialised.length === 1 &&
      colliding.plan.serialised[0].issue === "ORB-302" &&
      colliding.plan.serialised[0].behind === "ORB-301" &&
      JSON.stringify(colliding.plan.serialised[0].sharedPaths) === JSON.stringify(["tools/README.md"]) &&
      colliding.plan.launches.length === 1,
    `exit ${colliding.result.status}\n     ${(colliding.result.stdout || colliding.result.stderr).trim().slice(0, 700)}`,
  )

  /** Silence must not buy parallelism: an unparseable path list collides with its whole repo. */
  const silent = runWave("wave-silent", [DISJOINT_PAIR[0], { identifier: "ORB-302", files: [] }], ["--wave-label", "harness"])
  T(
    "launch-worker.mjs: a ticket with no parseable path list collides with everything in its repo",
    silent.result.status === 0 &&
      JSON.stringify(silent.plan?.concurrent) === JSON.stringify(["ORB-301"]) &&
      silent.plan?.serialised[0]?.issue === "ORB-302" &&
      /no parseable path list/.test(silent.plan.serialised[0].sharedPaths.join(" ")),
    `exit ${silent.result.status}\n     ${(silent.result.stdout || silent.result.stderr).trim().slice(0, 700)}`,
  )

  /** ...but only its own repo: wave-plan already skips a pair whose repo:* labels differ, and the
   * silence rule has to be worded the same way or two repositories would serialise for nothing. */
  const crossRepo = runWave(
    "wave-cross-repo",
    [DISJOINT_PAIR[0], { identifier: "ORB-302", files: [], labels: ["repo:api"] }],
    ["--wave-label", "harness"],
  )
  T(
    "launch-worker.mjs: disjointness is evaluated WITHIN a repo, so a silent api ticket still runs",
    crossRepo.result.status === 0 &&
      JSON.stringify(crossRepo.plan?.concurrent) === JSON.stringify(["ORB-301", "ORB-302"]) &&
      crossRepo.plan.serialised.length === 0 &&
      crossRepo.plan.launches.every((launch) => launch.status === 0),
    `exit ${crossRepo.result.status}\n     ${(crossRepo.result.stdout || crossRepo.result.stderr).trim().slice(0, 700)}`,
  )

  const capped = runWave("wave-capped", DISJOINT_PAIR, ["--wave-label", "harness"], { maxParallelWorktrees: 1 })
  T(
    "launch-worker.mjs: wave mode respects maxParallelWorktrees and defers the excess with its reason",
    capped.result.status === 0 &&
      JSON.stringify(capped.plan?.concurrent) === JSON.stringify(["ORB-301"]) &&
      capped.plan?.serialised[0]?.reason === "maxParallelWorktrees cap 1",
    `exit ${capped.result.status}\n     ${(capped.result.stdout || capped.result.stderr).trim().slice(0, 700)}`,
  )

  /**
   * The four selectors do not all partition the same way, so the three the launcher accepts are
   * proved to agree on one wave, and the fourth is refused by name. In --issues mode wave-plan
   * filters every wave down to the requested identifiers BEFORE computing collisions, so a
   * collision with a ticket the caller did not name is invisible.
   */
  const partitions = ["--wave-all", "--wave-label", "--wave-project"].map((flag) => {
    const outcome = runWave(`wave-selector-${flag.slice(2)}`, COLLIDING_PAIR, flag === "--wave-all" ? [flag] : [flag, "harness"])
    return { flag, concurrent: outcome.plan?.concurrent, serialised: outcome.plan?.serialised?.map(({ issue, behind }) => [issue, behind]), status: outcome.result.status }
  })
  T(
    "launch-worker.mjs: the three accepted wave selectors partition one wave identically",
    partitions.every((partition) => partition.status === 0) &&
      new Set(partitions.map((partition) => JSON.stringify([partition.concurrent, partition.serialised]))).size === 1 &&
      JSON.stringify(partitions[0].concurrent) === JSON.stringify(["ORB-301"]),
    JSON.stringify(partitions, null, 2),
  )
  check(
    "launch-worker.mjs",
    "refuses wave-plan's --issues mode, which partitions differently, rather than accepting it",
    ["--wave-issues", "ORB-301,ORB-302", "--prompt-dir", root, "--dry-run"],
    { status: 2, stderr: /--wave-issues is refused[\s\S]*filters every wave down[\s\S]*BEFORE computing collisions/ },
    { path: stageWaveLauncher("wave-issues-refused").path },
  )

  const missingPrompt = runWave("wave-missing-prompt", DISJOINT_PAIR, ["--wave-label", "harness"], { withoutPromptFor: ["ORB-302"] })
  T(
    "launch-worker.mjs: a wave with a missing work order refuses rather than skipping that ticket",
    missingPrompt.result.status === 2 && /no work order for ORB-302/.test(missingPrompt.result.stderr),
    `exit ${missingPrompt.result.status}\n     ${missingPrompt.result.stderr.trim()}`,
  )

  const waveStage = stageWaveLauncher("wave-usage")
  check(
    "launch-worker.mjs",
    "wave mode requires a prompt directory",
    ["--wave-all", "--dry-run"],
    { status: 2, stderr: /wave mode requires --prompt-dir/ },
    { path: waveStage.path },
  )
  check(
    "launch-worker.mjs",
    "wave mode takes exactly one selector",
    ["--wave-all", "--wave-label", "harness", "--prompt-dir", root, "--dry-run"],
    { status: 2, stderr: /wave mode takes exactly one selector; got --wave-all, --wave-label/ },
    { path: waveStage.path },
  )
  check(
    "launch-worker.mjs",
    "wave mode cannot be combined with the per-ticket flags",
    ["--wave-all", "--issue", "ORB-75", "--prompt-dir", root, "--dry-run"],
    { status: 2, stderr: /wave mode selects its own tickets/ },
    { path: waveStage.path },
  )
  check(
    "launch-worker.mjs",
    "a single-ticket launch refuses the wave prompt directory",
    ["--issue", "ORB-75", "--prompt-dir", root, "--dry-run"],
    { status: 2, stderr: /--prompt-dir belongs to wave mode/ },
    { path: waveStage.path },
  )
}

/**
 * D3. The launcher used to read .claude/orchestrator.json out of whatever working tree it sat in.
 * Measured: the ticket that changed the codex default merged, the very next launch still started a
 * worker on the old, more expensive model, and nothing anywhere said so, because that tree was 26
 * commits behind on an already squash-merged branch. So the fixture is exactly that state: a real
 * repository whose HEAD is one commit behind its own origin/main, with the two copies disagreeing.
 * No stub can stand in for it; the reader's whole job is reading git.
 */
const stagedRepositoryLauncher = (label, committedWorker, workingWorker) => {
  const base = join(root, "config-authority", label)
  const originPath = join(base, "origin.git")
  const workPath = join(base, "work")
  const repoPath = join(base, "repos", "ui")
  mkdirSync(repoPath, { recursive: true })
  mkdirSync(join(workPath, "tools"), { recursive: true })
  mkdirSync(join(workPath, ".claude"), { recursive: true })
  const git = (cwd, argv) => spawnSync("git", ["-C", cwd, ...argv], { encoding: "utf8" })
  if (spawnSync("git", ["init", "--quiet", "--bare", "--initial-branch=main", originPath], { encoding: "utf8" }).status !== 0) return null
  for (const argv of [
    ["init", "--quiet", "--initial-branch=main"],
    ["config", "user.email", "gate@orbit.test"],
    ["config", "user.name", "Orbit Gate"],
    ["remote", "add", "origin", originPath],
  ]) {
    if (git(workPath, argv).status !== 0) return null
  }
  cpSync(join(TOOLS_DIR, "launch-worker.mjs"), join(workPath, "tools", "launch-worker.mjs"))
  cpSync(join(TOOLS_DIR, "wave-plan.mjs"), join(workPath, "tools", "wave-plan.mjs"))
  cpSync(join(TOOLS_DIR, "automation-budget.mjs"), join(workPath, "tools", "automation-budget.mjs"))
  cpSync(join(TOOLS_DIR, "lib"), join(workPath, "tools", "lib"), { recursive: true })
  writeFileSync(join(workPath, "tools", "ai-quota.mjs"), "#!/usr/bin/env node\nprocess.exit(1)\n")
  const configPath = join(workPath, ".claude", "orchestrator.json")

  writeFileSync(configPath, orchestratorConfig(repoPath, workingWorker, "claude"))
  for (const argv of [["add", "-A"], ["commit", "--quiet", "-m", "the copy this checkout carries"], ["push", "--quiet", "-u", "origin", "main"]]) {
    if (git(workPath, argv).status !== 0) return null
  }
  writeFileSync(configPath, orchestratorConfig(repoPath, committedWorker, "claude"))
  for (const argv of [["commit", "--quiet", "-am", "the copy origin/main carries"], ["push", "--quiet", "origin", "main"], ["reset", "--quiet", "--hard", "HEAD~1"]]) {
    if (git(workPath, argv).status !== 0) return null
  }
  return { path: join(workPath, "tools", "launch-worker.mjs"), wavePlanPath: join(workPath, "tools", "wave-plan.mjs"), workPath, repoPath }
}

const configAuthorityCases = (promptFile) => {
  const staged = stagedRepositoryLauncher(
    "stale-root",
    { ...INTERACTIVE_WORKER, models: { ...CLAUDE_MODELS, default: { model: "sonnet" } } },
    INTERACTIVE_WORKER,
  )
  if (!staged) {
    T("launch-worker.mjs: refuses a working-tree config the base branch has moved past", false, "could not stage a git repository with an origin remote")
    return
  }
  const stale = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], {
    path: staged.path,
    env: orcaEnv(linearIssueStub(["repo:ui"])),
  })
  T(
    "launch-worker.mjs: refuses a working-tree config the base branch has moved past, naming BOTH values",
    stale.status === 2 &&
      /\.claude\/orchestrator\.json disagrees with origin\/main/.test(stale.stderr) &&
      /workers\.claude\.models\.default\.model: origin\/main has "sonnet", the working tree has "opus"/.test(stale.stderr) &&
      /git merge --ff-only origin\/main/.test(stale.stderr),
    `exit ${stale.status}, expected 2\n     ${stale.stderr.trim()}`,
  )
  const wavePlanStale = run("wave-plan.mjs", ["--all", "--json"], { path: staged.wavePlanPath })
  T(
    "wave-plan.mjs: the same shared reader refuses the same stale config",
    wavePlanStale.status === 2 && /origin\/main has "sonnet", the working tree has "opus"/.test(wavePlanStale.stderr),
    `exit ${wavePlanStale.status}, expected 2\n     ${wavePlanStale.stderr.trim()}`,
  )

  // Green half: the identical launch once the checkout carries what origin/main carries. Without
  // this the refusal above could be a reader that refuses everything.
  const merged = spawnSync("git", ["-C", staged.workPath, "merge", "--quiet", "--ff-only", "origin/main"], { encoding: "utf8" })
  const current = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], {
    path: staged.path,
    env: orcaEnv(linearIssueStub(["repo:ui"])),
  })
  T(
    "launch-worker.mjs: the same launch proceeds once the checkout carries origin/main's copy, on ITS value",
    merged.status === 0 && current.status === 0 && /"command": "claude --permission-mode bypassPermissions --model sonnet"/.test(current.stdout),
    `merge exit ${merged.status}, launch exit ${current.status}\n     ${(current.stdout || current.stderr).trim().slice(0, 400)}`,
  )

  // A checkout that CONTAINS origin/main and edits the config is the ordinary pull request, not
  // the stale-copy defect. Refusing it would make every config change turn every tool red, which
  // is how a gate gets switched off.
  writeFileSync(
    join(staged.workPath, ".claude", "orchestrator.json"),
    orchestratorConfig(staged.repoPath, { ...INTERACTIVE_WORKER, models: { ...CLAUDE_MODELS, default: { model: "haiku" } } }, "claude"),
  )
  const ahead = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], {
    path: staged.path,
    env: orcaEnv(linearIssueStub(["repo:ui"])),
  })
  T(
    "launch-worker.mjs: a checkout that already contains origin/main keeps its own newer config",
    ahead.status === 0 && /--model haiku/.test(ahead.stdout),
    `exit ${ahead.status}\n     ${(ahead.stdout || ahead.stderr).trim().slice(0, 400)}`,
  )

  // An unresolvable origin/<base> is a READ FAILURE, not a licence to use the working copy: a
  // reader that fell back there would reintroduce the defect it exists to remove.
  const missingRef = spawnSync("git", ["-C", staged.workPath, "remote", "set-url", "origin", join(root, "config-authority", "no-such-origin.git")], { encoding: "utf8" })
  spawnSync("git", ["-C", staged.workPath, "update-ref", "-d", "refs/remotes/origin/main"], { encoding: "utf8" })
  const unresolvable = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], {
    path: staged.path,
    env: orcaEnv(linearIssueStub(["repo:ui"])),
  })
  T(
    "launch-worker.mjs: an unresolvable origin/main fails CLOSED naming which read failed",
    missingRef.status === 0 &&
      unresolvable.status === 2 &&
      /could not resolve origin\/main/.test(unresolvable.stderr) &&
      /git fetch origin main did not create it/.test(unresolvable.stderr) &&
      !/"command"/.test(unresolvable.stdout),
    `exit ${unresolvable.status}\n     ${(unresolvable.stderr || unresolvable.stdout).trim().slice(0, 500)}`,
  )
}

/**
 * B3. Clause 4 says "two consecutive cycles fail on the same finding. Do not try that finding a
 * third time", and until now that sentence was the whole mechanism: a string in a prompt file
 * every relaunch rewrote, so the count reset to zero each time and escalation degraded into
 * unbounded retry. Nineteen review rounds. These cases pin the count at ABSOLUTE values the test
 * writes, so raising the compiled-in limit turns them red rather than quietly following it.
 */
const findingStrikeCases = (promptFile) => {
  const staged = stageLaunchWorker("finding-strikes", INTERACTIVE_WORKER)
  const ledger = join(staged.base, "worker-strikes.jsonl")
  const strikeRow = (scope, issue, key) => JSON.stringify({ scope, issue, key, recordedAt: "2026-07-31T10:00:00.000Z" })
  const dryRun = (finding, environment = {}) =>
    run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile, "--finding", finding, "--dry-run"], {
      path: staged.path,
      env: { ...orcaEnv(linearIssueStub(["repo:ui"])), ORBIT_WORKER_STRIKE_LEDGER: ledger, ...environment },
    })

  writeFileSync(
    ledger,
    `${[
      strikeRow("finding", "ORB-75", "review-thread-9001"),
      strikeRow("finding", "ORB-75", "review-thread-9001"),
      strikeRow("finding", "ORB-75", "review-thread-other"),
      strikeRow("finding", "ORB-88", "review-thread-9001"),
      strikeRow("relaunch", "ORB-75", "review-thread-9001"),
    ].join("\n")}\n`,
  )
  const third = dryRun("review-thread-9001")
  T(
    "launch-worker.mjs: a third launch on the same unresolved finding escalates instead of relaunching",
    third.status === 5 &&
      /ORB-75 finding "review-thread-9001" has already failed 2 cycles/.test(third.stderr) &&
      /worker-contract clause 4's limit of 2/.test(third.stderr) &&
      /escalate the finding with your reasoning instead/.test(third.stderr),
    `exit ${third.status}, expected 5\n     ${third.stderr.trim()}`,
  )
  const otherFinding = dryRun("review-thread-other")
  T(
    "launch-worker.mjs: the strike count is per finding, not per ticket",
    otherFinding.status === 0 && /"strikes": 1/.test(otherFinding.stdout) && /"limit": 2/.test(otherFinding.stdout),
    `exit ${otherFinding.status}\n     ${(otherFinding.stdout || otherFinding.stderr).trim().slice(0, 400)}`,
  )
  const freshFinding = dryRun("review-thread-new")
  T(
    "launch-worker.mjs: a relaunch-scoped row for the same key is a different counter and never a strike",
    freshFinding.status === 0 && /"strikes": 0/.test(freshFinding.stdout),
    `exit ${freshFinding.status}\n     ${(freshFinding.stdout || freshFinding.stderr).trim().slice(0, 400)}`,
  )

  /**
   * Durability is the whole point, so it is proved across PROCESSES: three real launches, each a
   * fresh node process reading the store the previous one wrote. Each stops at `worktree create`,
   * which the launcher reaches only after the strike is recorded.
   */
  const durable = stageLaunchWorker("finding-strikes-durable", INTERACTIVE_WORKER)
  const durableLedger = join(durable.base, "worker-strikes.jsonl")
  const realLaunch = () =>
    run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", stage("finding-strike-prompt.md", "the ticket body verbatim\n"), "--finding", "thread-42"], {
      path: durable.path,
      env: {
        ...orcaEnv([
          ...linearIssueStub(["repo:ui"]),
          { match: "worktree create", stdout: JSON.stringify({ ok: false, error: { message: "stop after the strike is recorded" } }), exit: 1 },
          { match: "terminal stop", stdout: JSON.stringify({ ok: true, result: {} }) },
          { match: "worktree rm", stdout: JSON.stringify({ ok: true, result: {} }) },
        ]),
        ORBIT_AUTOMATION_BUDGET_LEDGER: join(durable.base, "automation-budget.jsonl"),
        ORBIT_WORKER_STRIKE_LEDGER: durableLedger,
      },
    })
  const cycles = [realLaunch(), realLaunch(), realLaunch()]
  const durableRows = existsSync(durableLedger)
    ? readFileSync(durableLedger, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    : []
  T(
    "launch-worker.mjs: the strike survives the process that wrote it, so the third cycle escalates",
    cycles[0].status === 3 &&
      cycles[1].status === 3 &&
      cycles[2].status === 5 &&
      durableRows.length === 2 &&
      durableRows.every((row) => row.scope === "finding" && row.issue === "ORB-75" && row.key === "thread-42" && typeof row.recordedAt === "string"),
    `statuses ${cycles.map((cycle) => cycle.status).join(", ")}\n     ledger ${JSON.stringify(durableRows)}\n     ${cycles[2].stderr.trim()}`,
  )
  T(
    "launch-worker.mjs: a launch with no --finding records no strike at all",
    (() => {
      const before = readFileSync(durableLedger, "utf8")
      run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], {
        path: durable.path,
        env: { ...orcaEnv(linearIssueStub(["repo:ui"])), ORBIT_WORKER_STRIKE_LEDGER: durableLedger },
      })
      return readFileSync(durableLedger, "utf8") === before
    })(),
    "an unlabelled launch appended to the strike ledger",
  )
  check(
    "launch-worker.mjs",
    "refuses an empty strike-ledger override instead of writing an unknown default",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--finding", "thread-42", "--dry-run"],
    { status: 2, stderr: /ORBIT_WORKER_STRIKE_LEDGER must not be empty/ },
    { path: staged.path, env: { ...orcaEnv(linearIssueStub(["repo:ui"])), ORBIT_WORKER_STRIKE_LEDGER: " " } },
  )
}

/**
 * The fuse is the PROVIDER's own weekly reading against the configured ceiling; the token budget
 * is warning-only whenever that reading is available, because one measured codex session spent
 * 89 percent of the configured 1,000,000 while the provider reading did not move off 11 percent.
 * So the blocking case is a reading at the ceiling, and the ledger figures below exist for the
 * fallback cases, which need records INSIDE the trailing seven-day window that fallback uses.
 */
const recentTimestamp = new Date(Date.now() - 60 * 60 * 1000).toISOString()
const inWindowRecord = (identity, inputTokens, outputTokens) =>
  budgetRecord(identity, inputTokens, outputTokens, "routine", "codex", { startedAt: recentTimestamp, endedAt: recentTimestamp })
const unavailableCodexQuota = JSON.stringify({
  claude: { status: "OK", weeklyPercent: 10, sessionPercent: 5, resetsIn: "4h 7m" },
  codex: { status: "UNAVAILABLE", usedPercent: null, windowDays: null, resetsAt: null, hasCredits: null, planType: null },
})
const createdAWorktree = (logPath) =>
  existsSync(logPath) &&
  readFileSync(logPath, "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .some((argumentsList) => argumentsList[0].split(/[\\/]/).pop() === "worktree" && argumentsList[1] === "create")

const launchWorkerCases = async () => {
  const promptFile = stage("prompt.md", "the ticket body verbatim\n")

  const good = stageLaunchWorker("interactive", INTERACTIVE_WORKER)
  const claudeDefault = check(
    "launch-worker.mjs",
    "Claude defaults to opus",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 0, stdout: /claude[\s\S]*--model opus/ },
    { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui"])) },
  )
  const claudeCheap = check(
    "launch-worker.mjs",
    "tier:cheap selects sonnet on Claude",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 0, stdout: /claude[\s\S]*--model sonnet/ },
    { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui", "tier:cheap"])) },
  )
  const claudeDeep = check(
    "launch-worker.mjs",
    "tier:deep selects a distinct max-effort opus invocation on Claude",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 0, stdout: /claude[\s\S]*--effort max[\s\S]*--model opus/ },
    { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui", "tier:deep"])) },
  )
  const claudeDefaultCommand = claudeDefault.status === 0 ? JSON.parse(claudeDefault.stdout).command : ""
  const claudeCheapCommand = claudeCheap.status === 0 ? JSON.parse(claudeCheap.stdout).command : ""
  const claudeDeepCommand = claudeDeep.status === 0 ? JSON.parse(claudeDeep.stdout).command : ""
  T("launch-worker.mjs: Claude cheap tier cannot resolve to the unchanged default invocation", claudeCheapCommand !== claudeDefaultCommand, `default and cheap both resolved to: ${claudeDefaultCommand}`)
  T("launch-worker.mjs: Claude deep tier cannot resolve to the unchanged default invocation", claudeDeepCommand !== claudeDefaultCommand, `default and deep both resolved to: ${claudeDefaultCommand}`)
  check(
    "launch-worker.mjs",
    "an unknown tier lists the engine's declared cheap and deep tiers",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /fast[\s\S]*cheap[\s\S]*deep/ },
    { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui", "tier:fast"])) },
  )
  check(
    "launch-worker.mjs",
    "a codex-only or unknown tier is rejected on Claude",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /codex-only[\s\S]*cheap[\s\S]*deep/ },
    { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui", "tier:codex-only"])) },
  )
  check(
    "launch-worker.mjs",
    "rejects the legacy worker:sonnet label with tier:cheap remediation",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /worker:sonnet[\s\S]*tier:cheap/ },
    { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui", "worker:sonnet"])) },
  )
  check(
    "launch-worker.mjs",
    "rejects conflicting tier labels",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /conflict|multiple[\s\S]*tier/i },
    { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui", "tier:cheap", "tier:deep"])) },
  )
  check("launch-worker.mjs", "resolves the repo from the repo:* label", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 0, stdout: /"repo": "ui"/ }, { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })
  check("launch-worker.mjs", "derives the contract branch from the title", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 0, stdout: /"branch": "feature\/orb-75-prove-the-harness-gate/ }, { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })
  check("launch-worker.mjs", "refuses a repo:* label with no repos entry", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /no repo path for "zzz"/ }, { path: good.path, env: orcaEnv(linearIssueStub(["repo:zzz"])) })
  check("launch-worker.mjs", "refuses a ticket with no repo:* label and no --repo", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /carries no repo:\* label/ }, { path: good.path, env: orcaEnv(linearIssueStub([])) })

  const insidePrompt = join(good.repoPath, "prompt.md")
  writeFileSync(insidePrompt, "the ticket body verbatim\n")
  check("launch-worker.mjs", "refuses a prompt file inside a repo", ["--issue", "ORB-75", "--prompt-file", insidePrompt, "--dry-run"], { status: 2, stderr: /would be committed/ }, { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })
  const longPromptDirectory = join(root, "prompt-path-guard", "x".repeat(130))
  mkdirSync(longPromptDirectory, { recursive: true })
  const longPrompt = join(longPromptDirectory, "prompt.md")
  writeFileSync(longPrompt, "the ticket body verbatim\n")
  check("launch-worker.mjs", "interactive delivery refuses a conservatively over-long prompt path", ["--issue", "ORB-75", "--prompt-file", longPrompt, "--dry-run"], { status: 2, stderr: /interactive terminal delivery can swallow long paths/ }, { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const noModels = stageLaunchWorker("no-models", { command: "claude", args: ["--permission-mode", "bypassPermissions"], interactive: true })
  check("launch-worker.mjs", "refuses an engine with no models map", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /claude[\s\S]*models/ }, { path: noModels.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const noDefault = stageLaunchWorker("no-default-model", { ...INTERACTIVE_WORKER, models: { cheap: CLAUDE_MODELS.cheap, deep: CLAUDE_MODELS.deep } })
  check("launch-worker.mjs", "refuses an engine model map with no default", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /claude[\s\S]*default/ }, { path: noDefault.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const modelInBaseArgs = stageLaunchWorker("model-in-base-args", { ...INTERACTIVE_WORKER, args: ["--model", "opus"] })
  check("launch-worker.mjs", "refuses a model flag in the engine's base args", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /non-model strings/ }, { path: modelInBaseArgs.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const noCheap = stageLaunchWorker("no-cheap-model", { ...INTERACTIVE_WORKER, models: { default: CLAUDE_MODELS.default, deep: CLAUDE_MODELS.deep } })
  check("launch-worker.mjs", "refuses an engine model map with no cheap tier", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /claude[\s\S]*cheap/ }, { path: noCheap.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const noDeep = stageLaunchWorker("no-deep-model", { ...INTERACTIVE_WORKER, models: { default: CLAUDE_MODELS.default, cheap: CLAUDE_MODELS.cheap } })
  check("launch-worker.mjs", "refuses an engine model map with no deep tier", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /claude[\s\S]*deep/ }, { path: noDeep.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const identicalTiers = stageLaunchWorker("identical-tiers", {
    ...INTERACTIVE_WORKER,
    models: { ...CLAUDE_MODELS, cheap: { model: "sonnet" }, deep: { model: "sonnet" } },
  })
  check("launch-worker.mjs", "refuses identical cheap and deep mappings", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /cheap[\s\S]*deep|deep[\s\S]*cheap/ }, { path: identicalTiers.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const unchangedCheap = stageLaunchWorker("unchanged-cheap", {
    ...INTERACTIVE_WORKER,
    models: { ...CLAUDE_MODELS, cheap: { model: "opus" } },
  })
  check(
    "launch-worker.mjs",
    "refuses a selected non-default tier identical to the default",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /cheap[\s\S]*default|default[\s\S]*cheap/ },
    { path: unchangedCheap.path, env: orcaEnv(linearIssueStub(["repo:ui", "tier:cheap"])) },
  )

  const notInteractive = stageLaunchWorker("not-interactive", { ...INTERACTIVE_WORKER, interactive: false })
  check("launch-worker.mjs", "interactive false without a headless token is refused", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /interactive: false[\s\S]*no known headless token/ }, { path: notInteractive.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const omitted = stageLaunchWorker("omits-interactive", { command: "claude", args: [], models: CLAUDE_MODELS })
  check("launch-worker.mjs", "refuses an engine that omits interactive entirely", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /must explicitly declare interactive/ }, { path: omitted.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const missingBudgetTier = stageLaunchWorker("missing-budget-tier", { ...INTERACTIVE_WORKER, automationBudget: {} })
  check(
    "launch-worker.mjs",
    "refuses a worker with no explicit routine or reserved budget tier",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /automationBudget\.tier as routine or reserved/ },
    { path: missingBudgetTier.path, env: orcaEnv(linearIssueStub(["repo:ui"])) },
  )
  const missingTokenBudget = stageLaunchWorker("missing-token-budget", {
    ...INTERACTIVE_WORKER,
    automationBudget: { ...DEFAULT_AUTOMATION_BUDGET, tokenBudget: undefined },
  })
  check(
    "launch-worker.mjs",
    "refuses a worker with no positive engine token budget",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /automationBudget\.tokenBudget as a positive integer/ },
    { path: missingTokenBudget.path, env: orcaEnv(linearIssueStub(["repo:ui"])) },
  )
  const invalidWarning = stageLaunchWorker("invalid-token-warning", {
    ...INTERACTIVE_WORKER,
    automationBudget: { ...DEFAULT_AUTOMATION_BUDGET, warningTokens: 1_000_000 },
  })
  check(
    "launch-worker.mjs",
    "refuses a warning level that is not below the engine token budget",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /automationBudget\.warningTokens[\s\S]*below tokenBudget/ },
    { path: invalidWarning.path, env: orcaEnv(linearIssueStub(["repo:ui"])) },
  )
  const missingProjection = stageLaunchWorker("missing-token-projection", {
    ...INTERACTIVE_WORKER,
    automationBudget: {
      ...DEFAULT_AUTOMATION_BUDGET,
      invocationTokens: { ...DEFAULT_AUTOMATION_BUDGET.invocationTokens, deep: undefined },
    },
  })
  check(
    "launch-worker.mjs",
    "refuses a worker missing a projected token count for one model tier",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /automationBudget\.invocationTokens for every declared model tier: default, cheap, deep/ },
    { path: missingProjection.path, env: orcaEnv(linearIssueStub(["repo:ui"])) },
  )
  const missingAddedTierProjection = stageLaunchWorker("missing-added-tier-projection", {
    ...INTERACTIVE_WORKER,
    models: { ...CLAUDE_MODELS, burst: { model: "haiku" } },
  })
  check(
    "launch-worker.mjs",
    "requires a projected token count for every tier declared by the selected engine",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /automationBudget\.invocationTokens for every declared model tier: default, cheap, deep, burst/ },
    { path: missingAddedTierProjection.path, env: orcaEnv(linearIssueStub(["repo:ui"])) },
  )
  check(
    "launch-worker.mjs",
    "refuses an empty ledger override instead of writing an unknown default",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /ORBIT_AUTOMATION_BUDGET_LEDGER must not be empty/ },
    { path: good.path, env: { ...orcaEnv(linearIssueStub(["repo:ui"])), ORBIT_AUTOMATION_BUDGET_LEDGER: " " } },
  )

  const headless = stageLaunchWorker("headless-args", { ...INTERACTIVE_WORKER, args: ["-p"] })
  check("launch-worker.mjs", "refuses headless args behind an interactive declaration", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /headless invocation/ }, { path: headless.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const headlessCommand = stageLaunchWorker("headless-command", { ...INTERACTIVE_WORKER, command: "claude --print", args: [] })
  check("launch-worker.mjs", "refuses a headless token hidden in the command field", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /headless invocation/ }, { path: headlessCommand.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const acceptEdits = stageLaunchWorker("accept-edits", { command: "claude", args: ["--permission-mode", "acceptEdits"], models: CLAUDE_MODELS, interactive: true })
  check("launch-worker.mjs", "refuses a claude permission mode that cannot run unattended shell commands", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /permission mode is "acceptEdits"/ }, { path: acceptEdits.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const permissionInCommand = stageLaunchWorker("permission-in-command", { command: "claude --permission-mode bypassPermissions", args: [], models: CLAUDE_MODELS, interactive: true })
  check("launch-worker.mjs", "accepts the required claude permission mode from the whole resolved invocation", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 0, stdout: /claude --permission-mode bypassPermissions/ }, { path: permissionInCommand.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  // Headless is a property of the CLI, not of the harness: codex's -p is --profile, an
  // interactive flag, while claude's -p is --print. One shared token list cannot tell them
  // apart, so these five cases pin both halves of the per-engine split.
  const codex = stageLaunchWorker("codex-interactive", INTERACTIVE_CODEX, "codex")
  const codexPlan = check(
    "launch-worker.mjs",
    "Codex defaults to Terra at medium effort",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 0, stdout: /codex[\s\S]*model_reasoning_effort[\s\S]*medium[\s\S]*--model gpt-5\.6-terra/ },
    { path: codex.path, env: orcaEnv(linearIssueStub(["repo:ui"])) },
  )
  const codexCheap = check(
    "launch-worker.mjs",
    "tier:cheap selects Luna at low effort on Codex",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 0, stdout: /codex[\s\S]*model_reasoning_effort[\s\S]*low[\s\S]*--model gpt-5\.6-luna/ },
    { path: codex.path, env: orcaEnv(linearIssueStub(["repo:ui", "tier:cheap"])) },
  )
  const codexDeep = check(
    "launch-worker.mjs",
    "tier:deep selects Sol at high effort with the routine budget on Codex",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 0, stdout: /codex[\s\S]*model_reasoning_effort[\s\S]*high[\s\S]*--model gpt-5\.6-sol[\s\S]*"automationBudget":\s*\{[\s\S]*"tier":\s*"routine"[\s\S]*"tokenBudget":\s*1000000[\s\S]*"warningTokens":\s*800000[\s\S]*"projectedTokens":\s*250000/ },
    { path: codex.path, env: orcaEnv(linearIssueStub(["repo:ui", "tier:deep"])) },
  )
  const codexDefaultCommand = codexPlan.status === 0 ? JSON.parse(codexPlan.stdout).command : ""
  const codexCheapCommand = codexCheap.status === 0 ? JSON.parse(codexCheap.stdout).command : ""
  const codexDeepCommand = codexDeep.status === 0 ? JSON.parse(codexDeep.stdout).command : ""
  T("launch-worker.mjs: Codex cheap tier cannot resolve to the unchanged default invocation", codexCheapCommand !== codexDefaultCommand, `default and cheap both resolved to: ${codexDefaultCommand}`)
  T("launch-worker.mjs: Codex deep tier cannot resolve to the unchanged default invocation", codexDeepCommand !== codexDefaultCommand, `default and deep both resolved to: ${codexDefaultCommand}`)
  T(
    "launch-worker.mjs: no Codex tier resolves at max reasoning",
    ![codexDefaultCommand, codexCheapCommand, codexDeepCommand].some(
      (command) => command.includes('model_reasoning_effort="max"'),
    ),
    `resolved commands: ${[codexDefaultCommand, codexCheapCommand, codexDeepCommand].join(" | ")}`,
  )
  T(
    "launch-worker.mjs: the codex plan's command carries no headless token",
    codexPlan.status === 0 && !/(^|\s)(-p|--print|exec|e)(\s|"|$)/.test(JSON.parse(codexPlan.stdout).command),
    `command was: ${codexPlan.stdout.trim().slice(0, 200)}`,
  )

  const codexProfile = stageLaunchWorker("codex-profile", { ...INTERACTIVE_CODEX, args: ["-p", "my-profile", "--dangerously-bypass-approvals-and-sandbox"] }, "codex")
  check("launch-worker.mjs", "accepts codex -p, which is --profile and not --print", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 0, stdout: /codex -p my-profile/ }, { path: codexProfile.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const codexExec = stageLaunchWorker("codex-exec", { ...INTERACTIVE_CODEX, args: ["exec", "--full-auto"] }, "codex")
  check("launch-worker.mjs", "still refuses codex exec behind an interactive declaration", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /carries "exec", which is a headless invocation of codex/ }, { path: codexExec.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const codexExecAlias = stageLaunchWorker("codex-exec-alias", { ...INTERACTIVE_CODEX, args: ["e"] }, "codex")
  check("launch-worker.mjs", "refuses codex e, the documented alias for exec", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /headless invocation of codex/ }, { path: codexExecAlias.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const headlessCodex = stageLaunchWorker("headless-codex", { ...INTERACTIVE_CODEX, args: ["exec", "--dangerously-bypass-approvals-and-sandbox"], interactive: false }, "codex")
  check("launch-worker.mjs", "accepts codex exec when interactive false agrees with its headless token", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 0, stdout: /codex exec/ }, { path: headlessCodex.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })
  check("launch-worker.mjs", "rejects a headless declaration without a headless token", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /has no known headless token/ }, { path: stageLaunchWorker("headless-without-token", { ...INTERACTIVE_CODEX, interactive: false }, "codex").path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const unknownEngine = stageLaunchWorker("unknown-engine", { command: "aider", args: [], models: CLAUDE_MODELS, interactive: true }, "aider")
  check("launch-worker.mjs", "refuses an engine with no quota reader rather than waving it through", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /has no quota reader/ }, { path: unknownEngine.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const unknownProfile = stageLaunchWorker("unknown-profile", { ...INTERACTIVE_WORKER, command: "aider" })
  check("launch-worker.mjs", "refuses an engine binary with no profile rather than waving it through", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /no engine profile for/ }, { path: unknownProfile.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  check("launch-worker.mjs", "refuses a missing prompt file", ["--issue", "ORB-75", "--prompt-file", join(root, "absent.md"), "--dry-run"], { status: 2, stderr: /prompt file not found/ }, { path: good.path })
  check("launch-worker.mjs", "refuses a non-Linear issue identifier", ["--issue", "nope", "--prompt-file", promptFile, "--dry-run"], { status: 2, stderr: /Linear identifier/ }, { path: good.path })

  /**
   * The standing worker contract has to be OWNED by the launcher, not by whoever composed the
   * prompt. Both clauses it carries were broken on the ORB-88 run by a worker whose hand-written
   * prompt happened not to say them: it ended a turn on a question, and it armed a monitor on
   * another ticket's PR. These cases are what makes dropping a clause fail Harness Execution.
   */
  check("launch-worker.mjs", "injects the standing worker contract into a prompt that lacks it", ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"], { status: 0, stdout: /"workerContract": "appended"/ }, { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const alreadyContracted = stage("prompt-with-contract.md", `the ticket body verbatim\n\n${WORKER_CONTRACT_MARKER}\n\nclauses already here\n`)
  check("launch-worker.mjs", "does not stack a second copy on relaunch", ["--issue", "ORB-75", "--prompt-file", alreadyContracted, "--dry-run"], { status: 0, stdout: /"workerContract": "already present"/ }, { path: good.path, env: orcaEnv(linearIssueStub(["repo:ui"])) })

  const appendFailure = stageLaunchWorker("contract-append-failure", INTERACTIVE_WORKER)
  const appendFailureSource = readFileSync(appendFailure.path, "utf8")
  const appendCall = 'appendFileSync(promptFile, existingWorktreeArg ? SLICE_CONTRACT : WORKER_CONTRACT, "utf8")'
  if (!appendFailureSource.includes(appendCall)) {
    throw new Error("launch-worker fixture could not locate the worker-contract append")
  }
  writeFileSync(
    appendFailure.path,
    appendFailureSource.replace(appendCall, 'throw new Error("fixture append failure")'),
  )
  const appendFailurePrompt = stage("contract-append-failure-prompt.md", "the ticket body verbatim\n")
  const appendFailureLedger = join(appendFailure.base, "automation-budget.jsonl")
  const appendFailureLog = join(appendFailure.base, "orca-calls.log")
  const appendFailureResult = run(
    "launch-worker.mjs",
    ["--issue", "ORB-75", "--prompt-file", appendFailurePrompt],
    {
      path: appendFailure.path,
      env: {
        ...orcaEnv(linearIssueStub(["repo:ui"])),
        ORBIT_AUTOMATION_BUDGET_LEDGER: appendFailureLedger,
        ORBIT_ORCA_LOG: appendFailureLog,
      },
    },
  )
  /** The raw log text never contains "worktree create": each row is JSON, so the two tokens are
   * `"worktree","create"`. A substring probe here could never fail, which is the same defect this
   * ticket exists to remove, so the calls are parsed instead. */
  const appendFailureCalls = readFileSync(appendFailureLog, "utf8")
  const appendFailureRecords = readFileSync(appendFailureLedger, "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line))
  T(
    "launch-worker.mjs: a worker-contract append failure cancels its pre-worktree reservation",
    appendFailureResult.status === 3 &&
      /could not append the worker contract[\s\S]*fixture append failure/.test(appendFailureResult.stderr) &&
      !createdAWorktree(appendFailureLog) &&
      appendFailureRecords.length === 2 &&
      appendFailureRecords[0]?.identity === appendFailureRecords[1]?.identity &&
      appendFailureRecords[1]?.cancelled === true,
    `exit ${appendFailureResult.status}\n     stderr: ${appendFailureResult.stderr}\n     calls: ${appendFailureCalls}\n     ledger: ${JSON.stringify(appendFailureRecords)}`,
  )

  const blocked = stageLaunchWorker("budget-blocked", INTERACTIVE_CODEX, "codex")
  const blockedLog = join(root, "launch", "budget-blocked-calls.jsonl")
  const blockedResult = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile], {
    path: blocked.path,
    env: {
      ...orcaEnv(linearIssueStub(["repo:ui"])),
      ORBIT_TEST_AI_QUOTA: JSON.stringify({
        claude: { status: "OK", weeklyPercent: 10, sessionPercent: 5, resetsIn: "4h 7m" },
        codex: { status: "OK", usedPercent: 90, windowDays: 7, resetsAt: 1894060800, hasCredits: false, planType: "pro" },
      }),
      ORBIT_AUTOMATION_BUDGET_LEDGER: stage("launch/budget-blocked.jsonl", ""),
      ORBIT_ORCA_LOG: blockedLog,
    },
  })
  T(
    "launch-worker.mjs: a provider reading at the account ceiling blocks before any worktree is created",
    blockedResult.status === 4 &&
      /ORB-75:[\s\S]*codex account usage 90 percent has reached the configured ceiling 85 percent/.test(blockedResult.stderr) &&
      !createdAWorktree(blockedLog),
    `exit ${blockedResult.status}\n     ${blockedResult.stderr}\n     created a worktree: ${createdAWorktree(blockedLog)}`,
  )

  const pendingLedger = stage("launch/budget-pending.jsonl", `${inWindowRecord("prior-pending", undefined, undefined)}\n`)
  const pendingLog = join(root, "launch", "budget-pending-calls.jsonl")
  const pendingResult = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile], {
    path: blocked.path,
    env: {
      ...orcaEnv(linearIssueStub(["repo:ui"])),
      ORBIT_TEST_AI_QUOTA: unavailableCodexQuota,
      ORBIT_AUTOMATION_BUDGET_LEDGER: pendingLedger,
      ORBIT_ORCA_LOG: pendingLog,
    },
  })
  T(
    "launch-worker.mjs: under the token fallback an absent prior measurement fails closed before worktree creation",
    pendingResult.status === 3 &&
      /lack input or output tokens[\s\S]*prior-pending/.test(pendingResult.stderr) &&
      !createdAWorktree(pendingLog),
    `exit ${pendingResult.status}\n     ${pendingResult.stderr}\n     created a worktree: ${createdAWorktree(pendingLog)}`,
  )

  /**
   * The REAL spawn, never --dry-run. A dry run returns before startHeadlessWorker, which is how a
   * headless launcher that could not start anything reached CI twice: Node has refused to spawn a
   * .cmd without a shell since CVE-2024-27980, so `spawn("codex.cmd", ...)` throws EINVAL before
   * the engine exists. The win32 fixture is an npm shim of the same shape as the installed
   * codex.cmd (`"%dp0%\\...js" %*`, read off disk, not invented), and the child reports its own
   * argv back so a shell re-parse of the prompt would be visible rather than silent.
   */
  const headlessEngineDirectory = join(root, "launch", "headless-bin")
  mkdirSync(headlessEngineDirectory, { recursive: true })
  const headlessArgvLog = join(root, "launch", "headless-argv.json")
  const headlessScript = join(headlessEngineDirectory, "worker-shim.js")
  writeFileSync(
    headlessScript,
    `const { writeFileSync } = require("node:fs")\nwriteFileSync(process.env.ORBIT_HEADLESS_ARGV_LOG, JSON.stringify(process.argv.slice(2)))\nconst holdMilliseconds = Number(process.env.ORBIT_HEADLESS_HOLD_MS || 0)\nif (holdMilliseconds > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, holdMilliseconds)\n`,
  )
  if (process.platform === "win32") {
    writeFileSync(
      join(headlessEngineDirectory, "codex.cmd"),
      `@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\nSET "_prog=node"\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\worker-shim.js" %*\r\n`,
    )
  } else {
    const posixShim = join(headlessEngineDirectory, "codex")
    writeFileSync(posixShim, `#!/usr/bin/env node\nrequire(${JSON.stringify(headlessScript)})\n`)
    chmodSync(posixShim, 0o755)
  }
  const headlessWorker = {
    command: "codex",
    args: ["exec", "-c", 'windows.sandbox="unelevated"', "--dangerously-bypass-approvals-and-sandbox"],
    models: CODEX_MODELS,
    interactive: false,
    automationBudget: DEFAULT_AUTOMATION_BUDGET,
  }
  const headlessStage = stageLaunchWorker("headless-spawn", headlessWorker, "codex")
  const headlessCheckout = stageCheckout(headlessStage.base)
  if (!headlessCheckout) {
    T("launch-worker.mjs: a headless launch starts a real worker process", false, "could not stage the headless launch checkout")
  } else {
    const headlessPrompt = stage("headless-launch-prompt.md", "the ticket body verbatim\n")
    const headlessResult = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", headlessPrompt], {
      path: headlessStage.path,
      env: {
        ...orcaEnv([
          ...linearIssueStub(["repo:ui"]),
          { match: "worktree create", stdout: JSON.stringify({ ok: true, result: { worktree: { path: headlessCheckout, branch: "refs/heads/thomasluizon/orb-75" } } }) },
          { match: "worktree set", stdout: JSON.stringify({ ok: true, result: {} }) },
          { match: "worktree rm", stdout: JSON.stringify({ ok: true, result: {} }) },
        ]),
        PATH: `${headlessEngineDirectory}${delimiter}${process.env.PATH}`,
        ORBIT_AUTOMATION_BUDGET_LEDGER: join(headlessStage.base, "automation-budget.jsonl"),
        ORBIT_HEADLESS_ARGV_LOG: headlessArgvLog,
      },
    })
    let headlessPlan = null
    try {
      headlessPlan = JSON.parse(headlessResult.stdout)
    } catch {
      headlessPlan = null
    }
    const headlessDeadline = Date.now() + 15_000
    while (!existsSync(headlessArgvLog) && Date.now() < headlessDeadline) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
    const childArgv = existsSync(headlessArgvLog) ? JSON.parse(readFileSync(headlessArgvLog, "utf8")) : null
    const markerPath = join(
      resolve(headlessCheckout, spawnSync("git", ["-C", headlessCheckout, "rev-parse", "--git-dir"], { encoding: "utf8" }).stdout.trim()),
      "orbit-worker-pids.jsonl",
    )
    const markerRows = existsSync(markerPath)
      ? readFileSync(markerPath, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
      : []
    T(
      "launch-worker.mjs: a headless launch starts a real worker process and records its PID",
      headlessResult.status === 0 &&
        headlessPlan?.launchMode === "new-worktree" &&
        Number.isInteger(headlessPlan?.workerPid) &&
        markerRows.length === 1 &&
        markerRows[0].pid === headlessPlan.workerPid &&
        markerRows[0].worktreePath === headlessCheckout,
      `exit ${headlessResult.status}\n     stdout: ${headlessResult.stdout.slice(0, 400)}\n     stderr: ${headlessResult.stderr.slice(0, 600)}\n     marker: ${JSON.stringify(markerRows)}`,
    )
    const headlessLedger = join(headlessStage.base, "automation-budget.jsonl")
    const headlessRows = existsSync(headlessLedger)
      ? readFileSync(headlessLedger, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
      : []
    T(
      "launch-worker.mjs: the launcher claims its reservation with the PID it just spawned",
      headlessRows.length === 2 &&
        headlessRows[0]?.pending === true &&
        !Object.hasOwn(headlessRows[0] ?? {}, "workerPid") &&
        headlessRows[1]?.pending === true &&
        headlessRows[1]?.workerPid === headlessPlan?.workerPid,
      `plan pid ${headlessPlan?.workerPid}\n     ledger: ${JSON.stringify(headlessRows)}`,
    )
    const expectedEngineArgs = [...headlessWorker.args, ...CODEX_MODELS.default.args, "--model", CODEX_MODELS.default.model]
    T(
      "launch-worker.mjs: the headless worker receives its engine args and the whole pointer as one argument",
      Array.isArray(childArgv) &&
        childArgv.length === expectedEngineArgs.length + 1 &&
        expectedEngineArgs.every((argument, index) => childArgv[index] === argument) &&
        childArgv.at(-1).includes(headlessPrompt) &&
        childArgv.at(-1).includes('automation-budget.mjs" record') &&
        childArgv.at(-1).includes("--cached-input-tokens"),
      `expected ${JSON.stringify(expectedEngineArgs)} plus one pointer
     child argv: ${JSON.stringify(childArgv)}`,
    )
  }

  /**
   * The slice cap races the same way the worktree cap does, and the whole point of
   * --existing-worktree is two slices in one worktree. The cap is read from
   * orbit-worker-pids.jsonl, checked, and only appended to after the spawn, so unlocked both
   * launchers read before either appends and both pass a cap of one. Two real concurrent
   * processes are the only thing that can prove the lock; a serial pair passes either way.
   */
  const sliceStage = stageLaunchWorker("slice-cap", headlessWorker, "codex", 8, 1)
  const sliceWorktree = stageCheckout(sliceStage.base)
  if (!sliceWorktree) {
    T("launch-worker.mjs: concurrent slice launches cannot both pass one slice cap", false, "could not stage the slice checkout")
  } else {
    const slicePrompt = stage("slice-cap-prompt.md", "the ticket body verbatim\n")
    const sliceRunner = stage(
      "slice-cap-runner.mjs",
      `import { spawn } from "node:child_process"
const [tool, promptFile, worktreePath] = process.argv.slice(2)
const run = () => new Promise((resolve) => {
  const child = spawn(process.execPath, [tool, "--issue", "ORB-75", "--prompt-file", promptFile, "--existing-worktree", worktreePath], {
    stdio: ["ignore", "pipe", "pipe"],
  })
  let stderr = ""
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk) => { stderr += chunk })
  child.stdout.resume()
  child.on("exit", (status) => resolve({ status, stderr }))
})
process.stdout.write(JSON.stringify(await Promise.all([run(), run()])))
`,
    )
    const sliceEnv = {
      ...orcaEnv([
        ...linearIssueStub(["repo:ui"], [{ ...launchWorktreeStub(sliceWorktree), isArchived: false, linkedLinearIssue: "ORB-75" }]),
        { match: "worktree set", stdout: JSON.stringify({ ok: true, result: {} }) },
      ]),
      PATH: `${headlessEngineDirectory}${delimiter}${process.env.PATH}`,
      ORBIT_AUTOMATION_BUDGET_LEDGER: join(sliceStage.base, "automation-budget.jsonl"),
      ORBIT_HEADLESS_ARGV_LOG: join(root, "launch", "slice-argv.json"),
      ORBIT_HEADLESS_HOLD_MS: "6000",
    }
    const sliceResult = spawnSync(process.execPath, [sliceRunner, sliceStage.path, slicePrompt, sliceWorktree], {
      encoding: "utf8",
      cwd: REPO_ROOT,
      env: { ...process.env, ...sliceEnv },
      timeout: 120_000,
    })
    let sliceOutcomes = []
    try {
      sliceOutcomes = JSON.parse(sliceResult.stdout)
    } catch {
      sliceOutcomes = []
    }
    const sliceStatuses = sliceOutcomes.map((outcome) => outcome.status).sort((first, second) => first - second)
    const sliceMarker = join(
      resolve(sliceWorktree, spawnSync("git", ["-C", sliceWorktree, "rev-parse", "--git-dir"], { encoding: "utf8" }).stdout.trim()),
      "orbit-worker-pids.jsonl",
    )
    const sliceRows = existsSync(sliceMarker)
      ? readFileSync(sliceMarker, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
      : []
    T(
      "launch-worker.mjs: concurrent slice launches cannot both pass one slice cap",
      sliceStatuses.length === 2 &&
        sliceStatuses[0] === 0 &&
        sliceStatuses[1] === 1 &&
        sliceOutcomes.some((outcome) => /maxSlicesPerWorker cap 1 reached for ORB-75/.test(outcome.stderr)) &&
        sliceRows.length === 1,
      `runner exit ${sliceResult.status}\n     statuses ${JSON.stringify(sliceStatuses)}\n     marker ${JSON.stringify(sliceRows)}\n     stderr ${sliceOutcomes.map((outcome) => (outcome.stderr ?? "").trim().split("\n").slice(-2).join(" | ")).join("\n     ")}`,
    )
  }

  const concurrentWorker = {
    ...INTERACTIVE_WORKER,
    automationBudget: {
      ...DEFAULT_AUTOMATION_BUDGET,
      tokenBudget: 1_000,
      warningTokens: 800,
      invocationTokens: { default: 600, cheap: 500, deep: 900 },
    },
  }
  const concurrentLaunch = stageLaunchWorker("budget-concurrent-launch", concurrentWorker)
  const concurrentCheckout = stageCheckout(concurrentLaunch.base)
  if (!concurrentCheckout) {
    T("launch-worker.mjs: concurrent launchers share one atomic pre-worktree reservation", false, "could not stage the concurrent launch checkout")
  } else {
    const concurrentLedger = join(concurrentLaunch.base, "automation-budget.jsonl")
    const concurrentMarker = join(concurrentLaunch.base, "budget-lock-acquired")
    const concurrentRelease = join(concurrentLaunch.base, "budget-lock-release")
    const concurrentPrompt = stage("budget-concurrent-launch-prompt.md", "the ticket body verbatim\n")
    const concurrentPainted = `> Read ${concurrentPrompt} and execute it in full. That file is your complete work order for ORB-75:`
    const concurrentPlan = [
      ...linearIssueStub(["repo:ui"]),
      { match: "worktree create", stdout: JSON.stringify({ ok: true, result: { worktree: { path: concurrentCheckout, branch: "refs/heads/thomasluizon/orb-75" } } }) },
      { match: "terminal create", stdout: JSON.stringify({ ok: true, result: { terminal: { handle: "t1" } } }) },
      { match: "terminal wait", stdout: JSON.stringify({ ok: true, result: { wait: { satisfied: true } } }) },
      { match: "terminal show", stdout: JSON.stringify({ ok: true, result: { terminal: { lastOutputAt: 1785168487585 } } }) },
      { match: "terminal read", stdout: JSON.stringify({ ok: true, result: { terminal: { tail: [concurrentPainted] } } }) },
      { match: "terminal send", stdout: JSON.stringify({ ok: true, result: {} }) },
      { match: "terminal switch", stdout: JSON.stringify({ ok: true, result: {} }) },
      { match: "worktree set", stdout: JSON.stringify({ ok: true, result: {} }) },
      { match: "terminal stop", stdout: JSON.stringify({ ok: true, result: {} }) },
      { match: "worktree rm", stdout: JSON.stringify({ ok: true, result: {} }) },
    ]
    const concurrentRunner = stage(
      "budget-concurrent-launch-runner.mjs",
      `import { spawn } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
const [tool, prompt, ledger, marker, release, firstLog, secondLog] = process.argv.slice(2)
const baseEnv = JSON.parse(process.env.CONCURRENT_LAUNCH_ENV)
const run = (extraEnv) => {
  const child = spawn(process.execPath, [tool, "--issue", "ORB-75", "--prompt-file", prompt], {
    env: { ...process.env, ...baseEnv, ORBIT_AUTOMATION_BUDGET_LEDGER: ledger, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let stderr = ""
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk) => { stderr += chunk })
  return new Promise((resolve) => child.on("exit", (status) => resolve({ status, stderr })))
}
const first = run({
  AUTOMATION_BUDGET_TEST_LOCK_MARKER: marker,
  AUTOMATION_BUDGET_TEST_LOCK_RELEASE: release,
  ORBIT_ORCA_LOG: firstLog,
})
const deadline = Date.now() + 5000
while (!existsSync(marker) && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 10))
}
if (!existsSync(marker)) process.exit(9)
const second = run({ ORBIT_ORCA_LOG: secondLog })
await new Promise((resolve) => setTimeout(resolve, 100))
writeFileSync(release, "release\\n")
process.stdout.write(JSON.stringify(await Promise.all([first, second])))
`,
    )
    const firstLog = join(concurrentLaunch.base, "first-orca.jsonl")
    const secondLog = join(concurrentLaunch.base, "second-orca.jsonl")
    const concurrentResult = spawnSync(
      process.execPath,
      [
        concurrentRunner,
        join(concurrentLaunch.base, "tools", "launch-worker.mjs"),
        concurrentPrompt,
        concurrentLedger,
        concurrentMarker,
        concurrentRelease,
        firstLog,
        secondLog,
      ],
      {
        encoding: "utf8",
        timeout: 30_000,
        /**
         * The provider reading is UNAVAILABLE here on purpose. Atomicity is only observable when
         * something the two launchers SHARE can refuse the second one, and the only shared state
         * is the ledger, which gates a launch under the token fallback. The account ceiling reads
         * the provider and would refuse both or neither, proving nothing about the lock.
         */
        env: {
          ...process.env,
          CONCURRENT_LAUNCH_ENV: JSON.stringify({
            ...orcaEnv(concurrentPlan),
            ORBIT_TEST_AI_QUOTA: JSON.stringify({
              claude: { status: "UNAVAILABLE", weeklyPercent: null, sessionPercent: null, resetsIn: null },
              codex: { status: "OK", usedPercent: 10, windowDays: 7, resetsAt: 1894060800, hasCredits: false, planType: "pro" },
            }),
          }),
        },
      },
    )
    const concurrentOutcomes = concurrentResult.status === 0 ? JSON.parse(concurrentResult.stdout) : []
    const concurrentRecords = existsSync(concurrentLedger)
      ? readFileSync(concurrentLedger, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
      : []
    const readCalls = (path) => existsSync(path)
      ? readFileSync(path, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
      : []
    const firstCalls = readCalls(firstLog)
    const secondCalls = readCalls(secondLog)
    const createdWorktree = (calls) => calls.some((argumentsList) =>
      argumentsList[0].split(/[\\/]/).pop() === "worktree" && argumentsList[1] === "create")
    T(
      "launch-worker.mjs: concurrent launchers share one atomic pre-worktree reservation",
      concurrentResult.status === 0 &&
        concurrentOutcomes[0]?.status === 0 &&
        concurrentOutcomes[1]?.status === 4 &&
        /blocked:/.test(concurrentOutcomes[1]?.stderr ?? "") &&
        createdWorktree(firstCalls) &&
        !createdWorktree(secondCalls) &&
        concurrentRecords.length === 1 &&
        !Object.hasOwn(concurrentRecords[0] ?? {}, "inputTokens"),
      `exit ${concurrentResult.status}\n     stdout: ${concurrentResult.stdout}\n     stderr: ${concurrentResult.stderr}\n     ledger: ${JSON.stringify(concurrentRecords)}\n     first calls: ${JSON.stringify(firstCalls)}\n     second calls: ${JSON.stringify(secondCalls)}`,
    )
  }

  const reservedLog = join(root, "launch", "budget-reserved-calls.jsonl")
  const reservedResult = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile], {
    path: blocked.path,
    env: {
      ...orcaEnv([
        ...linearIssueStub(["repo:ui", "tier:deep"]),
        {
          match: "worktree create",
          stdout: JSON.stringify({ ok: false, error: { message: "stop after reserved budget" } }),
          exit: 1,
        },
      ]),
      ORBIT_TEST_AI_QUOTA: unavailableCodexQuota,
      ORBIT_AUTOMATION_BUDGET_LEDGER: stage("launch/budget-reserved.jsonl", `${inWindowRecord("prior-routine", 600_000, 350_000)}\n`),
      ORBIT_ORCA_LOG: reservedLog,
    },
  })
  T(
    "launch-worker.mjs: under the token fallback tier:deep is blocked before worktree creation",
    reservedResult.status === 4 &&
      /blocked:[\s\S]*projected spend 1200000 tokens/.test(reservedResult.stderr) &&
      !createdAWorktree(reservedLog),
    `exit ${reservedResult.status}\n     ${reservedResult.stderr}\n     created a worktree: ${createdAWorktree(reservedLog)}`,
  )

  /**
   * An UNAVAILABLE provider reading is an honest answer, not a tool failure. The launcher used to
   * exit 3 on it, which is stricter than automation-budget's own policy and refuses every launch
   * while the Orca window is not scrapeable; that reading was measured flipping OK to UNAVAILABLE
   * twice on an idle machine inside twenty minutes. So the bounded token fallback must be able to
   * fire, AND must still be able to refuse. Both halves, or the relaxation is just a hole.
   */
  const fallbackPermits = stageLaunchWorker("budget-unavailable-permits", INTERACTIVE_CODEX, "codex")
  const fallbackPermitsLog = join(fallbackPermits.base, "orca-calls.jsonl")
  const fallbackPermitsResult = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile], {
    path: fallbackPermits.path,
    env: {
      ...orcaEnv([
        ...linearIssueStub(["repo:ui"]),
        { match: "worktree create", stdout: JSON.stringify({ ok: false, error: { message: "stop after the fuse passed" } }), exit: 1 },
        { match: "terminal stop", stdout: JSON.stringify({ ok: true, result: {} }) },
        { match: "worktree rm", stdout: JSON.stringify({ ok: true, result: {} }) },
      ]),
      ORBIT_TEST_AI_QUOTA: unavailableCodexQuota,
      ORBIT_AUTOMATION_BUDGET_LEDGER: join(fallbackPermits.base, "automation-budget.jsonl"),
      ORBIT_ORCA_LOG: fallbackPermitsLog,
    },
  })
  T(
    "launch-worker.mjs: an unavailable provider reading does not by itself refuse a launch the token fallback permits",
    fallbackPermitsResult.status === 3 &&
      /codex UNAVAILABLE, so automation-budget gates this launch on the token budget/.test(fallbackPermitsResult.stderr) &&
      /worktree create[\s\S]*stop after the fuse passed/.test(fallbackPermitsResult.stderr) &&
      createdAWorktree(fallbackPermitsLog),
    `exit ${fallbackPermitsResult.status}\n     ${fallbackPermitsResult.stderr.trim().split("\n").slice(-4).join("\n     ")}`,
  )

  const fallbackBlocks = stageLaunchWorker("budget-unavailable-blocks", INTERACTIVE_CODEX, "codex")
  const fallbackBlocksLog = join(fallbackBlocks.base, "orca-calls.jsonl")
  const fallbackBlocksResult = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile], {
    path: fallbackBlocks.path,
    env: {
      ...orcaEnv(linearIssueStub(["repo:ui"])),
      ORBIT_TEST_AI_QUOTA: unavailableCodexQuota,
      ORBIT_AUTOMATION_BUDGET_LEDGER: stage("launch/budget-unavailable-blocks.jsonl", `${inWindowRecord("prior-routine", 600_000, 350_000)}\n`),
      ORBIT_ORCA_LOG: fallbackBlocksLog,
    },
  })
  T(
    "launch-worker.mjs: the token fallback still refuses a launch that would cross the token budget",
    fallbackBlocksResult.status === 4 &&
      /blocked/.test(fallbackBlocksResult.stderr) &&
      !createdAWorktree(fallbackBlocksLog),
    `exit ${fallbackBlocksResult.status}, expected 4\n     ${fallbackBlocksResult.stderr.trim().split("\n").slice(-4).join("\n     ")}`,
  )

    /** The shared default now carries the ceiling, so the refusal needs a budget that explicitly omits it. */
  const budgetWithoutCeiling = { ...DEFAULT_AUTOMATION_BUDGET }
  delete budgetWithoutCeiling.accountUsedPercentCeiling
  const noCeiling = stageLaunchWorker("budget-no-account-ceiling", { ...INTERACTIVE_CODEX, automationBudget: budgetWithoutCeiling }, "codex")
  check(
    "launch-worker.mjs",
    "refuses a worker that declares no provider account ceiling",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 2, stderr: /automationBudget\.accountUsedPercentCeiling as a number from 0 to 100[\s\S]*only figure that refuses a launch/ },
    { path: noCeiling.path, env: orcaEnv(linearIssueStub(["repo:ui"])) },
  )
  check(
    "launch-worker.mjs",
    "reports the resolved account ceiling in the plan",
    ["--issue", "ORB-75", "--prompt-file", promptFile, "--dry-run"],
    { status: 0, stdout: /"accountCeilingPercent": 85/ },
    { path: fallbackPermits.path, env: orcaEnv(linearIssueStub(["repo:ui"])) },
  )

  const malformedClaudeReset = stageLaunchWorker("budget-malformed-claude-reset", INTERACTIVE_WORKER)
  const malformedClaudeResult = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile], {
    path: malformedClaudeReset.path,
    env: {
      ...orcaEnv(linearIssueStub(["repo:ui"])),
      ORBIT_TEST_AI_QUOTA: JSON.stringify({
        claude: { status: "OK", weeklyPercent: 10, sessionPercent: 5, resetsIn: "later" },
        codex: { status: "OK", usedPercent: 10, windowDays: 7, resetsAt: 1894060800, hasCredits: false, planType: "pro" },
      }),
      ORBIT_AUTOMATION_BUDGET_LEDGER: join(malformedClaudeReset.base, "automation-budget.jsonl"),
    },
  })
  T(
    "launch-worker.mjs: a malformed Claude reset duration fails closed",
    malformedClaudeResult.status === 3 && /unsupported Claude reset duration/.test(malformedClaudeResult.stderr),
    `exit ${malformedClaudeResult.status}\n     ${malformedClaudeResult.stderr}`,
  )

  const compactClaudeReset = stageLaunchWorker("budget-compact-claude-reset", INTERACTIVE_WORKER)
  const compactLog = join(root, "launch", "budget-compact-calls.jsonl")
  const compactClaudeResult = run("launch-worker.mjs", ["--issue", "ORB-75", "--prompt-file", promptFile], {
    path: compactClaudeReset.path,
    env: {
      ...orcaEnv([
        ...linearIssueStub(["repo:ui"]),
        {
          match: "worktree create",
          stdout: JSON.stringify({ ok: false, error: { message: "stop after budget" } }),
          exit: 1,
        },
      ]),
      ORBIT_AUTOMATION_BUDGET_LEDGER: join(compactClaudeReset.base, "automation-budget.jsonl"),
      ORBIT_ORCA_LOG: compactLog,
    },
  })
  const compactCalls = existsSync(compactLog)
    ? readFileSync(compactLog, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    : []
  T(
    "launch-worker.mjs: a compact Claude reset duration reaches worktree creation after the fuse passes",
    compactClaudeResult.status === 3 &&
      /worktree create[\s\S]*failed: stop after budget/.test(compactClaudeResult.stderr) &&
      compactCalls.some((argumentsList) => argumentsList[0].split(/[\\/]/).pop() === "worktree" && argumentsList[1] === "create"),
    `exit ${compactClaudeResult.status}\n     ${compactClaudeResult.stderr}\n     ${JSON.stringify(compactCalls)}`,
  )

  trustScreenCases()
  pointerDeliveryCases()
  terminalCreateRetryCases()
  await launchConcurrencyCases(promptFile)

  contractClauseCases()
  configAuthorityCases(promptFile)
  findingStrikeCases(promptFile)
  waveLaunchCases()

  const agentsSource = readFileSync(join(REPO_ROOT, "AGENTS.md"), "utf8")
  T(
    "AGENTS.md: the standing worker contract forbids opening a draft pull request",
    agentsSource.includes(NO_DRAFT_PULL_REQUEST_CLAUSE),
    `AGENTS.md no longer contains ${NO_DRAFT_PULL_REQUEST_CLAUSE}`,
  )
  T(
    "launch-worker.mjs: AGENTS.md requires the same full-surface completion poll",
    FULL_SURFACE_POLL.test(agentsSource),
    "AGENTS.md no longer requires worker-status to inventory every review activity surface and fail closed.",
  )
}

export { launchWorkerCases as cases }
