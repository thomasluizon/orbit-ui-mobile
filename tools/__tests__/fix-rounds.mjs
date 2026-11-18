import { readdirSync } from "node:fs"
import { join } from "node:path"
import { fixRoundRefusal, fixRoundRefusalReason } from "../lib/run-state.mjs"
import { check, realOrchestratorConfig, same, stage, stageRepo, stageWithConfig, T } from "./_harness.mjs"

const TOOL = "fix-rounds.mjs"

const parse = (result) => {
  try { return JSON.parse(result.stdout) } catch { return null }
}

/** One admission rule serves the launcher pre-check and the ledger write, so each row is a case of both. */
const refusalTable = () => {
  const design = { path: "/x/design.md", sha256: "a".repeat(64) }
  const other = { path: "/x/other.md", sha256: "b".repeat(64) }
  const below = [{ number: 1, designChange: null }]
  const atCap = [...below, { number: 2, designChange: null }]
  const usedDesign = [...atCap, { number: 3, designChange: design }]
  const rows = [
    ["below the cap without a design change", below, null, null],
    ["below the cap with a design change", below, design, null],
    ["at the cap without a design change", atCap, null, { spentBy: null }],
    ["at the cap with a new design change", atCap, design, null],
    ["above the cap with the same design change", usedDesign, design, { spentBy: usedDesign[2] }],
    ["above the cap with a new design change", usedDesign, other, null],
    ["above the cap without a design change", usedDesign, null, { spentBy: null }],
  ]
  for (const [name, rounds, designChange, expected] of rows) {
    same(`${TOOL}: fixRoundRefusal ${name}`, fixRoundRefusal(rounds, 2, designChange), expected)
  }
  same(`${TOOL}: the cap refusal names the cap and the branch`, fixRoundRefusalReason({ spentBy: null }, { cap: 2, branch: "main", designChange: null }), "fix round cap 2 reached for branch main")
  same(`${TOOL}: the reuse refusal names the file and the round it allowed`, fixRoundRefusalReason({ spentBy: usedDesign[2] }, { cap: 2, branch: "main", designChange: design }), "design change /x/design.md already allowed fix round 3 on branch main: one file allows one round")
}

export const cases = () => {
  refusalTable()
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
  const reused = check(TOOL, "a design change file that already passed the cap is refused with exit 5", [...worktree, "--record", "local", "--design-change", designFile], { status: 5, stderr: /design change .*design\.md already allowed fix round 3 on branch main/ }, options)
  T(`${TOOL}: a refused reuse writes nothing`, parse(reused)?.used === 3 && parse(check(TOOL, "reads the ledger after a refused reuse", worktree, { status: 0 }, options))?.used === 3, reused.stdout)
  const secondDesign = stage("fix-rounds/second-design.md", "Split the guard into one rule per input class.\n")
  T(`${TOOL}: a new design change file allows the next round`, parse(check(TOOL, "a second design change file allows round 4", [...worktree, "--record", "local", "--design-change", secondDesign], { status: 0 }, options))?.recorded === 4)

  repo.git(["checkout", "-q", "-b", "fix/other"])
  const other = parse(check(TOOL, "a second branch in the same checkout starts at zero", worktree, { status: 0 }, options))
  T(`${TOOL}: the count is kept per branch`, other?.used === 0 && other.branch === "fix/other", JSON.stringify(other))
  const ledger = readdirSync(join(repo.path, ".git", "orbit-fix-rounds"))
  T(`${TOOL}: the ledger lives in the git directory, one file per round`, ledger.filter((name) => name.endsWith(".json")).length === 4, ledger.join(","))
}
