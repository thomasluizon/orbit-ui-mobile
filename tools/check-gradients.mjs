#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, extname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: check-gradients.mjs [--root <repository>]

  Fails when app source contains a decorative CSS gradient, a retired header
  gradient symbol, or a gradient rendering primitive, and when app CSS draws a
  spinner: a keyframe that turns a full rotation or is named spin, or an
  animation that runs the spin keyframes.

  --root <repository>  scan this repository instead of the script's repository
  --help, -h           print this usage and exit 0

exit codes: 0 no banned gradients or spinners, 1 banned gradient or spinner found, 2 usage error`

const SOURCE_EXTENSIONS = new Set([".cjs", ".css", ".js", ".jsx", ".mjs", ".ts", ".tsx"])
const SKIPPED_DIRECTORIES = new Set([".expo", ".next", "coverage", "dist", "node_modules"])

const allowlist = new Map([
  [
    "apps/web/components/calendar/calendar-agenda-view.tsx",
    {
      gradientLines: [
        /^\s*backgroundImage:\s*'linear-gradient\(var\(--bg-card\), var\(--bg-card\)\)',\s*$/,
        /^\s*'repeating-linear-gradient\(to bottom, var\(--hairline\) 0, var\(--hairline\) 1px, transparent 1px, transparent '\s*\+\s*$/,
      ],
      reason: "The flat card layer makes pinned panes opaque, and the repeating gradient draws structural hour hairlines.",
    },
  ],
  [
    "apps/web/components/calendar/calendar-time-grid.tsx",
    {
      gradientLines: [
        /^\s*backgroundImage:\s*'linear-gradient\(var\(--bg-card\), var\(--bg-card\)\)',\s*$/,
        /^\s*'repeating-linear-gradient\(to bottom, var\(--hairline\) 0, var\(--hairline\) 1px, transparent 1px, transparent '\s*\+\s*$/,
      ],
      reason: "The flat card layer makes pinned panes opaque, and the repeating gradient draws structural hour hairlines.",
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
  return allowlist.get(path)?.gradientLines?.some((pattern) => pattern.test(line)) ?? false
}

/** A full rotation in a `transform: rotate()` function or a `rotate` property. */
const FULL_TURN = /\brotate[XYZ]?\(\s*-?(?:360deg|1turn)\s*\)|\brotate\s*:\s*-?(?:360deg|1turn)\b/
const KEYFRAMES_START = /@keyframes\s+([\w-]+)\s*\{/g
const SPIN_ANIMATION = /\banimation(?:-name)?\s*:[^;{}]*(?<![\w-])spin(?![\w-])/

function lineAt(content, index) {
  return content.slice(0, index).split("\n").length
}

function keyframesBody(content, start) {
  let depth = 1
  let index = start
  while (index < content.length && depth > 0) {
    if (content[index] === "{") depth += 1
    if (content[index] === "}") depth -= 1
    index += 1
  }
  return content.slice(start, index - 1)
}

/** DESIGN.md Bans: no spinner keyframes. Content that loads shows a skeleton, so app CSS never turns an element forever. */
function inspectSpinnerCss(path, content) {
  const violations = []
  for (const match of content.matchAll(KEYFRAMES_START)) {
    const name = match[1]
    if (/spin/i.test(name) || FULL_TURN.test(keyframesBody(content, match.index + match[0].length))) {
      violations.push(`${path}:${lineAt(content, match.index)}: spinner keyframes "${name}"`)
    }
  }
  content.split(/\r?\n/).forEach((line, index) => {
    if (SPIN_ANIMATION.test(line)) violations.push(`${path}:${index + 1}: spinner animation`)
  })
  return violations
}

function inspectFile(repositoryRoot, file) {
  const path = normalizedRelativePath(repositoryRoot, file)
  const content = readFileSync(file, "utf8")
  const violations = extname(file) === ".css" ? inspectSpinnerCss(path, content) : []
  const lines = content.split(/\r?\n/)

  lines.forEach((line, index) => {
    const lineNumber = index + 1
    if (/(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/i.test(line) && !isAllowedGradientLine(path, line)) {
      violations.push(`${path}:${lineNumber}: decorative gradient function`)
    }
    if (/\b(?:GradientTop|gradientHeader(?:From|To)?)\b|--gradient-header\b/.test(line)) {
      violations.push(`${path}:${lineNumber}: retired header gradient symbol`)
    }
    for (const match of line.matchAll(/\b(?:LinearGradient|RadialGradient|linearGradient|radialGradient)\b/g)) {
      violations.push(`${path}:${lineNumber}: ${match[0]} rendering primitive`)
    }
    if (/\b(?:from\s*|import\s*\(\s*|require\(\s*)["']expo-linear-gradient["']/.test(line)) {
      violations.push(`${path}:${lineNumber}: expo-linear-gradient import`)
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
  console.error("DESIGN.md ban: decorative gradients and spinners are not allowed in application source.")
  for (const violation of violations) console.error(violation)
  process.exit(1)
}

console.log(`Gradient guard passed. ${files.length} source files checked.`)
