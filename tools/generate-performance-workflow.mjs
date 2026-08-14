#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const GENERATED_START = "// <generated:performance-measurement>"
export const GENERATED_END = "// </generated:performance-measurement>"

const USAGE = `usage: generate-performance-workflow.mjs (--check | --write)

  Generates the measured-performance block in .claude/workflows/audit.mjs from
  tools/lib/performance-measurement.mjs, the canonical implementation.

  --check  exit 1 when the committed workflow block has drifted
  --write  replace only the generated workflow block
  --help   print this usage and exit 0

exit codes: 0 current or written, 1 generated block drifted, 2 usage error`

export const generatedPerformanceSource = (moduleSource) => moduleSource
  .replace(/\r\n/g, "\n")
  .replace(/^export\s+/gm, "")
  .trimEnd()

export const renderPerformanceWorkflow = (workflowSource, moduleSource) => {
  const normalizedWorkflow = workflowSource.replace(/\r\n/g, "\n")
  const start = normalizedWorkflow.indexOf(GENERATED_START)
  const end = normalizedWorkflow.indexOf(GENERATED_END)
  if (start < 0 || end < start) throw new Error("audit workflow is missing the generated performance markers")
  const generated = `${GENERATED_START}\n${generatedPerformanceSource(moduleSource)}\n${GENERATED_END}`
  return normalizedWorkflow.slice(0, start) + generated + normalizedWorkflow.slice(end + GENERATED_END.length)
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE)
    process.exit(0)
  }
  if (args.length !== 1 || !["--check", "--write"].includes(args[0])) {
    console.error(USAGE)
    process.exit(2)
  }

  const toolsDirectory = dirname(fileURLToPath(import.meta.url))
  const modulePath = resolve(toolsDirectory, "lib", "performance-measurement.mjs")
  const workflowPath = resolve(toolsDirectory, "..", ".claude", "workflows", "audit.mjs")
  const moduleSource = readFileSync(modulePath, "utf8")
  const workflowSource = readFileSync(workflowPath, "utf8")
  const rendered = renderPerformanceWorkflow(workflowSource, moduleSource)
  const current = workflowSource.replace(/\r\n/g, "\n")

  if (args[0] === "--check") {
    if (rendered !== current) {
      console.error("generate-performance-workflow: audit workflow performance block has drifted")
      process.exit(1)
    }
    console.log("generate-performance-workflow: generated block is current")
  } else {
    writeFileSync(workflowPath, rendered)
    console.log("generate-performance-workflow: wrote .claude/workflows/audit.mjs")
  }
}
