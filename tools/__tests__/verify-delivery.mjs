import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { T, check, orcaEnv, realOrchestratorConfig, run, stage, stageRepo, stageWithConfig } from "./_harness.mjs"

const TOOL = "verify-delivery.mjs"
const BRANCH = "feature/orb-200-delivery"

/**
 * A real git repository is the whole point: this tool exists because a worker's own report is not
 * evidence, so every fixture below is an artifact on disk that git can be asked about. `commit`
 * false is openai/codex#19945's real shape and the reason the tool exists: the process exits 0, the
 * branch is pushed by setup, and nothing was ever committed.
 */
const stageDelivery = (label, { commit = true, push = true, dirty = false } = {}) => {
  const repo = stageRepo(`verify-delivery-${label}`)
  if (!repo || repo.git(["switch", "-q", "-c", BRANCH]).status !== 0) return null
  if (commit) {
    writeFileSync(join(repo.path, "worked.txt"), `${label}\n`)
    if (repo.git(["add", "worked.txt"]).status !== 0 || repo.git(["commit", "-q", "-m", label]).status !== 0) return null
  }
  if (push && repo.git(["push", "-q", "-u", "origin", BRANCH]).status !== 0) return null
  if (dirty) writeFileSync(join(repo.path, "uncommitted.txt"), "left behind\n")
  return { ...repo, head: repo.git(["rev-parse", "HEAD"]).stdout.trim() }
}

const pullRequest = (headRefOid, additions = 10, deletions = 5, number = 200) => ({
  number,
  url: `https://github.com/useorbitai/orbit-ui-mobile/pull/${number}`,
  headRefOid,
  additions,
  deletions,
})

const ghPlan = (stdout, exit = 0) => orcaEnv([{ match: `pr list --head ${BRANCH}`, stdout, exit }])

const verdictOf = (fixture, stdout, expected, status, name) =>
  check(TOOL, name, ["--issue", "ORB-200", "--worktree", fixture.path, "--branch", BRANCH], { status, stdout: new RegExp(`"verdict": "${expected}"`) }, { env: ghPlan(stdout) })

export const cases = () => {
  check(TOOL, "refuses a missing issue", ["--worktree", ".", "--branch", BRANCH], { status: 2, stderr: /--issue must be a Linear identifier/ })
  check(TOOL, "refuses a malformed issue", ["--issue", "orbit200", "--worktree", ".", "--branch", BRANCH], { status: 2, stderr: /--issue must be a Linear identifier/ })
  check(TOOL, "refuses a missing branch", ["--issue", "ORB-200", "--worktree", "."], { status: 2, stderr: /--branch requires a branch name/ })
  check(TOOL, "refuses an unknown option before doing any work", ["--issue", "ORB-200", "--worktree", ".", "--branch", BRANCH, "--force"], { status: 2, stderr: /unknown option\(s\): --force/ })
  check(TOOL, "refuses a worktree that is a file rather than a directory", ["--issue", "ORB-200", "--worktree", stage("verify-delivery/not-a-directory", "x"), "--branch", BRANCH], { status: 2, stderr: /--worktree does not name a directory/ })

  const nothing = stageDelivery("no-commit", { commit: false })
  if (!nothing) {
    T(`${TOOL}: real git fixtures are available`, false, "could not stage a git repository with a bare origin")
    return
  }

  /**
   * THE case. A worker that exits 0 having committed nothing must be caught here and nowhere else:
   * its branch exists on the remote, its tree is clean, and every self-report says success.
   */
  const noCommit = verdictOf(nothing, JSON.stringify([pullRequest(nothing.head)]), "NO_COMMIT", 1, "a worker that exited 0 having committed nothing is NO_COMMIT")
  T(
    `${TOOL}: NO_COMMIT reports the commit count it actually counted`,
    /"hasCommits": \{\s*"pass": false,\s*"observed": 0/.test(noCommit.stdout),
    noCommit.stdout || noCommit.stderr,
  )

  const dirty = stageDelivery("dirty", { dirty: true })
  const dirtyResult = verdictOf(dirty, JSON.stringify([pullRequest(dirty.head)]), "NO_COMMIT", 1, "an uncommitted working tree is NO_COMMIT")
  T(`${TOOL}: the dirty verdict names the uncommitted path`, /uncommitted\.txt/.test(dirtyResult.stdout), dirtyResult.stdout || dirtyResult.stderr)

  const unpushed = stageDelivery("unpushed", { push: false })
  verdictOf(unpushed, JSON.stringify([pullRequest(unpushed.head)]), "UNPUSHED", 1, "a commit that never reached origin is UNPUSHED")

  const pushed = stageDelivery("pushed")
  verdictOf(pushed, "[]", "NO_PR", 1, "a pushed branch with no pull request is NO_PR")
  verdictOf(pushed, JSON.stringify([pullRequest(pushed.head), pullRequest(pushed.head, 1, 1, 201)]), "NO_PR", 1, "two pull requests on one branch is NO_PR rather than a silent pick")
  verdictOf(pushed, JSON.stringify([pullRequest("0000000000000000000000000000000000000000")]), "STALE_PR", 1, "a pull request head behind the local head is STALE_PR")
  verdictOf(pushed, JSON.stringify([pullRequest(pushed.head, 300, 200)]), "OVERSIZE", 1, "a diff over the 400-line cap is OVERSIZE")
  verdictOf(pushed, JSON.stringify([pullRequest(pushed.head, 200, 200)]), "DELIVERED", 0, "a diff exactly at the 400-line cap is DELIVERED")

  const delivered = check(
    TOOL,
    "a clean, pushed, single, current, in-cap pull request is DELIVERED and exits 0",
    ["--issue", "ORB-200", "--worktree", pushed.path, "--branch", BRANCH],
    { status: 0, stdout: /"verdict": "DELIVERED"/ },
    { env: ghPlan(JSON.stringify([pullRequest(pushed.head)])) },
  )
  T(
    `${TOOL}: DELIVERED carries the pull request number and url every later step needs`,
    /"number": 200/.test(delivered.stdout) && /"url": "https:\/\/github\.com\/[^"]+\/pull\/200"/.test(delivered.stdout),
    delivered.stdout || delivered.stderr,
  )
  T(
    `${TOOL}: stdout carries ONE JSON object and nothing else`,
    (() => {
      try {
        return JSON.parse(delivered.stdout).verdict === "DELIVERED"
      } catch {
        return false
      }
    })(),
    delivered.stdout,
  )

  const argv = ["--issue", "ORB-200", "--worktree", pushed.path, "--branch", BRANCH]
  check(TOOL, "a failing gh is an environment error, never a verdict", argv, { status: 2, stderr: /gh pr list --head .* failed/ }, { env: ghPlan("", 1) })
  check(TOOL, "unparseable gh output is an environment error", argv, { status: 2, stderr: /returned unparseable JSON/ }, { env: ghPlan("not json at all") })
  check(TOOL, "a non-array gh payload is an environment error", argv, { status: 2, stderr: /did not return an array/ }, { env: ghPlan(JSON.stringify({ number: 200 })) })
  check(
    TOOL,
    "a pull request with no numeric diff size is an environment error, not an in-cap pass",
    argv,
    { status: 2, stderr: /reported no numeric additions and deletions/ },
    { env: ghPlan(JSON.stringify([{ number: 200, url: "https://example.test/pull/200", headRefOid: pushed.head }])) },
  )

  const real = realOrchestratorConfig()
  const staged = stageWithConfig("verify-delivery-repo", TOOL, { ...real, repos: { ui: pushed.path } })
  const unknownRepo = run(TOOL, [...argv, "--repo", "ghost"], { path: staged.path, env: ghPlan("[]") })
  T(
    `${TOOL}: an unknown --repo key is refused naming the keys that are configured`,
    unknownRepo.status === 2 && /--repo must name a configured repository \(known: ui\)/.test(unknownRepo.stderr),
    `exit ${unknownRepo.status}: ${unknownRepo.stderr || unknownRepo.stdout}`,
  )
}
