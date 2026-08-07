import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { T, check, orcaEnv, realOrchestratorConfig, run, stage, stageRepo, stageWithConfig } from "./_harness.mjs"

const TOOL = "verify-delivery.mjs"
const BRANCH = "feature/orb-200-delivery"
const ISSUE = "ORB-200"

/**
 * A real git repository is the whole point: this tool exists because a worker's own report is not
 * evidence, so every fixture below is an artifact on disk that git can be asked about. `commit`
 * false is openai/codex#19945's real shape and the reason the tool exists: the process exits 0, the
 * branch is pushed by setup, and nothing was ever committed. `dirty` takes the paths to leave
 * behind, because WHICH paths are dirty is now part of the verdict.
 */
const stageDelivery = (label, { commit = true, push = true, dirty = [] } = {}) => {
  const repo = stageRepo(`verify-delivery-${label}`)
  if (!repo || repo.git(["switch", "-q", "-c", BRANCH]).status !== 0) return null
  if (commit) {
    writeFileSync(join(repo.path, "worked.txt"), `${label}\n`)
    if (repo.git(["add", "worked.txt"]).status !== 0 || repo.git(["commit", "-q", "-m", `${label} the ticket's real work`]).status !== 0) return null
  }
  if (push && repo.git(["push", "-q", "-u", "origin", BRANCH]).status !== 0) return null
  for (const path of dirty) {
    mkdirSync(dirname(join(repo.path, path)), { recursive: true })
    writeFileSync(join(repo.path, path), "left behind\n")
  }
  return { ...repo, head: repo.git(["rev-parse", "HEAD"]).stdout.trim() }
}

/**
 * Every key here was read off a REAL `gh pr list --json` response before being written down, per
 * CLAUDE.md standard 8. `changedFiles` is an integer and was confirmed against
 * `gh pr view 690 --json changedFiles`, which reported 8 for a commit touching 8 files. It replaces
 * counting the `files` array, which the API truncates at 100 entries.
 */
const pullRequest = (headRefOid, additions = 10, deletions = 5, number = 200, changedFiles = 3) => ({
  number,
  url: `https://github.com/useorbitai/orbit-ui-mobile/pull/${number}`,
  headRefOid,
  additions,
  deletions,
  changedFiles,
  title: `${ISSUE} do the thing`,
  body: `Implements ${ISSUE}.`,
})

/**
 * A CheckRun reports `status` plus `conclusion` and a StatusContext reports `state` alone, so both
 * shapes appear here: a rollup fixture carrying only one kind would let a reader that ignores the
 * other pass. Confirmed against a live `gh pr view --json statusCheckRollup` response.
 */
const rollup = (nodes = [{ __typename: "CheckRun", name: "Lint", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-08-06T10:00:00Z" }]) =>
  JSON.stringify({ statusCheckRollup: nodes })

const ticketEnvelope = (description) => JSON.stringify({ id: "envelope-orb-200", ok: true, result: { issue: { identifier: ISSUE, description } } })

const ghPlan = (stdout, exit = 0, checks = rollup(), description = null) =>
  orcaEnv([
    { match: `pr list --head ${BRANCH}`, stdout, exit },
    { match: "pr view", stdout: checks },
    ...(description === null ? [] : [{ match: `linear issue ${ISSUE}`, stdout: ticketEnvelope(description) }]),
  ])

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

  /**
   * The ORB-39 pair, and the reason DIRTY_TREE exists. Both worktrees are dirty; one carries the
   * finished ticket as a commit and one carries nothing. They had the SAME verdict and the same
   * one-key report, so a morning summary could not tell 221 lines of correct work from a worker that
   * did nothing, and the recoveries have nothing in common: discard the residue and push, against
   * re-run the whole ticket.
   */
  const dirtyNoCommit = stageDelivery("dirty-no-commit", { commit: false, dirty: ["src/half-done.ts"] })
  verdictOf(dirtyNoCommit, JSON.stringify([pullRequest(dirtyNoCommit.head)]), "NO_COMMIT", 1, "no commits and a dirty tree is NO_COMMIT, which now means exactly that")

  const residue = stageDelivery("dirty-residue", { dirty: ["apps/web/next-env.d.ts", "apps/web/e2e/visual/orb-39-evidence.visual.ts"] })
  const residueResult = verdictOf(residue, JSON.stringify([pullRequest(residue.head)]), "DIRTY_TREE", 1, "commits plus a dirty tree is DIRTY_TREE, never NO_COMMIT")
  T(
    `${TOOL}: DIRTY_TREE still evaluates hasCommits, so the report says the work exists`,
    /"hasCommits": \{\s*"pass": true,\s*"observed": 1/.test(residueResult.stdout) && /the ticket's real work/.test(residueResult.stdout),
    residueResult.stdout || residueResult.stderr,
  )
  T(
    `${TOOL}: DIRTY_TREE carries the head commit's stat, so nobody has to open the worktree`,
    /"headStat": "[^"]*worked\.txt[^"]*1 \+/.test(residueResult.stdout),
    residueResult.stdout,
  )
  T(
    `${TOOL}: generated and evidence residue is classified as discardable`,
    /"allDiscardable": true/.test(residueResult.stdout) && /next-env\.d\.ts/.test(residueResult.stdout) && /"source": \[\]/.test(residueResult.stdout),
    residueResult.stdout,
  )

  const midEdit = stageDelivery("dirty-source", { dirty: ["apps/web/src/store.ts"] })
  const midEditResult = verdictOf(midEdit, JSON.stringify([pullRequest(midEdit.head)]), "DIRTY_TREE", 1, "a tracked source file left mid-edit is DIRTY_TREE too, but not discardable")
  T(
    `${TOOL}: source residue is never reported as safe to discard`,
    /"allDiscardable": false/.test(midEditResult.stdout) && /"source": \[\s*"apps\/web\/src\/store\.ts"/.test(midEditResult.stdout),
    midEditResult.stdout,
  )

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

  /**
   * The caps override. Every case below is the SAME oversized pull request, so only the ticket's own
   * CAPS-OVERRIDE line can be what moves the verdict, and a run that delivers 700 lines says so in
   * the verdict rather than printing a bare DELIVERED.
   */
  const oversized = JSON.stringify([pullRequest(pushed.head, 400, 300)])
  const withTicket = (description) => ({ env: ghPlan(oversized, 0, rollup(), description) })
  const overArgv = ["--issue", "ORB-200", "--worktree", pushed.path, "--branch", BRANCH]

  const exempt = check(
    TOOL,
    "an oversized diff a CAPS-OVERRIDE line covers is DELIVERED_OVERSIZE_EXEMPT and exits 0",
    overArgv,
    { status: 0, stdout: /"verdict": "DELIVERED_OVERSIZE_EXEMPT"/ },
    withTicket("## Problem\n\nCAPS-OVERRIDE: lines=6000 reason=regenerated package-lock.json\n"),
  )
  T(
    `${TOOL}: the exempt verdict still prints the real numbers and the standing cap it passed`,
    /"observed": 700/.test(exempt.stdout) && /"cap": 400/.test(exempt.stdout) && /"allowed": 6000/.test(exempt.stdout) && /"exempt": true/.test(exempt.stdout),
    exempt.stdout,
  )
  T(
    `${TOOL}: the exempt verdict names the reason the human typed, so the override is auditable`,
    /"reason": "regenerated package-lock\.json"/.test(exempt.stdout),
    exempt.stdout,
  )

  check(
    TOOL,
    "an override that lifts the WRONG cap does not exempt the breach",
    overArgv,
    { status: 1, stdout: /"verdict": "OVERSIZE"/ },
    withTicket("CAPS-OVERRIDE: files=400 reason=one mechanical icon codemod\n"),
  )
  check(
    TOOL,
    "a malformed override lifts nothing and says why",
    overArgv,
    { status: 1, stdout: /does not lift the standing caps\.diffLines of 400/ },
    withTicket("CAPS-OVERRIDE: lines=12 reason=typo\n"),
  )
  check(
    TOOL,
    "a ticket that cannot be read leaves the caps standing rather than assuming an exemption",
    overArgv,
    { status: 1, stdout: /the ticket could not be read, so the caps stand/ },
    { env: ghPlan(oversized) },
  )

  const fileExempt = check(
    TOOL,
    "a 355-file codemod its ticket exempts is delivered, which an 8-file cap made impossible",
    overArgv.slice(),
    { status: 0, stdout: /"verdict": "DELIVERED_OVERSIZE_EXEMPT"/ },
    { env: ghPlan(JSON.stringify([pullRequest(pushed.head, 10, 5, 200, 355)]), 0, rollup(), "CAPS-OVERRIDE: files=400 reason=one mechanical icon codemod, reviewed as a transform\n") },
  )
  T(`${TOOL}: the exempt file count is the real one, never a truncated 100`, /"observed": 355/.test(fileExempt.stdout), fileExempt.stdout)

  /**
   * A pull request that cannot merge was never delivered. Every case below passes every OTHER check,
   * so only the CI verdict can be what moves it, which is what makes these assertions able to fail.
   */
  const withChecks = (nodes) => ({ env: ghPlan(JSON.stringify([pullRequest(pushed.head)]), 0, rollup(nodes)) })
  const ciArgv = ["--issue", "ORB-200", "--worktree", pushed.path, "--branch", BRANCH]

  check(TOOL, "a red required check is CI_FAILING, never DELIVERED", ciArgv, { status: 1, stdout: /"verdict": "CI_FAILING"/ }, withChecks([{ __typename: "CheckRun", name: "React Doctor", status: "COMPLETED", conclusion: "FAILURE", startedAt: "2026-08-06T10:00:00Z" }]))

  check(TOOL, "a still-running check is CI_PENDING, so nothing is called delivered mid-flight", ciArgv, { status: 1, stdout: /"verdict": "CI_PENDING"/ }, withChecks([{ __typename: "CheckRun", name: "Build", status: "IN_PROGRESS", conclusion: "", startedAt: "2026-08-06T10:00:00Z" }]))

  check(TOOL, "a StatusContext failure counts too, despite carrying state instead of conclusion", ciArgv, { status: 1, stdout: /"verdict": "CI_FAILING"/ }, withChecks([{ __typename: "StatusContext", context: "Vercel", state: "FAILURE" }]))

  check(TOOL, "SKIPPED and NEUTRAL are not failures", ciArgv, { status: 0, stdout: /"verdict": "DELIVERED"/ }, withChecks([
    { __typename: "CheckRun", name: "auto-merge", status: "COMPLETED", conclusion: "SKIPPED", startedAt: "2026-08-06T10:00:00Z" },
    { __typename: "CheckRun", name: "Advisory", status: "COMPLETED", conclusion: "NEUTRAL", startedAt: "2026-08-06T10:00:00Z" },
  ]))

  /**
   * The trap this exists for: a re-run does NOT replace the old entry, so the rollup carries the old
   * FAILURE and the new SUCCESS under ONE name. Reading every entry leaves the check permanently red
   * and permanently pending at once, and no re-run could ever clear it. Measured on #685.
   */
  check(TOOL, "a re-run supersedes its own failed entry rather than counting twice", ciArgv, { status: 0, stdout: /"verdict": "DELIVERED"/ }, withChecks([
    { __typename: "CheckRun", name: "Dash Ban", status: "COMPLETED", conclusion: "FAILURE", startedAt: "2026-08-06T10:00:00Z" },
    { __typename: "CheckRun", name: "Dash Ban", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-08-06T11:00:00Z" },
  ]))

  check(TOOL, "CI_FAILING names the checks, so the report never says merely that something is red", ciArgv, { status: 1, stdout: /"failing": \[\s*"CodeQL"/ }, withChecks([{ __typename: "CheckRun", name: "CodeQL", status: "COMPLETED", conclusion: "TIMED_OUT", startedAt: "2026-08-06T10:00:00Z" }]))
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
  check(TOOL, "a failing gh is an environment error, never a verdict", ciArgv, { status: 2, stderr: /gh pr list --head .* failed/ }, { env: ghPlan("", 1) })
  check(TOOL, "unparseable gh output is an environment error", ciArgv, { status: 2, stderr: /returned unparseable JSON/ }, { env: ghPlan("not json at all") })
  check(TOOL, "a non-array gh payload is an environment error", ciArgv, { status: 2, stderr: /did not return an array/ }, { env: ghPlan(JSON.stringify({ number: 200 })) })
  check(
    TOOL,
    "a pull request with no numeric diff size is an environment error, not an in-cap pass",
    argv,
    { status: 2, stderr: /reported no numeric additions and deletions/ },
    // title is present so the run reaches the size check: linksTicket is asserted earlier in the
    // ladder, and a payload missing it would short-circuit to UNLINKED_PR and never test this.
    { env: ghPlan(JSON.stringify([{ number: 200, url: "https://example.test/pull/200", headRefOid: pushed.head, title: `${ISSUE} x` }])) },
  )
  check(
    TOOL,
    "a pull request with no numeric changedFiles is an environment error, not an in-cap pass",
    argv,
    { status: 2, stderr: /reported no numeric changedFiles/ },
    { env: ghPlan(JSON.stringify([{ number: 200, url: "https://example.test/pull/200", headRefOid: pushed.head, title: `${ISSUE} x`, additions: 1, deletions: 1 }])) },
  )

  verdictOf(pushed, JSON.stringify([{ ...pullRequest(pushed.head), title: "no ticket here", body: "none either" }]), "UNLINKED_PR", 1, "a pull request that never names the ticket is UNLINKED_PR")
  verdictOf(pushed, JSON.stringify([pullRequest(pushed.head, 10, 5, 200, 8)]), "DELIVERED", 0, "exactly 8 affected files is at the cap and DELIVERED")
  verdictOf(pushed, JSON.stringify([pullRequest(pushed.head, 10, 5, 200, 9)]), "OVERSIZE", 1, "9 affected files exceeds the file cap even well under 400 lines")

  const real = realOrchestratorConfig()
  const staged = stageWithConfig("verify-delivery-repo", TOOL, { ...real, repos: { ui: pushed.path } })
  const unknownRepo = run(TOOL, [...argv, "--repo", "ghost"], { path: staged.path, env: ghPlan("[]") })
  T(
    `${TOOL}: an unknown --repo key is refused naming the keys that are configured`,
    unknownRepo.status === 2 && /--repo must name a configured repository \(known: ui\)/.test(unknownRepo.stderr),
    `exit ${unknownRepo.status}: ${unknownRepo.stderr || unknownRepo.stdout}`,
  )
}
