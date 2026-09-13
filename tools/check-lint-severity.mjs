#!/usr/bin/env node

import { existsSync, readFileSync, realpathSync, readdirSync, statSync } from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import yaml from "js-yaml"

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
const resolvedPath = (path) => {
  const absolutePath = resolve(path)
  if (existsSync(absolutePath)) return realpathSync.native(absolutePath)

  const missingSegments = []
  let existingAncestor = absolutePath
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor)
    if (parent === existingAncestor) return absolutePath
    missingSegments.unshift(basename(existingAncestor))
    existingAncestor = parent
  }
  return resolve(realpathSync.native(existingAncestor), ...missingSegments)
}
const resolvedRepositoryRoot = resolvedPath(repositoryRoot)
const isInsideRepository = (path) => {
  const relativePath = relative(resolvedRepositoryRoot, path)
  return relativePath === "" || (!isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith(`..${sep}`))
}
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

const resolvedOffAllowlist = scopedOffAllowlist.map((entry) => {
  const configPath = resolvedPath(resolve(repositoryRoot, entry.config))
  const basePath = resolvedPath(dirname(configPath))
  return {
    configPath,
    files: entry.files.map((pattern) => resolve(basePath, pattern)),
    rules: entry.rules,
  }
})

const isAllowedOff = (configPath, block, rule) => {
  if (!Array.isArray(block.files) || !block.files.every((pattern) => typeof pattern === "string")) return false
  if (block.basePath !== undefined && typeof block.basePath !== "string") return false
  const basePath = resolvedPath(resolve(dirname(configPath), block.basePath ?? "."))
  const files = block.files.map((pattern) => resolve(basePath, pattern))
  const canonicalConfigPath = resolvedPath(configPath)
  return resolvedOffAllowlist.some(
    (entry) => entry.configPath === canonicalConfigPath && sameStrings(files, entry.files) && entry.rules.includes(rule),
  )
}

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
      } else if ((severity === "off" || severity === 0) && !isAllowedOff(configPath, block, rule)) {
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

const suppressionTargetPattern = /--suppressions-location(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s"']+))/g
const hasShellExpansion = (target) =>
  /[$`*?\[]/.test(target)
  || /^~(?:[\\/]|$|[A-Za-z0-9_.-])/.test(target)
  || /%[^%\s]+%|![^!\s]+!|%(?:~[A-Za-z]*\d|\d)/.test(target)
  || /\{(?:[^{}]*,|\d+\.\.\d+)/.test(target)
  || /[<>]\(/.test(target)
const declaredTargets = new Map()
const suppressionLocationProblems = []
const recordDeclaredTargets = (sourcePath, command, basePath) => {
  suppressionTargetPattern.lastIndex = 0
  let declarationCount = 0
  for (const match of command.matchAll(suppressionTargetPattern)) {
    declarationCount++
    const target = match[1] ?? match[2] ?? match[3]
    if (hasShellExpansion(target)) {
      suppressionLocationProblems.push(
        `${normalizedRelativePath(sourcePath)}: --suppressions-location ${target} is dynamic and cannot be resolved safely`,
      )
      continue
    }
    const absoluteTarget = resolvedPath(resolve(basePath, target))
    if (!isInsideRepository(absoluteTarget)) {
      suppressionLocationProblems.push(
        `${normalizedRelativePath(sourcePath)}: --suppressions-location ${target} resolves outside the repository`,
      )
      continue
    }
    if (/[\\/]$/.test(target) || (existsSync(absoluteTarget) && statSync(absoluteTarget).isDirectory())) {
      suppressionLocationProblems.push(
        `${normalizedRelativePath(sourcePath)}: --suppressions-location ${target} is a directory target and cannot be resolved safely`,
      )
      continue
    }
    declaredTargets.set(absoluteTarget, { sourcePath, target })
  }
  if (command.includes("--suppressions-location") && declarationCount === 0) {
    suppressionLocationProblems.push(
      `${normalizedRelativePath(sourcePath)}: --suppressions-location declaration cannot be resolved safely`,
    )
  }
}

for (const sourcePath of repositoryFiles.filter((path) => basename(path) === "package.json")) {
  const body = readFileSync(sourcePath, "utf8")
  let packageJson
  try {
    packageJson = JSON.parse(body)
  } catch (error) {
    fail(2, `check-lint-severity: cannot parse ${normalizedRelativePath(sourcePath)}: ${error.message}`)
  }
  if (!packageJson.scripts || typeof packageJson.scripts !== "object") continue
  for (const command of Object.values(packageJson.scripts)) {
    if (typeof command === "string") recordDeclaredTargets(sourcePath, command, dirname(sourcePath))
  }
}

const workflowPaths = repositoryFiles.filter((path) => /[\\/]\.github[\\/]workflows[\\/].+\.ya?ml$/.test(path))
for (const sourcePath of workflowPaths) {
  let workflow
  try {
    workflow = yaml.load(readFileSync(sourcePath, "utf8"))
  } catch (error) {
    fail(2, `check-lint-severity: cannot parse ${normalizedRelativePath(sourcePath)}: ${error.message}`)
  }
  if (!workflow || typeof workflow !== "object" || !workflow.jobs || typeof workflow.jobs !== "object") continue
  const workflowDirectory = workflow.defaults?.run?.["working-directory"]
  for (const job of Object.values(workflow.jobs)) {
    if (!job || typeof job !== "object" || !Array.isArray(job.steps)) continue
    const jobDirectory = job.defaults?.run?.["working-directory"] ?? workflowDirectory
    for (const step of job.steps) {
      if (!step || typeof step !== "object" || typeof step.run !== "string") continue
      if (!step.run.includes("--suppressions-location")) continue
      const workingDirectory = step["working-directory"] ?? jobDirectory ?? "."
      if (typeof workingDirectory !== "string" || workingDirectory.includes("${{")) {
        suppressionLocationProblems.push(
          `${normalizedRelativePath(sourcePath)}: suppression command has a dynamic working-directory and cannot be resolved safely`,
        )
        continue
      }
      const basePath = resolvedPath(resolve(repositoryRoot, workingDirectory))
      if (!isInsideRepository(basePath)) {
        suppressionLocationProblems.push(
          `${normalizedRelativePath(sourcePath)}: working-directory ${workingDirectory} resolves outside the repository`,
        )
        continue
      }
      recordDeclaredTargets(sourcePath, step.run, basePath)
    }
  }
}
const repositoryFilesByResolvedPath = new Map(
  repositoryFiles.map((path) => [resolvedPath(path), normalizedRelativePath(path)]),
)
for (const [absoluteTarget, declaration] of declaredTargets) {
  if (!isInsideRepository(absoluteTarget)) {
    suppressionLocationProblems.push(
      `${normalizedRelativePath(declaration.sourcePath)}: --suppressions-location ${declaration.target} resolves outside the repository`,
    )
    continue
  }
  const matchedFile = repositoryFilesByResolvedPath.get(absoluteTarget)
  if (matchedFile) suppressionFiles.add(matchedFile)
}

if (severityProblems.length > 0) {
  console.error(`Lint severity failed: ${severityProblems.length} forbidden local rule setting(s).`)
  for (const problem of severityProblems) console.error(`  ${problem}`)
}

const hasSuppressionFindings = suppressionFiles.size > 0 || suppressionLocationProblems.length > 0
if (hasSuppressionFindings) {
  const paths = [...suppressionFiles].sort()
  const label = suppressionMode === "report" ? "reported" : "failed"
  const stream = suppressionMode === "report" ? console.log : console.error
  if (paths.length > 0) {
    stream(`Lint suppressions ${label}: ${paths.length} baseline file(s) exist.`)
    for (const path of paths) stream(`  ${path}`)
  }
  if (suppressionLocationProblems.length > 0) {
    stream(`Lint suppression locations ${label}: ${suppressionLocationProblems.length} unsafe target declaration(s).`)
    for (const problem of suppressionLocationProblems) stream(`  ${problem}`)
  }
  if (suppressionMode === "report") {
    stream("GitHub #175 keeps this finding report-only until the redesign reaches zero baselines; severity findings still enforce now.")
  }
}

if (severityProblems.length > 0 || (suppressionMode === "enforce" && hasSuppressionFindings)) process.exit(1)
console.log(`check-lint-severity: checked ${localRuleCount} local rule setting(s) across ${configPaths.length} config(s) in ${suppressionMode} mode.`)
