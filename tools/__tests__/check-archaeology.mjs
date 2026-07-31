import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { cpSync } from "node:fs"
import { dirname, join } from "node:path"

import { TOOLS_DIR, T, root, check } from "./_harness.mjs"

/**
 * The banned shape: a measurement whose provenance is one past run. Pinned as literal fixture
 * text rather than copied from a repository file, so editing a real instruction file can never
 * change what these cases assert.
 */
const ARCHAEOLOGY = [
  "# Fixture skill",
  "",
  "Print the resolved scope first. Measured on the ORB-4242 run: three reconciliation agents",
  "nobody asked for, about 230k tokens.",
  "",
].join("\n")

/** Two occurrences, so a case can shrink a file to ONE rather than to zero. */
const ARCHAEOLOGY_TWICE = `${ARCHAEOLOGY}\nMeasured 2026-07-24: the sweep took 51 minutes.\n`

/** The legitimate shape: a threshold with the observation that set it, naming no run. */
const JUSTIFIED_MEASUREMENT = [
  "# Fixture skill",
  "",
  "Every figure comes from one status call per worktree, so budget roughly five seconds per",
  "worktree: measured at 4.9 s for one and 9.2 s for two. A backstop at 16 hours clears the",
  "longest measured session.",
  "",
].join("\n")

/** A run stamp with no measurement: a dated decision attribution, which must stay legal. */
const DATED_DECISION = [
  "# Fixture skill",
  "",
  "Under `--sleep` the run performs that rewrite itself rather than stalling until morning",
  "(Thomas, 2026-07-27), and ORB-4242 records why.",
  "",
].join("\n")

const archaeologyGit = (repo, argumentsList) => {
  const result = spawnSync("git", argumentsList, { cwd: repo, encoding: "utf8" })
  if (result.status !== 0) {
    throw new Error(`archaeology git fixture failed: git ${argumentsList.join(" ")}\n${result.stderr}`)
  }
}

/**
 * Stages a real git checkout, because the tool reads TRACKED content and compares against the
 * TARGET BRANCH's committed baseline. `seed` is committed on main; `branch` is then applied on a
 * feature branch, which is the only way a case can tell growth from a working-tree reseed.
 */
const stageArchaeology = (label, options = {}) => {
  const repo = join(root, "archaeology", label)
  const tools = join(repo, "tools")
  mkdirSync(tools, { recursive: true })
  cpSync(join(TOOLS_DIR, "check-archaeology.mjs"), join(tools, "check-archaeology.mjs"))
  writeFileSync(join(repo, "CLAUDE.md"), "# Fixture root\n")

  const writeAll = (fileMap) => {
    for (const [file, body] of Object.entries(fileMap)) {
      const absolute = join(repo, file)
      mkdirSync(dirname(absolute), { recursive: true })
      writeFileSync(absolute, body)
    }
  }
  const seed = options.seed ?? {}
  writeAll(seed)
  const baselinePath = join(tools, "archaeology-baseline.json")
  if (options.baseline !== undefined) {
    writeFileSync(baselinePath, typeof options.baseline === "string" ? options.baseline : `${JSON.stringify(options.baseline, null, 2)}\n`)
  }

  archaeologyGit(repo, ["init", "-b", "main"])
  archaeologyGit(repo, ["config", "user.email", "archaeology@example.test"])
  archaeologyGit(repo, ["config", "user.name", "Archaeology Fixture"])
  archaeologyGit(repo, ["add", "--all"])
  archaeologyGit(repo, ["commit", "-m", "Seed archaeology fixture"])
  archaeologyGit(repo, ["switch", "-c", "feature"])

  writeAll(options.branch ?? {})
  for (const file of Object.keys(options.untracked ?? {})) {
    const absolute = join(repo, file)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, options.untracked[file])
  }
  if (Object.keys(options.branch ?? {}).length > 0) {
    archaeologyGit(repo, ["add", "--all"])
    archaeologyGit(repo, ["commit", "-m", "Branch change"])
  }
  return { path: join(tools, "check-archaeology.mjs"), repo, baselinePath }
}

const archaeologyCases = () => {
  const banned = stageArchaeology("banned", { branch: { ".claude/skills/demo/SKILL.md": ARCHAEOLOGY } })
  check(
    "check-archaeology.mjs",
    "a banned run narrative fails naming the file, the line and the shape",
    ["--check"],
    {
      status: 1,
      stdout: /\.claude\/skills\/demo\/SKILL\.md:3: run archaeology[\s\S]*a ticket identifier, "ORB-4242"[\s\S]*a measurement word, "Measured"/,
      stderr: /\.claude\/skills\/demo\/SKILL\.md carries 1 occurrence\(s\); the baseline allows 0[\s\S]*decays into a false claim/,
    },
    { path: banned.path, cwd: banned.repo },
  )

  const justified = stageArchaeology("justified", { branch: { ".claude/skills/demo/SKILL.md": JUSTIFIED_MEASUREMENT } })
  check(
    "check-archaeology.mjs",
    "a measurement cited as a threshold's justification passes",
    ["--check"],
    { status: 0 },
    { path: justified.path, cwd: justified.repo },
  )

  const dated = stageArchaeology("dated-decision", { branch: { ".claude/skills/demo/SKILL.md": DATED_DECISION } })
  check(
    "check-archaeology.mjs",
    "a run stamp with no measurement is provenance, not archaeology",
    ["--check"],
    { status: 0 },
    { path: dated.path, cwd: dated.repo },
  )

  const outOfScope = stageArchaeology("out-of-scope", { branch: { "docs/history/retro.md": ARCHAEOLOGY } })
  check(
    "check-archaeology.mjs",
    "a record outside the instruction-file set is not scanned",
    ["--check"],
    { status: 0 },
    { path: outOfScope.path, cwd: outOfScope.repo },
  )

  const playbook = stageArchaeology("playbook-in-scope", {
    branch: { ".claude/playbooks/example.md": ARCHAEOLOGY },
  })
  check(
    "check-archaeology.mjs",
    "a playbook is instruction text, so a worked-example shape does not exempt run archaeology",
    ["--check"],
    { status: 1, stderr: /\.claude\/playbooks\/example\.md carries 1 occurrence/ },
    { path: playbook.path, cwd: playbook.repo },
  )

  const untracked = stageArchaeology("untracked", { untracked: { ".claude/skills/demo/SKILL.md": ARCHAEOLOGY } })
  check(
    "check-archaeology.mjs",
    "an untracked local artifact is not scanned",
    ["--check"],
    { status: 0 },
    { path: untracked.path, cwd: untracked.repo },
  )

  const atBaseline = stageArchaeology("at-baseline", {
    seed: { ".claude/skills/demo/SKILL.md": ARCHAEOLOGY },
    baseline: { occurrences: 1, files: { ".claude/skills/demo/SKILL.md": 1 } },
  })
  check(
    "check-archaeology.mjs",
    "an occurrence carried by the baseline passes and is still reported as owed",
    ["--check"],
    { status: 0, stdout: /still owed a deletion:[\s\S]*\.claude\/skills\/demo\/SKILL\.md: 1/ },
    { path: atBaseline.path, cwd: atBaseline.repo },
  )

  const aboveBaseline = stageArchaeology("above-baseline", {
    seed: { ".claude/skills/demo/SKILL.md": ARCHAEOLOGY },
    baseline: { occurrences: 1, files: { ".claude/skills/demo/SKILL.md": 1 } },
    branch: { ".claude/skills/demo/SKILL.md": ARCHAEOLOGY_TWICE },
  })
  check(
    "check-archaeology.mjs",
    "one occurrence above the baseline fails",
    ["--check"],
    { status: 1, stderr: /carries 2 occurrence\(s\); the baseline allows 1/ },
    { path: aboveBaseline.path, cwd: aboveBaseline.repo },
  )

  // Shrinks to ONE, not to zero: a file that drops out of the report entirely never reaches the
  // count comparison, so it cannot prove the comparison tolerates a shrink.
  const shrunk = stageArchaeology("shrunk", {
    seed: { ".claude/skills/demo/SKILL.md": ARCHAEOLOGY_TWICE },
    baseline: { occurrences: 2, files: { ".claude/skills/demo/SKILL.md": 2 } },
    branch: { ".claude/skills/demo/SKILL.md": ARCHAEOLOGY },
  })
  check(
    "check-archaeology.mjs",
    "deleting one of two baselined occurrences passes, so the ratchet can only shrink",
    ["--check"],
    { status: 0 },
    { path: shrunk.path, cwd: shrunk.repo },
  )

  const emptied = stageArchaeology("emptied", {
    seed: { ".claude/skills/demo/SKILL.md": ARCHAEOLOGY },
    baseline: { occurrences: 1, files: { ".claude/skills/demo/SKILL.md": 1 } },
    branch: { ".claude/skills/demo/SKILL.md": JUSTIFIED_MEASUREMENT },
  })
  check(
    "check-archaeology.mjs",
    "deleting the last occurrence in a file passes",
    ["--check"],
    { status: 0 },
    { path: emptied.path, cwd: emptied.repo },
  )

  const bootstrap = stageArchaeology("bootstrap", { branch: { ".claude/skills/demo/SKILL.md": ARCHAEOLOGY } })
  check(
    "check-archaeology.mjs",
    "a first-run baseline bootstraps only when absent from the target branch, and says so",
    ["--check"],
    { status: 1, stdout: /working tree bootstrap/ },
    { path: bootstrap.path, cwd: bootstrap.repo },
  )

  const regenerated = stageArchaeology("regenerated", {
    baseline: { occurrences: 0, files: {} },
    branch: { ".claude/skills/demo/SKILL.md": ARCHAEOLOGY },
  })
  check(
    "check-archaeology.mjs",
    "a grown branch can regenerate its working baseline",
    ["--write-baseline"],
    { status: 0, stdout: /1 occurrences/ },
    { path: regenerated.path, cwd: regenerated.repo },
  )
  T(
    "check-archaeology.mjs: --write-baseline records the real per-file count",
    JSON.parse(readFileSync(regenerated.baselinePath, "utf8")).files[".claude/skills/demo/SKILL.md"] === 1,
    readFileSync(regenerated.baselinePath, "utf8"),
  )
  check(
    "check-archaeology.mjs",
    "a regenerated working baseline cannot hide growth from the target branch",
    ["--check"],
    { status: 1, stderr: /carries 1 occurrence\(s\); the baseline allows 0/ },
    { path: regenerated.path, cwd: regenerated.repo },
  )

  const malformed = stageArchaeology("malformed", { baseline: "{not-json\n" })
  check(
    "check-archaeology.mjs",
    "a malformed baseline is a tool error",
    ["--check"],
    { status: 2, stderr: /not valid JSON/ },
    { path: malformed.path, cwd: malformed.repo },
  )

  const mismatched = stageArchaeology("mismatched", {
    baseline: { occurrences: 9, files: { "AGENTS.md": 1 } },
  })
  check(
    "check-archaeology.mjs",
    "a baseline whose total disagrees with its files is a tool error",
    ["--check"],
    { status: 2, stderr: /matching positive integer occurrences and files values/ },
    { path: mismatched.path, cwd: mismatched.repo },
  )

  const unfetched = stageArchaeology("unfetched", { branch: { ".claude/skills/demo/SKILL.md": ARCHAEOLOGY } })
  check(
    "check-archaeology.mjs",
    "an unfetched target branch fails closed",
    ["--check"],
    { status: 2, stderr: /target branch missing-base is unavailable.*fetch its history/i },
    { path: unfetched.path, cwd: unfetched.repo, env: { ARCHAEOLOGY_BASE_REF: "missing-base" } },
  )

  const help = stageArchaeology("help")
  check(
    "check-archaeology.mjs",
    "help names every flag, the distinction it draws, and every exit code",
    ["--help"],
    {
      status: 0,
      stdout: /(?=[\s\S]*--check)(?=[\s\S]*--write-baseline)(?=[\s\S]*--json)(?=[\s\S]*--help)(?=[\s\S]*-h)(?=[\s\S]*THE DISTINCTION, IN ONE SENTENCE)(?=[\s\S]*SCOPE:)(?=[\s\S]*NO ESCAPE HATCH)(?=[\s\S]*exit codes)/,
    },
    { path: help.path, cwd: help.repo },
  )
}

export { archaeologyCases as cases }
