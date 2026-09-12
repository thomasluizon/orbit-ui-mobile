import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { check, root } from "./_harness.mjs"

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
