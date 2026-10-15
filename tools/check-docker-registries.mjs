#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const USAGE = `usage: check-docker-registries.mjs [--root <path>]

  Requires an explicit registry host in every tracked Dockerfile FROM image.
  Allows scratch, earlier build stages, and global ARG image references whose
  literal defaults include explicit registry hosts. Unresolved variables fail.
  Requires the same explicit hosts in docker/build-push-action build-args
  overrides of global ARGs referenced by tracked Dockerfile FROM instructions,
  and rejects quoted build-args forms and CSV-quoted build-args entries
  whose decoded value it cannot read.
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

const hasExplicitRegistry = (image) => {
  const host = image.split("/")[0]
  return image.includes("/") && !image.includes("$") && (host.includes(".") || host.includes(":") || host === "localhost")
}

const inspectDockerfile = (filename, contents, imageArguments) => {
  const stages = new Set()
  const globalArguments = new Map()
  let beforeFirstStage = true
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
    const argument = instruction.match(/^ARG\s+([A-Za-z_][A-Za-z0-9_]*)(?:=(\S+))?\s*$/i)
    if (beforeFirstStage && argument) globalArguments.set(argument[1], argument[2])
    const from = instruction.match(/^FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?\s*$/i)
    instruction = ""
    if (!from) continue
    beforeFirstStage = false
    const [, image, stage] = from
    const variable = image.match(/^\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))$/)
    const argumentName = variable?.[1] ?? variable?.[2]
    if (globalArguments.has(argumentName)) imageArguments.add(argumentName)
    const resolvedImage = (variable && globalArguments.get(variable[1] ?? variable[2])) || image
    if (image !== "scratch" && !stages.has(image.toLowerCase()) && !hasExplicitRegistry(resolvedImage)) {
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
      list.push({ line: index + 1, indent, lines: [{ text: line.replace("- ", "  "), number: index + 1 }] })
    } else if (list.length > 0) {
      list.at(-1).lines.push({ text: line, number: index + 1 })
    }
  }
  return lists
}

const stepProperty = (step, key, input = false) => {
  const indent = step.indent + (input ? 4 : 2)
  const pattern = new RegExp(`^ {${indent}}${key}:\\s*(.*?)\\s*(?:\\s+#.*)?$`)
  let start = 0
  if (input) {
    const withIndex = step.lines.findIndex(({ text }) => new RegExp(`^ {${step.indent + 2}}with:\\s*(?:#.*)?$`).test(text))
    if (withIndex === -1) return undefined
    start = withIndex + 1
  }
  for (let index = start; index < step.lines.length; index++) {
    const { text } = step.lines[index]
    if (input && text.match(/^ */)[0].length < indent) break
    const match = text.match(pattern)
    if (match) return { value: match[1].replace(/^(["'])(.*)\1$/, "$2"), raw: match[1], index }
  }
  return undefined
}

const stepValue = (step, key, input = false) => stepProperty(step, key, input)?.value

const inspectBuildArguments = (filename, step, imageArguments) => {
  const property = stepProperty(step, "build-args", true)
  if (!property) return []
  const number = step.lines[property.index].number
  const quote = property.raw[0]
  if ((quote === '"' || quote === "'") && (property.raw.length < 2 || !property.raw.endsWith(quote) || (quote === '"' && property.raw.includes("\\")))) {
    return [`${filename}:${number}: build-args uses a quoted YAML form this guard cannot read; write it as a plain value or a literal block`]
  }
  let lines = [{ text: property.value, number }]
  if (/^[|>](?:[1-9][+-]?|[+-][1-9]?)?$/.test(property.value)) {
    lines = step.lines.slice(property.index + 1)
    const end = lines.findIndex(({ text }) => text.match(/^ */)[0].length <= step.indent + 4)
    if (end !== -1) lines = lines.slice(0, end)
  }
  const violations = []
  for (const { text, number } of lines) {
    const entry = text.trim()
    if (entry.startsWith('"')) {
      violations.push(`${filename}:${number}: build-args entry ${entry} uses CSV quoting this guard cannot read; write it unquoted`)
      continue
    }
    const argument = entry.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (argument && imageArguments.has(argument[1]) && !hasExplicitRegistry(argument[2])) {
      violations.push(`${filename}:${number}: build-args ${argument[1]}=${argument[2]} needs an explicit registry host`)
    }
  }
  return violations
}

const inspectWorkflow = (filename, contents, imageArguments) => {
  const violations = []
  for (const steps of workflowStepLists(contents)) {
    const dockerDriver = steps.some((step) => /^docker\/setup-buildx-action@/.test(stepValue(step, "uses") ?? "") && stepValue(step, "driver", true) === "docker")
    for (const step of steps) {
      const action = stepValue(step, "uses") ?? ""
      if (!/^docker\/build-push-action@/.test(action)) continue
      violations.push(...inspectBuildArguments(filename, step, imageArguments))
      if (dockerDriver && stepValue(step, "push", true) === "true" && stepValue(step, "provenance", true) !== "false") {
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
  const imageArguments = new Set()
  const violations = [
    ...dockerfiles.flatMap((filename) => inspectDockerfile(filename, readFileSync(join(repositoryRoot, filename), "utf8"), imageArguments)),
    ...workflows.flatMap((filename) => inspectWorkflow(filename, readFileSync(join(repositoryRoot, filename), "utf8"), imageArguments)),
  ]
  if (violations.length > 0) {
    console.error(violations.join("\n"))
    process.exit(1)
  }
  console.log(`Checked ${dockerfiles.length} tracked Dockerfile(s): image registries are explicit; checked ${workflows.length} workflow(s): image build arguments use explicit registries; docker driver pushes disable provenance`)
} catch (error) {
  console.error(`check-docker-registries: ${error.message}`)
  process.exit(2)
}
