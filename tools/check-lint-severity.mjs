#!/usr/bin/env node

import { existsSync, readFileSync, realpathSync, readdirSync, statSync } from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import yaml from "js-yaml"

const USAGE = `usage: check-lint-severity.mjs [--root <path>]

  A local/* rule ships at error with zero violations, or it does not ship. Fails when an
  eslint config sets a local/* rule to warn, sets one to off outside a declared scoped
  exception, changes a declared ignore or local-rule file scope, loses an inventoried config,
  or finds a lint-suppression baseline: an eslint-suppressions.json anywhere in the tree, or any file a
  --suppressions-location flag names.

  --root <path>  repository root (defaults to the parent of this tool's directory)
  --help, -h     print this usage and exit 0

exit codes: 0 checks passed, 1 a forbidden severity, scope, or suppression baseline exists,
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
const argumentsLeft = process.argv.slice(2)
while (argumentsLeft.length > 0) {
  const flag = argumentsLeft.shift()
  if (flag === "--root" && argumentsLeft.length > 0) {
    repositoryRoot = resolve(argumentsLeft.shift())
  } else {
    fail(2, `check-lint-severity: invalid arguments: ${process.argv.slice(2).join(" ")}\n\n${USAGE}`)
  }
}

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
    rules: ["local/no-fullbleed-button", "local/max-button-words", "local/no-double-assertion"],
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
    rules: ["local/no-fullbleed-button", "local/max-button-words", "local/no-double-assertion"],
  },
  {
    config: "packages/shared/eslint.config.mjs",
    files: ["src/__tests__/**/*.ts", "**/*.test.ts", "**/*.spec.ts"],
    rules: ["local/no-double-assertion"],
  },
]

const nextIgnores = [".next/**", "out/**", "build/**", "next-env.d.ts"]
const webRules = [
  "local/no-comments", "local/no-fullbleed-button", "local/animate-presence-stable-key",
  "local/no-arbitrary-zindex", "local/no-calc-percentage-width", "local/no-dead-href",
  "local/no-double-assertion", "local/no-gradient-text", "local/no-jsx-logical-and",
  "local/no-nested-component-definition", "local/no-overshoot-easing", "local/no-placeholder-alt",
  "local/no-raw-font-feature-tag", "local/no-side-stripe-border", "local/no-unjustified-disable",
  "local/no-user-scalable-no", "local/require-dialog-title", "local/will-change-discipline",
  "local/no-decorative-glow", "local/no-raw-gradient", "local/animate-presence-exit",
  "local/no-dynamic-tailwind-class", "local/no-scroll-listener-motion", "local/no-space-x-y",
  "local/react19-api", "local/require-focus-replacement", "local/no-sparkle-ai-marker",
  "local/icon-size-grid", "local/no-pill-radius-on-static", "local/max-button-words",
  "local/spacing-scale",
]
const mobileRules = [
  "local/no-comments", "local/spacing-scale", "local/no-gorhom-sheet",
  "local/no-fullbleed-button", "local/animate-presence-exit", "local/animate-presence-stable-key",
  "local/no-arbitrary-zindex", "local/no-double-assertion", "local/no-draggable-onscroll",
  "local/no-jsx-logical-and", "local/no-dynamic-tailwind-class", "local/no-space-x-y",
  "local/require-focus-replacement", "local/will-change-discipline", "local/no-sparkle-ai-marker",
  "local/icon-size-grid", "local/no-pill-radius-on-static", "local/no-oklch-outside-web-tokens",
  "local/no-overshoot-easing", "local/no-raw-font-feature-tag", "local/no-scroll-listener-motion",
  "local/no-side-stripe-border", "local/no-unjustified-disable", "local/no-decorative-glow",
  "local/no-raw-gradient", "local/max-button-words",
]
const sharedRules = [
  "local/no-comments", "local/no-double-assertion", "local/spacing-scale",
  "local/no-fullbleed-button", "local/no-unjustified-disable", "local/no-decorative-glow",
  "local/no-overshoot-easing", "local/no-raw-font-feature-tag", "local/no-raw-gradient",
  "local/no-oklch-outside-web-tokens",
]
const scopeInventory = [
  {
    config: "apps/web/eslint.config.mjs",
    globalIgnores: [
      nextIgnores, nextIgnores, nextIgnores,
      [".next/**", "node_modules/**", "coverage/**", "public/**", "*.config.{js,mjs,cjs,ts}"],
    ],
    localBlocks: [
      { files: ["**/*.{ts,tsx}"], ignores: ["**/*.d.ts"], rules: webRules },
      { files: scopedOffAllowlist[0].files, ignores: [], rules: ["local/no-fullbleed-button"] },
      { files: scopedOffAllowlist[1].files, ignores: [], rules: scopedOffAllowlist[1].rules },
    ],
  },
  {
    config: "apps/mobile/eslint.config.js",
    globalIgnores: [
      ["android/app/build"],
      ["dist/**", ".expo/**", "android/**", "ios/**", "modules/*/android/build/**", "eslint.config.js"],
    ],
    localBlocks: [
      { files: ["**/*.{ts,tsx}"], ignores: ["**/*.d.ts"], rules: mobileRules },
      { files: scopedOffAllowlist[2].files, ignores: [], rules: ["local/no-fullbleed-button"] },
      { files: ["**/supabase.ts"], ignores: [], rules: ["local/mobile-supabase-lazy"] },
      { files: scopedOffAllowlist[3].files, ignores: [], rules: scopedOffAllowlist[3].rules },
    ],
  },
  {
    config: "packages/shared/eslint.config.mjs",
    globalIgnores: [["node_modules/**", "dist/**", "coverage/**", "src/types/__generated__/**", "*.config.{js,mjs,cjs,ts}"]],
    localBlocks: [
      { files: ["src/**/*.{ts,tsx}"], ignores: ["**/*.d.ts"], rules: sharedRules },
      { files: scopedOffAllowlist[4].files, ignores: [], rules: scopedOffAllowlist[4].rules },
    ],
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
const scopeProblems = []
let localRuleCount = 0

const compareScope = (configName, label, actual, expected) => {
  if (!Array.isArray(actual) || !actual.every((pattern) => typeof pattern === "string")) {
    scopeProblems.push(`${configName} ${label}: missing or invalid glob list`)
    return
  }
  if (sameStrings(actual, expected)) return
  const added = actual.filter((pattern) => !expected.includes(pattern))
  const removed = expected.filter((pattern) => !actual.includes(pattern))
  scopeProblems.push(`${configName} ${label}: added ${added.join(", ") || "none"}; removed ${removed.join(", ") || "none"}`)
}

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
  const inventory = scopeInventory.find((entry) => entry.config === configName)
  const globalIgnores = blocks.filter((block) => block.ignores !== undefined && block.files === undefined && block.rules === undefined)
  const localBlocks = blocks.filter((block) => Object.keys(block.rules ?? {}).some((rule) => rule.startsWith("local/")))
  if (!inventory && (globalIgnores.length > 0 || localBlocks.length > 0)) {
    scopeProblems.push(`${configName}: undeclared scope for ${globalIgnores.length} top-level ignores block(s) and ${localBlocks.length} local rule block(s)`)
  }
  if (inventory) {
    if (globalIgnores.length !== inventory.globalIgnores.length) {
      scopeProblems.push(`${configName}: expected ${inventory.globalIgnores.length} top-level ignores block(s), found ${globalIgnores.length}`)
    }
    if (localBlocks.length !== inventory.localBlocks.length) {
      scopeProblems.push(`${configName}: expected ${inventory.localBlocks.length} local rule block(s), found ${localBlocks.length}`)
    }
    globalIgnores.forEach((block, index) => {
      if (block.basePath !== undefined) scopeProblems.push(`${configName} top-level ignores block ${index + 1}: undeclared basePath ${block.basePath}`)
      if (inventory.globalIgnores[index]) compareScope(configName, `top-level ignores block ${index + 1}`, block.ignores, inventory.globalIgnores[index])
      else scopeProblems.push(`${configName} top-level ignores block ${index + 1}: undeclared ${JSON.stringify(block.ignores)}`)
    })
    localBlocks.forEach((block, index) => {
      const declared = inventory.localBlocks[index]
      if (!declared) {
        scopeProblems.push(`${configName} local rule block ${index + 1}: undeclared files ${JSON.stringify(block.files)}`)
        return
      }
      if (block.basePath !== undefined) scopeProblems.push(`${configName} local rule block ${index + 1}: undeclared basePath ${block.basePath}`)
      compareScope(configName, `local rule block ${index + 1} files`, block.files, declared.files)
      compareScope(configName, `local rule block ${index + 1} ignores`, block.ignores ?? [], declared.ignores)
      for (const rule of declared.rules) {
        if (!Object.hasOwn(block.rules, rule)) {
          scopeProblems.push(`${configName} local rule block ${index + 1}: missing declared ${rule}`)
        }
      }
    })
  }
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

const discoveredConfigs = new Set(configPaths.map(normalizedRelativePath))
for (const entry of scopeInventory) {
  if (!discoveredConfigs.has(entry.config)) {
    scopeProblems.push(`${entry.config}: inventoried config is missing, so its declared local rule scopes are no longer enforced`)
  }
}

const suppressionFiles = new Set(
  repositoryFiles
    .filter((path) => basename(path) === "eslint-suppressions.json")
    .map(normalizedRelativePath),
)

const suppressionTargetPattern = /--suppressions-location(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s"']+))/g
const hasShellExpansion = (target) =>
  /[$`*?\[]/.test(target)
  || target.startsWith("~")
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

if (scopeProblems.length > 0) {
  console.error(`Lint scopes failed: ${scopeProblems.length} undeclared scope change(s).`)
  for (const problem of scopeProblems) console.error(`  ${problem}`)
}

const hasSuppressionFindings = suppressionFiles.size > 0 || suppressionLocationProblems.length > 0
if (hasSuppressionFindings) {
  const paths = [...suppressionFiles].sort()
  if (paths.length > 0) {
    console.error(`Lint suppressions failed: ${paths.length} baseline file(s) exist.`)
    for (const path of paths) console.error(`  ${path}`)
  }
  if (suppressionLocationProblems.length > 0) {
    console.error(`Lint suppression locations failed: ${suppressionLocationProblems.length} unsafe target declaration(s).`)
    for (const problem of suppressionLocationProblems) console.error(`  ${problem}`)
  }
  console.error("A local rule ships at error with zero violations, or it does not ship. Fix the violations rather than recording them.")
}

if (severityProblems.length > 0 || scopeProblems.length > 0 || hasSuppressionFindings) process.exit(1)
console.log(`check-lint-severity: checked ${localRuleCount} local rule setting(s) across ${configPaths.length} config(s).`)
