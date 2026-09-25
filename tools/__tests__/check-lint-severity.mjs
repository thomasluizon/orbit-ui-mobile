import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { BASH, check, REPO_ROOT, root, T } from "./_harness.mjs"

const TOOL = "check-lint-severity.mjs"
const localSettings = async (path) => {
  const { default: config } = await import(pathToFileURL(join(REPO_ROOT, path)).href)
  return config.flat(Infinity)
    .filter((block) => Object.keys(block?.rules ?? {}).some((rule) => rule.startsWith("local/")))
    .map((block) => Object.fromEntries(Object.entries(block.rules).filter(([rule]) => rule.startsWith("local/"))))
}
const [webMainRules, webScreenRules, webTestRules] = await localSettings("apps/web/eslint.config.mjs")
const [sharedMainRules] = await localSettings("packages/shared/eslint.config.mjs")

const inventoriedConfigs = [
  "apps/web/eslint.config.mjs",
  "apps/mobile/eslint.config.js",
  "packages/shared/eslint.config.mjs",
]
const fixtureConfigs = new Map()
for (const path of inventoriedConfigs) {
  const { default: config } = await import(pathToFileURL(join(REPO_ROOT, path)).href)
  const blocks = config.flat(Infinity)
    .filter((block) => block && typeof block === "object")
    .filter((block) =>
      (block.ignores !== undefined && block.files === undefined && block.rules === undefined)
      || Object.keys(block.rules ?? {}).some((rule) => rule.startsWith("local/")),
    )
    .map((block) => ({
      ...(block.files === undefined ? {} : { files: block.files }),
      ...(block.ignores === undefined ? {} : { ignores: block.ignores }),
      ...(block.rules === undefined ? {} : {
        rules: Object.fromEntries(Object.entries(block.rules).filter(([rule]) => rule.startsWith("local/"))),
      }),
    }))
  fixtureConfigs.set(path, `${path.endsWith(".js") ? "module.exports =" : "export default"} ${JSON.stringify(blocks)}\n`)
}

const stageConfig = (label, body, relativePath = "eslint.config.mjs") => {
  const repository = join(root, "lint-severity", label)
  for (const [inventoryPath, configBody] of fixtureConfigs) {
    const inventoryFile = join(repository, inventoryPath)
    if (existsSync(inventoryFile)) continue
    mkdirSync(join(inventoryFile, ".."), { recursive: true })
    writeFileSync(inventoryFile, configBody)
  }
  const configPath = join(repository, relativePath)
  mkdirSync(join(configPath, ".."), { recursive: true })
  writeFileSync(configPath, body)
  return repository
}

const run = (name, repository, expected) => check(TOOL, name, ["--root", repository], expected)

const sharedFiles = ["src/**/*.{ts,tsx}"]
const sharedIgnores = ["node_modules/**", "dist/**", "coverage/**", "src/types/__generated__/**", "*.config.{js,mjs,cjs,ts}"]
const sharedTestFiles = ["src/__tests__/**/*.ts", "**/*.test.ts", "**/*.spec.ts"]
const sharedConfig = ({ files = sharedFiles, ignores = sharedIgnores, testFiles = sharedTestFiles, testBasePath, mainRules = sharedMainRules } = {}) => `export default [
  { files: ${JSON.stringify(files)}, ignores: ["**/*.d.ts"], rules: ${JSON.stringify(mainRules)} },
  { ${testBasePath ? `basePath: ${JSON.stringify(testBasePath)}, ` : ""}files: ${JSON.stringify(testFiles)}, rules: { "local/no-double-assertion": "off" } },
  { ignores: ${JSON.stringify(ignores)} },
]\n`

const webNextIgnores = [".next/**", "out/**", "build/**", "next-env.d.ts"]
const webIgnores = [".next/**", "node_modules/**", "coverage/**", "public/**", "*.config.{js,mjs,cjs,ts}"]
const webScreenFiles = [
  "**/*-sheet.tsx", "**/*-modal.tsx", "**/*-dialog.tsx", "**/*-drawer.tsx",
  "**/*-overlay.tsx", "**/*-prompt.tsx", "**/*-form.tsx", "**/*-celebration.tsx",
  "**/*-picker.tsx", "**/*-gate.tsx", "**/goal-detail-drawer/**", "**/calendar-sync/**",
  "**/onboarding/**", "**/(auth)/**", "**/*empty-state.tsx", "**/*-no-data-state.tsx",
]
const webTestFiles = ["__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "e2e/**/*.{ts,tsx}"]
const webConfig = ({ ignores = webIgnores, screenFiles = webScreenFiles, mainRules = webMainRules, screenRules = webScreenRules } = {}) => `export default [
  ...Array.from({ length: 3 }, () => ({ ignores: ${JSON.stringify(webNextIgnores)} })),
  { files: ["**/*.{ts,tsx}"], ignores: ["**/*.d.ts"], rules: ${JSON.stringify(mainRules)} },
  { files: ${JSON.stringify(screenFiles)}, rules: ${JSON.stringify(screenRules)} },
  { files: ${JSON.stringify(webTestFiles)}, rules: ${JSON.stringify(webTestRules)} },
  { ignores: ${JSON.stringify(ignores)} },
]\n`

export const cases = () => {
  const clean = stageConfig("clean", sharedConfig(), "packages/shared/eslint.config.mjs")
  run("accepts local rules at error", clean, { status: 0, stdout: /checked \d+ local rule setting/ })

  const warning = stageConfig("warning", 'export default [{ rules: { "local/example": ["warn", {}] } }]\n')
  run("rejects a local rule at warn", warning, { status: 1, stderr: /local\/example is warn/ })

  const unscopedOff = stageConfig("unscoped-off", 'export default [{ rules: { "local/example": "off" } }]\n')
  run("rejects a local rule at off without an allowlisted scope", unscopedOff, {
    status: 1,
    stderr: /local\/example is off outside the declared scoped allowlist/,
  })

  const allowedFiles = sharedTestFiles
  const allowed = stageConfig(
    "allowed-off",
    sharedConfig(),
    "packages/shared/eslint.config.mjs",
  )
  run("accepts an explicitly allowlisted scoped off rule", allowed, { status: 0 })

  const escapedBasePath = stageConfig(
    "escaped-base-path",
    sharedConfig({ testBasePath: "../.." }),
    "packages/shared/eslint.config.mjs",
  )
  run("rejects an allowlisted off rule resolved outside its named directory", escapedBasePath, {
    status: 1,
    stderr: /outside the declared scoped allowlist/,
  })

  const fullScreen = stageConfig(
    "full-screen-off",
    webConfig(),
    "apps/web/eslint.config.mjs",
  )
  run("accepts the allowlisted full-screen off scope", fullScreen, { status: 0 })

  const missingWeb = stageConfig("missing-web", sharedConfig(), "packages/shared/eslint.config.mjs")
  rmSync(join(missingWeb, "apps/web/eslint.config.mjs"))
  run("rejects a removed inventoried web config", missingWeb, {
    status: 1,
    stderr: /apps\/web\/eslint\.config\.mjs.*inventoried config is missing/,
  })

  for (const [label, configPath] of [
    ["mobile", "apps/mobile/eslint.config.js"],
    ["shared", "packages/shared/eslint.config.mjs"],
  ]) {
    const missingConfig = stageConfig(`missing-${label}`, webConfig(), "apps/web/eslint.config.mjs")
    rmSync(join(missingConfig, configPath))
    const result = run(`rejects a removed inventoried ${label} config`, missingConfig, { status: 1 })
    T(`${TOOL}: missing ${label} config is named`, result.stderr.includes(`${configPath}: inventoried config is missing`), result.stderr)
  }

  const addedConfig = stageConfig("added-config", webConfig(), "apps/web/eslint.config.mjs")
  stageConfig("added-config", 'export default [{ ignores: ["hidden/**"] }, { files: ["hidden/**/*.ts"], rules: { "local/example": "error" } }]\n', "apps/extra/eslint.config.mjs")
  run("rejects an added config with undeclared ignores and local scope", addedConfig, {
    status: 1,
    stderr: /apps\/extra\/eslint\.config\.mjs.*undeclared scope/,
  })

  const renamedConfig = stageConfig(
    "renamed-config",
    'export default [{ ignores: ["hidden/**"] }, { files: ["hidden/**/*.ts"], rules: { "local/example": "error" } }]\n',
    "apps/renamed/eslint.config.mjs",
  )
  run("rejects a renamed config with undeclared ignores and local scope", renamedConfig, {
    status: 1,
    stderr: /apps\/renamed\/eslint\.config\.mjs.*undeclared scope/,
  })

  const movedRule = stageConfig(
    "moved-rule",
    webConfig({
      mainRules: Object.fromEntries(Object.entries(webMainRules).filter(([rule]) => rule !== "local/no-comments")),
      screenRules: { ...webScreenRules, "local/no-comments": "error" },
    }),
    "apps/web/eslint.config.mjs",
  )
  run("rejects moving an existing local rule into a narrower block", movedRule, {
    status: 1,
    stderr: /apps\/web\/eslint\.config\.mjs.*local\/no-comments/,
  })

  const broadenedFiles = [...allowedFiles, "src/**/*.ts"]
  const broadened = stageConfig(
    "broadened-off",
    sharedConfig({ testFiles: broadenedFiles }),
    "packages/shared/eslint.config.mjs",
  )
  run("rejects an allowlisted rule when its scope is broadened", broadened, { status: 1, stderr: /outside the declared scoped allowlist/ })

  const addedIgnore = stageConfig("added-ignore", webConfig({ ignores: [...webIgnores, "app/**"] }), "apps/web/eslint.config.mjs")
  run("rejects an added top-level ignore", addedIgnore, { status: 1, stderr: /apps\/web\/eslint\.config\.mjs.*app\/\*\*/ })

  const removedIgnore = stageConfig("removed-ignore", sharedConfig({ ignores: sharedIgnores.slice(1) }), "packages/shared/eslint.config.mjs")
  run("rejects a removed top-level ignore", removedIgnore, { status: 1, stderr: /packages\/shared\/eslint\.config\.mjs.*node_modules\/\*\*/ })

  const narrowedFiles = stageConfig("narrowed-files", sharedConfig({ files: ["matches-nothing/**/*.ts"] }), "packages/shared/eslint.config.mjs")
  run("rejects a narrowed local rule block", narrowedFiles, { status: 1, stderr: /packages\/shared\/eslint\.config\.mjs.*matches-nothing/ })

  const addedRule = stageConfig("added-rule", sharedConfig({ mainRules: { ...sharedMainRules, "local/new-rule": "error" } }), "packages/shared/eslint.config.mjs")
  run("accepts a new local rule at error in an existing block", addedRule, { status: 0 })

  const namedBaseline = stageConfig("named-baseline", 'export default [{ rules: { "local/example": "error" } }]\n')
  mkdirSync(join(namedBaseline, "nested"), { recursive: true })
  writeFileSync(join(namedBaseline, "nested", "eslint-suppressions.json"), "{}\n")
  run("rejects an eslint-suppressions.json anywhere in the tree", namedBaseline, {
    status: 1,
    stderr: /nested\/eslint-suppressions\.json/,
  })

  const customBaseline = stageConfig("custom-baseline", 'export default [{ rules: { "local/example": "error" } }]\n')
  mkdirSync(join(customBaseline, "apps", "web"), { recursive: true })
  writeFileSync(join(customBaseline, "apps", "web", "package.json"), JSON.stringify({
    scripts: { lint: "eslint . --suppressions-location custom-lint-baseline.json" },
  }))
  writeFileSync(join(customBaseline, "apps", "web", "custom-lint-baseline.json"), "{}\n")
  run("rejects an existing custom suppressions-location target", customBaseline, {
    status: 1,
    stderr: /apps\/web\/custom-lint-baseline\.json/,
  })

  const shellExpandedBaseline = stageConfig(
    "shell-expanded-baseline",
    'export default [{ files: ["target.js"], rules: { "no-unused-vars": "error" } }]\n',
  )
  writeFileSync(join(shellExpandedBaseline, "target.js"), "const unused = 1\n")
  const eslintPath = join(REPO_ROOT, "node_modules", "eslint", "bin", "eslint.js").replaceAll("\\", "/")
  const nodePath = process.execPath.replaceAll("\\", "/")
  const eslintCommand = `"${nodePath}" "${eslintPath}" target.js --suppress-all --suppressions-location`
  const shellExpansionCommands = {
    lint: `${eslintCommand} $SUPPRESSIONS_FILE`,
    lintBraced: `${eslintCommand} "\${SUPPRESSIONS_FILE}"`,
    lintDefault: `${eslintCommand} \${SUPPRESSIONS_FILE:-custom-baseline.json}`,
    lintBacktick: `${eslintCommand} \`printf custom-baseline.json\``,
    lintSubshell: `${eslintCommand} $(printf custom-baseline.json)`,
    lintTildeHome: `${eslintCommand} ~`,
    lintTildeHomePath: `${eslintCommand} ~/custom-baseline.json`,
    lintTildeUser: `${eslintCommand} ~root/custom-baseline.json`,
    lintTildeQualifiedUser: `${eslintCommand} ~user@domain/custom-baseline.json`,
    lintTildeUnlistedUser: `${eslintCommand} ~@domain/custom-baseline.json`,
    lintTildeCurrent: `${eslintCommand} ~+/tilde-plus-baseline.json`,
    lintTildePrevious: `${eslintCommand} ~-/custom-baseline.json`,
    lintTildeCurrentStack: `${eslintCommand} ~+0/custom-baseline.json`,
    lintTildePreviousStack: `${eslintCommand} ~-0/custom-baseline.json`,
    lintTildeStack: `${eslintCommand} ~0/custom-baseline.json`,
  }
  writeFileSync(join(shellExpandedBaseline, "package.json"), JSON.stringify({ scripts: shellExpansionCommands }))
  const shellExpandedEslint = spawnSync(BASH, ["-lc", shellExpansionCommands.lint], {
    cwd: shellExpandedBaseline,
    encoding: "utf8",
    env: { ...process.env, SUPPRESSIONS_FILE: "custom-baseline.json" },
    windowsHide: true,
  })
  T(
    `${TOOL}: installed ESLint uses the shell-expanded custom baseline`,
    shellExpandedEslint.status === 0 && existsSync(join(shellExpandedBaseline, "custom-baseline.json")),
    `eslint exit ${shellExpandedEslint.status}; ${(shellExpandedEslint.stderr || shellExpandedEslint.stdout).trim()}`,
  )
  const tildePlusEslint = spawnSync(BASH, ["-lc", shellExpansionCommands.lintTildeCurrent], {
    cwd: shellExpandedBaseline,
    encoding: "utf8",
    env: process.env,
    windowsHide: true,
  })
  T(
    `${TOOL}: installed ESLint expands ~+ to the current directory`,
    tildePlusEslint.status === 0 && existsSync(join(shellExpandedBaseline, "tilde-plus-baseline.json")),
    `eslint exit ${tildePlusEslint.status}; ${(tildePlusEslint.stderr || tildePlusEslint.stdout).trim()}`,
  )
  const shellExpansionResult = run("rejects shell-expanded suppressions-location targets", shellExpandedBaseline, {
    status: 1,
    stderr: /15 unsafe target declaration\(s\)/,
  })
  const shellExpansionTargets = [
    "$SUPPRESSIONS_FILE",
    "${SUPPRESSIONS_FILE}",
    "${SUPPRESSIONS_FILE:-custom-baseline.json}",
    "`printf",
    "$(printf",
    "~",
    "~/custom-baseline.json",
    "~root/custom-baseline.json",
    "~user@domain/custom-baseline.json",
    "~@domain/custom-baseline.json",
    "~+/tilde-plus-baseline.json",
    "~-/custom-baseline.json",
    "~+0/custom-baseline.json",
    "~-0/custom-baseline.json",
    "~0/custom-baseline.json",
  ]
  for (const target of shellExpansionTargets) {
    T(
      `${TOOL}: rejects the ${target} expansion form`,
      shellExpansionResult.stderr.includes(`--suppressions-location ${target}`),
      shellExpansionResult.stderr.trim(),
    )
  }

  const workflowBaseline = stageConfig("workflow-baseline", 'export default [{ rules: { "local/example": "error" } }]\n')
  for (const directory of ["workflow", "job", "step"]) {
    mkdirSync(join(workflowBaseline, "apps", directory), { recursive: true })
    writeFileSync(join(workflowBaseline, "apps", directory, "workflow-baseline.json"), "{}\n")
  }
  mkdirSync(join(workflowBaseline, ".github", "workflows"), { recursive: true })
  writeFileSync(join(workflowBaseline, ".github", "workflows", "lint.yml"), `name: lint
on: push
defaults:
  run:
    working-directory: apps/workflow
jobs:
  workflow-default:
    steps:
      - run: eslint . --suppressions-location workflow-baseline.json
  job-default:
    defaults:
      run:
        working-directory: apps/job
    steps:
      - run: eslint . --suppressions-location workflow-baseline.json
  step-override:
    defaults:
      run:
        working-directory: apps/job
    steps:
      - run: eslint . --suppressions-location workflow-baseline.json
        working-directory: apps/step
`)
  const workflowResult = run("resolves workflow suppression targets from their effective working directories", workflowBaseline, {
    status: 1,
    stderr: /apps\/workflow\/workflow-baseline\.json/,
  })
  T(
    `${TOOL}: job and step working directories override the workflow default`,
    /apps\/job\/workflow-baseline\.json/.test(workflowResult.stderr)
      && /apps\/step\/workflow-baseline\.json/.test(workflowResult.stderr),
    workflowResult.stderr.trim(),
  )

  const directoryBaseline = stageConfig(
    "directory-baseline",
    'export default [{ files: ["target.js"], rules: { "no-unused-vars": "error" } }]\n',
  )
  writeFileSync(join(directoryBaseline, "target.js"), "const unused = 1\n")
  mkdirSync(join(directoryBaseline, "suppressions"), { recursive: true })
  writeFileSync(join(directoryBaseline, "package.json"), JSON.stringify({
    scripts: { lint: "eslint target.js --suppressions-location suppressions" },
  }))
  const eslint = spawnSync(
    process.execPath,
    [join(REPO_ROOT, "node_modules", "eslint", "bin", "eslint.js"), "target.js", "--suppress-all", "--suppressions-location", "suppressions"],
    { cwd: directoryBaseline, encoding: "utf8", windowsHide: true },
  )
  const generatedSuppressions = readdirSync(join(directoryBaseline, "suppressions"))
  T(
    `${TOOL}: the directory fixture was created by installed ESLint`,
    eslint.status === 0 && generatedSuppressions.length === 1 && /^suppressions_.+$/.test(generatedSuppressions[0]),
    `eslint exit ${eslint.status}; files: ${generatedSuppressions.join(", ")}; ${(eslint.stderr || eslint.stdout).trim()}`,
  )
  run("rejects a directory-valued suppressions-location", directoryBaseline, {
    status: 1,
    stderr: /suppressions is a directory target/,
  })

  const escapedBaseline = stageConfig("escaped-baseline", 'export default [{ rules: { "local/example": "error" } }]\n')
  writeFileSync(join(escapedBaseline, "package.json"), JSON.stringify({
    scripts: { lint: "eslint . --suppressions-location ../.." },
  }))
  run("rejects a suppressions-location resolved outside the repository", escapedBaseline, {
    status: 1,
    stderr: /resolves outside the repository/,
  })

  run("accepts this repository's own tree", REPO_ROOT, {
    status: 0,
    stdout: /checked \d+ local rule setting\(s\) across \d+ config\(s\)\./,
  })

  const guardsWorkflow = readFileSync(join(REPO_ROOT, ".github", "workflows", "guards.yml"), "utf8")
  const lintSeverityJob = guardsWorkflow.slice(
    guardsWorkflow.indexOf("  lint-severity:"),
    guardsWorkflow.indexOf("\n  calibration:", guardsWorkflow.indexOf("  lint-severity:")),
  )
  T(
    `${TOOL}: the workflow predicate owns package-lock.json`,
    /\^package-lock\\\.json\$/.test(lintSeverityJob),
    lintSeverityJob.trim(),
  )
  T(
    `${TOOL}: the workflow runs the gate with no suppression mode flag`,
    /node tools\/check-lint-severity\.mjs\s*$/m.test(lintSeverityJob),
    lintSeverityJob.trim(),
  )
  T(
    `${TOOL}: no suppression ratchet survives in guards.yml`,
    !/ratchet/i.test(guardsWorkflow),
    guardsWorkflow.split("\n").filter((line) => /ratchet/i.test(line)).join("\n"),
  )
}
