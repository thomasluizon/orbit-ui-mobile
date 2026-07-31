import { readFileSync } from "node:fs"
import { join } from "node:path"

import { TOOLS_DIR, T, root, mergeSweepEnv, mergeSweepCalls, orphanCaseKeys, toolPath, run, check } from "./_harness.mjs"

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
  for (const name of ["ensure_issue_in_review", "linear_state", "commit_linear_reassertion", "approval_not_stale"]) {
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
    new RegExp(`SKIP #615 APPROVAL-STALE expected=${expectedHead} approved=\\[${changedHead}\\]`),
  )

  /**
   * A2 refuses a STALE approval; it does not require a fresh one, and this case is what stops
   * the next agent restoring the stricter form. PR4 deletes claude-review.yml, and the ONLY
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
      /SKIP #615 APPROVAL-STALE/.test(insufficient.stdout),
    `exit ${insufficient.status}\n     stdout: ${insufficient.stdout.trim()}\n     calls: ${JSON.stringify(insufficientCalls)}`,
  )
  approvalRefusal("an approval lookup failure", { approvalLookupFailure: true }, /SKIP #615 APPROVAL-LOOKUP-FAILED/)
  approvalRefusal("more than one page of reviews", { approvalCommits: "PAGINATED" }, /SKIP #615 APPROVAL-PAGE-OVERFLOW/)

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
    mergeSweepCliFlagCases()
    mergeSweepCases("merge-sweep.sh")
  }
export const coverageCases = () => mergeSweepCases("merge-sweep-cov.sh")
