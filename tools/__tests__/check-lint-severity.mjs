import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { BASH, check, REPO_ROOT, root, T } from "./_harness.mjs"

const TOOL = "check-lint-severity.mjs"

const stageConfig = (label, body, relativePath = "eslint.config.mjs") => {
  const repository = join(root, "lint-severity", label)
  const configPath = join(repository, relativePath)
  mkdirSync(join(configPath, ".."), { recursive: true })
  writeFileSync(configPath, body)
  return repository
}

const run = (name, repository, expected, mode = "--enforce-suppressions") => check(
  TOOL,
  name,
  [mode, "--root", repository],
  expected,
)

export const cases = () => {
  const clean = stageConfig("clean", 'export default [{ rules: { "local/example": "error" } }]\n')
  run("accepts local rules at error", clean, { status: 0, stdout: /checked 1 local rule setting/ })

  const warning = stageConfig("warning", 'export default [{ rules: { "local/example": ["warn", {}] } }]\n')
  run("rejects a local rule at warn", warning, { status: 1, stderr: /local\/example is warn/ })

  const unscopedOff = stageConfig("unscoped-off", 'export default [{ rules: { "local/example": "off" } }]\n')
  run("rejects a local rule at off without an allowlisted scope", unscopedOff, {
    status: 1,
    stderr: /local\/example is off outside the declared scoped allowlist/,
  })

  const allowedFiles = ["src/__tests__/**/*.ts", "**/*.test.ts", "**/*.spec.ts"]
  const allowed = stageConfig(
    "allowed-off",
    `export default [{ files: ${JSON.stringify(allowedFiles)}, rules: { "local/no-double-assertion": "off" } }]\n`,
    "packages/shared/eslint.config.mjs",
  )
  run("accepts an explicitly allowlisted scoped off rule", allowed, { status: 0 })

  const escapedBasePath = stageConfig(
    "escaped-base-path",
    `export default [{ basePath: "../..", files: ${JSON.stringify(allowedFiles)}, rules: { "local/no-double-assertion": "off" } }]\n`,
    "packages/shared/eslint.config.mjs",
  )
  run("rejects an allowlisted off rule resolved outside its named directory", escapedBasePath, {
    status: 1,
    stderr: /outside the declared scoped allowlist/,
  })

  const fullScreenFiles = [
    "**/*-sheet.tsx", "**/*-modal.tsx", "**/*-dialog.tsx", "**/*-drawer.tsx",
    "**/*-overlay.tsx", "**/*-prompt.tsx", "**/*-form.tsx", "**/*-celebration.tsx",
    "**/*-picker.tsx", "**/*-gate.tsx", "**/goal-detail-drawer/**", "**/calendar-sync/**",
    "**/onboarding/**", "**/(auth)/**", "**/*empty-state.tsx", "**/*-no-data-state.tsx",
  ]
  const fullScreen = stageConfig(
    "full-screen-off",
    `export default [{ files: ${JSON.stringify(fullScreenFiles)}, rules: { "local/no-fullbleed-button": "off" } }]\n`,
    "apps/web/eslint.config.mjs",
  )
  run("accepts the allowlisted full-screen off scope", fullScreen, { status: 0 })

  const broadenedFiles = [...allowedFiles, "src/**/*.ts"]
  const broadened = stageConfig(
    "broadened-off",
    `export default [{ files: ${JSON.stringify(broadenedFiles)}, rules: { "local/no-double-assertion": "off" } }]\n`,
    "packages/shared/eslint.config.mjs",
  )
  run("rejects an allowlisted rule when its scope is broadened", broadened, { status: 1, stderr: /outside the declared scoped allowlist/ })

  const namedBaseline = stageConfig("named-baseline", 'export default [{ rules: { "local/example": "error" } }]\n')
  mkdirSync(join(namedBaseline, "nested"), { recursive: true })
  writeFileSync(join(namedBaseline, "nested", "eslint-suppressions.json"), "{}\n")
  run("rejects eslint-suppressions.json in enforcing mode", namedBaseline, {
    status: 1,
    stderr: /nested\/eslint-suppressions\.json/,
  })
  run("reports eslint-suppressions.json without weakening severity checks", namedBaseline, {
    status: 0,
    stdout: /GitHub #175 keeps this finding report-only/,
  }, "--report-suppressions")

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
  const shellExpansionResult = run("rejects shell-expanded suppressions-location targets", shellExpandedBaseline, {
    status: 1,
    stderr: /5 unsafe target declaration\(s\)/,
  })
  const shellExpansionTargets = [
    "$SUPPRESSIONS_FILE",
    "${SUPPRESSIONS_FILE}",
    "${SUPPRESSIONS_FILE:-custom-baseline.json}",
    "`printf",
    "$(printf",
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

  const reportingStillBlocks = stageConfig("reporting-warning", 'export default [{ rules: { "local/example": "warn" } }]\n')
  run("keeps severity failures blocking in reporting mode", reportingStillBlocks, {
    status: 1,
    stderr: /local\/example is warn/,
  }, "--report-suppressions")
}
