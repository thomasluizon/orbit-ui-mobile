import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { TOOLS_DIR, T, root, check } from "./_harness.mjs"

const CONTEXT_CLAUDE = [
  "# Orbit fixture",
  "",
].join("\n")

const CONTEXT_CORE = "# Core fixture\n\nAlways applies.\n"

const contextBytes = (body) => Buffer.byteLength(body, "utf8")

const contextGit = (repo, argumentsList) => {
  const result = spawnSync("git", argumentsList, { cwd: repo, encoding: "utf8" })
  if (result.status !== 0) throw new Error(`context budget git fixture failed: git ${argumentsList.join(" ")}\n${result.stderr}`)
}

const stageContextBudget = (label, options = {}) => {
  const parent = join(root, "context-budget", label)
  const repo = join(parent, "orbit-ui-mobile")
  const tools = join(repo, "tools")
  const rules = join(repo, ".claude", "rules")
  const claude = options.claude ?? CONTEXT_CLAUDE
  const core = options.core ?? CONTEXT_CORE
  mkdirSync(tools, { recursive: true })
  mkdirSync(rules, { recursive: true })
  cpSync(join(TOOLS_DIR, "check-context-budget.mjs"), join(tools, "check-context-budget.mjs"))
  writeFileSync(join(repo, "CLAUDE.md"), claude)
  writeFileSync(join(rules, "core.md"), core)
  for (const [file, body] of Object.entries(options.rules ?? {})) writeFileSync(join(rules, file), body)
  for (const [repoName, body] of Object.entries(options.siblings ?? {})) {
    const sibling = join(parent, repoName, "CLAUDE.md")
    mkdirSync(dirname(sibling), { recursive: true })
    writeFileSync(sibling, body)
  }
  const measuredFiles = {
    "CLAUDE.md": contextBytes(claude),
    ".claude/rules/core.md": contextBytes(core),
  }
  const baselineAdjustment = options.baselineAdjustment ?? 0
  const baseline = options.baseline ?? {
    bytes: Object.values(measuredFiles).reduce((sum, bytes) => sum + bytes, 0) + baselineAdjustment,
    files: {
      ...measuredFiles,
      "CLAUDE.md": measuredFiles["CLAUDE.md"] + baselineAdjustment,
    },
  }
  const baselinePath = join(tools, "context-budget.json")
  const baselineBody = typeof baseline === "string" ? baseline : `${JSON.stringify(baseline, null, 2)}\n`
  if (options.baselineOnBase !== false) writeFileSync(baselinePath, baselineBody)
  contextGit(repo, ["init", "-b", "main"])
  contextGit(repo, ["config", "user.email", "context-budget@example.test"])
  contextGit(repo, ["config", "user.name", "Context Budget Fixture"])
  const trackedPaths = [
    "CLAUDE.md",
    ".claude/rules/core.md",
    ...Object.keys(options.rules ?? {}).map((file) => `.claude/rules/${file}`),
    "tools/check-context-budget.mjs",
  ]
  if (options.baselineOnBase !== false) trackedPaths.push("tools/context-budget.json")
  contextGit(repo, ["add", "--", ...trackedPaths])
  contextGit(repo, ["commit", "-m", "Seed context budget fixture"])
  contextGit(repo, ["switch", "-c", "feature"])
  if (options.baselineOnBase === false) writeFileSync(baselinePath, baselineBody)
  return { path: join(tools, "check-context-budget.mjs"), repo, baselinePath, measuredFiles }
}

const contextBudgetCases = () => {
  const over = stageContextBudget("over", { baselineAdjustment: -1 })
  check("check-context-budget.mjs", "total over baseline exits 1 and names the offending file", ["--check"], { status: 1, stderr: /grew by 1 byte[\s\S]*CLAUDE\.md: \+1 byte/i }, { path: over.path, cwd: over.repo })

  const under = stageContextBudget("under", { baselineAdjustment: 1 })
  const underBaselineBefore = readFileSync(under.baselinePath, "utf8")
  const underResult = check("check-context-budget.mjs", "total under baseline exits 0", ["--check"], { status: 0 }, { path: under.path, cwd: under.repo })
  T(
    "check-context-budget.mjs: an under-budget check does not rewrite context-budget.json",
    underResult.status === 0 && readFileSync(under.baselinePath, "utf8") === underBaselineBefore,
    readFileSync(under.baselinePath, "utf8"),
  )

  const regenerated = stageContextBudget("regenerated")
  writeFileSync(join(regenerated.repo, "CLAUDE.md"), `${CONTEXT_CLAUDE}x`)
  check("check-context-budget.mjs", "a grown branch can regenerate its working baseline", ["--write-baseline"], { status: 0 }, { path: regenerated.path, cwd: regenerated.repo })
  check("check-context-budget.mjs", "a regenerated working baseline cannot hide growth from the target branch", ["--check"], { status: 1, stderr: /grew by 1 byte[\s\S]*CLAUDE\.md: \+1 byte/i }, { path: regenerated.path, cwd: regenerated.repo })

  const bootstrap = stageContextBudget("bootstrap", { baselineOnBase: false })
  check("check-context-budget.mjs", "a first-run baseline bootstraps only when absent from the target branch", ["--check"], { status: 0, stdout: /working tree bootstrap/ }, { path: bootstrap.path, cwd: bootstrap.repo })

  const unfetched = stageContextBudget("unfetched")
  check("check-context-budget.mjs", "an unfetched target branch fails closed", ["--check"], { status: 2, stderr: /target branch missing-base is unavailable.*fetch its history/i }, { path: unfetched.path, cwd: unfetched.repo, env: { CONTEXT_BUDGET_BASE_REF: "missing-base" } })

  const importAddition = stageContextBudget("import-addition", { claude: `${CONTEXT_CLAUDE}@../orbit-api/CLAUDE.md\n` })
  check("check-context-budget.mjs", "a removed sibling import fails even when its target is absent", ["--check"], { status: 1, stderr: /@..\/orbit-api\/CLAUDE\.md|import/i }, { path: importAddition.path, cwd: importAddition.repo })

  const unconditional = stageContextBudget("unconditional-rule", { rules: { "foo.md": "# Always loaded\n" } })
  check("check-context-budget.mjs", "a new unconditional rules file exits 1", ["--check"], { status: 1, stderr: /foo\.md/ }, { path: unconditional.path, cwd: unconditional.repo })

  const scoped = stageContextBudget("scoped-rule", { rules: { "foo.md": "---\npaths:\n  - apps/web/**\n---\n# Scoped\n" } })
  check("check-context-budget.mjs", "a rules file with paths frontmatter stays outside the budget", ["--check"], { status: 0 }, { path: scoped.path, cwd: scoped.repo })

  const siblingsAbsent = stageContextBudget("siblings-absent")
  const absentResult = check("check-context-budget.mjs", "missing sibling repos do not fail the check", ["--check"], { status: 0, stdout: /full.session/i }, { path: siblingsAbsent.path, cwd: siblingsAbsent.repo })
  T(
    "check-context-budget.mjs: missing sibling files are omitted from the printed full-session table",
    absentResult.status === 0 && !/(?:orbit-api|orbit-landing-page)\/CLAUDE\.md\s+\d/.test(absentResult.stdout.replaceAll("\\", "/")),
    absentResult.stdout,
  )

  const siblingsPresent = stageContextBudget("siblings-present", {
    siblings: {
      "orbit-api": "# API fixture\n",
      "orbit-landing-page": "# Landing fixture\n",
    },
  })
  const presentResult = check("check-context-budget.mjs", "present sibling files without imports do not change the enforced verdict", ["--check"], { status: 0 }, { path: siblingsPresent.path, cwd: siblingsPresent.repo })
  T(
    "check-context-budget.mjs: present sibling files without imports stay outside the printed full-session table",
    presentResult.status === 0 && !/(?:orbit-api|orbit-landing-page)\/CLAUDE\.md:\s+\d+ bytes/.test(presentResult.stdout.replaceAll("\\", "/")),
    presentResult.stdout,
  )

  const malformed = stageContextBudget("malformed", { baseline: "{not-json\n" })
  check("check-context-budget.mjs", "a malformed baseline is a tool error", ["--check"], { status: 2 }, { path: malformed.path, cwd: malformed.repo })

  const help = stageContextBudget("help")
  check(
    "check-context-budget.mjs",
    "help names every flag and every exit code",
    ["--help"],
    { status: 0, stdout: /(?=[\s\S]*--check)(?=[\s\S]*--write-baseline)(?=[\s\S]*--json)(?=[\s\S]*--help)(?=[\s\S]*-h)(?=[\s\S]*0)(?=[\s\S]*1)(?=[\s\S]*2)/ },
    { path: help.path, cwd: help.repo },
  )
}

export { contextBudgetCases as cases }
