#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: check-sonar-paths.mjs

  Fails when sonar-project.properties names a missing literal path.

  --help, -h  print this usage and exit 0

exit codes: 0 all paths exist, 1 a path is missing, 2 usage error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}
if (process.argv.length !== 2) {
  console.error(USAGE)
  process.exit(2)
}

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const properties = readFileSync(join(repositoryRoot, "sonar-project.properties"), "utf8")
const generatedRoots = new Set([".next", ".expo", ".turbo", "dist"])
const missing = []
for (const line of properties.split(/\r?\n/)) {
  const separator = line.indexOf("=")
  if (separator === -1) continue
  const setting = line.slice(0, separator).trim()
  if (!/^sonar\.(?:sources|tests|(?:.*\.)?(?:exclusions|inclusions))$/.test(setting)) continue
  for (const path of line.slice(separator + 1).split(",").map((part) => part.trim())) {
    if (!path) continue
    const segments = path.split("/")
    const globIndex = segments.findIndex((segment) => /[*?{}]/.test(segment))
    const literal = globIndex < 0 ? path : segments.slice(0, globIndex).join("/")
    if (setting === "sonar.exclusions" && globIndex > 0 && generatedRoots.has(literal)) continue
    if (literal && !existsSync(join(repositoryRoot, literal))) {
      missing.push(`${setting}: ${path} (missing ${literal})`)
    }
  }
}
if (missing.length > 0) {
  console.error("sonar-project.properties names missing paths:")
  for (const entry of missing) console.error(`  ${entry}`)
  process.exit(1)
}
