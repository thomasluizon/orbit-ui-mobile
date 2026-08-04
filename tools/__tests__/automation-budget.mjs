import { spawnSyncHidden as spawnSync } from "../lib/subprocess-options.mjs"
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs"
import { isAbsolute, join, relative, resolve } from "node:path"

import { TOOLS_DIR, T, root, stage, run, check, exitedProbePid, budgetRecord } from "./_harness.mjs"

/**
 * Three verbatim `node tools/ai-quota.mjs --json` readings, captured on this machine on
 * 2026-07-31 and committed unedited. Nothing here is hand-written: the tool's contract was
 * confirmed by RUNNING it, including that with both providers down it exits 1 and still writes
 * the whole object to stdout.
 *
 * All three shapes are real and all three are load-bearing. The claude arm reads its figure by
 * scraping an Orca accessibility tree, so `ai-quota-claude-unavailable.json` (one arm down, the
 * other unmoved) is the COMMON reading, not an edge case; two captures twenty minutes apart on an
 * idle machine differed by exactly that.
 */
const QUOTA_BOTH_OK = "ai-quota-both-ok.json"
const QUOTA_CLAUDE_UNAVAILABLE = "ai-quota-claude-unavailable.json"
const QUOTA_BOTH_UNAVAILABLE = "ai-quota-both-unavailable.json"

const automationBudgetCases = () => {
  const quotaFixture = (name) => join(TOOLS_DIR, "__fixtures__", name)
  /**
   * F-5's first half. A stranded reservation was found in the PRODUCTION ledger that was never a
   * worker at all: it matched this suite's own fixture field for field, including a mocked
   * usedPercent, and no worktree, transcript or session ever existed for it. These two readings
   * bracket the whole module, so a case that writes one production byte is named at the end.
   */
  const helpOutput = run("automation-budget.mjs", ["--help"])
  const productionLedgerPath = helpOutput.stdout.match(/defaults to ORBIT_AUTOMATION_BUDGET_LEDGER or (.+?)\r?\n/)?.[1] ?? ""
  const productionLedgerState = () =>
    existsSync(productionLedgerPath)
      ? `${statSync(productionLedgerPath).size}@${statSync(productionLedgerPath).mtimeMs}`
      : "absent"
  const productionLedgerBefore = productionLedgerState()

  const resetAt = "2030-01-08T00:00:00Z"
  const checkArgs = (identity, ledger, invocationTokens = 100, extra = [], quota = quotaFixture(QUOTA_BOTH_UNAVAILABLE), ceilingPercent = "85") => [
    "check",
    "--engine",
    "claude",
    "--identity",
    identity,
    "--tier",
    "routine",
    "--reset-at",
    resetAt,
    "--account-ceiling-percent",
    ceilingPercent,
    "--quota",
    quota,
    "--warning-tokens",
    "800",
    "--budget-tokens",
    "1000",
    "--invocation-tokens",
    String(invocationTokens),
    "--ledger",
    ledger,
    ...extra,
  ]
  const recordArgs = (identity, ledger) => [
    "record",
    "--identity",
    identity,
    "--engine",
    "claude",
    "--tier",
    "routine",
    "--started-at",
    "2030-01-02T09:00:00Z",
    "--ended-at",
    "2030-01-02T10:00:00Z",
    "--input-tokens",
    "10",
    "--output-tokens",
    "5",
    "--ledger",
    ledger,
  ]
  const ledgerBelow = stage("budget/below-warning.jsonl", `${budgetRecord("fixture-below", 500, 199)}\n`)
  const ledgerWarning = stage("budget/at-warning.jsonl", `${budgetRecord("fixture-warning", 500, 200)}\n`)
  const ledgerBlock = stage("budget/cross-budget.jsonl", `${budgetRecord("fixture-block", 600, 301)}\n`)

  const belowWarning = run("automation-budget.mjs", checkArgs("next-below", ledgerBelow))
  T(
    "automation-budget.mjs: a token projection below the configured warning proceeds, naming the unavailable reading it fell back from",
    belowWarning.status === 0 &&
      belowWarning.stdout === "" &&
      belowWarning.stderr.trim().split("\n").length === 1 &&
      /claude account usage is UNAVAILABLE and is not being read as zero/.test(belowWarning.stderr),
    `exit ${belowWarning.status}\n     stdout: ${belowWarning.stdout}\n     stderr: ${belowWarning.stderr}`,
  )
  const silentWithReading = run(
    "automation-budget.mjs",
    checkArgs("next-below-with-reading", ledgerBelow, 100, [], quotaFixture(QUOTA_BOTH_OK)),
  )
  T(
    "automation-budget.mjs: an available provider reading below the ceiling proceeds silently",
    silentWithReading.status === 0 && silentWithReading.stdout === "" && silentWithReading.stderr === "",
    `exit ${silentWithReading.status}\n     stdout: ${silentWithReading.stdout}\n     stderr: ${silentWithReading.stderr}`,
  )
  check(
    "automation-budget.mjs",
    "a token projection at the configured warning proceeds with the budget figures",
    checkArgs("next-warning", ledgerWarning),
    { status: 0, stderr: /warning[\s\S]*next-warning[\s\S]*800 tokens[\s\S]*warning 800 tokens[\s\S]*budget 1000 tokens[\s\S]*observed spend 700 tokens/ },
  )
  check(
    "automation-budget.mjs",
    "a launch that would cross the token budget is blocked with budget, spend, and invocation",
    checkArgs("next-blocked", ledgerBlock),
    { status: 4, stderr: /next-blocked[\s\S]*budget 1000 tokens[\s\S]*observed spend 901 tokens[\s\S]*reservation 100 tokens[\s\S]*projected spend 1001 tokens/ },
  )
  const exactBudget = run(
    "automation-budget.mjs",
    checkArgs("deep-exact", stage("budget/exact.jsonl", `${budgetRecord("prior-deep", 500, 250)}\n`), 250)
      .map((value) => value === "routine" ? "reserved" : value),
  )
  T(
    "automation-budget.mjs: an invocation may consume the exact remaining token budget",
    exactBudget.status === 0 && /warning[\s\S]*1000 tokens/.test(exactBudget.stderr),
    `exit ${exactBudget.status}\n     stdout: ${exactBudget.stdout}\n     stderr: ${exactBudget.stderr}`,
  )
  check(
    "automation-budget.mjs",
    "every invocation blocks when it exceeds the token budget",
    checkArgs("deep-over-budget", ledgerBlock, 250, ["--json"]).map((value) => value === "routine" ? "reserved" : value),
    { status: 4, stdout: /"status":"BLOCK"[\s\S]*"projectedTokens":1151/, stderr: /blocked:[\s\S]*projected spend 1151 tokens/ },
  )

  check(
    "automation-budget.mjs",
    "a malformed ledger is rejected instead of silently changing the fuse total",
    checkArgs("broken-check", stage("budget/broken.jsonl", "{nope}\n")),
    { status: 3, stderr: /ledger line 1 is not valid JSON/ },
  )

  const deadOwnerLedger = stage("budget/dead-lock-owner.jsonl", "")
  const deadOwnerLock = `${deadOwnerLedger}.lock`
  const deadOwnerProbe = spawnSync(
    process.execPath,
    ["-e", "process.stdout.write(String(process.pid))"],
    { encoding: "utf8" },
  )
  const deadOwnerPid = Number(deadOwnerProbe.stdout)
  writeFileSync(
    deadOwnerLock,
    `${JSON.stringify({ pid: deadOwnerPid, acquiredAt: new Date().toISOString() })}\n`,
  )
  const deadOwnerRecovery = run(
    "automation-budget.mjs",
    recordArgs("after-dead-lock", deadOwnerLedger),
  )
  T(
    "automation-budget.mjs: a lock whose owner PID is provably dead is reclaimed immediately",
    deadOwnerProbe.status === 0 &&
      Number.isSafeInteger(deadOwnerPid) &&
      deadOwnerRecovery.status === 0 &&
      !existsSync(deadOwnerLock),
    `probe exit ${deadOwnerProbe.status}, pid ${deadOwnerPid}\n     record exit ${deadOwnerRecovery.status}\n     ${deadOwnerRecovery.stderr}`,
  )

  const corruptLockLedger = stage("budget/stale-corrupt-lock.jsonl", "")
  const corruptLock = `${corruptLockLedger}.lock`
  writeFileSync(corruptLock, "{not-json\n")
  const staleLockTime = new Date(Date.now() - 10_000)
  utimesSync(corruptLock, staleLockTime, staleLockTime)
  const corruptLockRecovery = run(
    "automation-budget.mjs",
    recordArgs("after-corrupt-lock", corruptLockLedger),
  )
  T(
    "automation-budget.mjs: an old malformed lock marker is reclaimed",
    corruptLockRecovery.status === 0 && !existsSync(corruptLock),
    `record exit ${corruptLockRecovery.status}\n     ${corruptLockRecovery.stderr}`,
  )

  const liveOwnerLedger = stage("budget/live-lock-owner.jsonl", "")
  const liveOwnerLock = `${liveOwnerLedger}.lock`
  const liveOwnerMarker = `${JSON.stringify({
    pid: process.pid,
    acquiredAt: "2000-01-01T00:00:00.000Z",
  })}\n`
  writeFileSync(liveOwnerLock, liveOwnerMarker)
  utimesSync(liveOwnerLock, staleLockTime, staleLockTime)
  const liveOwnerRefusal = run(
    "automation-budget.mjs",
    recordArgs("blocked-by-live-lock", liveOwnerLedger),
    { env: { AUTOMATION_BUDGET_TEST_LOCK_TIMEOUT_MS: "100" } },
  )
  const liveOwnerPreserved =
    existsSync(liveOwnerLock) && readFileSync(liveOwnerLock, "utf8") === liveOwnerMarker
  rmSync(liveOwnerLock, { force: true })
  T(
    "automation-budget.mjs: an old lock owned by a live PID is never stolen",
    liveOwnerRefusal.status === 3 &&
      /timed out waiting for ledger lock/.test(liveOwnerRefusal.stderr) &&
      liveOwnerPreserved,
    `record exit ${liveOwnerRefusal.status}\n     preserved ${liveOwnerPreserved}\n     ${liveOwnerRefusal.stderr}`,
  )

  const contextOnlyLedger = stage(
    "budget/account-context.jsonl",
    `${budgetRecord("context-only", 1, 1, "routine", "claude", {
      accountContext: {
        scope: "account",
        attributed: false,
        usedPercent: 99,
        observedAt: "2030-01-02T10:00:00.000Z",
      },
    })}\n`,
  )
  check(
    "automation-budget.mjs",
    "account usedPercent is context and cannot affect the token fuse",
    checkArgs("context-next", contextOnlyLedger, 1, ["--json"]),
    { status: 0, stdout: /"status":"PROCEED"[\s\S]*"projectedTokens":3[\s\S]*"totalTokens":2/ },
  )

  const pendingLedger = stage("budget/pending.jsonl", `${budgetRecord("pending-invocation", undefined, undefined)}\n`)
  check(
    "automation-budget.mjs",
    "an absent token measurement fails closed instead of becoming zero",
    checkArgs("after-pending", pendingLedger),
    { status: 3, stderr: /after-pending[\s\S]*lack input or output tokens[\s\S]*pending-invocation/ },
  )
  check(
    "automation-budget.mjs",
    "an unmeasured record still fails closed for every invocation tier",
    checkArgs("reserved-after-pending", pendingLedger, 100, ["--json"])
      .map((value) => value === "routine" ? "reserved" : value),
    {
      status: 3,
      stderr: /lack input or output tokens[\s\S]*pending-invocation/,
    },
  )
  const correctedLedger = stage(
    "budget/corrected.jsonl",
    `${budgetRecord("corrected-invocation", undefined, undefined)}\n${budgetRecord("corrected-invocation", 300, 200)}\n`,
  )
  check(
    "automation-budget.mjs",
    "a later authoritative append for the same identity closes its pending measurement",
    checkArgs("after-correction", correctedLedger, 100, ["--json"]),
    { status: 0, stdout: /"projectedTokens":600[\s\S]*"totalTokens":500[\s\S]*"missingIdentities":\[\]/ },
  )

  /**
   * Cache reads are recorded and never charged. Measured on the ORB-153 launch: raw input was
   * 5,681,754 tokens of which 5,399,808 were cache reads, so the raw figure blocks a 1,000,000
   * budget and the uncached figure proceeds. Every fixture here is sized so the two answers
   * differ, which is the only way the assertion can fail when the subtraction is dropped.
   */
  const cachedLedger = stage(
    "budget/cached-input.jsonl",
    `${JSON.stringify({
      identity: "cache-heavy",
      engine: "claude",
      tier: "routine",
      startedAt: "2030-01-02T09:00:00.000Z",
      endedAt: "2030-01-02T10:00:00.000Z",
      inputTokens: 900,
      cachedInputTokens: 850,
      outputTokens: 20,
    })}\n`,
  )
  check(
    "automation-budget.mjs",
    "cache reads are recorded but never counted as spend",
    checkArgs("after-cache-heavy", cachedLedger, 100, ["--json"]),
    {
      status: 0,
      stdout: /"status":"PROCEED"[\s\S]*"projectedTokens":170[\s\S]*"inputTokens":50,"outputTokens":20,"totalTokens":70,"routineTokens":70/,
    },
  )
  check(
    "automation-budget.mjs",
    "record keeps the raw provider input alongside its cache-read share",
    [
      "record",
      "--identity",
      "cache-round-trip",
      "--engine",
      "claude",
      "--tier",
      "routine",
      "--started-at",
      "2030-01-02T09:00:00Z",
      "--ended-at",
      "2030-01-02T10:00:00Z",
      "--input-tokens",
      "900",
      "--cached-input-tokens",
      "850",
      "--output-tokens",
      "20",
      "--ledger",
      stage("budget/cache-round-trip.jsonl", ""),
      "--json",
    ],
    { status: 0, stdout: /"inputTokens":900,"cachedInputTokens":850,"outputTokens":20/ },
  )
  check(
    "automation-budget.mjs",
    "a cache-read count without its raw input is refused rather than assumed",
    [
      "record",
      "--identity",
      "cache-without-input",
      "--engine",
      "claude",
      "--tier",
      "routine",
      "--started-at",
      "2030-01-02T09:00:00Z",
      "--ended-at",
      "2030-01-02T10:00:00Z",
      "--cached-input-tokens",
      "850",
      "--output-tokens",
      "20",
      "--ledger",
      stage("budget/cache-without-input.jsonl", ""),
    ],
    { status: 2, stderr: /--cached-input-tokens requires --input-tokens and cannot exceed it/ },
  )
  check(
    "automation-budget.mjs",
    "a ledger row claiming more cache reads than raw input is rejected",
    checkArgs(
      "after-impossible-cache",
      stage(
        "budget/impossible-cache.jsonl",
        `${JSON.stringify({
          identity: "impossible-cache",
          engine: "claude",
          tier: "routine",
          startedAt: "2030-01-02T09:00:00.000Z",
          endedAt: "2030-01-02T10:00:00.000Z",
          inputTokens: 100,
          cachedInputTokens: 101,
          outputTokens: 20,
        })}\n`,
      ),
    ),
    { status: 3, stderr: /cachedInputTokens must not exceed inputTokens/ },
  )

  /**
   * The reservation lease. Every row below is built relative to the wall clock, because the
   * lease is the only rule in this tool that reads it, and both of its edges have to hold:
   * inside the lease a reservation still holds budget, past it the row releases itself. The
   * unmeasured rows copy the exact shape the production ledger carries for a reservation
   * written before `reserve` persisted `pending`: no pending key, no reserved figure, no
   * tokens. That shape is why the fuse refused every codex launch for a full week.
   */
  /**
   * ABSOLUTE ages, never an offset derived from the tool's own constants. A fixture aged
   * relative to the compiled-in lease can never fail when that lease moves, it moves with it,
   * which is how raising the unclaimed lease from two hours to sixteen re-poisoned the real
   * production ledger with the whole suite still green. These four hold the two arms between
   * fixed walls: change either constant far enough to re-break a four hour old legacy row, or
   * to expire a fourteen hour session that is still running, and a case goes red.
   */
  const HOUR_MILLISECONDS = 60 * 60 * 1000
  const leaseResetAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const leaseCheckArgs = (identity, ledger, invocationTokens, quota = quotaFixture(QUOTA_BOTH_UNAVAILABLE), ceilingPercent = "85") => [
    "check",
    "--engine",
    "codex",
    "--identity",
    identity,
    "--tier",
    "routine",
    "--reset-at",
    leaseResetAt,
    "--account-ceiling-percent",
    ceilingPercent,
    "--quota",
    quota,
    "--warning-tokens",
    "800000",
    "--budget-tokens",
    "1000000",
    "--invocation-tokens",
    String(invocationTokens),
    "--ledger",
    ledger,
    "--json",
  ]
  /**
   * The committed production row, read off disk rather than retyped, so the SHAPE this suite
   * defends is the one a pre-C1 `reserve` actually wrote: no pending, no reservedTokens, no
   * token measurements, no workerPid. Only the timestamps are moved, to the absolute age each
   * case names in its own label.
   */
  const LEGACY_FIXTURE = JSON.parse(
    readFileSync(join(TOOLS_DIR, "__fixtures__", "legacy-reservation.jsonl"), "utf8").trim(),
  )
  const legacyReservation = (identity, endedAgoMilliseconds) => {
    const endedAt = new Date(Date.now() - endedAgoMilliseconds).toISOString()
    return JSON.stringify({
      ...LEGACY_FIXTURE,
      identity,
      startedAt: new Date(Date.now() - endedAgoMilliseconds - 13_000).toISOString(),
      endedAt,
      accountContext: { ...LEGACY_FIXTURE.accountContext, observedAt: endedAt },
    })
  }
  T(
    "automation-budget.mjs: the committed legacy fixture still carries the pre-C1 reservation shape",
    LEGACY_FIXTURE.engine === "codex" &&
      LEGACY_FIXTURE.tier === "routine" &&
      typeof LEGACY_FIXTURE.identity === "string" &&
      LEGACY_FIXTURE.accountContext?.scope === "account" &&
      ["pending", "reservedTokens", "inputTokens", "outputTokens", "workerPid", "cancelled"].every(
        (field) => !Object.hasOwn(LEGACY_FIXTURE, field),
      ),
    `tools/__fixtures__/legacy-reservation.jsonl: ${JSON.stringify(LEGACY_FIXTURE)}`,
  )
  const leasedReservation = (identity, endedAgoMilliseconds, reservedTokens, workerPid) =>
    JSON.stringify({
      identity,
      engine: "codex",
      tier: "routine",
      startedAt: new Date(Date.now() - endedAgoMilliseconds - 13_000).toISOString(),
      endedAt: new Date(Date.now() - endedAgoMilliseconds).toISOString(),
      pending: true,
      reservedTokens,
      ...(workerPid === undefined ? {} : { workerPid }),
    })
  const measuredInvocation = (identity, endedAgoMilliseconds, inputTokens, outputTokens) =>
    JSON.stringify({
      identity,
      engine: "codex",
      tier: "routine",
      startedAt: new Date(Date.now() - endedAgoMilliseconds - 60_000).toISOString(),
      endedAt: new Date(Date.now() - endedAgoMilliseconds).toISOString(),
      inputTokens,
      outputTokens,
    })

  check(
    "automation-budget.mjs",
    "a legacy reservation four hours old no longer refuses a launch the budget permits",
    leaseCheckArgs(
      "after-expired-legacy",
      stage(
        "budget/expired-legacy.jsonl",
        `${legacyReservation("ORB-163:stranded", 4 * HOUR_MILLISECONDS)}\n`,
      ),
      100000,
    ),
    {
      status: 0,
      stdout: /"status":"PROCEED"[\s\S]*"projectedTokens":100000[\s\S]*"pendingTokens":0,"missingIdentities":\[\],"expiredIdentities":\["ORB-163:stranded"\]/,
      stderr: /reservation lease expired for identities ORB-163:stranded/,
    },
  )
  check(
    "automation-budget.mjs",
    "a legacy reservation one hour old still fails the fuse closed",
    leaseCheckArgs(
      "after-live-legacy",
      stage(
        "budget/live-legacy.jsonl",
        `${legacyReservation("ORB-163:in-flight", HOUR_MILLISECONDS)}\n`,
      ),
      100000,
    ),
    { status: 3, stderr: /lack input or output tokens[\s\S]*ORB-163:in-flight/ },
  )
  check(
    "automation-budget.mjs",
    "an unclaimed reservation one hour old still holds its reserved tokens",
    leaseCheckArgs(
      "after-live-reservation",
      stage(
        "budget/live-reservation.jsonl",
        `${leasedReservation("ORB-163:live", HOUR_MILLISECONDS, 250000)}\n`,
      ),
      100000,
    ),
    {
      status: 0,
      stdout: /"status":"PROCEED"[\s\S]*"projectedTokens":350000[\s\S]*"pendingTokens":250000,"missingIdentities":\[\],"expiredIdentities":\[\]/,
    },
  )
  check(
    "automation-budget.mjs",
    "an unclaimed reservation four hours old stops holding budget",
    leaseCheckArgs(
      "after-killed-launcher",
      stage(
        "budget/expired-reservation.jsonl",
        `${leasedReservation("ORB-163:killed-launcher", 4 * HOUR_MILLISECONDS, 250000)}\n`,
      ),
      100000,
    ),
    {
      status: 0,
      stdout: /"projectedTokens":100000[\s\S]*"pendingTokens":0,"missingIdentities":\[\],"expiredIdentities":\["ORB-163:killed-launcher"\]/,
    },
  )
  check(
    "automation-budget.mjs",
    "a reservation whose worker process is gone expires well inside its lease",
    leaseCheckArgs(
      "after-dead-worker",
      stage(
        "budget/dead-worker.jsonl",
        `${leasedReservation("ORB-163:dead-worker", 60_000, 250000, exitedProbePid())}\n`,
      ),
      100000,
    ),
    {
      status: 0,
      stdout: /"projectedTokens":100000[\s\S]*"pendingTokens":0,"missingIdentities":\[\],"expiredIdentities":\["ORB-163:dead-worker"\]/,
      stderr: /reservation lease expired for identities ORB-163:dead-worker/,
    },
  )
  check(
    "automation-budget.mjs",
    "a live worker PID fourteen hours in still holds its tokens, because real sessions run that long",
    leaseCheckArgs(
      "after-live-worker",
      stage(
        "budget/live-worker.jsonl",
        `${leasedReservation("ORB-163:live-worker", 14 * HOUR_MILLISECONDS, 250000, process.pid)}\n`,
      ),
      100000,
    ),
    {
      status: 0,
      stdout: /"projectedTokens":350000[\s\S]*"pendingTokens":250000,"missingIdentities":\[\],"expiredIdentities":\[\]/,
    },
  )
  check(
    "automation-budget.mjs",
    "a live worker PID eighteen hours in still expires, so a recycled PID can never poison the fuse forever",
    leaseCheckArgs(
      "after-recycled-pid",
      stage(
        "budget/recycled-pid.jsonl",
        `${leasedReservation("ORB-163:recycled-pid", 18 * HOUR_MILLISECONDS, 250000, process.pid)}\n`,
      ),
      100000,
    ),
    {
      status: 0,
      stdout: /"projectedTokens":100000[\s\S]*"pendingTokens":0,"missingIdentities":\[\],"expiredIdentities":\["ORB-163:recycled-pid"\]/,
      stderr: /reservation lease expired for identities ORB-163:recycled-pid/,
    },
  )
  const claimedLedger = stage("budget/claimed.jsonl", `${leasedReservation("ORB-163:to-claim", 60_000, 250000)}\n`)
  const claimed = run("automation-budget.mjs", [
    "claim",
    "--identity",
    "ORB-163:to-claim",
    "--engine",
    "codex",
    "--tier",
    "routine",
    "--started-at",
    new Date(Date.now() - 73_000).toISOString(),
    "--ended-at",
    new Date().toISOString(),
    "--invocation-tokens",
    "250000",
    "--worker-pid",
    String(process.pid),
    "--ledger",
    claimedLedger,
    "--json",
  ])
  const claimedRows = existsSync(claimedLedger)
    ? readFileSync(claimedLedger, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    : []
  T(
    "automation-budget.mjs: claim attaches the running worker PID to an open reservation",
    claimed.status === 0 &&
      /"status":"CLAIMED"/.test(claimed.stdout) &&
      claimedRows.length === 2 &&
      claimedRows[1]?.pending === true &&
      claimedRows[1]?.workerPid === process.pid &&
      claimedRows[1]?.reservedTokens === 250000,
    `exit ${claimed.status}\n     ${claimed.stderr}\n     ${JSON.stringify(claimedRows)}`,
  )
  check(
    "automation-budget.mjs",
    "claim refuses an identity whose latest record is not an open reservation",
    [
      "claim",
      "--identity",
      "ORB-163:measured-already",
      "--engine",
      "codex",
      "--tier",
      "routine",
      "--started-at",
      new Date(Date.now() - 73_000).toISOString(),
      "--ended-at",
      new Date().toISOString(),
      "--invocation-tokens",
      "250000",
      "--worker-pid",
      String(process.pid),
      "--ledger",
      stage("budget/claim-closed.jsonl", `${measuredInvocation("ORB-163:measured-already", 60_000, 10, 5)}\n`),
    ],
    { status: 3, stderr: /is not an open reservation/ },
  )
  check(
    "automation-budget.mjs",
    "a ledger row carrying a worker PID without a reservation is rejected",
    leaseCheckArgs(
      "after-orphan-pid",
      stage(
        "budget/orphan-pid.jsonl",
        `${JSON.stringify({
          identity: "ORB-163:orphan-pid",
          engine: "codex",
          tier: "routine",
          startedAt: "2026-07-30T09:00:00.000Z",
          endedAt: "2026-07-30T10:00:00.000Z",
          inputTokens: 10,
          outputTokens: 5,
          workerPid: 1234,
        })}\n`,
      ),
      100000,
    ),
    { status: 3, stderr: /workerPid is only valid on a pending reservation/ },
  )
  check(
    "automation-budget.mjs",
    "a half-measured invocation keeps failing closed for the whole window, no lease applies",
    leaseCheckArgs(
      "after-half-measured",
      stage(
        "budget/half-measured.jsonl",
        `${JSON.stringify({
          identity: "ORB-163:half-measured",
          engine: "codex",
          tier: "routine",
          startedAt: new Date(Date.now() - 4 * HOUR_MILLISECONDS - 60_000).toISOString(),
          endedAt: new Date(Date.now() - 4 * HOUR_MILLISECONDS).toISOString(),
          inputTokens: 900,
        })}\n`,
      ),
      100000,
    ),
    { status: 3, stderr: /lack input or output tokens[\s\S]*ORB-163:half-measured/ },
  )
  check(
    "automation-budget.mjs",
    "an expired lease never softens a real token block",
    leaseCheckArgs(
      "after-expired-block",
      stage(
        "budget/expired-with-spend.jsonl",
        [
          legacyReservation("ORB-163:stranded-beside-spend", 4 * HOUR_MILLISECONDS),
          measuredInvocation("ORB-163:measured", 4 * HOUR_MILLISECONDS, 900000, 50000),
          "",
        ].join("\n"),
      ),
      100000,
    ),
    { status: 4, stderr: /blocked:[\s\S]*projected spend 1050000 tokens/ },
  )

  /**
   * The provider ceiling, which is now the only thing that can refuse a launch.
   *
   * Every ledger below is pinned at the ABSOLUTE figure the live window really carried on
   * 2026-07-31: one codex worker session charged 827,711 uncached input and 60,858 output, so
   * 888,569 tokens, 89 percent of the configured 1,000,000 budget, while the provider's own
   * reading did not move off usedPercent 11. Nothing here is derived from the tool's own numbers,
   * so moving the ceiling or the budget turns a case red instead of quietly following it.
   */
  const MEASURED_SESSION_INPUT_TOKENS = 827711
  const MEASURED_SESSION_OUTPUT_TOKENS = 60858
  const measuredSessionLedger = (label) =>
    stage(
      `budget/${label}.jsonl`,
      `${measuredInvocation("ORB-163:measured-session", 60_000, MEASURED_SESSION_INPUT_TOKENS, MEASURED_SESSION_OUTPUT_TOKENS)}\n`,
    )
  const reserveSequentially = (label, ledger, quota, identities) => {
    const startedAt = new Date(Date.now() - 13_000).toISOString()
    const endedAt = new Date().toISOString()
    return identities.map((identity) =>
      run("automation-budget.mjs", [
        "reserve",
        "--engine",
        "codex",
        "--identity",
        `${label}:${identity}`,
        "--tier",
        "routine",
        "--started-at",
        startedAt,
        "--ended-at",
        endedAt,
        "--reset-at",
        leaseResetAt,
        "--account-ceiling-percent",
        "85",
        "--quota",
        quota,
        "--warning-tokens",
        "800000",
        "--budget-tokens",
        "1000000",
        "--invocation-tokens",
        "100000",
        "--ledger",
        ledger,
        "--json",
      ]),
    )
  }
  const sequentialLedger = measuredSessionLedger("account-sequential")
  const sequential = reserveSequentially("wave", sequentialLedger, quotaFixture(QUOTA_CLAUDE_UNAVAILABLE), ["a", "b", "c"])
  const sequentialRows = readFileSync(sequentialLedger, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
  T(
    "automation-budget.mjs: a provider reading below the ceiling permits three sequential launches the token budget alone would have refused",
    sequential.every((result) => result.status === 0) &&
      /"projectedTokens":988569[\s\S]*"gate":"ACCOUNT"[\s\S]*"usedPercent":11,"ceilingPercent":85/.test(sequential[0].stdout) &&
      /"projectedTokens":1088569/.test(sequential[1].stdout) &&
      /"projectedTokens":1188569/.test(sequential[2].stdout) &&
      sequentialRows.length === 4 &&
      sequentialRows.slice(1).every((record) => record.pending === true && record.reservedTokens === 100000),
    sequential
      .map((result, index) => `reserve ${index} exit ${result.status}\n     stdout: ${result.stdout}\n     stderr: ${result.stderr}`)
      .join("\n     "),
  )
  const fallbackRefusal = reserveSequentially("wave-fallback", sequentialLedger, quotaFixture(QUOTA_BOTH_UNAVAILABLE), ["d"])[0]
  T(
    "automation-budget.mjs: the identical fourth launch is refused the moment the provider reading goes unavailable",
    fallbackRefusal.status === 4 &&
      /account usage is unavailable, so the token fallback gates this launch[\s\S]*projected spend 1288569 tokens/.test(fallbackRefusal.stderr) &&
      /"status":"BLOCK"[\s\S]*"gate":"TOKEN_FALLBACK"/.test(fallbackRefusal.stdout),
    `exit ${fallbackRefusal.status}\n     stdout: ${fallbackRefusal.stdout}\n     stderr: ${fallbackRefusal.stderr}`,
  )

  /**
   * The only figure moved off the committed capture is `usedPercent`, exactly as
   * `legacyReservation` above moves only the timestamps: the shape stays the real one, because
   * the account is at 11 percent and a 92 percent reading cannot be captured to order.
   */
  const REAL_CODEX_READING = JSON.parse(readFileSync(quotaFixture(QUOTA_CLAUDE_UNAVAILABLE), "utf8"))
  const codexUsageAt = (label, usedPercent) =>
    stage(
      `budget/quota-${label}.json`,
      JSON.stringify({ ...REAL_CODEX_READING, codex: { ...REAL_CODEX_READING.codex, usedPercent } }),
    )
  check(
    "automation-budget.mjs",
    "a provider reading above the ceiling refuses a launch an empty ledger would have permitted",
    leaseCheckArgs(
      "after-over-ceiling",
      stage("budget/account-idle.jsonl", ""),
      100000,
      codexUsageAt("over-ceiling", 92),
    ),
    {
      status: 4,
      stderr: /codex account usage 92 percent has reached the configured ceiling 85 percent/,
      stdout: /"status":"BLOCK"[\s\S]*"gate":"ACCOUNT"[\s\S]*"usedPercent":92,"ceilingPercent":85/,
    },
  )
  check(
    "automation-budget.mjs",
    "usage exactly at the ceiling refuses, because at the ceiling there is no headroom left to authorise",
    leaseCheckArgs("after-exact-ceiling", stage("budget/account-exact.jsonl", ""), 100000, quotaFixture(QUOTA_CLAUDE_UNAVAILABLE), "11"),
    { status: 4, stderr: /codex account usage 11 percent has reached the configured ceiling 11 percent/ },
  )
  check(
    "automation-budget.mjs",
    "usage one point below the ceiling proceeds",
    leaseCheckArgs("after-under-ceiling", stage("budget/account-under.jsonl", ""), 100000, quotaFixture(QUOTA_CLAUDE_UNAVAILABLE), "12"),
    { status: 0, stdout: /"gate":"ACCOUNT"[\s\S]*"usedPercent":11,"ceilingPercent":12/ },
  )
  check(
    "automation-budget.mjs",
    "the claude ceiling reads weeklyPercent, not the codex field, and blocks on it",
    checkArgs("after-claude-weekly", stage("budget/account-claude.jsonl", ""), 100, ["--json"], quotaFixture(QUOTA_BOTH_OK), "40"),
    {
      status: 4,
      stderr: /claude account usage 48 percent has reached the configured ceiling 40 percent/,
      stdout: /"gate":"ACCOUNT"[\s\S]*"usedPercent":48,"ceilingPercent":40/,
    },
  )
  check(
    "automation-budget.mjs",
    "one unavailable provider arm never disturbs the other engine's account gate",
    leaseCheckArgs("after-one-arm-down", measuredSessionLedger("account-one-arm"), 250000, quotaFixture(QUOTA_CLAUDE_UNAVAILABLE)),
    {
      status: 0,
      stdout: /"status":"WARN"[\s\S]*"projectedTokens":1138569[\s\S]*"gate":"ACCOUNT"/,
      stderr: /warning-only signal that was never derived from a measurement, so it did not refuse this launch/,
    },
  )
  check(
    "automation-budget.mjs",
    "an unavailable reading falls back to the token budget and says so on stderr",
    leaseCheckArgs("after-unavailable", measuredSessionLedger("account-unavailable"), 250000),
    {
      status: 4,
      stderr: /codex account usage is UNAVAILABLE and is not being read as zero[\s\S]*falling back to the token budget[\s\S]*projected spend 1138569 tokens/,
      stdout: /"status":"BLOCK"[\s\S]*"gate":"TOKEN_FALLBACK"[\s\S]*"status":"UNAVAILABLE"[\s\S]*"ceilingPercent":85/,
    },
  )
  check(
    "automation-budget.mjs",
    "an unmeasured record warns instead of failing closed once the provider reading gates the launch",
    leaseCheckArgs(
      "after-incomplete-with-reading",
      stage(
        "budget/account-incomplete.jsonl",
        `${JSON.stringify({
          identity: "ORB-163:half-measured-with-reading",
          engine: "codex",
          tier: "routine",
          startedAt: new Date(Date.now() - 4 * HOUR_MILLISECONDS - 60_000).toISOString(),
          endedAt: new Date(Date.now() - 4 * HOUR_MILLISECONDS).toISOString(),
          inputTokens: 900,
        })}\n`,
      ),
      100000,
      quotaFixture(QUOTA_CLAUDE_UNAVAILABLE),
    ),
    {
      status: 0,
      stderr: /token totals are incomplete for identities ORB-163:half-measured-with-reading[\s\S]*measurement is still missing from the ledger/,
      stdout: /"gate":"ACCOUNT"/,
    },
  )
  check(
    "automation-budget.mjs",
    "a named quota file that cannot be read is a hard failure, never a silent unbounded proceed",
    leaseCheckArgs(
      "after-missing-quota",
      stage("budget/account-missing-quota.jsonl", ""),
      100000,
      join(root, "budget", "no-such-quota.json"),
    ),
    { status: 3, stderr: /could not read quota reading[\s\S]*no-such-quota\.json/ },
  )
  check(
    "automation-budget.mjs",
    "a named quota file holding invalid JSON is a hard failure too, because a typo in that flag would otherwise disable the only real gate",
    leaseCheckArgs(
      "after-malformed-quota",
      stage("budget/account-malformed-quota.jsonl", ""),
      100000,
      stage("budget/malformed-quota.json", '{"codex": {"status": "OK", "usedPercent": 11\n'),
    ),
    { status: 3, stderr: /quota reading[\s\S]*malformed-quota\.json is not valid JSON/ },
  )
  check(
    "automation-budget.mjs",
    "check refuses to run at all without the account ceiling that decides the launch",
    leaseCheckArgs("after-no-ceiling", stage("budget/account-no-ceiling.jsonl", ""), 100000).filter(
      (value, index, argv) => value !== "--account-ceiling-percent" && argv[index - 1] !== "--account-ceiling-percent",
    ),
    { status: 2, stderr: /--account-ceiling-percent is required/ },
  )

  /**
   * The DEFAULT quota resolution, which is the one PRODUCTION takes and the only one no case
   * above ever ran: every case so far hands the tool a `--quota` fixture, so the third arm, where
   * the tool resolves and spawns its own reader, was wired and believed and never executed.
   *
   * It resolves that reader as `./ai-quota.mjs` beside its OWN file, read off QUOTA_TOOL_PATH in
   * the tool rather than assumed, so the only hermetic way to reach the spawn is to stage a
   * private copy of the tool and put the stub next to it. Every case below withholds `--quota`
   * and explicitly UNSETS the environment override, because an ambient one on the operator's
   * machine would otherwise send these straight back down the arm that was already covered.
   */
  const spawnedReaderEnvironment = { ORBIT_AUTOMATION_BUDGET_QUOTA: undefined }
  const stageSpawnedReader = (label, readingPath, exitCode) => {
    const toolsDirectory = join(root, "budget-spawn", label, "tools")
    mkdirSync(toolsDirectory, { recursive: true })
    cpSync(join(TOOLS_DIR, "automation-budget.mjs"), join(toolsDirectory, "automation-budget.mjs"))
    mkdirSync(join(toolsDirectory, "lib"), { recursive: true })
    cpSync(join(TOOLS_DIR, "lib", "subprocess-options.mjs"), join(toolsDirectory, "lib", "subprocess-options.mjs"))
    /**
     * The stub prints a CAPTURED reading byte for byte and never composes one, and its exit code
     * is a parameter because the real reader exits 1 while still printing a complete object.
     * A `readingPath` of undefined stages no reader at all, which is the child that cannot start.
     */
    if (readingPath !== undefined) {
      writeFileSync(
        join(toolsDirectory, "ai-quota.mjs"),
        `import { readFileSync } from "node:fs"
process.stdout.write(readFileSync(${JSON.stringify(readingPath)}, "utf8"))
process.exit(${exitCode})
`,
      )
    }
    return { path: join(toolsDirectory, "automation-budget.mjs"), readerPath: join(toolsDirectory, "ai-quota.mjs") }
  }
  const runSpawnedReaderCheck = (label, identity, readingPath, exitCode, ceilingPercent) => {
    const staged = stageSpawnedReader(label, readingPath, exitCode)
    const result = run(
      "automation-budget.mjs",
      [
        "check",
        "--engine",
        "codex",
        "--identity",
        identity,
        "--tier",
        "routine",
        "--reset-at",
        leaseResetAt,
        "--account-ceiling-percent",
        ceilingPercent,
        "--warning-tokens",
        "800000",
        "--budget-tokens",
        "1000000",
        "--invocation-tokens",
        "100000",
        "--ledger",
        stage(`budget/spawn-${label}.jsonl`, ""),
        "--json",
      ],
      { path: staged.path, env: spawnedReaderEnvironment },
    )
    /**
     * Every one of these commands emits JSON on both the permitted and the blocked path, so
     * unparseable stdout is itself the failure. It becomes a null the assertions read as wrong
     * rather than an exception, which would abort the module instead of naming the case.
     */
    let emitted = null
    try {
      emitted = JSON.parse(result.stdout)
    } catch {
      emitted = null
    }
    return { ...result, emitted, readerPath: staged.readerPath }
  }
  const spawnedReaderDetail = (result) =>
    `exit ${result.status}\n     reader: ${result.readerPath}\n     stdout: ${result.stdout}\n     stderr: ${result.stderr}`

  const spawnedBelowCeiling = runSpawnedReaderCheck(
    "below-ceiling",
    "spawned-below-ceiling",
    quotaFixture(QUOTA_CLAUDE_UNAVAILABLE),
    0,
    "85",
  )
  T(
    "automation-budget.mjs: with neither --quota nor the environment override the tool spawns its own reader and gates on the figure that reader printed",
    spawnedBelowCeiling.status === 0 &&
      spawnedBelowCeiling.emitted?.status === "PROCEED" &&
      spawnedBelowCeiling.emitted?.gate === "ACCOUNT" &&
      spawnedBelowCeiling.emitted?.accountUsage?.usedPercent === 11 &&
      resolve(spawnedBelowCeiling.emitted?.accountUsage?.source ?? ".") === resolve(spawnedBelowCeiling.readerPath),
    spawnedReaderDetail(spawnedBelowCeiling),
  )
  const spawnedOverCeiling = runSpawnedReaderCheck(
    "over-ceiling",
    "spawned-over-ceiling",
    codexUsageAt("spawned-over-ceiling", 92),
    0,
    "85",
  )
  T(
    "automation-budget.mjs: the spawned reader's own figure above the ceiling refuses the launch with exit 4",
    spawnedOverCeiling.status === 4 &&
      /codex account usage 92 percent has reached the configured ceiling 85 percent/.test(spawnedOverCeiling.stderr) &&
      spawnedOverCeiling.emitted?.status === "BLOCK" &&
      spawnedOverCeiling.emitted?.accountUsage?.usedPercent === 92 &&
      resolve(spawnedOverCeiling.emitted?.accountUsage?.source ?? ".") === resolve(spawnedOverCeiling.readerPath),
    spawnedReaderDetail(spawnedOverCeiling),
  )

  const spawnedReaderAbsent = runSpawnedReaderCheck("absent-reader", "spawned-absent-reader", undefined, 0, "85")
  T(
    "automation-budget.mjs: a spawned reader that printed nothing is unavailable and says the output was not JSON, never that the account is idle",
    spawnedReaderAbsent.status === 0 &&
      spawnedReaderAbsent.emitted?.gate === "TOKEN_FALLBACK" &&
      spawnedReaderAbsent.emitted?.accountUsage?.status === "UNAVAILABLE" &&
      spawnedReaderAbsent.emitted?.accountUsage?.usedPercent === undefined &&
      spawnedReaderAbsent.emitted?.accountUsage?.reason === "ai-quota.mjs returned output that is not JSON",
    spawnedReaderDetail(spawnedReaderAbsent),
  )
  const spawnedHonestUnavailable = runSpawnedReaderCheck(
    "honest-unavailable",
    "spawned-honest-unavailable",
    quotaFixture(QUOTA_BOTH_UNAVAILABLE),
    1,
    "85",
  )
  T(
    "automation-budget.mjs: a spawned reader exiting 1 while printing a complete UNAVAILABLE object is read anyway, and its reason never collapses into the printed-nothing one",
    spawnedHonestUnavailable.status === 0 &&
      spawnedHonestUnavailable.emitted?.gate === "TOKEN_FALLBACK" &&
      spawnedHonestUnavailable.emitted?.accountUsage?.status === "UNAVAILABLE" &&
      spawnedHonestUnavailable.emitted?.accountUsage?.reason === "ai-quota reported codex status UNAVAILABLE and usedPercent null" &&
      spawnedHonestUnavailable.emitted?.accountUsage?.reason !== spawnedReaderAbsent.emitted?.accountUsage?.reason,
    `${spawnedReaderDetail(spawnedHonestUnavailable)}\n     printed-nothing reason: ${spawnedReaderAbsent.emitted?.accountUsage?.reason}`,
  )

  /**
   * F-5's second half. The assertion is on the ledger path a child actually RECEIVES, never on a
   * write, because proving isolation by writing is the defect that put a fixture row in the real
   * ledger. Delete the ORBIT_AUTOMATION_BUDGET_LEDGER default from run() in _harness.mjs and the
   * child falls back to the tool's compiled-in production path, which this case names as not
   * isolated, with no production byte touched.
   */
  const ledgerProbe = stage(
    "budget/ledger-probe.mjs",
    `process.stdout.write(process.env.ORBIT_AUTOMATION_BUDGET_LEDGER ?? "<unset>")\n`,
  )
  const probeLedgerPath = (env) => run("ledger-probe.mjs", [], { path: ledgerProbe, ...(env === undefined ? {} : { env }) }).stdout
  const isolatedFromProduction = (path) => {
    if (typeof path !== "string" || path.length === 0 || path === "<unset>") return false
    const insideSuite = relative(resolve(root), resolve(path))
    return (
      resolve(path) !== resolve(productionLedgerPath) &&
      insideSuite.length > 0 &&
      !insideSuite.startsWith("..") &&
      !isAbsolute(insideSuite)
    )
  }
  const suiteLedgerPath = probeLedgerPath()
  const productionProbe = probeLedgerPath({ ORBIT_AUTOMATION_BUDGET_LEDGER: productionLedgerPath })
  T(
    "automation-budget.mjs: the suite hands every child a ledger inside its own temp root, never the real ~/.orbit one",
    helpOutput.status === 0 &&
      isAbsolute(productionLedgerPath) &&
      /[\\/]\.orbit[\\/]automation-budget\.jsonl$/.test(productionLedgerPath) &&
      isolatedFromProduction(suiteLedgerPath) &&
      !isolatedFromProduction(productionProbe),
    `production default from --help: ${productionLedgerPath}\n     child received: ${suiteLedgerPath}\n     unisolated control: ${productionProbe}`,
  )

  const reportLedger = stage(
    "budget/report.jsonl",
    [
      budgetRecord("report-routine", 300, 200),
      budgetRecord("report-reserved", 100, 50, "reserved"),
      budgetRecord("report-pending", undefined, undefined),
      "",
    ].join("\n"),
  )
  check(
    "automation-budget.mjs",
    "report emits deterministic token totals and missing identities as JSON",
    ["report", "--engine", "claude", "--reset-at", resetAt, "--ledger", reportLedger, "--json"],
    {
      status: 0,
      stdout:
        /"engine":"claude","inputTokens":400,"outputTokens":250,"totalTokens":650,"routineTokens":500,"reservedTokens":150,"pendingTokens":0,"missingIdentities":\["report-pending"\],"expiredIdentities":\[\],"windowStart":"2030-01-01T00:00:00.000Z","resetsAt":"2030-01-08T00:00:00.000Z"/,
    },
  )
  check(
    "automation-budget.mjs",
    "report renders deterministic token totals and missing identities as plain text",
    ["report", "--engine", "claude", "--reset-at", resetAt, "--ledger", reportLedger],
    {
      status: 0,
      stdout:
        /^claude: 650 tokens \(400 input, 250 output; 500 routine, 150 reserved, 0 pending\); missing identities: report-pending; expired reservations: none; resets at 2030-01-08T00:00:00.000Z\r?\n$/,
    },
  )

  const atomicLedger = join(root, "budget", "atomic-reservations.jsonl")
  const lockMarker = join(root, "budget", "atomic-lock-acquired")
  const lockRelease = join(root, "budget", "atomic-lock-release")
  const atomicRunner = stage(
    "budget/atomic-reservations.mjs",
    `import { spawn } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
const [tool, ledger, marker, release, quota] = process.argv.slice(2)
const common = (identity) => [
  tool, "reserve", "--engine", "claude", "--identity", identity, "--tier", "routine",
  "--started-at", "2030-01-02T09:00:00.000Z", "--ended-at", "2030-01-02T10:00:00.000Z",
  "--reset-at", "2030-01-08T00:00:00Z", "--account-ceiling-percent", "85", "--quota", quota,
  "--warning-tokens", "800",
  "--budget-tokens", "1000", "--invocation-tokens", "400", "--ledger", ledger,
]
const run = (identity, env = {}) => {
  const child = spawn(process.execPath, common(identity), {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  let stderr = ""
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk) => { stderr += chunk })
  return new Promise((resolve) => child.on("exit", (status) => resolve({ status, stderr })))
}
const first = run("atomic-a", {
  AUTOMATION_BUDGET_TEST_LOCK_MARKER: marker,
  AUTOMATION_BUDGET_TEST_LOCK_RELEASE: release,
})
const deadline = Date.now() + 5000
while (!existsSync(marker) && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 10))
}
if (!existsSync(marker)) process.exit(9)
const second = run("atomic-b")
await new Promise((resolve) => setTimeout(resolve, 100))
writeFileSync(release, "release\\n")
const results = await Promise.all([first, second])
process.stdout.write(JSON.stringify(results))
`,
  )
  const atomic = spawnSync(
    process.execPath,
    [atomicRunner, join(TOOLS_DIR, "automation-budget.mjs"), atomicLedger, lockMarker, lockRelease, quotaFixture(QUOTA_BOTH_UNAVAILABLE)],
    { encoding: "utf8", timeout: 20_000 },
  )
  const atomicResults = atomic.status === 0 ? JSON.parse(atomic.stdout) : []
  const atomicRecords = existsSync(atomicLedger)
    ? readFileSync(atomicLedger, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    : []
  T(
    "automation-budget.mjs: concurrent reservations proceed atomically below the budget",
    atomic.status === 0 &&
      atomicResults[0]?.status === 0 &&
      atomicResults[1]?.status === 0 &&
      !/lack input or output tokens/.test(atomicResults[1]?.stderr ?? "") &&
      atomicRecords.length === 2 &&
      new Set(atomicRecords.map((record) => record.identity)).size === 2 &&
      atomicRecords.every((record) => record.pending === true && record.reservedTokens === 400) &&
      !existsSync(`${atomicLedger}.lock`),
    `exit ${atomic.status}\n     stdout: ${atomic.stdout}\n     stderr: ${atomic.stderr}\n     ledger: ${JSON.stringify(atomicRecords)}`,
  )
  const beforeCancel = run("automation-budget.mjs", checkArgs("atomic-before-cancel", atomicLedger, 600, ["--json"]))
  const cancelAtomic = run("automation-budget.mjs", [
    "cancel",
    "--identity",
    "atomic-a",
    "--engine",
    "claude",
    "--tier",
    "routine",
    "--started-at",
    "2030-01-02T09:00:00.000Z",
    "--ended-at",
    "2030-01-02T10:01:00.000Z",
    "--ledger",
    atomicLedger,
  ])
  const afterCancel = run("automation-budget.mjs", checkArgs("atomic-after-cancel", atomicLedger, 600, ["--json"]))
  T(
    "automation-budget.mjs: append-only cancellation releases a reservation that never started",
    beforeCancel.status === 4 &&
      /"projectedTokens":1400[\s\S]*"pendingTokens":800,/.test(beforeCancel.stdout) &&
      cancelAtomic.status === 0 &&
      afterCancel.status === 0 &&
      /"projectedTokens":1000[\s\S]*"pendingTokens":400,"missingIdentities":\[\]/.test(afterCancel.stdout),
    `before exit ${beforeCancel.status}: ${beforeCancel.stdout}\n     cancel exit ${cancelAtomic.status}: ${cancelAtomic.stderr}\n     check exit ${afterCancel.status}: ${afterCancel.stderr}\n     ${afterCancel.stdout}`,
  )

  check(
    "automation-budget.mjs",
    "record appends authoritative tokens, provider cost, and explicit non-attributed account context",
    [
      "record",
      "--identity",
      "workflow:123",
      "--engine",
      "codex",
      "--tier",
      "routine",
      "--started-at",
      "2030-01-03T09:00:00Z",
      "--ended-at",
      "2030-01-03T09:05:00Z",
      "--input-tokens",
      "1200",
      "--output-tokens",
      "300",
      "--provider-estimated-cost",
      "1.25",
      "--account-used-percent",
      "88",
      "--account-observed-at",
      "2030-01-03T09:05:01Z",
      "--ledger",
      stage("budget/record.jsonl", ""),
      "--json",
    ],
    {
      status: 0,
      stdout:
        /"status":"RECORDED"[\s\S]*"identity":"workflow:123"[\s\S]*"inputTokens":1200[\s\S]*"outputTokens":300[\s\S]*"providerEstimatedCost":1.25[\s\S]*"accountContext":\{"scope":"account","attributed":false,"usedPercent":88,"observedAt":"2030-01-03T09:05:01.000Z"/,
    },
  )

  const concurrentLedger = join(root, "budget", "concurrent.jsonl")
  const concurrentRunner = stage(
    "budget/concurrent-records.mjs",
    `import { spawn } from "node:child_process"
const [tool, ledger] = process.argv.slice(2)
const base = ["--engine", "claude", "--tier", "routine", "--started-at", "2030-01-04T09:00:00Z", "--ended-at", "2030-01-04T09:01:00Z", "--input-tokens", "10", "--output-tokens", "5", "--ledger", ledger]
const run = (identity) => new Promise((resolve) => {
  const child = spawn(process.execPath, [tool, "record", "--identity", identity, ...base], { stdio: "inherit", windowsHide: true })
  child.on("exit", (status) => resolve(status))
})
const statuses = await Promise.all([run("concurrent-a"), run("concurrent-b")])
process.exit(statuses.every((status) => status === 0) ? 0 : 1)
`,
  )
  const concurrent = spawnSync(process.execPath, [concurrentRunner, join(TOOLS_DIR, "automation-budget.mjs"), concurrentLedger], {
    encoding: "utf8",
    timeout: 10000,
  })
  const concurrentRecords = existsSync(concurrentLedger)
    ? readFileSync(concurrentLedger, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line))
    : []
  T(
    "automation-budget.mjs: two concurrent invocations append without losing a record",
    concurrent.status === 0 &&
      concurrentRecords.length === 2 &&
      new Set(concurrentRecords.map((record) => record.identity)).size === 2,
    `exit ${concurrent.status}\n     ${concurrent.stderr ?? ""}\n     ${JSON.stringify(concurrentRecords)}`,
  )

  /**
   * The closing half of F-5, and the only assertion here that looks at the real file. Every case
   * above has now run; if any of them reached ~/.orbit/automation-budget.jsonl its size or mtime
   * moved. This is a read, never a write, so a green run proves the suite left production alone
   * and a red one names the module that did not.
   */
  T(
    "automation-budget.mjs: no case in this module touched the real ~/.orbit ledger",
    productionLedgerState() === productionLedgerBefore,
    `${productionLedgerPath}\n     before: ${productionLedgerBefore}\n     after:  ${productionLedgerState()}`,
  )
}

export { automationBudgetCases as cases }
