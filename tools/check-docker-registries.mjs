#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: check-docker-registries.mjs [--root <path>]

  Requires an explicit registry host in every tracked Dockerfile FROM image.
  Allows scratch and references to earlier build stages. Variable image references
  must be replaced with explicit registry paths so the source can be checked.
  Also requires provenance: false on pushing docker/build-push-action steps
  when their steps list sets the docker/setup-buildx-action driver to docker.
  Reads tracked Dockerfiles and .github/workflows YAML as working-tree text,
  splitting steps lists by the indentation of their leading '- '. Takes no stdin.

  --root <path>  repository root (defaults to the parent of this tool's directory)
  --help, -h     print this usage and exit 0

exit codes: 0 checks passed, 1 implicit image source or unsupported provenance, 2 usage or read error`

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

const workflowStepLists = (contents) => {
  const lists = []
  let list = null
  let listIndent = 0
  let stepIndent = 0
  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    if (!line.trim() || line.trim().startsWith("#")) continue
    const indent = line.match(/^ */)[0].length
    if (list && indent <= listIndent) list = null
    if (!list && /^\s*steps:\s*(?:#.*)?$/.test(line)) {
      list = []
      lists.push(list)
      listIndent = indent
      stepIndent = null
      continue
    }
    if (!list) continue
    if (stepIndent === null && line.trimStart().startsWith("- ")) stepIndent = indent
    if (indent === stepIndent && line.trimStart().startsWith("- ")) {
      list.push({ line: index + 1, indent, lines: [line.replace("- ", "  ")] })
    } else if (list.length > 0) {
      list.at(-1).lines.push(line)
    }
  }
  return lists
}

const stepValue = (step, key, input = false) => {
  const indent = step.indent + (input ? 4 : 2)
  const pattern = new RegExp(`^ {${indent}}${key}:\\s*(.*?)\\s*(?:\\s+#.*)?$`)
  let lines = step.lines
  if (input) {
    const withIndex = lines.findIndex((line) => new RegExp(`^ {${step.indent + 2}}with:\\s*(?:#.*)?$`).test(line))
    if (withIndex === -1) return undefined
    lines = lines.slice(withIndex + 1)
    const end = lines.findIndex((line) => line.match(/^ */)[0].length < indent)
    if (end !== -1) lines = lines.slice(0, end)
  }
  const value = lines.map((line) => line.match(pattern)?.[1]).find((value) => value !== undefined)
  return value?.replace(/^(["'])(.*)\1$/, "$2")
}

const inspectWorkflow = (filename, contents) => {
  const violations = []
  for (const steps of workflowStepLists(contents)) {
    const dockerDriver = steps.some((step) => /^docker\/setup-buildx-action@/.test(stepValue(step, "uses") ?? "") && stepValue(step, "driver", true) === "docker")
    if (!dockerDriver) continue
    for (const step of steps) {
      const action = stepValue(step, "uses") ?? ""
      if (/^docker\/build-push-action@/.test(action) && stepValue(step, "push", true) === "true" && stepValue(step, "provenance", true) !== "false") {
        violations.push(`${filename}:${step.line}: ${stepValue(step, "name") ?? action} must set provenance: false for pushes with the docker driver`)
      }
    }
  }
  return violations
}

try {
  const trackedFiles = execFileSync("git", ["ls-files", "-z"], { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    .split("\0")
    .filter(Boolean)
  const dockerfiles = trackedFiles.filter((filename) => /^(?:Dockerfile(?:\..+)?|.+\.Dockerfile)$/i.test(basename(filename)))
  const workflows = trackedFiles.filter((filename) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(filename))
  const violations = [
    ...dockerfiles.flatMap((filename) => inspectDockerfile(filename, readFileSync(join(repositoryRoot, filename), "utf8"))),
    ...workflows.flatMap((filename) => inspectWorkflow(filename, readFileSync(join(repositoryRoot, filename), "utf8"))),
  ]
  if (violations.length > 0) {
    console.error(violations.join("\n"))
    process.exit(1)
  }
  console.log(`Checked ${dockerfiles.length} tracked Dockerfile(s): image registries are explicit; checked ${workflows.length} workflow(s): docker driver pushes disable provenance`)
} catch (error) {
  console.error(`check-docker-registries: ${error.message}`)
  process.exit(2)
}
