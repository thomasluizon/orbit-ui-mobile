#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, extname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: check-gradients.mjs [--root <repository>]

  Fails when app source contains a decorative CSS gradient, a retired header
  gradient symbol, or a LinearGradient outside the explicit functional allowlist.

  --root <repository>  scan this repository instead of the script's repository
  --help, -h           print this usage and exit 0

exit codes: 0 no banned gradients, 1 banned gradient found, 2 usage error`

const SOURCE_EXTENSIONS = new Set([".cjs", ".css", ".js", ".jsx", ".mjs", ".ts", ".tsx"])
const SKIPPED_DIRECTORIES = new Set([".expo", ".next", "coverage", "dist", "node_modules"])

const allowlist = new Map([
  [
    "apps/web/app/globals.css",
    {
      gradientLine: /^\s*(?:-webkit-)?mask:\s*radial-gradient\(transparent 58%, black 60%\);\s*$/,
      reason: "The radial mask cuts out the ring center and paints no color.",
    },
  ],
  [
    "apps/web/components/calendar/calendar-agenda-view.tsx",
    {
      gradientLine:
        /^\s*'repeating-linear-gradient\(to bottom, var\(--hairline\) 0, var\(--hairline\) 1px, transparent 1px, transparent '\s*\+\s*$/,
      reason: "The repeating gradient draws the agenda's structural hour hairlines.",
    },
  ],
  [
    "apps/web/components/calendar/calendar-time-grid.tsx",
    {
      gradientLine:
        /^\s*'repeating-linear-gradient\(to bottom, var\(--hairline\) 0, var\(--hairline\) 1px, transparent 1px, transparent '\s*\+\s*$/,
      reason: "The repeating gradient draws the time grid's structural hour hairlines.",
    },
  ],
  [
    "apps/mobile/app/(tabs)/calendar/_components/calendar-loading-bar.tsx",
    {
      linearGradientIdentifier: true,
      expoImport: true,
      reason: "The moving loading indicator communicates progress rather than decorating a surface.",
    },
  ],
  [
    "apps/mobile/test-mocks/react-native-svg.ts",
    {
      linearGradientIdentifier: true,
      reason: "The test-only SVG export paints no application surface.",
    },
  ],
])

function parseArguments(argv) {
  let repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--help" || argument === "-h") {
      console.log(USAGE)
      process.exit(0)
    }
    if (argument === "--root") {
      const value = argv[index + 1]
      if (!value) throw new Error("--root requires a repository path")
      repositoryRoot = resolve(value)
      index += 1
      continue
    }
    throw new Error(`unknown argument: ${argument}`)
  }
  return repositoryRoot
}

function collectSourceFiles(directory) {
  if (!existsSync(directory)) throw new Error(`missing app directory: ${directory}`)
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        files.push(...collectSourceFiles(resolve(directory, entry.name)))
      }
      continue
    }
    if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
      files.push(resolve(directory, entry.name))
    }
  }
  return files
}

function normalizedRelativePath(repositoryRoot, file) {
  return relative(repositoryRoot, file).replaceAll("\\", "/")
}

function isAllowedGradientLine(path, line) {
  return allowlist.get(path)?.gradientLine?.test(line) ?? false
}

function inspectFile(repositoryRoot, file) {
  const path = normalizedRelativePath(repositoryRoot, file)
  const allowance = allowlist.get(path)
  const violations = []
  const lines = readFileSync(file, "utf8").split(/\r?\n/)

  lines.forEach((line, index) => {
    const lineNumber = index + 1
    if (/(?:repeating-)?(?:linear|radial)-gradient\s*\(/i.test(line) && !isAllowedGradientLine(path, line)) {
      violations.push(`${path}:${lineNumber}: decorative gradient function`)
    }
    if (/\b(?:GradientTop|gradientHeader(?:From|To)?)\b|--gradient-header\b/.test(line)) {
      violations.push(`${path}:${lineNumber}: retired header gradient symbol`)
    }
    if (/\bLinearGradient\b/.test(line) && !path.includes("/__tests__/") && !allowance?.linearGradientIdentifier) {
      violations.push(`${path}:${lineNumber}: LinearGradient outside the functional allowlist`)
    }
    if (/\b(?:from\s*|import\s*\(\s*|require\(\s*)["']expo-linear-gradient["']/.test(line) && !allowance?.expoImport) {
      violations.push(`${path}:${lineNumber}: expo-linear-gradient import outside the loading indicator`)
    }
  })

  return violations
}

let repositoryRoot
try {
  repositoryRoot = parseArguments(process.argv.slice(2))
} catch (error) {
  console.error(`check-gradients: ${error.message}\n`)
  console.error(USAGE)
  process.exit(2)
}

let files
try {
  files = ["apps/web", "apps/mobile"].flatMap((path) =>
    collectSourceFiles(resolve(repositoryRoot, path)),
  )
} catch (error) {
  console.error(`check-gradients: ${error.message}`)
  process.exit(2)
}

const violations = files.flatMap((file) => inspectFile(repositoryRoot, file))
if (violations.length > 0) {
  console.error("DESIGN.md ban: decorative gradients are not allowed in application source.")
  for (const violation of violations) console.error(violation)
  process.exit(1)
}

console.log(`Gradient guard passed. ${files.length} source files checked.`)
