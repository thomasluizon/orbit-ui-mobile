#!/usr/bin/env node
/**
 * Fail when an npm workspace declares overrides that npm will ignore.
 *
 * npm only applies overrides from the root package.json. Workspace patterns are expanded from
 * that file so the gate follows the repository's declared workspace inventory.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: check-workspace-overrides.mjs [--root <path>]

  Fails when a workspace package.json declares an overrides key.
  npm applies overrides only from the root package.json.

  --root <path>  repository root (defaults to the parent of this tool's directory)
  --help, -h     print this usage and exit 0

exit codes: 0 no workspace overrides, 1 workspace overrides exist, 2 usage or configuration error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

let repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const argumentsToParse = process.argv.slice(2)
while (argumentsToParse.length > 0) {
  const argument = argumentsToParse.shift()
  if (argument !== "--root" || argumentsToParse.length === 0) {
    console.error(`check-workspace-overrides: invalid arguments: ${process.argv.slice(2).join(" ")}\n`)
    console.error(USAGE)
    process.exit(2)
  }
  repositoryRoot = resolve(argumentsToParse.shift())
}

const readPackage = (packagePath) => {
  try {
    return JSON.parse(readFileSync(packagePath, "utf8"))
  } catch (error) {
    console.error(`check-workspace-overrides: cannot read ${packagePath}: ${error.message}`)
    process.exit(2)
  }
}

const rootPackagePath = join(repositoryRoot, "package.json")
const rootPackage = readPackage(rootPackagePath)
const workspacePatterns = Array.isArray(rootPackage.workspaces) ? rootPackage.workspaces : rootPackage.workspaces?.packages

if (!Array.isArray(workspacePatterns) || workspacePatterns.some((pattern) => typeof pattern !== "string" || pattern.length === 0)) {
  console.error("check-workspace-overrides: root package.json must declare workspaces as an array of non-empty paths")
  process.exit(2)
}

const expandWorkspacePattern = (pattern) => {
  if (isAbsolute(pattern) || pattern.split(/[\\/]/).includes("..")) {
    console.error(`check-workspace-overrides: workspace pattern must stay inside the repository: ${pattern}`)
    process.exit(2)
  }

  let candidates = [repositoryRoot]
  for (const segment of pattern.split(/[\\/]/).filter(Boolean)) {
    if (segment !== "*" && /[*?\[\]{}!]/.test(segment)) {
      console.error(`check-workspace-overrides: unsupported workspace pattern segment: ${segment}`)
      process.exit(2)
    }
    candidates = candidates.flatMap((candidate) => {
      if (segment !== "*") return [join(candidate, segment)]
      if (!existsSync(candidate)) return []
      return readdirSync(candidate, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(candidate, entry.name))
    })
  }
  return candidates.filter((candidate) => existsSync(join(candidate, "package.json")))
}

const workspacePackagePaths = [...new Set(workspacePatterns.flatMap(expandWorkspacePattern).map((workspace) => join(workspace, "package.json")))]
const offenders = workspacePackagePaths
  .filter((packagePath) => Object.hasOwn(readPackage(packagePath), "overrides"))
  .map((packagePath) => relative(repositoryRoot, packagePath).split(sep).join("/"))
  .sort()

if (offenders.length > 0) {
  console.error("Workspace overrides violation: npm ignores overrides outside the root package.json block.")
  for (const offender of offenders) console.error(`  ${offender}`)
  process.exit(1)
}
