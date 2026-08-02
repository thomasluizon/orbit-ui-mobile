import { spawnSyncHidden as spawnSync } from "../lib/subprocess-options.mjs"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { BASH, TOOLS_DIR, T, WORKER_LAUNCH_LEDGER, forgedReviewMarker, root, stage, mergeSweepEnv as baseMergeSweepEnv, mergeSweepCalls, orphanCaseKeys, reviewMarker, toolPath, run, check, writeCompletedWorkerLaunch } from "./_harness.mjs"

const reviewEvidenceJson = (head, approvalCommits = "__HEAD__", recommendation = "APPROVE", reviewBody = null) => {
  const files = { pageInfo: { hasNextPage: approvalCommits === "FILES_PAGINATED" }, nodes: [{ path: "tools/example.mjs" }] }
  if (approvalCommits === "PAGINATED") return JSON.stringify({ headRefOid: head, files, reviews: { pageInfo: { hasNextPage: true }, nodes: [] } })
  const local = {
    id: "PRR_local_review",
    state: "COMMENTED",
    body: reviewBody ?? reviewMarker({ repository: "thomasluizon/orbit-ui-mobile", pullRequest: 615, head, recommendation, findingIds: recommendation === "NEEDS_WORK" ? ["finding-0123456789abcdef0123456789abcdef"] : [] }),
    submittedAt: "2026-07-31T10:00:00Z",
    updatedAt: "2026-07-31T10:00:00Z",
    lastEditedAt: null,
    url: "https://github.com/orbit/ui/pull/615#pullrequestreview-local",
    author: { login: "local-reviewer" },
    commit: { oid: head },
  }
  const nativeHeads = approvalCommits === "__HEAD__" ? [head] : approvalCommits.split(/\s+/).filter(Boolean)
  const native = nativeHeads.map((oid, index) => ({
    id: `PRR_native_review_${index}`,
    state: "APPROVED",
    body: "",
    submittedAt: `2026-07-31T09:00:0${index}Z`,
    updatedAt: `2026-07-31T09:00:0${index}Z`,
    lastEditedAt: null,
    url: `https://github.com/orbit/ui/pull/615#pullrequestreview-native-${index}`,
    author: { login: "native-reviewer" },
    commit: { oid },
  }))
  return JSON.stringify({ headRefOid: head, files, reviews: { pageInfo: { hasNextPage: false }, nodes: [local, ...native] } })
}

const mergeSweepEnv = (options = {}) => {
  const evidenceHead = options.updatedHead || options.head
  if (/^[0-9a-f]{40}$/.test(evidenceHead ?? "") && options.workerDelivery !== false) {
    writeCompletedWorkerLaunch({ issue: "ORB-150", branch: "feature/orb-106", head: evidenceHead })
  }
  return baseMergeSweepEnv({
    ...options,
    approvalCommits: options.reviewEvidenceJson ?? reviewEvidenceJson(evidenceHead, options.approvalCommits, options.recommendation ?? "APPROVE", options.reviewBody ?? null),
  })
}

const mergeSweepCliFlagCases = () => {
  const filenames = ["merge-sweep.sh", "merge-sweep-cov.sh"]
  const missing = orphanCaseKeys(filenames, TOOLS_DIR)
  const scanned = filenames
    .filter((filename) => !missing.includes(filename))
    .map((filename) => ({ filename, source: readFileSync(toolPath(filename), "utf8") }))
  T(
    "merge sweep CLI flag guard scans both real script filenames",
    missing.length === 0,
    `scanned ${scanned.length} of ${filenames.length} files; missing: ${missing.join(", ")}`,
  )
  for (const { filename, source } of scanned) {
    T(
      `${filename}: defaults to the configured Windows Orca executable while allowing an override`,
      source.includes('ORCA_BIN="${ORCA_BIN:-C:\\Users\\thoma\\AppData\\Local\\Programs\\orca\\resources\\bin\\orca}"') &&
        source.includes('"$ORCA_BIN" linear issue "$issue" --json'),
      "merge sweeps must use the configured Orca executable when ORCA_BIN is unset",
    )
    const ghApiInvocations = source
      .replace(/\\\r?\n/g, " ")
      .split(/\r?\n/)
      .filter((line) => /\bgh api\b/.test(line))
    const unsupported = ghApiInvocations.filter(
      (invocation) => /(?:^|\s)--slurp(?:[=\s]|$)/.test(invocation) && /(?:^|\s)--(?:jq|template)(?:[=\s]|$)/.test(invocation),
    )
    T(
      `${filename}: never combines --slurp with --jq or --template`,
      unsupported.length === 0,
      `unsupported gh api invocation:\n     ${unsupported.join("\n     ")}`,
    )
    const stateParser = source.match(/statusCheckRollup,headRefOid 2>\/dev\/null \| node -e "([\s\S]*?)"\r?\n\}/)?.[1] ?? ""
    const runStateParser = (rows) =>
      spawnSync(process.execPath, ["-e", stateParser], {
        encoding: "utf8",
        input: JSON.stringify({ mergeStateStatus: "CLEAN", reviewDecision: "", headRefOid: "a".repeat(40), statusCheckRollup: rows }),
      })
    const latestSuccess = runStateParser([
      { __typename: "CheckRun", name: "Harness Lockstep", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-07-31T14:55:37Z" },
      { __typename: "CheckRun", name: "Harness Lockstep", status: "COMPLETED", conclusion: "FAILURE", startedAt: "2026-07-31T14:53:17Z" },
    ])
    const clearOutput = filename === "merge-sweep-cov.sh"
      ? `CLEAN\t?\tNONE\tNONE\t${"a".repeat(40)}\tNONE\tABSENT`
      : `CLEAN|?|none|none|ABSENT|${"a".repeat(40)}`
    T(
      `${filename}: a newer successful status check supersedes an older failure regardless of array order`,
      stateParser.length > 0 && latestSuccess.status === 0 && latestSuccess.stdout === clearOutput,
      `exit ${latestSuccess.status}\n     stdout: ${latestSuccess.stdout}\n     stderr: ${latestSuccess.stderr}`,
    )
    const exactTie = runStateParser([
      { __typename: "CheckRun", name: "Harness Lockstep", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-07-31T14:55:37Z" },
      { __typename: "CheckRun", name: "Harness Lockstep", status: "COMPLETED", conclusion: "FAILURE", startedAt: "2026-07-31T14:55:37Z" },
    ])
    T(
      `${filename}: exact timestamp ties fail closed when one duplicate failed`,
      stateParser.length > 0 && exactTie.status === 0 && exactTie.stdout.includes("Harness Lockstep"),
      `exit ${exactTie.status}\n     stdout: ${exactTie.stdout}\n     stderr: ${exactTie.stderr}`,
    )
    const nullTimestampFailure = runStateParser([
      { __typename: "CheckRun", name: "Harness Lockstep", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-07-31T14:55:37Z" },
      { __typename: "CheckRun", name: "Harness Lockstep", status: "COMPLETED", conclusion: "FAILURE", startedAt: null },
    ])
    T(
      `${filename}: a failed duplicate with null startedAt remains fail-closed beside a newer success`,
      stateParser.length > 0 && nullTimestampFailure.status === 0 && nullTimestampFailure.stdout.includes("Harness Lockstep"),
      `exit ${nullTimestampFailure.status}\n     stdout: ${nullTimestampFailure.stdout}\n     stderr: ${nullTimestampFailure.stderr}`,
    )
    const missingTimestampPending = runStateParser([
      { __typename: "CheckRun", name: "Harness Lockstep", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-07-31T14:55:37Z" },
      { __typename: "CheckRun", name: "Harness Lockstep", status: "IN_PROGRESS", conclusion: null },
    ])
    T(
      `${filename}: a pending duplicate with missing startedAt remains fail-closed beside a newer success`,
      stateParser.length > 0 && missingTimestampPending.status === 0 && missingTimestampPending.stdout.includes("Harness Lockstep"),
      `exit ${missingTimestampPending.status}\n     stdout: ${missingTimestampPending.stdout}\n     stderr: ${missingTimestampPending.stderr}`,
    )
  }
  const adoptionHelpers = scanned.map(({ filename, source }) => ({
    filename,
    helper: source.match(/^adopt_routine_update\(\).*?^}\r?$/ms)?.[0] ?? "",
  }))
  T(
    "merge sweep routine-update helpers stay in lockstep",
    adoptionHelpers.length === filenames.length &&
      adoptionHelpers.every(({ helper }) => helper.length > 0) &&
      adoptionHelpers.every(({ helper }) => helper === adoptionHelpers[0].helper),
    adoptionHelpers.map(({ filename, helper }) => `${filename}: ${helper.length} bytes`).join("\n     "),
  )
  // J3. The coverage sweep's `--admin` merge was the only agent-reachable admin merge in the
  // tooling. Prose telling the next agent not to restore it decays; this does not.
  for (const { filename, source } of scanned) {
    T(
      `${filename}: never passes --admin to a merge`,
      !/--admin/.test(source.replace(/^#.*$/gm, "")),
      "an admin merge bypasses the required checks. The override is Thomas's alone; an agent that needs one stops and asks.",
    )
  }
  for (const name of ["ensure_issue_in_review", "linear_state", "commit_linear_reassertion", "review_evidence_allows", "worker_delivery_allows"]) {
    const helpers = scanned.map(({ filename, source }) => ({
      filename,
      helper: source.match(new RegExp(`^${name}\\(\\).*?^}\\r?$`, "ms"))?.[0] ?? "",
    }))
    T(
      `merge sweep ${name} helper stays in lockstep`,
      helpers.length === filenames.length &&
        helpers.every(({ helper }) => helper.length > 0) &&
        helpers.every(({ helper }) => helper === helpers[0].helper),
      helpers.map(({ filename, helper }) => `${filename}: ${helper.length} bytes`).join("\n     "),
    )
  }
}

const processTreeVisibilityCase = () => {
  if (process.platform !== "win32") {
    T("Windows process-tree visibility regression is deterministic outside Windows", true, "the OS window probe is Windows-only")
    return
  }
  const fixtureRoot = join(root, "process-tree-visibility-fixture")
  const readyPath = join(fixtureRoot, "nested.ready")
  const expectedHead = "1111111111111111111111111111111111111111"
  const log = join(fixtureRoot, "merge-sweep.log")
  const nestedBash = existsSync("C:\\Program Files\\Git\\bin\\bash.exe") ? "C:\\Program Files\\Git\\bin\\bash.exe" : BASH
  const fixture = stage(
    "process-tree-visibility-fixture/fixture.sh",
    [
      "#!/usr/bin/env bash",
      "set -eu",
      "\"$ORBIT_REAL_BASH\" \"$ORBIT_REAL_MERGE_SWEEP\" --expected-head \"615=$ORBIT_EXPECTED_HEAD\" --reviewed-through \"615=2026-07-28T00:00:00Z\" --issue \"615=ORB-150\" thomasluizon/orbit-ui-mobile 615 &",
      "printf 'ready' > \"$ORBIT_PROCESS_TREE_READY\"",
      "while :; do sleep 1; done",
    ].join("\n"),
  )
  const result = run("merge-sweep.sh", [], {
    path: fixture,
    timeoutMs: 3000,
    cleanupPath: fixtureRoot,
    processTreeObservation: { readyPath, settleMs: 500, timeoutMs: 2000 },
    env: {
      ...baseMergeSweepEnv({ head: expectedHead, log, sonar: "success", state: "CLEAN", approvalCommits: reviewEvidenceJson(expectedHead) }),
      BASH_ENV: "",
      ORBIT_EXPECTED_HEAD: expectedHead,
      ORBIT_PROCESS_TREE_READY: readyPath.replaceAll("\\", "/"),
      ORBIT_REAL_BASH: nestedBash.replaceAll("\\", "/"),
      ORBIT_REAL_MERGE_SWEEP: join(TOOLS_DIR, "merge-sweep.sh").replaceAll("\\", "/"),
    },
  })
  const descendants = result.processTree?.descendants ?? []
  const visible = descendants.filter(({ mainWindowHandle }) => Number(mainWindowHandle) > 0)
  const bashProcesses = descendants.filter(({ name }) => /bash(?:\.exe)?$/i.test(name ?? ""))
  T(
    "Windows process-tree regression observes every nested Git Bash descendant and rejects visible top-level windows",
    result.status === "timed out" && result.processTree?.ready === true && bashProcesses.length >= 3 && visible.length === 0,
    JSON.stringify({ status: result.status, bashProcesses, visible, processTree: result.processTree, stderr: result.stderr }),
  )
}

const processTreeTimeoutCase = () => {
  const fixtureRoot = join(root, "process-tree-timeout-fixture")
  const stateRoot = join(root, "process-tree-timeout-state")
  const descendantPidPath = join(stateRoot, "descendant.pid")
  const descendantScript = stage(
    "process-tree-timeout-fixture/descendant.mjs",
    [
      "import { writeFileSync } from \"node:fs\"",
      "writeFileSync(process.env.ORBIT_TIMEOUT_DESCENDANT_PID, String(process.pid))",
      "setInterval(() => {}, 1000)",
    ].join("\n"),
  )
  stage("process-tree-timeout-state/last-output.txt", "")
  const fixture = stage(
    "process-tree-timeout-fixture/fixture.sh",
    [
      "#!/usr/bin/env bash",
      "set -eu",
      "node \"$ORBIT_TIMEOUT_DESCENDANT_SCRIPT\" &",
      "printf '%s' \"$!\" > \"$ORBIT_TIMEOUT_SHELL_PID\"",
      "printf 'merge-sweep-fixture-last-output\\n'",
      "while :; do sleep 1; done",
    ].join("\n"),
  )
  const result = run("merge-sweep.sh", [], {
    path: fixture,
    timeoutMs: 500,
    cleanupPath: fixtureRoot,
    env: {
      BASH_ENV: "",
      ORBIT_TIMEOUT_DESCENDANT_PID: descendantPidPath,
      ORBIT_TIMEOUT_DESCENDANT_SCRIPT: descendantScript,
      ORBIT_TIMEOUT_SHELL_PID: join(stateRoot, "shell.pid"),
    },
  })
  let descendantAlive = false
  let descendantPid = Number.NaN
  if (existsSync(descendantPidPath)) {
    descendantPid = Number(readFileSync(descendantPidPath, "utf8"))
    if (Number.isInteger(descendantPid)) {
      try {
        process.kill(descendantPid, 0)
        descendantAlive = true
      } catch (error) {
        descendantAlive = error.code !== "ESRCH"
      }
    }
  }
  T(
    "test harness: a timed-out Git Bash child returns, kills its descendant, and cleans only its fixture subtree",
    result.status === "timed out" && /merge-sweep-fixture-last-output/.test(result.stdout) && !descendantAlive && !existsSync(fixtureRoot) && existsSync(stateRoot),
    `exit ${result.status}; descendant ${descendantPid} alive=${descendantAlive}; fixture exists=${existsSync(fixtureRoot)}; outside state exists=${existsSync(stateRoot)}\\n     stdout: ${result.stdout}\\n     stderr: ${result.stderr}`,
  )
}

const mergeSweepCases = (file) => {
  const expectedHead = "1111111111111111111111111111111111111111"
  const changedHead = "2222222222222222222222222222222222222222"
  const reviewedThrough = "2026-07-28T00:00:00Z"
  const newerReviewTime = "2026-07-28T00:00:01Z"
  const coverageAware = file === "merge-sweep-cov.sh"
  for (const [label, args, stderr] of [
    ["requires a value for --issue", ["--issue"], /--issue requires <pr-number>=<ORB-N>/],
    ["rejects a malformed issue mapping", ["--issue", "615=150", "thomasluizon/orbit-ui-mobile", "615"], /issue mappings must be <pr-number>=<ORB-N>, got: 615=150/],
    ["rejects a non-numeric issue mapping PR", ["--issue", "not-615=ORB-150", "thomasluizon/orbit-ui-mobile", "615"], /issue mapping PR must be a number, got: not-615/],
    ["rejects a duplicate issue mapping", ["--issue", "615=ORB-150", "--issue", "615=ORB-151", "thomasluizon/orbit-ui-mobile", "615"], /duplicate issue mapping for PR 615/],
    ["requires an issue mapping for every swept PR", ["thomasluizon/orbit-ui-mobile", "615"], /issue mapping is required for PR 615/],
  ]) {
    check(file, label, args, { status: 2, stderr })
  }
  const reviewedArgs = ["--expected-head", `615=${expectedHead}`, "--reviewed-through", `615=${reviewedThrough}`, "--issue", "615=ORB-150", "thomasluizon/orbit-ui-mobile", "615"]
  const matchedLog = join(root, `${file}-matched.log`)
  const matched = run(file, reviewedArgs, {
    env: mergeSweepEnv({
      head: expectedHead,
      log: matchedLog,
      sonar: "success",
      state: "CLEAN",
    }),
  })
  const matchedMerges = mergeSweepCalls(matchedLog).filter(([group, command]) => group === "pr" && command === "merge")
  const matchedMerge = matchedMerges[0] ?? []
  const matchedHeadFlag = matchedMerge.indexOf("--match-head-commit")
  T(
    `${file}: matching expected head and clean review lookups merge`,
    matched.status === 0 &&
      /MERGED #615/.test(matched.stdout) &&
      matchedMerges.length === 1 &&
      matchedHeadFlag !== -1 &&
      matchedMerge[matchedHeadFlag + 1] === expectedHead,
    `exit ${matched.status}\n     stdout: ${matched.stdout.trim()}\n     stderr: ${matched.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(matchedLog))}`,
  )
  const missingWorkerLog = join(root, `${file}-missing-worker-delivery.log`)
  writeFileSync(WORKER_LAUNCH_LEDGER, "")
  const missingWorker = run(file, reviewedArgs, {
    env: mergeSweepEnv({ head: expectedHead, log: missingWorkerLog, sonar: "success", state: "CLEAN", workerDelivery: false }),
  })
  T(
    `${file}: a clean PR without launcher completion provenance is held`,
    missingWorker.status === 0 &&
      /WORKER-DELIVERY-HELD/.test(missingWorker.stdout) &&
      mergeSweepCalls(missingWorkerLog).filter(([group, command]) => group === "pr" && command === "merge").length === 0,
    `exit ${missingWorker.status}\n     stdout: ${missingWorker.stdout.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(missingWorkerLog))}`,
  )

  const linearCalls = (log) => mergeSweepCalls(log).filter(([group, ...argv]) => group === "orca" && argv[0] === "linear")
  T(
    `${file}: an In Review issue is freshly read without a rewrite`,
    linearCalls(matchedLog).filter(([, linear, command]) => linear === "linear" && command === "issue").length === 1 &&
      !linearCalls(matchedLog).some(([, linear, command, action]) => linear === "linear" && command === "status" && action === "set"),
    `calls: ${JSON.stringify(linearCalls(matchedLog))}`,
  )

  const regressedLog = join(root, `${file}-linear-regressed.log`)
  const regressed = run(file, reviewedArgs, {
    env: mergeSweepEnv({ head: expectedHead, linearState: "In Progress", log: regressedLog, sonar: "success", state: "CLEAN" }),
  })
  const regressedCalls = linearCalls(regressedLog)
  T(
    `${file}: a regressed issue is reasserted and recorded after merging`,
    regressed.status === 0 && /LINEAR-STATE-REASSERTED issue=ORB-150 observed=In Progress at=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/.test(regressed.stdout) &&
      regressedCalls.filter(([, linear, command]) => linear === "linear" && command === "issue").length === 3 &&
      regressedCalls.some(([, linear, command, action, issue, to, stateName]) => linear === "linear" && command === "status" && action === "set" && issue === "ORB-150" && to === "--to" && stateName === "In Review") &&
      mergeSweepCalls(regressedLog).some(([group, command]) => group === "pr" && command === "merge"),
    `exit ${regressed.status}\n     stdout: ${regressed.stdout.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(regressedLog))}`,
  )

  const skippedReassertion = (label, reassertState) => {
    const log = join(root, `${file}-${label}.log`)
    const result = run(file, reviewedArgs, {
      env: mergeSweepEnv({ head: expectedHead, linearState: "In Progress", linearReassertState: reassertState, log, sonar: "success", state: "CLEAN" }),
    })
    const calls = linearCalls(log)
    T(
      `${file}: a post-merge ${reassertState} state is left unchanged and recorded`,
      result.status === 0 && new RegExp(`LINEAR-STATE-REASSERT-SKIPPED issue=ORB-150 observed=${reassertState} at=\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\dZ`).test(result.stdout) &&
        calls.filter(([, linear, command]) => linear === "linear" && command === "issue").length === 2 &&
        !calls.some(([, linear, command, action]) => linear === "linear" && command === "status" && action === "set"),
      `exit ${result.status}\n     stdout: ${result.stdout.trim()}\n     calls: ${JSON.stringify(calls)}`,
    )
  }
  skippedReassertion("Done-after-merge", "Done")
  skippedReassertion("unknown-after-merge", "Blocked")

  const postWriteDisagreementLog = join(root, `${file}-post-write-disagreement.log`)
  const postWriteDisagreement = run(file, reviewedArgs, {
    env: mergeSweepEnv({ head: expectedHead, linearState: "In Progress", linearReassertState: "In Progress", linearPostWriteState: "Done", log: postWriteDisagreementLog, sonar: "success", state: "CLEAN" }),
  })
  T(
    `${file}: a post-write state disagreement is left unchanged and recorded`,
    postWriteDisagreement.status === 0 && /LINEAR-STATE-REASSERT-POST-WRITE-SKIPPED issue=ORB-150 observed=Done pre-write=In Progress/.test(postWriteDisagreement.stdout) &&
      linearCalls(postWriteDisagreementLog).filter(([, linear, command, action]) => linear === "linear" && command === "status" && action === "set").length === 1,
    `exit ${postWriteDisagreement.status}\n     stdout: ${postWriteDisagreement.stdout.trim()}\n     calls: ${JSON.stringify(linearCalls(postWriteDisagreementLog))}`,
  )

  const linearRefusal = (label, envOptions, output) => {
    const log = join(root, `${file}-${label}.log`)
    const result = run(file, reviewedArgs, {
      env: mergeSweepEnv({ head: expectedHead, log, sonar: "success", state: "CLEAN", ...envOptions }),
    })
    const calls = mergeSweepCalls(log)
    T(
      `${file}: ${label} refuses the merge`,
      result.status === 0 && output.test(result.stdout) && !calls.some(([group, command]) => group === "pr" && command === "merge"),
      `exit ${result.status}\n     stdout: ${result.stdout.trim()}\n     calls: ${JSON.stringify(calls)}`,
    )
  }
  linearRefusal("a failing Linear lookup", { linearLookupFailure: true }, /LINEAR-STATE-REFUSED issue=ORB-150 reason=lookup-failed/)
  const reassertFailureLog = join(root, `${file}-failed-Linear-reassert.log`)
  const reassertFailure = run(file, reviewedArgs, {
    env: mergeSweepEnv({ head: expectedHead, linearReassertFailure: true, linearState: "In Progress", log: reassertFailureLog, sonar: "success", state: "CLEAN" }),
  })
  T(
    `${file}: a failed post-merge Linear reassert reports the failure`,
    reassertFailure.status === 4 && /POST-MERGE-LINEAR-STATE-REASSERT-FAILED issue=ORB-150 observed=In Progress at=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/.test(reassertFailure.stdout),
    `exit ${reassertFailure.status}\n     stdout: ${reassertFailure.stdout.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(reassertFailureLog))}`,
  )
  const reassertReadFailureLog = join(root, `${file}-failed-Linear-reassert-read.log`)
  const reassertReadFailure = run(file, reviewedArgs, {
    env: mergeSweepEnv({ head: expectedHead, linearReassertLookupFailure: true, linearState: "In Progress", log: reassertReadFailureLog, sonar: "success", state: "CLEAN" }),
  })
  T(
    `${file}: a failed post-merge Linear re-read reports the failure`,
    reassertReadFailure.status === 4 && /POST-MERGE-LINEAR-STATE-REASSERT-FAILED issue=ORB-150 observed=In Progress at=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/.test(reassertReadFailure.stdout) &&
      !linearCalls(reassertReadFailureLog).some(([, linear, command, action]) => linear === "linear" && command === "status" && action === "set"),
    `exit ${reassertReadFailure.status}\n     stdout: ${reassertReadFailure.stdout.trim()}\n     calls: ${JSON.stringify(linearCalls(reassertReadFailureLog))}`,
  )
  linearRefusal("an unknown Linear state", { linearState: "Done" }, /LINEAR-STATE-REFUSED issue=ORB-150 observed=Done reason=unknown-state/)

  const finalReadLog = join(root, `${file}-linear-final-read.log`)
  const finalRead = run(file, reviewedArgs, {
    env: mergeSweepEnv({ head: expectedHead, log: finalReadLog, sonar: "success", state: "CLEAN" }),
  })
  const finalReadCalls = mergeSweepCalls(finalReadLog)
  const issueReadIndex = finalReadCalls.findIndex(([group, linear, command]) => group === "orca" && linear === "linear" && command === "issue")
  const mergeIndex = finalReadCalls.findIndex(([group, command]) => group === "pr" && command === "merge")
  const lastReviewReadIndex = finalReadCalls.slice(0, mergeIndex).reduce(
    (last, [group, ...argv], index) => group === "api" && argv.some((value) => String(value).includes("/comments")) ? index : last,
    -1,
  )
  // A2 inserted the head-anchored approval read between the Linear read and the merge, so the
  // boundary is now review reads, Linear, approval, merge, with nothing else in between.
  const approvalIndex = finalReadCalls.findIndex((argv) => argv.some((argument) => String(argument).includes("commit{oid}")))
  T(
    `${file}: Linear state is freshly read at the decision boundary rather than reused`,
    finalRead.status === 0 &&
      lastReviewReadIndex !== -1 &&
      issueReadIndex === lastReviewReadIndex + 1 &&
      approvalIndex === issueReadIndex + 1 &&
      mergeIndex === approvalIndex + 1,
    `calls: ${JSON.stringify(finalReadCalls)}`,
  )

  const changedLog = join(root, `${file}-changed.log`)
  const changed = run(file, reviewedArgs, {
    env: mergeSweepEnv({
      head: changedHead,
      log: changedLog,
      sonar: "success",
      state: "CLEAN",
    }),
  })
  const changedCalls = mergeSweepCalls(changedLog)
  const changedMerges = changedCalls.filter(([group, command]) => group === "pr" && command === "merge")
  T(
    `${file}: changed head skips and names both SHAs`,
    changed.status === 0 &&
      /SKIP #615/.test(changed.stdout) &&
      changed.stdout.includes(expectedHead) &&
      changed.stdout.includes(changedHead) &&
      changedMerges.length === 0,
    `exit ${changed.status}\n     stdout: ${changed.stdout.trim()}\n     stderr: ${changed.stderr.trim()}\n     calls: ${JSON.stringify(changedCalls)}`,
  )

  const mergeRaceLog = join(root, `${file}-merge-race.log`)
  const mergeRace = run(file, reviewedArgs, {
    env: mergeSweepEnv({
      changedHead,
      head: expectedHead,
      log: mergeRaceLog,
      moveAtMerge: true,
      sonar: "success",
      state: "CLEAN",
    }),
  })
  const mergeRaceCalls = mergeSweepCalls(mergeRaceLog)
  const mergeRaceMerges = mergeRaceCalls.filter(([group, command]) => group === "pr" && command === "merge")
  T(
    `${file}: atomic merge refusal reports a last-moment head change`,
    mergeRace.status === 0 &&
      /SKIP #615 HEAD-MOVED/.test(mergeRace.stdout) &&
      mergeRace.stdout.includes(expectedHead) &&
      mergeRace.stdout.includes(changedHead) &&
      mergeRaceMerges.length === 1,
    `exit ${mergeRace.status}\n     stdout: ${mergeRace.stdout.trim()}\n     stderr: ${mergeRace.stderr.trim()}\n     calls: ${JSON.stringify(mergeRaceCalls)}`,
  )

  const regressedMergeRaceLog = join(root, `${file}-regressed-merge-race.log`)
  const regressedMergeRace = run(file, reviewedArgs, {
    env: mergeSweepEnv({ changedHead, head: expectedHead, linearState: "In Progress", log: regressedMergeRaceLog, moveAtMerge: true, sonar: "success", state: "CLEAN" }),
  })
  const regressedMergeRaceCalls = linearCalls(regressedMergeRaceLog)
  T(
    `${file}: a refused merge never rewrites a regressed Linear issue`,
    regressedMergeRace.status === 0 && /SKIP #615 HEAD-MOVED/.test(regressedMergeRace.stdout) &&
      !regressedMergeRaceCalls.some(([, linear, command, action]) => linear === "linear" && command === "status" && action === "set"),
    `exit ${regressedMergeRace.status}\n     stdout: ${regressedMergeRace.stdout.trim()}\n     calls: ${JSON.stringify(regressedMergeRaceCalls)}`,
  )

  const bareLog = join(root, `${file}-bare.log`)
  const bare = run(file, ["--reviewed-through", `615=${reviewedThrough}`, "--issue", "615=ORB-150", "thomasluizon/orbit-ui-mobile", "615"], {
    env: mergeSweepEnv({ head: changedHead, log: bareLog }),
  })
  const bareMerges = mergeSweepCalls(bareLog).filter(([group, command]) => group === "pr" && command === "merge")
  T(
    `${file}: invocation without expected head still merges`,
    bare.status === 0 && /MERGED #615/.test(bare.stdout) && bareMerges.length === 1,
    `exit ${bare.status}\n     stdout: ${bare.stdout.trim()}\n     stderr: ${bare.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(bareLog))}`,
  )

  check(
    file,
    "help documents the Linear issue gate, exclusive cutoff, and residual post-merge window",
    ["--help"],
    { status: 0, stdout: /(?=[\s\S]*--reviewed-through)(?=[\s\S]*--issue must map every swept PR)(?=[\s\S]*LINEAR-STATE-REASSERTED)(?=[\s\S]*LINEAR-STATE-REASSERT-SKIPPED)(?=[\s\S]*LINEAR-STATE-REASSERT-POST-WRITE-SKIPPED)(?=[\s\S]*LINEAR-STATE-REFUSED)(?=[\s\S]*review-safety query runs before the fresh Linear decision-time read)(?=[\s\S]*failed post-merge Linear state read or reassert)(?=[\s\S]*POST-MERGE-LINEAR-STATE-REASSERT-FAILED)(?=[\s\S]*cutoff is exclusive: activity at or after that timestamp counts as new\.)(?=[\s\S]*Every status check, required or not, must reach a terminal successful conclusion before merge\.)(?=[\s\S]*residual response-to-merge race)(?=[\s\S]*undetectable sub-second residual)(?=[\s\S]*exits 4)/ },
  )

  const updatedHead = "3333333333333333333333333333333333333333"
  const baseTip = "4444444444444444444444444444444444444444"
  const baseAncestor = "5555555555555555555555555555555555555555"
  const routineParents = `${expectedHead}\n${baseTip}`
  const updateCase = (label, envOptions, expect) => {
    const log = join(root, `${file}-${label}.log`)
    const result = run(file, ["--reviewed-through", `615=${reviewedThrough}`, "--issue", "615=ORB-150", "thomasluizon/orbit-ui-mobile", "615"], {
      env: mergeSweepEnv({
        baseTip,
        head: expectedHead,
        log,
        sonar: "success",
        state: "CLEAN",
        updatedHead,
        updateParents: routineParents,
        ...envOptions,
      }),
    })
    const calls = mergeSweepCalls(log)
    const merges = calls.filter(([group, command]) => group === "pr" && command === "merge")
    T(
      `${file}: ${label}`,
      expect(result, calls, merges),
      `exit ${result.status}\n     stdout: ${result.stdout.trim()}\n     stderr: ${result.stderr.trim()}\n     calls: ${JSON.stringify(calls)}`,
    )
  }

  updateCase(
    "a routine update whose second parent equals the fresh base tip adopts",
    {},
    (result, calls, merges) =>
      result.status === 0 &&
      /MERGED #615/.test(result.stdout) &&
      calls.some(([group, command]) => group === "pr" && command === "update-branch") &&
      calls.some((argv) => argv.includes("headRefOid,baseRefName,headRefName")) &&
      !calls.some((argv) => argv.includes("headRefOid,baseRefOid")) &&
      calls.some((argv) => argv.some((value) => value.includes("/git/ref/heads/main"))) &&
      calls.findIndex(([group, command]) => group === "pr" && command === "update-branch") <
        calls.findIndex((argv) => argv.some((value) => value.includes("/git/ref/heads/main"))) &&
      calls.some((argv) => argv.some((value) => value.includes(`/commits/${updatedHead}`))) &&
      !calls.some((argv) => argv.some((value) => value.includes("/compare/"))) &&
      merges.length === 1 &&
      merges[0][merges[0].indexOf("--match-head-commit") + 1] === updatedHead,
  )
  updateCase(
    "a sibling race adopts when the update parent is an ancestor of the fresh base tip",
    { baseAncestor, updateParents: `${expectedHead}\n${baseAncestor}` },
    (result, calls, merges) =>
      result.status === 0 &&
      /MERGED #615/.test(result.stdout) &&
      calls.some((argv) => argv.some((value) => value.includes(`/compare/${baseAncestor}...${baseTip}`))) &&
      merges.length === 1 &&
      merges[0][merges[0].indexOf("--match-head-commit") + 1] === updatedHead,
  )
  updateCase(
    "a pushed commit with only the prior head as its parent is refused",
    { authenticUpdate: false, updateParents: expectedHead },
    (result, _calls, merges) =>
      result.status === 0 && result.stdout.includes(`SKIP #615 HEAD-MOVED expected=${expectedHead} actual=${updatedHead}`) && merges.length === 0,
  )
  updateCase(
    "an externally pushed merge with routine parents is refused",
    { authenticUpdate: false },
    (result, calls, merges) =>
      result.status === 0 &&
      result.stdout.includes(`SKIP #615 HEAD-MOVED expected=${expectedHead} actual=${updatedHead}`) &&
      calls.some((argv) => argv.some((value) => value.includes(`/git/commits/${updatedHead}`))) &&
      !calls.some((argv) => argv.some((value) => value.includes("/compare/"))) &&
      merges.length === 0,
  )
  updateCase(
    "a rewritten head without the prior expected commit is refused",
    { updateParents: `${baseTip}\n6666666666666666666666666666666666666666` },
    (result, _calls, merges) =>
      result.status === 0 && result.stdout.includes(`SKIP #615 HEAD-MOVED expected=${expectedHead} actual=${updatedHead}`) && merges.length === 0,
  )
  updateCase(
    "a failing fresh base ref lookup refuses adoption",
    { baseRefLookupFailure: true },
    (result, calls, merges) =>
      result.status === 0 &&
      result.stdout.includes(`SKIP #615 HEAD-MOVED expected=${expectedHead} actual=${updatedHead}`) &&
      calls.some((argv) => argv.some((value) => value.includes("/git/ref/heads/main"))) &&
      !calls.some((argv) => argv.some((value) => value.includes(`/commits/${updatedHead}`))) &&
      merges.length === 0,
  )
  updateCase(
    "an empty fresh base ref lookup refuses adoption",
    { baseTip: "" },
    (result, calls, merges) =>
      result.status === 0 &&
      result.stdout.includes(`SKIP #615 HEAD-MOVED expected=${expectedHead} actual=${updatedHead}`) &&
      calls.some((argv) => argv.some((value) => value.includes("/git/ref/heads/main"))) &&
      !calls.some((argv) => argv.some((value) => value.includes(`/commits/${updatedHead}`))) &&
      merges.length === 0,
  )
  updateCase(
    "an empty commits lookup refuses adoption",
    { commitsLookupEmpty: true },
    (result, calls, merges) =>
      result.status === 0 &&
      result.stdout.includes(`SKIP #615 HEAD-MOVED expected=${expectedHead} actual=${updatedHead}`) &&
      calls.some((argv) => argv.some((value) => value.includes(`/commits/${updatedHead}`))) &&
      merges.length === 0,
  )
  updateCase(
    "a failing commits lookup refuses adoption",
    { commitsLookupFailure: true },
    (result, calls, merges) =>
      result.status === 0 &&
      result.stdout.includes(`SKIP #615 HEAD-MOVED expected=${expectedHead} actual=${updatedHead}`) &&
      calls.some((argv) => argv.some((value) => value.includes(`/commits/${updatedHead}`))) &&
      merges.length === 0,
  )
  updateCase(
    "a failing ancestry lookup refuses adoption",
    { baseAncestor, compareLookupFailure: true, updateParents: `${expectedHead}\n${baseAncestor}` },
    (result, calls, merges) =>
      result.status === 0 &&
      result.stdout.includes(`SKIP #615 HEAD-MOVED expected=${expectedHead} actual=${updatedHead}`) &&
      calls.some((argv) => argv.some((value) => value.includes(`/compare/${baseAncestor}...${baseTip}`))) &&
      merges.length === 0,
  )
  const divergentBaseParent = "6666666666666666666666666666666666666666"
  updateCase(
    "a divergent ancestry result refuses adoption",
    { updateParents: `${expectedHead}\n${divergentBaseParent}` },
    (result, calls, merges) =>
      result.status === 0 &&
      result.stdout.includes(`SKIP #615 HEAD-MOVED expected=${expectedHead} actual=${updatedHead}`) &&
      calls.some((argv) => argv.some((value) => value.includes(`/compare/${divergentBaseParent}...${baseTip}`))) &&
      merges.length === 0,
  )

  const recordedPr641Updates = [
    {
      actual: "2f61618d4363acad223162bf29d1664d62952852",
      base: "9556f1b5ecf4bc6212c8d4e9b58fc5147a503fef",
      expected: "a76e984548a6824f328998d194094d14710b93cf",
    },
    {
      actual: "1e1e0e8029ca0089d52f8f6e5faf909367bc3c5d",
      base: "c737f8e8f506f35371e4a5e6586d7f5054231e88",
      expected: "2f61618d4363acad223162bf29d1664d62952852",
    },
  ]
  for (const [index, fixture] of recordedPr641Updates.entries()) {
    updateCase(
      `recorded #641 update ${index + 1} adopts`,
      {
        baseTip: fixture.base,
        head: fixture.expected,
        updatedHead: fixture.actual,
        updateParents: `${fixture.expected}\n${fixture.base}`,
      },
      (result, _calls, merges) =>
        result.status === 0 &&
        /MERGED #615/.test(result.stdout) &&
        merges.length === 1 &&
        merges[0][merges[0].indexOf("--match-head-commit") + 1] === fixture.actual,
    )
  }
  updateCase(
    "a failing check on the adopted head skips without merging",
    { failNewHead: true },
    (result, _calls, merges) =>
      result.status === 0 &&
      (coverageAware ? /SKIP #615 FAILED\(non-sonar\)=\[new-head-gate\]/ : /SKIP #615[\s\S]*FAILED=new-head-gate/).test(result.stdout) &&
      merges.length === 0,
  )
  updateCase(
    "an unsettled current-head review check skips without merging",
    { reviewRunning: true },
    (result, _calls, merges) => result.status === 0 && /SKIP #615 \(timeout: checks on the current head never all concluded \(pending=review\)\)/.test(result.stdout) && merges.length === 0,
  )

  const reconciledLog = join(root, `${file}-reconciled-before-cutoff.log`)
  const reconciled = run(file, reviewedArgs, {
    env: mergeSweepEnv({
      commentTimes: "orchestrator\t2026-07-27T23:59:59Z",
      head: expectedHead,
      log: reconciledLog,
      sonar: "success",
      state: "CLEAN",
    }),
  })
  const reconciledMerges = mergeSweepCalls(reconciledLog).filter(([group, command]) => group === "pr" && command === "merge")
  T(`${file}: a reconciled reply before the refreshed cutoff merges`, reconciled.status === 0 && reconciledMerges.length === 1, reconciled.stderr || reconciled.stdout)

  const postMergeLog = join(root, `${file}-post-merge-activity.log`)
  const postMergeUrl = "https://example.test/conversation/late"
  const postMergeActivity = run(file, reviewedArgs, {
    env: mergeSweepEnv({
      head: expectedHead,
      log: postMergeLog,
      postMergeActivity: `late-reviewer\t${newerReviewTime}\t${postMergeUrl}`,
      sonar: "success",
      state: "CLEAN",
    }),
  })
  const postMergeMerges = mergeSweepCalls(postMergeLog).filter(([group, command]) => group === "pr" && command === "merge")
  T(
    `${file}: activity in the residual merge window is reported after the merge`,
    postMergeActivity.status === 4 &&
      postMergeActivity.stdout.includes(`POST-MERGE-ACTIVITY #615 late-reviewer at ${newerReviewTime} ${postMergeUrl}`) &&
      postMergeMerges.length === 1,
    `exit ${postMergeActivity.status}\n     stdout: ${postMergeActivity.stdout.trim()}\n     stderr: ${postMergeActivity.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(postMergeLog))}`,
  )

  const postMergeFailure = (label, envOptions, outputPattern) => {
    const log = join(root, `${file}-${label}.log`)
    const result = run(file, reviewedArgs, {
      env: mergeSweepEnv({
        head: expectedHead,
        log,
        sonar: "success",
        state: "CLEAN",
        ...envOptions,
      }),
    })
    const merges = mergeSweepCalls(log).filter(([group, command]) => group === "pr" && command === "merge")
    T(
      `${file}: ${label}`,
      result.status === 4 && outputPattern.test(result.stdout) && merges.length === 1,
      `exit ${result.status}\n     stdout: ${result.stdout.trim()}\n     stderr: ${result.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(log))}`,
    )
  }

  postMergeFailure(
    "unresolved threads in the residual merge window are reported after the merge",
    { postMergeUnresolvedThreads: "2" },
    /POST-MERGE-UNRESOLVED-THREADS #615 count=2/,
  )
  postMergeFailure(
    "a review lookup failure after the merge is reported by source",
    { postMergeReviewsLookupFailure: true },
    /POST-MERGE-REVIEW-LOOKUP-FAILED #615 source=reviews/,
  )

  const stopAfterPostMergeFailureLog = join(root, `${file}-stop-after-post-merge-failure.log`)
  const stopAfterPostMergeFailure = run(
    file,
    [
      "--expected-head",
      `615=${expectedHead}`,
      "--expected-head",
      `616=${expectedHead}`,
      "--reviewed-through",
      `615=${reviewedThrough}`,
      "--reviewed-through",
      `616=${reviewedThrough}`,
      "--issue",
      "615=ORB-150",
      "--issue",
      "616=ORB-151",
      "thomasluizon/orbit-ui-mobile",
      "615",
      "616",
    ],
    {
      env: mergeSweepEnv({
        head: expectedHead,
        log: stopAfterPostMergeFailureLog,
        postMergeReviewsLookupFailure: true,
        sonar: "success",
        state: "CLEAN",
      }),
    },
  )
  const stopAfterPostMergeFailureCalls = mergeSweepCalls(stopAfterPostMergeFailureLog)
  const stopAfterPostMergeFailureMerges = stopAfterPostMergeFailureCalls.filter(
    ([group, command]) => group === "pr" && command === "merge",
  )
  T(
    `${file}: a post-merge review failure stops the multi-PR sweep`,
    stopAfterPostMergeFailure.status === 4 &&
      stopAfterPostMergeFailureMerges.length === 1 &&
      stopAfterPostMergeFailureMerges[0][2] === "615" &&
      !stopAfterPostMergeFailureCalls.some((argv) => argv.includes("616")),
    `exit ${stopAfterPostMergeFailure.status}\n     stdout: ${stopAfterPostMergeFailure.stdout.trim()}\n     stderr: ${stopAfterPostMergeFailure.stderr.trim()}\n     calls: ${JSON.stringify(stopAfterPostMergeFailureCalls)}`,
  )

  const reviewSkip = (label, envOptions, outputPattern) => {
    const log = join(root, `${file}-${label}.log`)
    const result = run(file, reviewedArgs, {
      env: mergeSweepEnv({
        head: expectedHead,
        log,
        sonar: "success",
        state: "CLEAN",
        ...envOptions,
      }),
    })
    const merges = mergeSweepCalls(log).filter(([group, command]) => group === "pr" && command === "merge")
    T(
      `${file}: ${label}`,
      result.status === 0 && outputPattern.test(result.stdout) && merges.length === 0,
      `exit ${result.status}\n     stdout: ${result.stdout.trim()}\n     stderr: ${result.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(log))}`,
    )
  }

  reviewSkip(
    "genuine third-party activity at the refreshed cutoff skips",
    { commentTimes: `third-party\t${reviewedThrough}` },
    new RegExp(`SKIP #615 NEW-REVIEW-SINCE ${reviewedThrough} by third-party at ${reviewedThrough}`),
  )

  reviewSkip("unresolved review threads skip without merging", { unresolvedThreads: "2" }, /SKIP #615 UNRESOLVED-THREADS=2/)
  reviewSkip("a newer review skips without merging", { reviewTimes: `reviewer\t${newerReviewTime}` }, new RegExp(`SKIP #615 NEW-REVIEW-SINCE ${reviewedThrough} by reviewer at ${newerReviewTime}`))
  reviewSkip(
    "an already-submitted COMMENTED review edited after the cutoff skips without merging",
    { reviewTimes: `commented-reviewer\t2026-07-27T22:00:00Z\ncommented-reviewer\t2026-07-27T22:00:00Z\ncommented-reviewer\t${newerReviewTime}` },
    new RegExp(`SKIP #615 NEW-REVIEW-SINCE ${reviewedThrough} by commented-reviewer at ${newerReviewTime}`),
  )
  reviewSkip(
    "pagination sees a newer review timestamp on page two",
    {
      reviewTimes: "page-one-reviewer\t2026-07-27T23:00:00Z",
      reviewsPageTwo: `page-two-reviewer\t${newerReviewTime}`,
    },
    new RegExp(`SKIP #615 NEW-REVIEW-SINCE ${reviewedThrough} by page-two-reviewer at ${newerReviewTime}`),
  )
  reviewSkip("a newer issue comment skips without merging", { commentTimes: `issue-commenter\t${newerReviewTime}` }, new RegExp(`SKIP #615 NEW-REVIEW-SINCE ${reviewedThrough} by issue-commenter at ${newerReviewTime}`))
  reviewSkip("review-thread lookup failure fails closed by name", { threadsLookupFailure: true }, /SKIP #615 REVIEW-LOOKUP-FAILED source=reviewThreads/)
  reviewSkip("reviews lookup failure fails closed by name", { reviewsLookupFailure: true }, /SKIP #615 REVIEW-LOOKUP-FAILED source=reviews/)
  reviewSkip("issue-comments lookup failure fails closed by name", { commentsLookupFailure: true }, /SKIP #615 REVIEW-LOOKUP-FAILED source=issue-comments/)

  const olderEditedReviewLog = join(root, `${file}-older-edited-commented-review.log`)
  const olderEditedReview = run(file, reviewedArgs, {
    env: mergeSweepEnv({
      head: expectedHead,
      log: olderEditedReviewLog,
      reviewTimes: "commented-reviewer\t2026-07-27T21:00:00Z\ncommented-reviewer\t2026-07-27T22:00:00Z\ncommented-reviewer\t2026-07-27T23:59:59Z",
      sonar: "success",
      state: "CLEAN",
    }),
  })
  const olderEditedReviewCalls = mergeSweepCalls(olderEditedReviewLog)
  const olderEditedReviewMerges = olderEditedReviewCalls.filter(([group, command]) => group === "pr" && command === "merge")
  const paginatedReviewLookup = olderEditedReviewCalls.find((argv) => argv[0] === "api" && argv[1] === "graphql" && argv.some((value) => value.includes("reviews(first:100")))
  T(
    `${file}: a COMMENTED review edited strictly before the cutoff still merges`,
    olderEditedReview.status === 0 &&
      olderEditedReviewMerges.length === 1 &&
      paginatedReviewLookup?.includes("--paginate") &&
      !paginatedReviewLookup.includes("--slurp"),
    `exit ${olderEditedReview.status}\n     stdout: ${olderEditedReview.stdout.trim()}\n     stderr: ${olderEditedReview.stderr.trim()}\n     calls: ${JSON.stringify(olderEditedReviewCalls)}`,
  )

  const inlineOutput = (author, timestamp) =>
    new RegExp(`SKIP #615 NEW-REVIEW-SINCE ${reviewedThrough} \\(inline comment by ${author} at ${timestamp}\\)`)

  reviewSkip(
    "a newer inline comment on a resolved thread skips without merging",
    { inlineItems: `inline-reviewer\t${newerReviewTime}\ninline-reviewer\t${newerReviewTime}` },
    inlineOutput("inline-reviewer", newerReviewTime),
  )

  const olderInlineLog = join(root, `${file}-older-inline-comment.log`)
  const olderInline = run(file, reviewedArgs, {
    env: mergeSweepEnv({
      head: expectedHead,
      inlineItems: "inline-reviewer\t2026-07-27T23:00:00Z\ninline-reviewer\t2026-07-27T23:30:00Z",
      log: olderInlineLog,
      sonar: "success",
      state: "CLEAN",
    }),
  })
  const olderInlineMerges = mergeSweepCalls(olderInlineLog).filter(([group, command]) => group === "pr" && command === "merge")
  T(
    `${file}: an older inline comment still merges`,
    olderInline.status === 0 && /MERGED #615/.test(olderInline.stdout) && olderInlineMerges.length === 1,
    `exit ${olderInline.status}\n     stdout: ${olderInline.stdout.trim()}\n     stderr: ${olderInline.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(olderInlineLog))}`,
  )

  reviewSkip(
    "an inline comment edited after the cutoff skips by updated time",
    { inlineItems: `inline-editor\t2026-07-27T23:00:00Z\ninline-editor\t${newerReviewTime}` },
    inlineOutput("inline-editor", newerReviewTime),
  )
  reviewSkip("inline-comment lookup failure fails closed by name", { inlineLookupFailure: true }, /SKIP #615 REVIEW-LOOKUP-FAILED source=inline-comments/)
  reviewSkip(
    "pagination sees a newer inline comment on page two",
    {
      inlineItems: "page-one-reviewer\t2026-07-27T23:00:00Z\npage-one-reviewer\t2026-07-27T23:00:00Z",
      inlinePageTwo: `page-two-reviewer\t${newerReviewTime}\npage-two-reviewer\t${newerReviewTime}`,
    },
    inlineOutput("page-two-reviewer", newerReviewTime),
  )

  const olderBoundaryTime = "2026-07-27T23:59:59Z"
  const genericActivityOutput = (author, timestamp) =>
    new RegExp(`SKIP #615 NEW-REVIEW-SINCE ${reviewedThrough} by ${author} at ${timestamp}`)
  const activityBoundaries = [
    {
      author: "boundary-reviewer",
      envKey: "reviewTimes",
      items: (timestamp) => `boundary-reviewer\t${timestamp}`,
      label: "reviews",
      output: genericActivityOutput,
    },
    {
      author: "boundary-inline-reviewer",
      envKey: "inlineItems",
      items: (timestamp) => `boundary-inline-reviewer\t${timestamp}\nboundary-inline-reviewer\t${timestamp}`,
      label: "inline comments",
      output: inlineOutput,
    },
    {
      author: "boundary-conversation-reviewer",
      envKey: "commentTimes",
      items: (timestamp) => `boundary-conversation-reviewer\t${timestamp}\nboundary-conversation-reviewer\t${timestamp}`,
      label: "conversation comments",
      output: genericActivityOutput,
    },
  ]
  for (const boundary of activityBoundaries) {
    reviewSkip(
      `${boundary.label} exactly at reviewed-through skip without merging`,
      { [boundary.envKey]: boundary.items(reviewedThrough) },
      boundary.output(boundary.author, reviewedThrough),
    )
    reviewSkip(
      `${boundary.label} strictly after reviewed-through skip without merging`,
      { [boundary.envKey]: boundary.items(newerReviewTime) },
      boundary.output(boundary.author, newerReviewTime),
    )

    const beforeLog = join(root, `${file}-${boundary.label}-strictly-before.log`)
    const before = run(file, reviewedArgs, {
      env: mergeSweepEnv({
        [boundary.envKey]: boundary.items(olderBoundaryTime),
        head: expectedHead,
        log: beforeLog,
        sonar: "success",
        state: "CLEAN",
      }),
    })
    const beforeMerges = mergeSweepCalls(beforeLog).filter(([group, command]) => group === "pr" && command === "merge")
    T(
      `${file}: ${boundary.label} strictly before reviewed-through still merge`,
      before.status === 0 && /MERGED #615/.test(before.stdout) && beforeMerges.length === 1,
      `exit ${before.status}\n     stdout: ${before.stdout.trim()}\n     stderr: ${before.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(beforeLog))}`,
    )
  }

  /**
   * A2. `reviewDecision` is PR-level and survives every push, so an APPROVED read from it can
   * name a commit that is no longer on the branch. PR #654 is the live instance: newest
   * APPROVED on cac9ccb, headRefOid 40dba9f, merged anyway. The stub reports
   * `reviewDecision: "APPROVED"` in every one of these runs, which is the point: each refusal
   * below happens WITH the PR-level signal saying approved.
   */
  const approvalRefusal = (label, environment, expectedOutput) => {
    const log = join(root, `${file}-${label}.log`)
    const result = run(file, reviewedArgs, { env: mergeSweepEnv({ head: expectedHead, log, ...environment }) })
    const merges = mergeSweepCalls(log).filter(([group, command]) => group === "pr" && command === "merge")
    T(
      `${file}: ${label} refuses the merge although reviewDecision reads APPROVED`,
      result.status === 0 && expectedOutput.test(result.stdout) && merges.length === 0,
      `exit ${result.status}\n     stdout: ${result.stdout.trim()}\n     stderr: ${result.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(log))}`,
    )
  }
  approvalRefusal(
    "an approval naming an older commit",
    { approvalCommits: changedHead },
    /SKIP #615 REVIEW-EVIDENCE-HELD[\s\S]*STALE_NATIVE_APPROVAL/,
  )

  /**
   * A2 refuses a STALE approval; it does not require a fresh one, and this case is what stops
   * the next agent restoring the stricter form. PR4 deletes the review workflow, and the ONLY
   * account that has ever posted an APPROVED review in this repository is the bot it drives.
   * A rule demanding an approval on the head would therefore refuse every unattended merge from
   * that point on, forever, which is the specification's own J3c failure mode arriving in the
   * two repositories that matter. The other gates carry a pull request nobody approved.
   */
  const noApprovalLog = join(root, `${file}-no-approving-review.log`)
  const noApproval = run(file, reviewedArgs, {
    env: mergeSweepEnv({ head: expectedHead, log: noApprovalLog, approvalCommits: "" }),
  })
  const noApprovalCalls = mergeSweepCalls(noApprovalLog)
  T(
    `${file}: a pull request with no approving review at all is not refused by the staleness gate`,
    noApproval.status === 0 &&
      !/APPROVAL-STALE/.test(noApproval.stdout) &&
      noApprovalCalls.some((argv) => argv.some((argument) => String(argument).includes("commit{oid}"))) &&
      noApprovalCalls.some(([group, command]) => group === "pr" && command === "merge"),
    `exit ${noApproval.status}\n     stdout: ${noApproval.stdout.trim()}\n     calls: ${JSON.stringify(noApprovalCalls)}`,
  )
  approvalRefusal(
    "absent local review evidence",
    { reviewEvidenceJson: JSON.stringify({ headRefOid: expectedHead, files: { pageInfo: { hasNextPage: false }, nodes: [{ path: "tools/example.mjs" }] }, reviews: { pageInfo: { hasNextPage: false }, nodes: [] } }) },
    /SKIP #615 REVIEW-EVIDENCE-HELD[\s\S]*AWAITING_REVIEW/,
  )
  approvalRefusal(
    "latest local review requests work",
    { reviewEvidenceJson: reviewEvidenceJson(expectedHead, "", "NEEDS_WORK") },
    /SKIP #615 REVIEW-EVIDENCE-HELD[\s\S]*NEEDS_WORK/,
  )
  approvalRefusal(
    "a hostile worker marker without a launcher receipt",
    { reviewBody: forgedReviewMarker({ head: expectedHead, recommendation: "APPROVE" }) },
    /SKIP #615 REVIEW-EVIDENCE-HELD[\s\S]*UNAUTHENTICATED/,
  )

  /**
   * The pair a human or an agent actually reads before typing a merge command is
   * `reviewDecision: APPROVED` with `mergeStateStatus: CLEAN`, and that pair was TRUE for
   * PR #654, which merged with its newest approval naming cac9ccb while headRefOid was
   * 40dba9f. It was true again at 05:20Z on the pull request shipping this fix: reviewDecision
   * APPROVED, head 6f8d8a1a, only approval on 0d3df5f7, because dismiss_stale_reviews is false.
   *
   * So the case is not "an old approval refuses". It is that those two green signals together
   * are INSUFFICIENT. Reaching the approval read at all proves the sweep got past the failed
   * check, DIRTY, review-staleness, pending-check, threads and Linear gates, which is only
   * possible with CLEAN and APPROVED in hand.
   */
  const insufficientLog = join(root, `${file}-approved-and-clean-is-insufficient.log`)
  const insufficient = run(file, reviewedArgs, {
    env: mergeSweepEnv({ head: expectedHead, log: insufficientLog, state: "CLEAN", approvalCommits: changedHead }),
  })
  const insufficientCalls = mergeSweepCalls(insufficientLog)
  T(
    `${file}: APPROVED plus a CLEAN merge state is not sufficient on its own`,
    insufficient.status === 0 &&
      insufficientCalls.some((argv) => argv.some((argument) => String(argument).includes("commit{oid}"))) &&
      !insufficientCalls.some(([group, command]) => group === "pr" && command === "merge") &&
      /SKIP #615 REVIEW-EVIDENCE-HELD[\s\S]*STALE_NATIVE_APPROVAL/.test(insufficient.stdout),
    `exit ${insufficient.status}\n     stdout: ${insufficient.stdout.trim()}\n     calls: ${JSON.stringify(insufficientCalls)}`,
  )
  approvalRefusal("an approval lookup failure", { approvalLookupFailure: true }, /SKIP #615 REVIEW-EVIDENCE-LOOKUP-FAILED/)
  approvalRefusal("more than one page of reviews", { approvalCommits: "PAGINATED" }, /SKIP #615 REVIEW-EVIDENCE-HELD[\s\S]*INCOMPLETE/)
  approvalRefusal("more than one page of changed files", { approvalCommits: "FILES_PAGINATED" }, /SKIP #615 REVIEW-EVIDENCE-HELD[\s\S]*INCOMPLETE/)

  const movedApprovalLog = join(root, `${file}-approval-moved-to-head.log`)
  const movedApproval = run(file, reviewedArgs, {
    env: mergeSweepEnv({ head: expectedHead, log: movedApprovalLog, approvalCommits: `${changedHead} ${expectedHead}` }),
  })
  const movedApprovalCalls = mergeSweepCalls(movedApprovalLog)
  const movedApprovalMerges = movedApprovalCalls.filter(([group, command]) => group === "pr" && command === "merge")
  T(
    `${file}: the same PR merges once an approval names the head SHA`,
    movedApproval.status === 0 && /MERGED #615/.test(movedApproval.stdout) && movedApprovalMerges.length === 1,
    `exit ${movedApproval.status}\n     stdout: ${movedApproval.stdout.trim()}\n     calls: ${JSON.stringify(movedApprovalCalls)}`,
  )
  const approvalReadIndex = movedApprovalCalls.findIndex((argv) => argv.some((argument) => argument.includes("commit{oid}")))
  const mergeCallIndex = movedApprovalCalls.findIndex(([group, command]) => group === "pr" && command === "merge")
  T(
    `${file}: the head-anchored approval read is the LAST API call before the merge`,
    approvalReadIndex !== -1 && mergeCallIndex !== -1 && approvalReadIndex + 1 === mergeCallIndex,
    `approval read at ${approvalReadIndex}, merge at ${mergeCallIndex}\n     calls: ${JSON.stringify(movedApprovalCalls)}`,
  )

  if (coverageAware) {
    // J3. This path used to squash-merge with --admin. It now asks.
    const adminLog = join(root, `${file}-coverage-only-failure.log`)
    const adminResult = run(file, reviewedArgs, {
      env: mergeSweepEnv({ head: expectedHead, log: adminLog, sonar: "coverage-failure", state: "BLOCKED" }),
    })
    const adminMerges = mergeSweepCalls(adminLog).filter(([group, command]) => group === "pr" && command === "merge")
    T(
      `${file}: a coverage-only Sonar failure asks for an admin merge instead of performing one`,
      adminResult.status === 0 &&
        new RegExp(`ADMIN-MERGE-REQUIRED #615 coverage-only Sonar failure on head ${expectedHead}`).test(adminResult.stdout) &&
        adminMerges.length === 0,
      `exit ${adminResult.status}\n     stdout: ${adminResult.stdout.trim()}\n     stderr: ${adminResult.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(adminLog))}`,
    )
  }

  /**
   * The review-workflow detector, in BOTH directions. Every case above this point ran against a
   * stub that answered the workflow lookup with empty stdout, which pinned the detector in its
   * absent branch: the armed branch was unreachable, so nothing could tell a working detector from
   * one that never fired. These are the cases that can.
   *
   * The `review` check is ABSENT throughout, because that is the permanent shape once
   * the review workflow is deleted: no run posts it again, ever.
   *
   * Row states are only ones the LIST endpoint really returns, read live on 2026-07-31. A DELETED
   * workflow is dropped from that list outright even with run history (orbit-api's deploy.yml has
   * 9 runs and reads `state: "deleted"` by id, but is absent from the list), so there is no
   * `deleted` row here and deleting the workflow is NOT what could strand this guard. A DISABLED
   * one is retained (disabling dep-sweep-reminder.yml returned it as `disabled_manually`), and it
   * posts no check run, which is the state that can.
   */
  const detector = (label, environment, expectation) => {
    const log = join(root, `${file}-detector-${label.replace(/[^a-z]+/gi, "-")}.log`)
    const result = run(file, reviewedArgs, { env: mergeSweepEnv({ head: expectedHead, log, reviewCheckAbsent: true, ...environment }) })
    const merges = mergeSweepCalls(log).filter(([group, command]) => group === "pr" && command === "merge")
    T(
      `${file}: ${label}`,
      result.status === 0 && (expectation.merges ? merges.length === 1 && /MERGED #615/.test(result.stdout) : merges.length === 0),
      `exit ${result.status}\n     stdout: ${result.stdout.trim()}\n     stderr: ${result.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(log))}`,
    )
  }
  detector(
    "a DISABLED review workflow does not arm the review-settled wait",
    // dead-path-ok: fixture proves a disabled review workflow cannot post the awaited check
    { workflows: ".github/workflows/claude-review.yml\tdisabled_manually\n.github/workflows/guards.yml\tactive" },
    { merges: true },
  )
  detector(
    "a review workflow absent from the list does not arm the review-settled wait",
    { workflows: ".github/workflows/guards.yml\tactive" },
    { merges: true },
  )
  detector(
    "an ACTIVE review workflow whose check never appears refuses the merge",
    // dead-path-ok: fixture proves an active review workflow keeps the wait armed
    { workflows: ".github/workflows/claude-review.yml\tactive" },
    { merges: false },
  )
  detector("a failed workflow lookup fails closed and refuses the merge", { workflowsLookupFailure: true }, { merges: false })

  /**
   * GitHub's remaining blocking half. `required_approving_review_count` is 0 in both repositories, so GitHub
   * reports `reviewDecision: ""` on an APPROVED pull request while still reporting
   * CHANGES_REQUESTED on a blocked one. Read live on 2026-07-31: #667 and #668 carry APPROVED
   * reviews and report "", while #656, #658, #660 and #661 report CHANGES_REQUESTED. A bare
   * `reviewDecision = APPROVED` precondition therefore refused every unattended merge in both
   * repositories. The positive gate is current marker-bearing local review evidence; this field
   * keeps only its blocking half.
   */
  const emptyDecisionLog = join(root, `${file}-empty-review-decision.log`)
  const emptyDecision = run(file, reviewedArgs, {
    env: mergeSweepEnv({ head: expectedHead, log: emptyDecisionLog, reviewDecision: "", approvalCommits: "" }),
  })
  const emptyDecisionMerges = mergeSweepCalls(emptyDecisionLog).filter(([group, command]) => group === "pr" && command === "merge")
  T(
    `${file}: an empty reviewDecision with no approving review still merges`,
    emptyDecision.status === 0 && /MERGED #615/.test(emptyDecision.stdout) && emptyDecisionMerges.length === 1,
    `exit ${emptyDecision.status}\n     stdout: ${emptyDecision.stdout.trim()}\n     stderr: ${emptyDecision.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(emptyDecisionLog))}`,
  )
  const changesRequestedLog = join(root, `${file}-changes-requested.log`)
  const changesRequested = run(file, reviewedArgs, {
    env: mergeSweepEnv({ head: expectedHead, log: changesRequestedLog, reviewDecision: "CHANGES_REQUESTED" }),
  })
  const changesRequestedMerges = mergeSweepCalls(changesRequestedLog).filter(([group, command]) => group === "pr" && command === "merge")
  T(
    `${file}: an outstanding CHANGES_REQUESTED still refuses the merge`,
    changesRequested.status === 0 && changesRequestedMerges.length === 0,
    `exit ${changesRequested.status}\n     stdout: ${changesRequested.stdout.trim()}\n     stderr: ${changesRequested.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(changesRequestedLog))}`,
  )
  /**
   * Dropping the bare precondition must not reopen #654's race: an approval naming an older
   * commit stays refused even now that reviewDecision no longer says APPROVED.
   */
  const staleUnderEmptyLog = join(root, `${file}-stale-approval-under-empty-decision.log`)
  const staleUnderEmpty = run(file, reviewedArgs, {
    env: mergeSweepEnv({ head: expectedHead, log: staleUnderEmptyLog, reviewDecision: "", approvalCommits: changedHead }),
  })
  const staleUnderEmptyMerges = mergeSweepCalls(staleUnderEmptyLog).filter(([group, command]) => group === "pr" && command === "merge")
  T(
    `${file}: a stale approval is still refused when reviewDecision is empty`,
    staleUnderEmpty.status === 0 &&
      /SKIP #615 REVIEW-EVIDENCE-HELD[\s\S]*STALE_NATIVE_APPROVAL/.test(staleUnderEmpty.stdout) &&
      staleUnderEmptyMerges.length === 0,
    `exit ${staleUnderEmpty.status}\n     stdout: ${staleUnderEmpty.stdout.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(staleUnderEmptyLog))}`,
  )

  const missingCutoffLog = join(root, `${file}-missing-reviewed-through.log`)
  const missingCutoff = run(file, ["--expected-head", `615=${expectedHead}`, "--issue", "615=ORB-150", "thomasluizon/orbit-ui-mobile", "615"], {
    env: mergeSweepEnv({
      head: expectedHead,
      log: missingCutoffLog,
      sonar: "success",
      state: "CLEAN",
    }),
  })
  const missingCutoffMerges = mergeSweepCalls(missingCutoffLog).filter(([group, command]) => group === "pr" && command === "merge")
  T(
    `${file}: a missing reviewed-through mapping fails closed`,
    missingCutoff.status === 0 && /SKIP #615 REVIEW-LOOKUP-FAILED source=reviewed-through/.test(missingCutoff.stdout) && missingCutoffMerges.length === 0,
    `exit ${missingCutoff.status}\n     stdout: ${missingCutoff.stdout.trim()}\n     stderr: ${missingCutoff.stderr.trim()}\n     calls: ${JSON.stringify(mergeSweepCalls(missingCutoffLog))}`,
  )
}

export const cases = () => {
    processTreeVisibilityCase()
    processTreeTimeoutCase()
    mergeSweepCliFlagCases()
    mergeSweepCases("merge-sweep.sh")
  }
export const coverageCases = () => mergeSweepCases("merge-sweep-cov.sh")
export { mergeSweepCliFlagCases as cliCases }
