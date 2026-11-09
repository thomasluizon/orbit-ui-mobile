#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { HANDOFF_PROMPT_MAX_BYTES, HANDOFF_PROMPT_PATH, SPEC_MAX_BYTES, relayDocumentLimit, relayDocumentOversize } from "./lib/handoff-prompt.mjs"

const USAGE = `usage: check-handoff-size.mjs (--files <path>... | --all) [--root <repository>]

  Fails when a relay document is over its byte ceiling: ${HANDOFF_PROMPT_PATH} over
  ${HANDOFF_PROMPT_MAX_BYTES} B, or a spec .claude/specs/<slug>.md over ${SPEC_MAX_BYTES} B. Every other path is ignored,
  so the Guards step passes every changed path. The ceilings live in tools/lib/handoff-prompt.mjs,
  which the handoff commit gate also reads.

  --files <path>...    check these paths, relative to the repository root; a missing relay document is an error
  --all                check ${HANDOFF_PROMPT_PATH} and every spec in the tree
  --root <repository>  read files from this repository instead of the script's repository
  --help, -h           print this usage and exit 0

exit codes: 0 every relay document is within its ceiling, 1 a relay document is over it, 2 usage error or unreadable input`

const fail = (message) => {
  console.error(`${message}\n\n${USAGE}`)
  process.exit(2)
}

const parseArguments = (argv) => {
  const options = { files: null, all: false, root: resolve(dirname(fileURLToPath(import.meta.url)), "..") }
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]
    if (flag === "--help" || flag === "-h") {
      console.log(USAGE)
      process.exit(0)
    }
    if (flag === "--all") {
      options.all = true
    } else if (flag === "--root") {
      const value = argv[++index]
      if (typeof value !== "string" || value === "" || value.startsWith("--")) fail("--root requires a value")
      options.root = resolve(value)
    } else if (flag === "--files") {
      options.files = []
      while (index + 1 < argv.length && !argv[index + 1].startsWith("--")) options.files.push(argv[++index])
      if (options.files.length === 0) fail("--files requires at least one path")
    } else {
      fail(`unknown argument: ${flag}`)
    }
  }
  if (options.all === (options.files !== null)) fail("pass exactly one of --files or --all")
  return options
}

const repositoryPath = (root, path) => relative(root, resolve(root, path)).split(sep).join("/")

const treeDocuments = (root) => {
  const specs = existsSync(resolve(root, ".claude/specs"))
    ? readdirSync(resolve(root, ".claude/specs")).filter((name) => name.endsWith(".md")).map((name) => `.claude/specs/${name}`)
    : []
  return [HANDOFF_PROMPT_PATH, ...specs].filter((path) => existsSync(resolve(root, path)))
}

const options = parseArguments(process.argv.slice(2))
const documents = (options.all ? treeDocuments(options.root) : options.files.map((path) => repositoryPath(options.root, path)))
  .filter((path) => relayDocumentLimit(path) !== null)
const problems = []
for (const path of documents) {
  let text
  try {
    text = readFileSync(resolve(options.root, path), "utf8")
  } catch (error) {
    fail(`cannot read ${path}: ${error.message}`)
  }
  const oversize = relayDocumentOversize(path, text)
  if (oversize) problems.push(oversize)
}
if (problems.length > 0) {
  console.error(`Handoff size guard failed. Each document needs:\n${problems.map((problem) => `  ${problem}`).join("\n")}`)
  process.exit(1)
}
console.log(`Handoff size guard passed. ${documents.length} relay document${documents.length === 1 ? "" : "s"} checked.`)
