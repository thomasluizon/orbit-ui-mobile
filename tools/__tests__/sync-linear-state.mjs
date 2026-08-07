import { existsSync, readFileSync } from "node:fs"

import { T, check, orcaEnv, processIsRunning, realOrchestratorConfig, stage, stageRepo, stageWithConfig } from "./_harness.mjs"

const TOOL = "sync-linear-state.mjs"
const HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const BASE = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

const issueEnvelope = (state = { name: "In Progress", type: "started" }, labels = []) => JSON.stringify({ id: "issue-read", ok: true, result: { issue: { identifier: "ORB-700", state, labels } } })

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

  const descendantPidFile = stage("sync-linear-state/descendant.pid", "")
  const hanging = check(TOOL, "a hanging Linear read is bounded", [...argv, "--command-timeout-seconds", "1"], { status: 2, stderr: /timed out after 1s/ }, { path: staged.path, env: orcaEnv([
    { match: "linear issue ORB-700 --full --json", stdout: "", hangTreePidFile: descendantPidFile, allowNonJsonLinear: true },
  ]) })
  const descendantPid = Number(readFileSync(descendantPidFile, "utf8"))
  T(`${TOOL}: a Linear timeout removes the complete child process tree`, Number.isInteger(descendantPid) && !processIsRunning(descendantPid), hanging.stderr || `descendant ${descendantPid} still alive`)
}
