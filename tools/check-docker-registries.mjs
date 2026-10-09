#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: check-docker-registries.mjs [--root <path>]

  Requires an explicit registry host in every tracked Dockerfile FROM image.
  Allows scratch and references to earlier build stages. Variable image references
  must be replaced with explicit registry paths so the source can be checked.
  Reads working-tree contents; takes no stdin.

  --root <path>  repository root (defaults to the parent of this tool's directory)
  --help, -h     print this usage and exit 0

exit codes: 0 all image sources explicit, 1 implicit image source, 2 usage or read error`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

let repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const argumentsToParse = process.argv.slice(2)
if (argumentsToParse.length > 0) {
  if (argumentsToParse.length !== 2 || argumentsToParse[0] !== "--root" || argumentsToParse[1].startsWith("-")) {
    console.error(USAGE)
    process.exit(2)
  }
  repositoryRoot = resolve(argumentsToParse[1])
}

const inspectDockerfile = (filename, contents) => {
  const stages = new Set()
  const violations = []
  const escape = contents.match(/^\s*#\s*escape\s*=\s*([\\`])\s*$/im)?.[1] ?? "\\"
  let instruction = ""
  let instructionLine = 0
  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    if (!instruction) instructionLine = index + 1
    const continued = trimmed.endsWith(escape)
    instruction += `${continued ? trimmed.slice(0, -1) : trimmed} `
    if (continued) continue
    const from = instruction.match(/^FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?\s*$/i)
    instruction = ""
    if (!from) continue
    const [, image, stage] = from
    const host = image.split("/")[0]
    const explicitRegistry = image.includes("/") && !image.includes("$") && (host.includes(".") || host.includes(":") || host === "localhost")
    if (image !== "scratch" && !stages.has(image.toLowerCase()) && !explicitRegistry) {
      violations.push(`${filename}:${instructionLine}: FROM ${image} needs an explicit registry host`)
    }
    if (stage) stages.add(stage.toLowerCase())
  }
  return violations
}

try {
  const trackedFiles = execFileSync("git", ["ls-files", "-z"], { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    .split("\0")
    .filter((filename) => /^(?:Dockerfile(?:\..+)?|.+\.Dockerfile)$/i.test(basename(filename)))
  const violations = trackedFiles.flatMap((filename) => inspectDockerfile(filename, readFileSync(join(repositoryRoot, filename), "utf8")))
  if (violations.length > 0) {
    console.error(violations.join("\n"))
    process.exit(1)
  }
  console.log(`Checked ${trackedFiles.length} tracked Dockerfile(s): image registries are explicit`)
} catch (error) {
  console.error(`check-docker-registries: ${error.message}`)
  process.exit(2)
}
