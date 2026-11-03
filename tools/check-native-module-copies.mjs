#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: check-native-module-copies.mjs [--root <path>]

  After npm ci, discover native packages by android/, ios/, or expo-module.config.json
  in installed packages. Fail when any has multiple paths in package-lock.json,
  including multiple copies of the same version and transitive dependencies.

  --root <path>  repository root (defaults to the parent of this tool's directory)
  --help, -h     print this usage and exit 0

exit codes: 0 one copy per native package, 1 duplicate native package, 2 usage or installation error`

function parseArguments(argv) {
  let repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--help" || argv[index] === "-h") {
      console.log(USAGE)
      process.exit(0)
    }
    if (argv[index] !== "--root" || !argv[index + 1] || argv[index + 1].startsWith("-")) {
      throw new Error(`invalid arguments: ${argv.join(" ")}\n${USAGE}`)
    }
    repositoryRoot = resolve(argv[++index])
  }
  return repositoryRoot
}

function isNativePackage(directory) {
  return existsSync(join(directory, "expo-module.config.json")) ||
    ["android", "ios"].some((platform) => {
      const path = join(directory, platform)
      return existsSync(path) && statSync(path).isDirectory()
    })
}

function inspectLockfile(repositoryRoot) {
  const lockfile = JSON.parse(readFileSync(join(repositoryRoot, "package-lock.json"), "utf8"))
  if (lockfile.lockfileVersion !== 3 || !lockfile.packages || typeof lockfile.packages !== "object") {
    throw new Error("expected package-lock.json with lockfileVersion 3 and a packages map")
  }
  const packages = new Map()
  for (const [path, entry] of Object.entries(lockfile.packages)) {
    if (!path.includes("node_modules/") || entry.link) continue
    const name = path.split("node_modules/").at(-1)
    const directory = join(repositoryRoot, path)
    const installed = existsSync(join(directory, "package.json"))
    if (!installed && !entry.optional) throw new Error(`missing ${path}; run npm ci before checking native modules`)
    const copies = packages.get(name) ?? []
    copies.push({ path, version: entry.version, native: installed && isNativePackage(directory) })
    packages.set(name, copies)
  }
  const nativePackages = [...packages].filter(([, copies]) => copies.some((copy) => copy.native))
  return { nativePackages, duplicates: nativePackages.filter(([, copies]) => copies.length > 1) }
}

try {
  const { nativePackages, duplicates } = inspectLockfile(parseArguments(process.argv.slice(2)))
  if (duplicates.length > 0) {
    console.error("Duplicate native modules in package-lock.json:")
    for (const [name, copies] of duplicates) {
      console.error(`  ${name}`)
      for (const copy of copies) console.error(`    ${copy.path} (${copy.version})`)
    }
    console.error("Align dependency declarations and root overrides, then regenerate the lockfile and run npm ci.")
    process.exitCode = 1
  } else {
    console.log(`Native module copies passed: ${nativePackages.length} native packages each have one lockfile entry.`)
  }
} catch (error) {
  console.error(`check-native-module-copies: ${error.message}`)
  process.exitCode = 2
}
