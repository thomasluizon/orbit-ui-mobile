#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { basename, dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const USAGE = `usage: check-lint-severity.mjs (--report-suppressions | --enforce-suppressions) [--root <path>]

  Fails when an eslint config sets a local/* rule to warn, or sets one to off outside
  a declared scoped exception. Finds eslint-suppressions.json files and targets named by
  --suppressions-location, then either reports or enforces those findings.

  --report-suppressions   print suppression findings and exit 0 when severity checks pass
  --enforce-suppressions  fail on suppression findings
  --root <path>           repository root (defaults to the parent of this tool's directory)
  --help, -h              print this usage and exit 0

exit codes: 0 checks passed, 1 a forbidden severity or enforced suppression exists,
            2 usage error or an unreadable eslint config`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const fail = (code, message) => {
  console.error(message)
  process.exit(code)
}

let repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
let suppressionMode = null
const argumentsLeft = process.argv.slice(2)
while (argumentsLeft.length > 0) {
  const flag = argumentsLeft.shift()
  if (flag === "--root" && argumentsLeft.length > 0) {
    repositoryRoot = resolve(argumentsLeft.shift())
  } else if (flag === "--report-suppressions" || flag === "--enforce-suppressions") {
    if (suppressionMode !== null) fail(2, `check-lint-severity: choose exactly one suppression mode\n\n${USAGE}`)
    suppressionMode = flag === "--report-suppressions" ? "report" : "enforce"
  } else {
    fail(2, `check-lint-severity: invalid arguments: ${process.argv.slice(2).join(" ")}\n\n${USAGE}`)
  }
}
if (suppressionMode === null) fail(2, `check-lint-severity: choose a suppression mode\n\n${USAGE}`)

const normalizedRelativePath = (path) => relative(repositoryRoot, path).split(sep).join("/")
const ignoredDirectories = new Set([".git", "node_modules"])
const repositoryFiles = []
const visit = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) visit(path)
    else if (entry.isFile()) repositoryFiles.push(path)
  }
}

try {
  visit(repositoryRoot)
} catch (error) {
  fail(2, `check-lint-severity: cannot scan ${repositoryRoot}: ${error.message}`)
}

const configPattern = /^eslint\.config\.(?:cjs|cts|js|mjs|mts|ts)$/
const configPaths = repositoryFiles.filter((path) => configPattern.test(basename(path))).sort()
if (configPaths.length === 0) fail(2, `check-lint-severity: ${repositoryRoot} holds no eslint.config file, so this gate would prove nothing`)

const scopedOffAllowlist = [
  {
    config: "apps/web/eslint.config.mjs",
    files: [
      "**/*-sheet.tsx", "**/*-modal.tsx", "**/*-dialog.tsx", "**/*-drawer.tsx",
      "**/*-overlay.tsx", "**/*-prompt.tsx", "**/*-form.tsx", "**/*-celebration.tsx",
      "**/*-picker.tsx", "**/*-gate.tsx", "**/goal-detail-drawer/**", "**/calendar-sync/**",
      "**/onboarding/**", "**/(auth)/**", "**/*empty-state.tsx", "**/*-no-data-state.tsx",
    ],
    rules: ["local/no-fullbleed-button"],
  },
  {
    config: "apps/web/eslint.config.mjs",
    files: ["__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "e2e/**/*.{ts,tsx}"],
    rules: ["local/no-fullbleed-button", "local/no-double-assertion"],
  },
  {
    config: "apps/mobile/eslint.config.js",
    files: [
      "**/*-sheet.tsx", "**/*-modal.tsx", "**/*-dialog.tsx", "**/*-drawer.tsx",
      "**/*-overlay.tsx", "**/*-prompt.tsx", "**/*-form.tsx", "**/*-celebration.tsx",
      "**/*-picker.tsx", "**/*-gate.tsx", "**/upgrade/**", "**/goal-detail-drawer/**",
      "**/calendar-sync.tsx", "**/wrapped-slide.tsx", "**/onboarding/**", "**/email-step.tsx",
      "**/code-step.tsx", "**/*empty-state.tsx", "**/*-no-data-state.tsx",
    ],
    rules: ["local/no-fullbleed-button"],
  },
  {
    config: "apps/mobile/eslint.config.js",
    files: ["__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: ["local/no-fullbleed-button", "local/no-double-assertion"],
  },
  {
    config: "packages/shared/eslint.config.mjs",
    files: ["src/__tests__/**/*.ts", "**/*.test.ts", "**/*.spec.ts"],
    rules: ["local/no-double-assertion"],
  },
]

const sameStrings = (left, right) =>
  Array.isArray(left)
  && left.length === right.length
  && [...left].sort().every((value, index) => value === [...right].sort()[index])

const isAllowedOff = (config, files, rule) => scopedOffAllowlist.some(
  (entry) => entry.config === config && sameStrings(files, entry.files) && entry.rules.includes(rule),
)

const flattenConfigs = (value) => Array.isArray(value) ? value.flatMap(flattenConfigs) : [value]
const severityOf = (setting) => Array.isArray(setting) ? setting[0] : setting
const severityProblems = []
let localRuleCount = 0

for (const configPath of configPaths) {
  const configName = normalizedRelativePath(configPath)
  let exported
  try {
    const cacheKey = statSync(configPath).mtimeMs
    exported = (await import(`${pathToFileURL(configPath).href}?lint-severity=${cacheKey}`)).default
  } catch (error) {
    fail(2, `check-lint-severity: cannot load ${configName}: ${error.message}`)
  }
  const blocks = flattenConfigs(exported).filter((block) => block && typeof block === "object")
  blocks.forEach((block, index) => {
    if (!block.rules || typeof block.rules !== "object") return
    for (const [rule, setting] of Object.entries(block.rules)) {
      if (!rule.startsWith("local/")) continue
      localRuleCount++
      const severity = severityOf(setting)
      if (severity === "warn" || severity === 1) {
        severityProblems.push(`${configName} block ${index + 1}: ${rule} is warn`)
      } else if ((severity === "off" || severity === 0) && !isAllowedOff(configName, block.files, rule)) {
        severityProblems.push(`${configName} block ${index + 1}: ${rule} is off outside the declared scoped allowlist`)
      }
    }
  })
}

const suppressionFiles = new Set(
  repositoryFiles
    .filter((path) => basename(path) === "eslint-suppressions.json")
    .map(normalizedRelativePath),
)

const suppressionTargetPattern = /--suppressions-location(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s"'`]+))/g
const commandSources = repositoryFiles.filter((path) =>
  basename(path) === "package.json" || /[\\/]\.github[\\/]workflows[\\/].+\.ya?ml$/.test(path),
)
const declaredTargets = new Set()
for (const sourcePath of commandSources) {
  const body = readFileSync(sourcePath, "utf8")
  for (const match of body.matchAll(suppressionTargetPattern)) {
    const target = (match[1] ?? match[2] ?? match[3]).replaceAll("\\", "/").replace(/^\.\//, "")
    declaredTargets.add(target)
  }
}
for (const target of declaredTargets) {
  for (const path of repositoryFiles) {
    const candidate = normalizedRelativePath(path)
    if (candidate === target || candidate.endsWith(`/${target}`)) suppressionFiles.add(candidate)
  }
}

if (severityProblems.length > 0) {
  console.error(`Lint severity failed: ${severityProblems.length} forbidden local rule setting(s).`)
  for (const problem of severityProblems) console.error(`  ${problem}`)
}

if (suppressionFiles.size > 0) {
  const paths = [...suppressionFiles].sort()
  const label = suppressionMode === "report" ? "reported" : "failed"
  const stream = suppressionMode === "report" ? console.log : console.error
  stream(`Lint suppressions ${label}: ${paths.length} baseline file(s) exist.`)
  for (const path of paths) stream(`  ${path}`)
  if (suppressionMode === "report") {
    stream("GitHub #175 keeps this finding report-only until the redesign reaches zero baselines; severity findings still enforce now.")
  }
}

if (severityProblems.length > 0 || (suppressionMode === "enforce" && suppressionFiles.size > 0)) process.exit(1)
console.log(`check-lint-severity: checked ${localRuleCount} local rule setting(s) across ${configPaths.length} config(s) in ${suppressionMode} mode.`)
