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

export const cases = () => {
  const repo = stageRepo("sync-linear-state")
  if (!repo) {
    T(`${TOOL}: a git fixture is available`, false, "could not stage repository")
    return
  }
  const real = realOrchestratorConfig()
  const staged = stageWithConfig("sync-linear-state", TOOL, { ...real, repos: { ui: repo.path } })
  const message = stage("sync-linear-state/message.md", "PR #700 is ready on the final head.")
  const argv = ["--issue", "ORB-700", "--repo", "ui", "--pr", "700", "--state", "ready", "--head-sha", HEAD, "--base-sha", BASE, "--message-file", message]
  const statusMarker = stage("sync-linear-state/status-marker", "status")
  const commentMarker = stage("sync-linear-state/comment-marker", "comment")
  const env = orcaEnv([
    { match: "linear issue ORB-700 --full --json", stdout: issueEnvelope() },
    { match: "linear status set ORB-700", stdout: "", removePath: statusMarker, ignoreLinearShape: true },
    { match: "linear comment add ORB-700", stdout: "", removePath: commentMarker, ignoreLinearShape: true },
  ])
  check(TOOL, "ready synchronizes In Review and posts one state comment", argv, { status: 0, stdout: /"status": "In Review"[\s\S]*"commentPosted": true/ }, { path: staged.path, env })
  T(`${TOOL}: status and comment writes both ran`, !existsSync(statusMarker) && !existsSync(commentMarker))

  const duplicateMarker = stage("sync-linear-state/duplicate-comment-marker", "must remain")
  const duplicateEnv = orcaEnv([
    { match: "linear issue ORB-700 --full --json", stdout: issueEnvelope({ name: "In Review", type: "started" }) },
    { match: "linear comment add ORB-700", stdout: "", removePath: duplicateMarker, ignoreLinearShape: true },
  ])
  check(TOOL, "an identical current-head state skips duplicate comment spam", argv, { status: 0, stdout: /"commentPosted": false/ }, { path: staged.path, env: duplicateEnv })
  T(`${TOOL}: duplicate state did not call comment add`, existsSync(duplicateMarker))

  const stdinArgv = [...argv]
  stdinArgv[stdinArgv.indexOf(message)] = "-"
  check(TOOL, "the documented message-file stdin sentinel is accepted", stdinArgv, { status: 0, stdout: /"lastSynchronizationResult": "SUCCESS"/ }, { path: staged.path, input: "state from stdin\n", env: orcaEnv([
    { match: "linear issue ORB-700 --full --json", stdout: issueEnvelope() },
    { match: "linear status set ORB-700", stdout: "", ignoreLinearShape: true },
    { match: "linear comment add ORB-700", stdout: "", ignoreLinearShape: true },
  ]) })

  const visual = [...argv]
  visual[visual.indexOf("ready")] = "visual"
  check(TOOL, "visible-effect work remains In Progress", visual, { status: 0, stdout: /"status": "In Progress"/ }, { path: staged.path, env: orcaEnv([
    { match: "linear issue ORB-700 --full --json", stdout: issueEnvelope({ name: "In Review", type: "started" }, [{ id: "label-visible", name: "visible-effect", color: "#abc" }]) },
    { match: "linear status set ORB-700", stdout: "", ignoreLinearShape: true },
    { match: "linear comment add ORB-700", stdout: "", ignoreLinearShape: true },
  ]) })

  check(TOOL, "an ordinary live ticket overrides a mistaken visual request", visual, { status: 0, stdout: /"status": "In Review"[\s\S]*"lastPostedState": "ready"/ }, { path: staged.path, env: orcaEnv([
    { match: "linear issue ORB-700 --full --json", stdout: issueEnvelope({ name: "In Progress", type: "started" }) },
    { match: "linear status set ORB-700", stdout: "", ignoreLinearShape: true },
    { match: "linear comment add ORB-700", stdout: "", ignoreLinearShape: true },
  ]) })

  check(TOOL, "a live visible-effect label overrides a mistaken ready request", argv, { status: 0, stdout: /"status": "In Progress"[\s\S]*"lastPostedState": "visual"/ }, { path: staged.path, env: orcaEnv([
    { match: "linear issue ORB-700 --full --json", stdout: issueEnvelope({ name: "In Review", type: "started" }, [{ id: "label-visible", name: "visible-effect", color: "#abc" }]) },
    { match: "linear status set ORB-700", stdout: "", ignoreLinearShape: true },
    { match: "linear comment add ORB-700", stdout: "", ignoreLinearShape: true },
  ]) })

  /**
   * THE Linear half of the 2026-08-08 misdirected-write incident. `--issue` is caller-supplied and
   * this tool writes twice with it, so a mistyped or invented ORB-N moves a stranger's ticket and
   * comments on it. Each case stubs BOTH writes and asserts they went unused, which is what proves
   * nothing was written rather than only that the exit code was non-zero.
   */
  const refusalEnv = (envelope) => {
    const statusUnused = stage(`sync-linear-state/unused-status-${Math.abs(envelope.length)}`, "must remain")
    const commentUnused = stage(`sync-linear-state/unused-comment-${Math.abs(envelope.length)}`, "must remain")
    return {
      env: orcaEnv([
        { match: "linear issue ORB-700 --full --json", stdout: envelope },
        { match: "linear status set ORB-700", stdout: "", removePath: statusUnused, ignoreLinearShape: true },
        { match: "linear comment add ORB-700", stdout: "", removePath: commentUnused, ignoreLinearShape: true },
      ]),
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

  const descendantPidFile = stage("sync-linear-state/descendant.pid", "")
  const hanging = check(TOOL, "a hanging Linear read is bounded", [...argv, "--command-timeout-seconds", "1"], { status: 2, stderr: /timed out after 1s/ }, { path: staged.path, env: orcaEnv([
    { match: "linear issue ORB-700 --full --json", stdout: "", hangTreePidFile: descendantPidFile, allowNonJsonLinear: true },
  ]) })
  const descendantPid = Number(readFileSync(descendantPidFile, "utf8"))
  T(`${TOOL}: a Linear timeout removes the complete child process tree`, Number.isInteger(descendantPid) && !processIsRunning(descendantPid), hanging.stderr || `descendant ${descendantPid} still alive`)
}
