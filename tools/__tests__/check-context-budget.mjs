import { spawnSyncHidden as spawnSync } from "../lib/subprocess-options.mjs"
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { TOOLS_DIR, T, root, check, run } from "./_harness.mjs"

const CONTEXT_CLAUDE = [
  "# Orbit fixture",
  "",
].join("\n")

const CONTEXT_CORE = "# Core fixture\n\nAlways applies.\n"

/** The one path in the tool's declared on-demand set, so every fixture repo has to carry it. */
const ON_DEMAND_REPO_PATH = ".claude/skills/orchestrate/SKILL.md"
const CONTEXT_SKILL = "# Orchestrate fixture\n\nLoaded only when the skill runs.\n"

/** Mirrors the real repository's pins. Without these every measured file reads as unpinned. */
const CONTEXT_GITATTRIBUTES = [
  "CLAUDE.md text eol=lf",
  ".claude/rules/*.md text eol=lf",
  ".claude/skills/**/*.md text eol=lf",
  "",
].join("\n")

/**
 * The user-level context the tool REPORTS. Every case stages its own copy inside the fixture root
 * and points HOME and USERPROFILE at it, because reading the real ~/.claude would make the suite's
 * verdict depend on files that differ per machine and do not exist in CI at all.
 */
const EXTERNAL_USER_CLAUDE = "# User fixture\n"
const EXTERNAL_USER_RULE = "# Answer once fixture\n"
const EXTERNAL_HOT = "# hot fixture\n\nWhat is live right now.\n"
const EXTERNAL_MEMORY = "# Memory index fixture\n\nOne remembered lesson.\n"

/**
 * The runtime's project-directory naming, reproduced here only to place the fixture where the tool
 * will look. The derivation itself was verified against seven real directories under
 * ~/.claude/projects rather than inferred, so this is not a fixture written to agree with a guess.
 */
const projectSlug = (absolutePath) => absolutePath.replace(/[^A-Za-z0-9]/g, "-")

const contextBytes = (body) => Buffer.byteLength(body, "utf8")

const contextGit = (repo, argumentsList) => {
  const result = spawnSync("git", argumentsList, { cwd: repo, encoding: "utf8" })
  if (result.status !== 0) throw new Error(`context budget git fixture failed: git ${argumentsList.join(" ")}\n${result.stderr}`)
}

/**
 * Stages ~/.claude, the derived project memory index, and the vault file the user CLAUDE.md imports.
 * Passing null for a member leaves it absent, which is how each unreadable path is exercised.
 * Returns exact byte counts so a case asserts an absolute figure the fixture controls, never one
 * recomputed from the tool's own output.
 */
const stageExternalContext = (parent, repo, options = {}) => {
  const home = join(parent, "home")
  const userRules = join(home, ".claude", "rules")
  const hotPath = join(parent, "brain", "hot.md")
  const nestedPath = join(parent, "brain", "nested.md")
  const memoryPath = join(home, ".claude", "projects", projectSlug(repo), "memory", "MEMORY.md")
  mkdirSync(options.rules === null ? join(home, ".claude") : userRules, { recursive: true })

  const bytes = {}
  if (options.memory !== null) {
    const body = options.memory ?? EXTERNAL_MEMORY
    mkdirSync(dirname(memoryPath), { recursive: true })
    writeFileSync(memoryPath, body)
    bytes.memory = contextBytes(body)
  }
  if (options.nested !== undefined) {
    mkdirSync(dirname(nestedPath), { recursive: true })
    writeFileSync(nestedPath, options.nested)
    bytes.nested = contextBytes(options.nested)
  }
  if (options.hot !== null) {
    // The trailing import points back at the importer, so a cycle has to terminate on its own.
    const body =
      options.nested === undefined
        ? (options.hot ?? EXTERNAL_HOT)
        : `${options.hot ?? EXTERNAL_HOT}@${nestedPath.replaceAll("\\", "/")}\n@${join(home, ".claude", "CLAUDE.md").replaceAll("\\", "/")}\n`
    mkdirSync(dirname(hotPath), { recursive: true })
    writeFileSync(hotPath, body)
    bytes.hot = contextBytes(body)
  }
  if (options.claude !== null) {
    const body = `${options.claude ?? EXTERNAL_USER_CLAUDE}@${hotPath.replaceAll("\\", "/")}\n`
    writeFileSync(join(home, ".claude", "CLAUDE.md"), body)
    bytes["~/.claude/CLAUDE.md"] = contextBytes(body)
  }
  if (options.rules !== null) {
    for (const [name, body] of Object.entries(options.rules ?? { "answer-once.md": EXTERNAL_USER_RULE })) {
      writeFileSync(join(userRules, name), body)
      bytes[`~/.claude/rules/${name}`] = contextBytes(body)
    }
  }
  return { home, hotPath, memoryPath, bytes, env: { HOME: home, USERPROFILE: home } }
}

const stageContextBudget = (label, options = {}) => {
  const parent = join(root, "context-budget", label)
  const repo = join(parent, "orbit-ui-mobile")
  const tools = join(repo, "tools")
  const rules = join(repo, ".claude", "rules")
  const claude = options.claude ?? CONTEXT_CLAUDE
  const core = options.core ?? CONTEXT_CORE
  const skill = options.skill === null ? null : (options.skill ?? CONTEXT_SKILL)
  mkdirSync(tools, { recursive: true })
  mkdirSync(join(tools, "lib"), { recursive: true })
  mkdirSync(rules, { recursive: true })
  cpSync(join(TOOLS_DIR, "check-context-budget.mjs"), join(tools, "check-context-budget.mjs"))
  mkdirSync(join(tools, "lib"), { recursive: true })
  cpSync(join(TOOLS_DIR, "lib", "subprocess-options.mjs"), join(tools, "lib", "subprocess-options.mjs"))
  writeFileSync(join(repo, "CLAUDE.md"), claude)
  writeFileSync(join(rules, "core.md"), core)
  writeFileSync(join(repo, ".gitattributes"), options.gitattributes ?? CONTEXT_GITATTRIBUTES)
  for (const [file, body] of Object.entries(options.rules ?? {})) writeFileSync(join(rules, file), body)
  if (skill !== null) {
    mkdirSync(join(repo, ".claude", "skills", "orchestrate"), { recursive: true })
    writeFileSync(join(repo, ON_DEMAND_REPO_PATH), skill)
  }
  const external = stageExternalContext(parent, repo, options.external ?? {})

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

  const onDemandBaselinePath = join(tools, "on-demand-budget.json")
  const declaresOnDemandCeiling = options.onDemandBaseline !== undefined || options.onDemandAdjustment !== undefined
  const onDemandCeiling = (skill === null ? 0 : contextBytes(skill)) + (options.onDemandAdjustment ?? 0)
  if (declaresOnDemandCeiling) {
    const value = options.onDemandBaseline ?? { bytes: onDemandCeiling, files: { [ON_DEMAND_REPO_PATH]: onDemandCeiling } }
    writeFileSync(onDemandBaselinePath, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`)
  }

  contextGit(repo, ["init", "-b", "main"])
  contextGit(repo, ["config", "user.email", "context-budget@example.test"])
  contextGit(repo, ["config", "user.name", "Context Budget Fixture"])
  const trackedPaths = [
    ".gitattributes",
    "CLAUDE.md",
    ".claude/rules/core.md",
    ...Object.keys(options.rules ?? {}).map((file) => `.claude/rules/${file}`),
    "tools/check-context-budget.mjs",
  ]
  if (skill !== null) trackedPaths.push(ON_DEMAND_REPO_PATH)
  if (options.baselineOnBase !== false) trackedPaths.push("tools/context-budget.json")
  if (declaresOnDemandCeiling) trackedPaths.push("tools/on-demand-budget.json")
  contextGit(repo, ["add", "--", ...trackedPaths])
  contextGit(repo, ["commit", "-m", "Seed context budget fixture"])
  contextGit(repo, ["switch", "-c", "feature"])
  if (options.baselineOnBase === false) writeFileSync(baselinePath, baselineBody)
  return {
    path: join(tools, "check-context-budget.mjs"),
    repo,
    baselinePath,
    onDemandBaselinePath,
    measuredFiles,
    external,
    env: external.env,
  }
}

const budgetJson = (fixture, argv = ["--check", "--json"]) => {
  const result = run("check-context-budget.mjs", argv, { path: fixture.path, cwd: fixture.repo, env: fixture.env })
  let parsed = null
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    parsed = null
  }
  return { ...result, parsed }
}

const externalSum = (fixture) => Object.values(fixture.external.bytes).reduce((sum, bytes) => sum + bytes, 0)

const alwaysLoadedCases = () => {
  const over = stageContextBudget("over", { baselineAdjustment: -1 })
  check("check-context-budget.mjs", "total over baseline exits 1 and names the offending file", ["--check"], { status: 1, stderr: /grew by 1 byte[\s\S]*CLAUDE\.md: \+1 byte/i }, { path: over.path, cwd: over.repo, env: over.env })

  const under = stageContextBudget("under", { baselineAdjustment: 1 })
  const underBaselineBefore = readFileSync(under.baselinePath, "utf8")
  const underResult = check("check-context-budget.mjs", "total under baseline exits 0", ["--check"], { status: 0 }, { path: under.path, cwd: under.repo, env: under.env })
  T(
    "check-context-budget.mjs: an under-budget check does not rewrite context-budget.json",
    underResult.status === 0 && readFileSync(under.baselinePath, "utf8") === underBaselineBefore,
    readFileSync(under.baselinePath, "utf8"),
  )

  const regenerated = stageContextBudget("regenerated")
  writeFileSync(join(regenerated.repo, "CLAUDE.md"), `${CONTEXT_CLAUDE}x`)
  const rewritten = check("check-context-budget.mjs", "a grown branch can regenerate its working baseline", ["--write-baseline"], { status: 0 }, { path: regenerated.path, cwd: regenerated.repo, env: regenerated.env })
  T(
    "check-context-budget.mjs: writing a baseline reports no comparison source rather than the word null",
    rewritten.status === 0 && !/\bnull\b/.test(rewritten.stdout),
    rewritten.stdout,
  )
  check("check-context-budget.mjs", "a regenerated working baseline cannot hide growth from the target branch", ["--check"], { status: 1, stderr: /grew by 1 byte[\s\S]*CLAUDE\.md: \+1 byte/i }, { path: regenerated.path, cwd: regenerated.repo, env: regenerated.env })

  const bootstrap = stageContextBudget("bootstrap", { baselineOnBase: false })
  check("check-context-budget.mjs", "a first-run baseline bootstraps only when absent from the target branch", ["--check"], { status: 0, stdout: /working tree bootstrap/ }, { path: bootstrap.path, cwd: bootstrap.repo, env: bootstrap.env })

  const unfetched = stageContextBudget("unfetched")
  check("check-context-budget.mjs", "an unfetched target branch fails closed", ["--check"], { status: 2, stderr: /target branch missing-base is unavailable.*fetch its history/i }, { path: unfetched.path, cwd: unfetched.repo, env: { ...unfetched.env, CONTEXT_BUDGET_BASE_REF: "missing-base" } })

  const importAddition = stageContextBudget("import-addition", { claude: `${CONTEXT_CLAUDE}@../orbit-api/CLAUDE.md\n` })
  check("check-context-budget.mjs", "a removed sibling import fails even when its target is absent", ["--check"], { status: 1, stderr: /@..\/orbit-api\/CLAUDE\.md|import/i }, { path: importAddition.path, cwd: importAddition.repo, env: importAddition.env })

  const unconditional = stageContextBudget("unconditional-rule", { rules: { "foo.md": "# Always loaded\n" } })
  check("check-context-budget.mjs", "a new unconditional rules file exits 1", ["--check"], { status: 1, stderr: /foo\.md/ }, { path: unconditional.path, cwd: unconditional.repo, env: unconditional.env })

  const scoped = stageContextBudget("scoped-rule", { rules: { "foo.md": "---\npaths:\n  - apps/web/**\n---\n# Scoped\n" } })
  check("check-context-budget.mjs", "a rules file with paths frontmatter stays outside the budget", ["--check"], { status: 0 }, { path: scoped.path, cwd: scoped.repo, env: scoped.env })

  // The always-loaded ceiling can only ever cover CLAUDE.md and .claude/rules/*.md, so a baseline key
  // of any other shape adds bytes to the ceiling that nothing is ever measured against.
  const unmeasurableKey = stageContextBudget("unmeasurable-baseline-key", {
    baseline: {
      bytes: contextBytes(CONTEXT_CLAUDE) + contextBytes(CONTEXT_CORE) + 100,
      files: {
        "CLAUDE.md": contextBytes(CONTEXT_CLAUDE),
        ".claude/rules/core.md": contextBytes(CONTEXT_CORE),
        ".claude/skills/orchestrate/SKILL.md": 100,
      },
    },
  })
  check(
    "check-context-budget.mjs",
    "an always-loaded baseline key the tool never measures exits 1 rather than inflating the ceiling",
    ["--check"],
    { status: 1, stderr: /context-budget\.json names \.claude\/skills\/orchestrate\/SKILL\.md[\s\S]*never measures/ },
    { path: unmeasurableKey.path, cwd: unmeasurableKey.repo, env: unmeasurableKey.env },
  )

  const malformed = stageContextBudget("malformed", { baseline: "{not-json\n" })
  check("check-context-budget.mjs", "a malformed baseline is a tool error", ["--check"], { status: 2 }, { path: malformed.path, cwd: malformed.repo, env: malformed.env })
}

const onDemandCases = () => {
  const undeclaredCeiling = stageContextBudget("on-demand-no-ceiling")
  const noCeiling = budgetJson(undeclaredCeiling)
  T(
    "check-context-budget.mjs: an on-demand set with no committed ceiling measures the file and passes rather than failing closed on arrival",
    noCeiling.status === 0 &&
      noCeiling.parsed?.onDemandBytes === contextBytes(CONTEXT_SKILL) &&
      noCeiling.parsed?.onDemandBaselineBytes === null &&
      noCeiling.parsed?.onDemandFiles[ON_DEMAND_REPO_PATH] === contextBytes(CONTEXT_SKILL),
    `${noCeiling.status} ${noCeiling.stdout}${noCeiling.stderr}`,
  )
  check(
    "check-context-budget.mjs",
    "a missing on-demand ceiling says so in the report instead of printing a silent zero",
    ["--check"],
    { status: 0, stdout: /on-demand ceiling: NONE COMMITTED YET, run --write-baseline/ },
    { path: undeclaredCeiling.path, cwd: undeclaredCeiling.repo, env: undeclaredCeiling.env },
  )

  const onDemandOver = stageContextBudget("on-demand-over", { onDemandAdjustment: -1 })
  check(
    "check-context-budget.mjs",
    "an on-demand file over its ceiling exits 1 and names it",
    ["--check"],
    { status: 1, stderr: /On-demand instruction files grew by 1 byte[\s\S]*orchestrate\/SKILL\.md: \+1 byte/ },
    { path: onDemandOver.path, cwd: onDemandOver.repo, env: onDemandOver.env },
  )

  const onDemandUnder = stageContextBudget("on-demand-under", { onDemandAdjustment: 1 })
  check(
    "check-context-budget.mjs",
    "an on-demand file under its ceiling exits 0",
    ["--check"],
    { status: 0, stdout: /on-demand delta:\s+-1 bytes/ },
    { path: onDemandUnder.path, cwd: onDemandUnder.repo, env: onDemandUnder.env },
  )

  const onDemandUndeclaredKey = stageContextBudget("on-demand-undeclared-key", {
    onDemandBaseline: {
      bytes: contextBytes(CONTEXT_SKILL) + 40,
      files: { [ON_DEMAND_REPO_PATH]: contextBytes(CONTEXT_SKILL), ".claude/skills/ship/SKILL.md": 40 },
    },
  })
  check(
    "check-context-budget.mjs",
    "an on-demand baseline key outside the declared set exits 1 and names it",
    ["--check"],
    { status: 1, stderr: /on-demand-budget\.json names \.claude\/skills\/ship\/SKILL\.md[\s\S]*not in the declared on-demand set/ },
    { path: onDemandUndeclaredKey.path, cwd: onDemandUndeclaredKey.repo, env: onDemandUndeclaredKey.env },
  )

  const onDemandMissing = stageContextBudget("on-demand-missing-file", { skill: null })
  check(
    "check-context-budget.mjs",
    "a declared on-demand file missing from the repository exits 1 and names it",
    ["--check"],
    { status: 1, stderr: /declared on-demand file is missing from the repository: \.claude\/skills\/orchestrate\/SKILL\.md/ },
    { path: onDemandMissing.path, cwd: onDemandMissing.repo, env: onDemandMissing.env },
  )

  // A byte ceiling over a file whose line endings are not pinned means one number on a CRLF checkout
  // and another on an LF one, so it would pass locally and fail on the first CI run.
  const unpinnedSkill = stageContextBudget("on-demand-unpinned", {
    gitattributes: "CLAUDE.md text eol=lf\n.claude/rules/*.md text eol=lf\n",
  })
  check(
    "check-context-budget.mjs",
    "a byte-budgeted file with no eol pin exits 1 and names the attribute it resolved to",
    ["--check"],
    { status: 1, stderr: /orchestrate\/SKILL\.md is byte-budgeted but its \.gitattributes eol is unspecified, not lf/ },
    { path: unpinnedSkill.path, cwd: unpinnedSkill.repo, env: unpinnedSkill.env },
  )

  const unpinnedAlwaysLoaded = stageContextBudget("always-loaded-unpinned", {
    gitattributes: ".claude/skills/**/*.md text eol=lf\n",
  })
  check(
    "check-context-budget.mjs",
    "the eol pin is required of the always-loaded set too, not only the on-demand one",
    ["--check"],
    { status: 1, stderr: /CLAUDE\.md is byte-budgeted but its \.gitattributes eol is unspecified[\s\S]*core\.md is byte-budgeted/ },
    { path: unpinnedAlwaysLoaded.path, cwd: unpinnedAlwaysLoaded.repo, env: unpinnedAlwaysLoaded.env },
  )

  const written = stageContextBudget("on-demand-write-baseline")
  check(
    "check-context-budget.mjs",
    "--write-baseline records both ceilings, not just the always-loaded one",
    ["--write-baseline"],
    { status: 0, stdout: /on-demand-budget\.json written: \d+ bytes/ },
    { path: written.path, cwd: written.repo, env: written.env },
  )
  T(
    "check-context-budget.mjs: the written on-demand baseline holds the measured bytes of the declared file",
    existsSync(written.onDemandBaselinePath) &&
      JSON.parse(readFileSync(written.onDemandBaselinePath, "utf8")).files[ON_DEMAND_REPO_PATH] === contextBytes(CONTEXT_SKILL),
    existsSync(written.onDemandBaselinePath) ? readFileSync(written.onDemandBaselinePath, "utf8") : "(absent)",
  )

  // The two sets mean different things, so a reader must never see one folded into the other: an
  // on-demand file is paid for when its skill runs, not on every turn.
  const distinctSets = stageContextBudget("on-demand-excluded-from-full-session", {
    skill: `# Orchestrate fixture\n${"x".repeat(500)}\n`,
  })
  const distinct = budgetJson(distinctSets)
  T(
    "check-context-budget.mjs: the on-demand total is excluded from both the enforced and the full-session totals",
    distinct.status === 0 &&
      distinct.parsed?.onDemandBytes > 500 &&
      distinct.parsed?.enforcedBytes === contextBytes(CONTEXT_CLAUDE) + contextBytes(CONTEXT_CORE) &&
      distinct.parsed?.fullSessionBytes === distinct.parsed.enforcedBytes + distinct.parsed.externalBytes,
    `${distinct.status} ${distinct.stdout}${distinct.stderr}`,
  )
  check(
    "check-context-budget.mjs",
    "the report separates the on-demand ceiling from the always-loaded one in words, not just numbers",
    ["--check"],
    { status: 0, stdout: /on-demand instruction files, capped separately \(loaded when a skill runs, NOT every turn\)/ },
    { path: distinctSets.path, cwd: distinctSets.repo, env: distinctSets.env },
  )
}

const externalCases = () => {
  const externalPresent = stageContextBudget("external-present")
  const expectedExternalBytes = externalSum(externalPresent)
  const present = budgetJson(externalPresent)
  T(
    "check-context-budget.mjs: --json reports the enforced and full-session totals under distinguishable keys",
    present.status === 0 &&
      present.parsed?.enforcedBytes === contextBytes(CONTEXT_CLAUDE) + contextBytes(CONTEXT_CORE) &&
      present.parsed?.externalBytes === expectedExternalBytes &&
      present.parsed?.fullSessionBytes === present.parsed.enforcedBytes + expectedExternalBytes &&
      present.parsed?.fullSessionComplete === true,
    `${present.status} ${present.stdout}${present.stderr}`,
  )
  T(
    "check-context-budget.mjs: every staged external file is named in the reported set",
    present.parsed?.externalUnreadableFiles.length === 0 &&
      ["~/.claude/CLAUDE.md", "~/.claude/rules/answer-once.md"].every((file) =>
        present.parsed.externalFiles.some((entry) => entry.file === file),
      ) &&
      present.parsed.externalFiles.some((entry) => entry.file.endsWith("/brain/hot.md")),
    JSON.stringify(present.parsed?.externalFiles),
  )
  T(
    "check-context-budget.mjs: each external file carries the origin that says how the list can rot",
    present.parsed?.externalFiles.find((entry) => entry.file === "~/.claude/CLAUDE.md")?.origin === "declared" &&
      present.parsed?.externalFiles.find((entry) => entry.file === "~/.claude/rules/answer-once.md")?.origin === "declared" &&
      present.parsed?.externalFiles.find((entry) => entry.file.endsWith("/memory/MEMORY.md"))?.origin === "derived" &&
      present.parsed?.externalFiles.find((entry) => entry.file.endsWith("/brain/hot.md"))?.origin === "imported" &&
      present.parsed?.externalFiles.find((entry) => entry.file.endsWith("/brain/hot.md"))?.importedBy === "~/.claude/CLAUDE.md",
    JSON.stringify(present.parsed?.externalFiles),
  )
  check(
    "check-context-budget.mjs",
    "the human report attributes an imported external file to its importer",
    ["--check"],
    { status: 0, stdout: /brain\/hot\.md: \d+ bytes \[imported by ~\/\.claude\/CLAUDE\.md\]/ },
    { path: externalPresent.path, cwd: externalPresent.repo, env: externalPresent.env },
  )
  const printed = check(
    "check-context-budget.mjs",
    "the human report prints the enforced and the full-session totals as separate lines",
    ["--check"],
    {
      status: 0,
      stdout: /enforced total: \d+ bytes[\s\S]*reported only, never enforced[\s\S]*full session \(always-loaded \+ reported\): \d+ bytes/,
    },
    { path: externalPresent.path, cwd: externalPresent.repo, env: externalPresent.env },
  )
  T(
    "check-context-budget.mjs: the full-session total exceeds the enforced total by the external sum",
    printed.status === 0 &&
      printed.stdout.includes(`enforced total: ${present.parsed?.enforcedBytes} bytes`) &&
      printed.stdout.includes(`external total:  ${expectedExternalBytes} bytes`) &&
      printed.stdout.includes(`full session (always-loaded + reported): ${present.parsed?.enforcedBytes + expectedExternalBytes} bytes`) &&
      expectedExternalBytes > 0,
    printed.stdout,
  )

  // The project memory index is loaded by the runtime and imported by nothing, so it can only be
  // reached by deriving its directory from the repository path.
  const memoryPresent = stageContextBudget("external-memory-present")
  const memory = budgetJson(memoryPresent)
  T(
    "check-context-budget.mjs: the derived project memory index is counted in the external total",
    memory.status === 0 &&
      memory.parsed?.externalFiles.some(
        (entry) => entry.file.endsWith("/memory/MEMORY.md") && entry.bytes === contextBytes(EXTERNAL_MEMORY) && entry.origin === "derived",
      ) &&
      memory.parsed?.externalBytes === externalSum(memoryPresent),
    JSON.stringify(memory.parsed?.externalFiles),
  )

  const memoryAbsent = stageContextBudget("external-memory-absent", { external: { memory: null } })
  const withoutMemory = budgetJson(memoryAbsent)
  T(
    "check-context-budget.mjs: an underivable project memory index is named unreadable rather than dropped",
    withoutMemory.status === 0 &&
      withoutMemory.parsed?.fullSessionComplete === false &&
      withoutMemory.parsed?.externalBytes === externalSum(memoryAbsent) &&
      withoutMemory.parsed?.externalUnreadableFiles.some(
        (entry) => entry.file.endsWith("/memory/MEMORY.md") && entry.origin === "derived" && entry.reason === "absent",
      ),
    `${withoutMemory.status} ${JSON.stringify(withoutMemory.parsed?.externalUnreadableFiles)}`,
  )

  // An external file the tool cannot read must be named, never counted as zero and never dropped so
  // that a smaller total passes for the real one.
  const externalMissing = stageContextBudget("external-missing", { external: { hot: null } })
  const missing = budgetJson(externalMissing)
  T(
    "check-context-budget.mjs: an unreadable external file leaves the enforced verdict at 0 and is named, not counted",
    missing.status === 0 &&
      missing.parsed?.fullSessionComplete === false &&
      missing.parsed?.externalBytes === externalSum(externalMissing) &&
      missing.parsed?.externalUnreadableFiles.some((entry) => entry.file.endsWith("/brain/hot.md")),
    `${missing.status} ${missing.stdout}${missing.stderr}`,
  )
  check(
    "check-context-budget.mjs",
    "an unreadable external file makes the printed full-session total say so",
    ["--check"],
    { status: 0, stdout: /brain\/hot\.md: UNREADABLE \(absent\), not counted[\s\S]*full session \(always-loaded \+ reported\): at least \d+ bytes[\s\S]*PARTIAL/ },
    { path: externalMissing.path, cwd: externalMissing.repo, env: externalMissing.env },
  )

  // The CI shape: no user-level Claude context exists at all, not even the rules directory.
  const externalAbsent = stageContextBudget("external-absent", {
    external: { hot: null, claude: null, rules: null, memory: null },
  })
  const absent = budgetJson(externalAbsent)
  T(
    "check-context-budget.mjs: a machine with no user-level context still passes the enforced check and names every absent path",
    absent.status === 0 &&
      absent.parsed?.externalBytes === 0 &&
      absent.parsed?.fullSessionBytes === absent.parsed.enforcedBytes &&
      absent.parsed?.fullSessionComplete === false &&
      ["~/.claude/CLAUDE.md", "~/.claude/rules"].every((file) =>
        absent.parsed.externalUnreadableFiles.some((entry) => entry.file === file),
      ) &&
      absent.parsed.externalUnreadableFiles.some((entry) => entry.file.endsWith("/memory/MEMORY.md")),
    `${absent.status} ${JSON.stringify(absent.parsed?.externalUnreadableFiles)}`,
  )

  // An import of an import loads just the same, and a cycle must terminate without double counting.
  const externalNested = stageContextBudget("external-nested-import", {
    external: { nested: "# Nested vault fixture\n\nReached only through hot.md.\n" },
  })
  const nested = budgetJson(externalNested)
  T(
    "check-context-budget.mjs: a transitively imported file is counted once and an import cycle terminates",
    nested.status === 0 &&
      nested.parsed?.externalBytes === externalSum(externalNested) &&
      nested.parsed?.externalFiles.filter((entry) => entry.file.endsWith("/brain/nested.md")).length === 1 &&
      nested.parsed?.externalFiles.filter((entry) => entry.file === "~/.claude/CLAUDE.md").length === 1,
    `${nested.status} ${JSON.stringify(nested.parsed?.externalFiles)}${nested.stderr}`,
  )

  const externalScoped = stageContextBudget("external-scoped-rule", {
    external: { rules: { "scoped.md": "---\npaths:\n  - apps/web/**\n---\n# Scoped\n" } },
  })
  const externalScopedResult = budgetJson(externalScoped)
  T(
    "check-context-budget.mjs: a scoped user rule is not part of the reported always-loaded set",
    externalScopedResult.status === 0 &&
      externalScopedResult.parsed?.externalFiles.every((entry) => !entry.file.endsWith("scoped.md")) &&
      externalScopedResult.parsed?.externalBytes ===
        externalScoped.external.bytes["~/.claude/CLAUDE.md"] +
          externalScoped.external.bytes.hot +
          externalScoped.external.bytes.memory,
    JSON.stringify(externalScopedResult.parsed?.externalFiles),
  )
}

const helpCases = () => {
  const help = stageContextBudget("help")
  check(
    "check-context-budget.mjs",
    "help names every flag and every exit code",
    ["--help"],
    { status: 0, stdout: /(?=[\s\S]*--check)(?=[\s\S]*--write-baseline)(?=[\s\S]*--json)(?=[\s\S]*--help)(?=[\s\S]*-h)(?=[\s\S]*0)(?=[\s\S]*1)(?=[\s\S]*2)/ },
    { path: help.path, cwd: help.repo, env: help.env },
  )
  check(
    "check-context-budget.mjs",
    "help documents all three figures and why the full-session one can never be enforced",
    ["--help"],
    {
      status: 0,
      stdout: /(?=[\s\S]*ALWAYS-LOADED total, ENFORCED)(?=[\s\S]*ON-DEMAND total, ENFORCED SEPARATELY)(?=[\s\S]*FULL SESSION, REPORTED AND NEVER ENFORCED)(?=[\s\S]*can never be enforced)(?=[\s\S]*outside the repository)(?=[\s\S]*CI has none\s+of them)(?=[\s\S]*NAMED with its)/,
    },
    { path: help.path, cwd: help.repo, env: help.env },
  )
  check(
    "check-context-budget.mjs",
    "help says plainly that the on-demand set is not part of the other two totals",
    ["--help"],
    { status: 0, stdout: /deliberately NOT added to figure 1 or figure 3/ },
    { path: help.path, cwd: help.repo, env: help.env },
  )
  check(
    "check-context-budget.mjs",
    "help states the eol pinning rule that makes any byte ceiling meaningful",
    ["--help"],
    { status: 0, stdout: /pinned to eol=lf in \.gitattributes[\s\S]*CRLF checkout carries one extra byte per line/ },
    { path: help.path, cwd: help.repo, env: help.env },
  )
}

const contextBudgetCases = () => {
  alwaysLoadedCases()
  onDemandCases()
  externalCases()
  helpCases()
}

export { contextBudgetCases as cases }
