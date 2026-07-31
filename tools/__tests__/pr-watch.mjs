import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { T, root, orcaEnv, check } from "./_harness.mjs"

/**
 * pr-watch cases. Every one is a state the two hand-rolled ORB-88 loops got wrong, so the
 * regression they pin is "the watcher went back to sleep with the answer on screen".
 */
const HEAD_SHA = "d9a3f1c43e6d6c571d09fe7ea8afc55c26aa19dd"

const OLD_SHA = "1111111111111111111111111111111111111111"

const reviewOn = (state, oid) => ({ state, author: { login: "claude" }, commit: { oid } })

const checkRun = (name, conclusion, createdAt = "2026-07-31T14:53:08Z", startedAt = createdAt) => ({
  __typename: "CheckRun",
  name,
  status: "COMPLETED",
  conclusion,
  startedAt,
  checkSuite: { createdAt },
})

const pullRequestStub = (number, pullRequest) => ({
  match: `number=${number}`,
  stdout: JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          number,
          url: `https://github.com/thomasluizon/orbit-ui-mobile/pull/${number}`,
          state: "OPEN",
          merged: false,
          isDraft: false,
          mergeStateStatus: "BLOCKED",
          reviewDecision: null,
          headRefOid: HEAD_SHA,
          latestReviews: { nodes: [] },
          reviews: { pageInfo: { hasNextPage: false }, nodes: [] },
          commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS", contexts: { nodes: [checkRun("Lint", "SUCCESS")] } } } }] },
          ...pullRequest,
        },
      },
    },
  }),
})

const rollup = (...contexts) => ({ nodes: [{ commit: { statusCheckRollup: { state: "FAILURE", contexts: { nodes: contexts } } } }] })

const prWatchCases = () => {
  const argv = ["--repo", "thomasluizon/orbit-ui-mobile", "--pr", "615", "--once"]
  check(
    "pr-watch.mjs",
    "--help documents accumulated signals and review-clear readiness",
    ["--help"],
    { status: 0, stdout: /same PR and head accumulate[\s\S]*READY_TO_MERGE independently[\s\S]*No\s+approval is required; if any approval exists, at least one must name the current head commit/ },
  )
  let sequenceNumber = 0
  const checkSequence = (name, states, extraArgv, expect) => {
    sequenceNumber += 1
    const log = join(root, `pr-watch-sequence-${sequenceNumber}.log`)
    const result = check(
      "pr-watch.mjs",
      name,
      ["--repo", "thomasluizon/orbit-ui-mobile", "--pr", "615", "--interval", "0.05", "--timeout", "2", ...extraArgv],
      expect,
      {
        env: {
          ...orcaEnv([{ match: "number=615", sequence: states.map((state) => pullRequestStub(615, state).stdout) }]),
          ORBIT_ORCA_LOG: log,
        },
      },
    )
    const polls = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).length : 0
    T(`pr-watch.mjs: ${name} consumed the state sequence`, polls >= states.length, `polled ${polls} time(s), expected at least ${states.length}`)
    return result
  }

  check(
    "pr-watch.mjs",
    "a verdict sitting on an OLDER commit does not satisfy the watch",
    argv,
    { status: 4, stdout: /"transition": "none"/ },
    { env: orcaEnv([pullRequestStub(615, { reviewDecision: "CHANGES_REQUESTED", latestReviews: { nodes: [reviewOn("CHANGES_REQUESTED", OLD_SHA)] } })]) },
  )
  check(
    "pr-watch.mjs",
    "a fresh CHANGES_REQUESTED on the current head fires, which is the silent-spin regression",
    argv,
    { status: 1, stdout: /"transition": "changes-requested"/ },
    { env: orcaEnv([pullRequestStub(615, { reviewDecision: "CHANGES_REQUESTED", latestReviews: { nodes: [reviewOn("CHANGES_REQUESTED", HEAD_SHA)] } })]) },
  )
  const headApproval = reviewOn("APPROVED", HEAD_SHA)
  const approved = pullRequestStub(615, {
    reviewDecision: "APPROVED",
    mergeStateStatus: "CLEAN",
    latestReviews: { nodes: [headApproval] },
    reviews: { pageInfo: { hasNextPage: false }, nodes: [headApproval] },
  })
  check("pr-watch.mjs", "a fresh approval fires", argv, { status: 0, stdout: /"transition": "approved"/ }, { env: orcaEnv([approved]) })
  check(
    "pr-watch.mjs",
    "a draft reading clean and review-clear is refused",
    argv,
    { status: 1, stdout: /"transition": "draft"[\s\S]*"reason": "the PR is a draft and cannot be merged"/ },
    { env: orcaEnv([pullRequestStub(615, { isDraft: true, mergeStateStatus: "CLEAN" })]) },
  )
  const reviewClear = pullRequestStub(615, { mergeStateStatus: "CLEAN" })
  check(
    "pr-watch.mjs",
    "a clean PR with no approval and no CHANGES_REQUESTED reports readiness",
    argv,
    { status: 0, stdout: /"transition": "ready-to-merge"/ },
    { env: orcaEnv([reviewClear]) },
  )
  check(
    "pr-watch.mjs",
    "an acted readiness on an already clean and review-clear PR does not repeat",
    [...argv, "--acted", `615=${HEAD_SHA}:READY_TO_MERGE`],
    { status: 4, stdout: /"transition": "none"/ },
    { env: orcaEnv([reviewClear]) },
  )
  check(
    "pr-watch.mjs",
    "a stale approval blocks readiness even when reviewDecision is empty",
    argv,
    { status: 4, stdout: /"transition": "none"/ },
    {
      env: orcaEnv([
        pullRequestStub(615, {
          mergeStateStatus: "CLEAN",
          reviews: { pageInfo: { hasNextPage: false }, nodes: [reviewOn("APPROVED", OLD_SHA)] },
        }),
      ]),
    },
  )
  check(
    "pr-watch.mjs",
    "a current-head approval remains review-clear even when reviewDecision is empty",
    argv,
    { status: 0, stdout: /"transition": "ready-to-merge"/ },
    {
      env: orcaEnv([
        pullRequestStub(615, {
          mergeStateStatus: "CLEAN",
          reviews: { pageInfo: { hasNextPage: false }, nodes: [headApproval] },
        }),
      ]),
    },
  )
  check(
    "pr-watch.mjs",
    "CHANGES_REQUESTED blocks readiness without requiring a current-head verdict",
    argv,
    { status: 4, stdout: /"transition": "none"/ },
    { env: orcaEnv([pullRequestStub(615, { mergeStateStatus: "CLEAN", reviewDecision: "CHANGES_REQUESTED" })]) },
  )
  check(
    "pr-watch.mjs",
    "an incomplete approval inventory blocks readiness",
    argv,
    { status: 4, stdout: /"transition": "none"/ },
    { env: orcaEnv([pullRequestStub(615, { mergeStateStatus: "CLEAN", reviews: { pageInfo: { hasNextPage: true }, nodes: [] } })]) },
  )
  const twoVerdicts = {
    reviewDecision: "CHANGES_REQUESTED",
    latestReviews: { nodes: [reviewOn("CHANGES_REQUESTED", HEAD_SHA), reviewOn("COMMENTED", HEAD_SHA)] },
  }
  check(
    "pr-watch.mjs",
    "two acted verdicts on the same PR and head both remain suppressed",
    [...argv, "--acted", `615=${HEAD_SHA}:CHANGES_REQUESTED`, "--acted", `615=${HEAD_SHA}:COMMENTED`],
    { status: 4, stdout: /"transition": "none"/ },
    { env: orcaEnv([pullRequestStub(615, twoVerdicts)]) },
  )
  check(
    "pr-watch.mjs",
    "acting only on the comment leaves changes requested actionable",
    [...argv, "--acted", `615=${HEAD_SHA}:COMMENTED`],
    { status: 1, stdout: /"transition": "changes-requested"/ },
    { env: orcaEnv([pullRequestStub(615, twoVerdicts)]) },
  )
  check(
    "pr-watch.mjs",
    "acting only on changes requested leaves the comment actionable",
    [...argv, "--acted", `615=${HEAD_SHA}:CHANGES_REQUESTED`],
    { status: 1, stdout: /"transition": "review-comment"/ },
    { env: orcaEnv([pullRequestStub(615, twoVerdicts)]) },
  )
  check(
    "pr-watch.mjs",
    "a failing check beats an approval",
    argv,
    { status: 1, stdout: /"transition": "checks-failed"/ },
    {
      env: orcaEnv([
        pullRequestStub(615, {
          reviewDecision: "APPROVED",
          mergeStateStatus: "CLEAN",
          latestReviews: { nodes: [reviewOn("APPROVED", HEAD_SHA)] },
          commits: rollup(checkRun("Lint", "SUCCESS"), checkRun("Harness Execution", "FAILURE")),
        }),
      ]),
    },
  )
  check(
    "pr-watch.mjs",
    "a newer successful run supersedes an older failure regardless of API array order",
    argv,
    { status: 4, stdout: /"transition": "none"/ },
    {
      env: orcaEnv([
        pullRequestStub(615, {
          commits: rollup(
            checkRun("Harness Lockstep", "SUCCESS", "2026-07-31T14:55:29Z"),
            checkRun("Harness Lockstep", "FAILURE", "2026-07-31T14:53:08Z"),
          ),
        }),
      ]),
    },
  )
  check(
    "pr-watch.mjs",
    "a newer successful same-suite rerun supersedes its older failure",
    argv,
    { status: 0, stdout: /"transition": "ready-to-merge"/ },
    {
      env: orcaEnv([
        pullRequestStub(615, {
          mergeStateStatus: "CLEAN",
          commits: rollup(
            checkRun("Harness Lockstep", "SUCCESS", "2026-07-31T14:53:08Z", "2026-07-31T14:55:37Z"),
            checkRun("Harness Lockstep", "FAILURE", "2026-07-31T14:53:08Z", "2026-07-31T14:53:17Z"),
          ),
        }),
      ]),
    },
  )
  check(
    "pr-watch.mjs",
    "an exact start timestamp tie retains a failed duplicate",
    argv,
    { status: 1, stdout: /"transition": "checks-failed"/ },
    {
      env: orcaEnv([
        pullRequestStub(615, {
          commits: rollup(
            checkRun("Harness Lockstep", "SUCCESS", "2026-07-31T14:55:29Z", "2026-07-31T14:55:37Z"),
            checkRun("Harness Lockstep", "FAILURE", "2026-07-31T14:53:08Z", "2026-07-31T14:55:37Z"),
          ),
        }),
      ]),
    },
  )
  check(
    "pr-watch.mjs",
    "a failed duplicate with no start timestamp cannot be discarded",
    argv,
    { status: 1, stdout: /"transition": "checks-failed"/ },
    {
      env: orcaEnv([
        pullRequestStub(615, {
          commits: rollup(
            checkRun("Harness Lockstep", "SUCCESS", "2026-07-31T14:55:29Z", "2026-07-31T14:55:37Z"),
            checkRun("Harness Lockstep", "FAILURE", "2026-07-31T14:53:08Z", null),
          ),
        }),
      ]),
    },
  )
  check(
    "pr-watch.mjs",
    "a merged PR ends the watch",
    argv,
    { status: 5, stdout: /"transition": "gone"/ },
    { env: orcaEnv([pullRequestStub(615, { state: "MERGED", merged: true })]) },
  )
  check(
    "pr-watch.mjs",
    "a closed PR ends the watch",
    argv,
    { status: 5, stdout: /"transition": "gone"[\s\S]*"reason": "the PR is closed unmerged"/ },
    { env: orcaEnv([pullRequestStub(615, { state: "CLOSED" })]) },
  )
  checkSequence(
    "a review decision changing on the current head fires",
    [{ reviewDecision: null }, { reviewDecision: "APPROVED" }],
    [],
    { status: 0, stdout: /"transition": "review-decision"/ },
  )
  checkSequence(
    "a non-approving review decision change needs work",
    [{ reviewDecision: "APPROVED" }, { reviewDecision: "CHANGES_REQUESTED" }],
    [],
    { status: 1, stdout: /"transition": "review-decision"/ },
  )
  checkSequence(
    "a required check concluding as failed fires",
    [
      { commits: { nodes: [{ commit: { statusCheckRollup: { state: "PENDING", contexts: { nodes: [{ ...checkRun("Lint", null), status: "IN_PROGRESS" }] } } } }] } },
      { commits: rollup(checkRun("Lint", "FAILURE")) },
    ],
    [],
    { status: 1, stdout: /"transition": "checks-failed"[\s\S]*Lint: FAILURE/ },
  )
  checkSequence(
    "a head change wins when merge state becomes clean in the same poll",
    [{ headRefOid: OLD_SHA, mergeStateStatus: "BLOCKED" }, { headRefOid: HEAD_SHA, mergeStateStatus: "CLEAN" }],
    [],
    { status: 1, stdout: /"transition": "head-changed"/ },
  )
  checkSequence(
    "clean through unknown and back to clean emits nothing",
    [{ mergeStateStatus: "CLEAN" }, { mergeStateStatus: "UNKNOWN" }, { mergeStateStatus: "CLEAN" }],
    ["--acted", `615=${HEAD_SHA}:READY_TO_MERGE`],
    { status: 4, stdout: /"transition": "timeout"/ },
  )
  checkSequence(
    "blocked through unknown to clean emits readiness once review-clear",
    [{ mergeStateStatus: "BLOCKED" }, { mergeStateStatus: "UNKNOWN" }, { mergeStateStatus: "CLEAN" }],
    [],
    { status: 0, stdout: /"transition": "ready-to-merge"/ },
  )
  checkSequence(
    "an acted approval emits readiness when the PR later becomes clean",
    [
      { reviewDecision: "APPROVED", mergeStateStatus: "BLOCKED", latestReviews: { nodes: [reviewOn("APPROVED", HEAD_SHA)] } },
      { reviewDecision: "APPROVED", mergeStateStatus: "CLEAN", latestReviews: { nodes: [reviewOn("APPROVED", HEAD_SHA)] } },
    ],
    ["--acted", `615=${HEAD_SHA}:APPROVED`],
    { status: 0, stdout: /"transition": "ready-to-merge"/ },
  )
  checkSequence(
    "non-terminal merge state churn emits nothing",
    [{ mergeStateStatus: "BLOCKED" }, { mergeStateStatus: "UNKNOWN" }, { mergeStateStatus: "BEHIND" }],
    [],
    { status: 4, stdout: /"transition": "timeout"/ },
  )
  check(
    "pr-watch.mjs",
    "watching several PRs reports whichever one transitioned",
    ["--repo", "thomasluizon/orbit-ui-mobile", "--pr", "615,616", "--once"],
    { status: 1, stdout: /"pr": 616[\s\S]*"transition": "changes-requested"/ },
    {
      env: orcaEnv([
        pullRequestStub(615, {}),
        pullRequestStub(616, { reviewDecision: "CHANGES_REQUESTED", latestReviews: { nodes: [reviewOn("CHANGES_REQUESTED", HEAD_SHA)] } }),
      ]),
    },
  )
  check(
    "pr-watch.mjs",
    "an acted ready PR does not starve a later fleet transition",
    [
      "--repo",
      "thomasluizon/orbit-ui-mobile",
      "--pr",
      "615,616",
      "--once",
      "--acted",
      `615=${HEAD_SHA}:APPROVED`,
      "--acted",
      `615=${HEAD_SHA}:READY_TO_MERGE`,
    ],
    { status: 1, stdout: /"pr": 616[\s\S]*"transition": "changes-requested"/ },
    {
      env: orcaEnv([
        approved,
        pullRequestStub(616, { reviewDecision: "CHANGES_REQUESTED", latestReviews: { nodes: [reviewOn("CHANGES_REQUESTED", HEAD_SHA)] } }),
      ]),
    },
  )
  /**
   * The REAL loop, not --once: every other case here short-circuits it, and this is the code
   * that runs unattended for 90 minutes in place of two predecessors that failed silently.
   * --interval 1 --timeout 3 gives it two sleeps before the deadline, so polls > 1 is the proof
   * that it slept and came back rather than falling out of the loop on the first pass.
   */
  const timedOut = check(
    "pr-watch.mjs",
    "the polling loop sleeps, re-polls and times out reporting it, without --once",
    ["--repo", "thomasluizon/orbit-ui-mobile", "--pr", "615", "--interval", "1", "--timeout", "3"],
    { status: 4, stdout: /"transition": "timeout"/ },
    { env: orcaEnv([pullRequestStub(615, { reviewDecision: "CHANGES_REQUESTED", latestReviews: { nodes: [reviewOn("CHANGES_REQUESTED", OLD_SHA)] } })]) },
  )
  T(
    "pr-watch.mjs: the timed-out watch really polled more than once",
    timedOut.status === 4 && JSON.parse(timedOut.stdout).polls > 1,
    `polls was ${timedOut.status === 4 ? JSON.parse(timedOut.stdout).polls : "unreadable"}; one poll means the loop never slept\n     ${timedOut.stderr.trim().split("\n").slice(0, 4).join("\n     ")}`,
  )

  check("pr-watch.mjs", "refuses a baseline for a PR it is not watching", [...argv, "--acted", `616=${HEAD_SHA}:APPROVED`], { status: 2, stderr: /--pr does not watch/ })
  check("pr-watch.mjs", "refuses a malformed baseline rather than ignoring it", [...argv, "--acted", "615=APPROVED"], { status: 2, stderr: /--acted must look like/ })
  check("pr-watch.mjs", "refuses an unknown acted signal", [...argv, "--acted", `615=${HEAD_SHA}:MERGEABLE`], { status: 2, stderr: /--acted signal must be/ })
  check("pr-watch.mjs", "refuses a repo that is not an owner\\/name slug", ["--repo", "orbit-ui-mobile", "--pr", "615", "--once"], { status: 2, stderr: /owner\/name slug/ })
}

export { prWatchCases as cases }
