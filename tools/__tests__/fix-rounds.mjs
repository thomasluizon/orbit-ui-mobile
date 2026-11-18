import { readdirSync } from "node:fs"
import { join } from "node:path"
import { check, realOrchestratorConfig, stage, stageRepo, stageWithConfig, T } from "./_harness.mjs"

const TOOL = "fix-rounds.mjs"

const parse = (result) => {
  try { return JSON.parse(result.stdout) } catch { return null }
}

export const cases = () => {
  const real = realOrchestratorConfig()
  const staged = stageWithConfig("fix-rounds", TOOL, { ...real, caps: { ...real.caps, reviewFixAttempts: 2 } })
  const repo = stageRepo("fix-rounds")
  if (!repo) {
    T(`${TOOL}: stages a git repository`, false, "git init failed")
    return
  }
  const options = { path: staged.path }
  const worktree = ["--worktree", repo.path]

  const empty = parse(check(TOOL, "prints an empty ledger for a new branch", worktree, { status: 0 }, options))
  T(`${TOOL}: a new branch has used 0 of the configured cap`, empty?.used === 0 && empty.remaining === 2 && empty.cap === 2 && empty.branch === "main", JSON.stringify(empty))

  const local = parse(check(TOOL, "records a local round", [...worktree, "--record", "local"], { status: 0 }, options))
  const pullfrog = parse(check(TOOL, "records a Pullfrog round", [...worktree, "--record", "pullfrog"], { status: 0 }, options))
  T(
    `${TOOL}: local and Pullfrog rounds share one count`,
    local?.recorded === 1 && pullfrog?.recorded === 2 && pullfrog.used === 2 && pullfrog.remaining === 0 &&
      pullfrog.rounds.map((round) => round.kind).join(",") === "local,pullfrog",
    JSON.stringify(pullfrog),
  )

  const refused = check(TOOL, "refuses a round above the cap with exit 5", [...worktree, "--record", "local"], { status: 5, stderr: /fix round cap 2 reached for branch main: 1\. local at [0-9a-f]{9}, 2\. pullfrog/ }, options)
  T(`${TOOL}: a refused round writes nothing`, parse(refused)?.used === 2 && parse(check(TOOL, "reads the ledger after a refusal", worktree, { status: 0 }, options))?.used === 2, refused.stdout)

  check(TOOL, "refuses an empty design change", [...worktree, "--record", "local", "--design-change", stage("fix-rounds/empty.md", "\n")], { status: 2, stderr: /design change file is empty/ }, options)
  check(TOOL, "refuses a design change without --record", [...worktree, "--design-change", stage("fix-rounds/orphan.md", "x\n")], { status: 2 }, options)
  check(TOOL, "refuses an unknown kind", [...worktree, "--record", "worker"], { status: 2, stderr: /--record must be local or pullfrog/ }, options)
  const designFile = stage("fix-rounds/design.md", "Replace the per-cell guard with one default-deny table.\n\nDetail.\n")
  const passed = parse(check(TOOL, "a written design change allows one round above the cap", [...worktree, "--record", "pullfrog", "--design-change", designFile], { status: 0 }, options))
  T(
    `${TOOL}: the round above the cap records the design change digest and summary`,
    passed?.recorded === 3 && passed.rounds[2].designChange?.summary === "Replace the per-cell guard with one default-deny table." &&
      /^[0-9a-f]{64}$/.test(passed.rounds[2].designChange.sha256),
    JSON.stringify(passed),
  )
  check(TOOL, "the next round above the cap needs its own design change", [...worktree, "--record", "local"], { status: 5 }, options)

  repo.git(["checkout", "-q", "-b", "fix/other"])
  const other = parse(check(TOOL, "a second branch in the same checkout starts at zero", worktree, { status: 0 }, options))
  T(`${TOOL}: the count is kept per branch`, other?.used === 0 && other.branch === "fix/other", JSON.stringify(other))
  const ledger = readdirSync(join(repo.path, ".git", "orbit-fix-rounds"))
  T(`${TOOL}: the ledger lives in the git directory, one file per round`, ledger.filter((name) => name.endsWith(".json")).length === 3, ledger.join(","))
}
