import { existsSync, readFileSync } from "node:fs"

import { T, check, orcaEnv, processIsRunning, realOrchestratorConfig, stage, stageRepo, stageWithConfig } from "./_harness.mjs"

const TOOL = "sync-linear-state.mjs"
const HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const BASE = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

/**
 * Every ticket this tool may legitimately write to carries exactly one repo:* label, because
 * tools/plan-queue.mjs admits no other shape. The default carries repo:ui so each behavioural case
 * below keeps testing what it was written to test, and the target assertion gets its own cases.
 */
const REPO_UI = { id: "label-repo-ui", name: "repo:ui", color: "#5e6ad2" }
const rawIssueEnvelope = (state, labels) => JSON.stringify({ id: "issue-read", ok: true, result: { issue: { identifier: "ORB-700", state, labels } } })
const issueEnvelope = (state = { name: "In Progress", type: "started" }, labels = []) => rawIssueEnvelope(state, [REPO_UI, ...labels])
const pullRequestEnvelope = ({ number = 700, headRefName = "fix/prove-write-target", title = "fix: prove the write target", body = "Refs ORB-700" } = {}) =>
  JSON.stringify({ body, headRefName, number, title })
const syncEnv = (entries, pullRequest = pullRequestEnvelope()) => orcaEnv([
  { match: "auth token --user thomasluizon", stdout: "test-github-token" },
  { match: "pr view 700 --repo thomasluizon/orbit-ui-mobile --json number,headRefName,title,body", stdout: pullRequest },
  ...entries,
])

export const cases = () => {
  const repo = stageRepo("sync-linear-state")
  if (!repo || repo.git(["remote", "set-url", "origin", "https://github.com/thomasluizon/orbit-ui-mobile.git"]).status !== 0) {
    T(`${TOOL}: a repository-qualified GitHub fixture is available`, false, "could not stage repository")
    return
  }
  const real = realOrchestratorConfig()
  const staged = stageWithConfig("sync-linear-state", TOOL, { ...real, repos: { ui: repo.path } })
  const message = stage("sync-linear-state/message.md", "PR #700 is ready on the final head.")
  const argv = ["--issue", "ORB-700", "--repo", "ui", "--pr", "700", "--state", "ready", "--head-sha", HEAD, "--base-sha", BASE, "--message-file", message]
  const statusMarker = stage("sync-linear-state/status-marker", "status")
  const commentMarker = stage("sync-linear-state/comment-marker", "comment")
  const env = syncEnv([
    { match: "linear issue ORB-700 --full --json", stdout: issueEnvelope() },
    { match: "linear status set ORB-700", stdout: "", removePath: statusMarker, ignoreLinearShape: true },
    { match: "linear comment add ORB-700", stdout: "", removePath: commentMarker, ignoreLinearShape: true },
  ])
  check(TOOL, "ready synchronizes In Review and posts one state comment", argv, { status: 0, stdout: /"status": "In Review"[\s\S]*"commentPosted": true/ }, { path: staged.path, env })
  T(`${TOOL}: status and comment writes both ran`, !existsSync(statusMarker) && !existsSync(commentMarker))

  const duplicateMarker = stage("sync-linear-state/duplicate-comment-marker", "must remain")
  const duplicateEnv = syncEnv([
    { match: "linear issue ORB-700 --full --json", stdout: issueEnvelope({ name: "In Review", type: "started" }) },
    { match: "linear comment add ORB-700", stdout: "", removePath: duplicateMarker, ignoreLinearShape: true },
  ])
  check(TOOL, "an identical current-head state skips duplicate comment spam", argv, { status: 0, stdout: /"commentPosted": false/ }, { path: staged.path, env: duplicateEnv })
  T(`${TOOL}: duplicate state did not call comment add`, existsSync(duplicateMarker))

  const stdinArgv = [...argv]
  stdinArgv[stdinArgv.indexOf(message)] = "-"
  check(TOOL, "the documented message-file stdin sentinel is accepted", stdinArgv, { status: 0, stdout: /"lastSynchronizationResult": "SUCCESS"/ }, { path: staged.path, input: "state from stdin\n", env: syncEnv([
    { match: "linear issue ORB-700 --full --json", stdout: issueEnvelope() },
    { match: "linear status set ORB-700", stdout: "", ignoreLinearShape: true },
    { match: "linear comment add ORB-700", stdout: "", ignoreLinearShape: true },
  ]) })

  /**
   * THE Linear half of the 2026-08-08 misdirected-write incident. `--issue` is caller-supplied and
   * this tool writes twice with it, so a mistyped or invented ORB-N moves a stranger's ticket and
   * comments on it. Each case stubs BOTH writes and asserts they went unused, which is what proves
   * nothing was written rather than only that the exit code was non-zero.
   */
  let refusalIndex = 0
  const refusalEnv = (envelope, pullRequest = pullRequestEnvelope()) => {
    refusalIndex++
    const statusUnused = stage(`sync-linear-state/unused-status-${refusalIndex}`, "must remain")
    const commentUnused = stage(`sync-linear-state/unused-comment-${refusalIndex}`, "must remain")
    return {
      env: syncEnv([
        { match: "linear issue ORB-700 --full --json", stdout: envelope },
        { match: "linear status set ORB-700", stdout: "", removePath: statusUnused, ignoreLinearShape: true },
        { match: "linear comment add ORB-700", stdout: "", removePath: commentUnused, ignoreLinearShape: true },
      ], pullRequest),
      statusUnused,
      commentUnused,
    }
  }

  const wrongRepo = refusalEnv(rawIssueEnvelope({ name: "In Progress", type: "started" }, [{ id: "label-repo-landing", name: "repo:landing", color: "#abc" }]))
  check(TOOL, "a ticket labelled for ANOTHER repository is refused", argv, { status: 2, stderr: /carries repo:landing[\s\S]*Expected exactly repo:ui/ }, { path: staged.path, env: wrongRepo.env })
  T(`${TOOL}: the wrong-repository refusal wrote neither the status nor the comment`, existsSync(wrongRepo.statusUnused) && existsSync(wrongRepo.commentUnused))

  const noRepo = refusalEnv(rawIssueEnvelope({ name: "In Progress", type: "started" }, [{ id: "label-feature", name: "Feature", color: "#abc" }]))
  check(TOOL, "a ticket with NO repo label is refused, so the gate fails closed", argv, { status: 2, stderr: /no repo:\* label/ }, { path: staged.path, env: noRepo.env })
  T(`${TOOL}: the missing-label refusal wrote neither the status nor the comment`, existsSync(noRepo.statusUnused) && existsSync(noRepo.commentUnused))

  const twoRepos = refusalEnv(rawIssueEnvelope({ name: "In Progress", type: "started" }, [REPO_UI, { id: "label-repo-api", name: "repo:api", color: "#abc" }]))
  check(TOOL, "a ticket carrying two repo labels is refused rather than guessed", argv, { status: 2, stderr: /repo:ui and repo:api/ }, { path: staged.path, env: twoRepos.env })

  const wrongTicket = refusalEnv(issueEnvelope(), pullRequestEnvelope({ body: "Refs ORB-7000" }))
  check(TOOL, "a same-repository pull request that names ANOTHER ticket is refused", argv, { status: 2, stderr: /does not reference ORB-700/ }, { path: staged.path, env: wrongTicket.env })
  T(`${TOOL}: the wrong-ticket refusal wrote neither the status nor the comment`, existsSync(wrongTicket.statusUnused) && existsSync(wrongTicket.commentUnused))

  const missingPullRequestField = refusalEnv(issueEnvelope(), JSON.stringify({ headRefName: "fix/prove-write-target", number: 700, title: "fix: prove the write target" }))
  check(TOOL, "a pull request response missing a target field fails closed", argv, { status: 2, stderr: /returned no number, headRefName, title, or body/ }, { path: staged.path, env: missingPullRequestField.env })
  T(`${TOOL}: the incomplete-PR refusal wrote neither the status nor the comment`, existsSync(missingPullRequestField.statusUnused) && existsSync(missingPullRequestField.commentUnused))

  const descendantPidFile = stage("sync-linear-state/descendant.pid", "")
  const hanging = check(TOOL, "a hanging Linear read is bounded", [...argv, "--command-timeout-seconds", "1"], { status: 2, stderr: /timed out after 1s/ }, { path: staged.path, env: orcaEnv([
    { match: "linear issue ORB-700 --full --json", stdout: "", hangTreePidFile: descendantPidFile, allowNonJsonLinear: true },
  ]) })
  const descendantPid = Number(readFileSync(descendantPidFile, "utf8"))
  T(`${TOOL}: a Linear timeout removes the complete child process tree`, Number.isInteger(descendantPid) && !processIsRunning(descendantPid), hanging.stderr || `descendant ${descendantPid} still alive`)
}
