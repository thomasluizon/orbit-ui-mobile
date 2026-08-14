import { readFileSync } from "node:fs"
import { join } from "node:path"

import { REPO_ROOT, T } from "./_harness.mjs"
import {
  GENERATED_END,
  GENERATED_START,
  generatedPerformanceSource,
  renderPerformanceWorkflow,
} from "../generate-performance-workflow.mjs"

export const cases = async () => {
  const moduleSource = readFileSync(join(REPO_ROOT, "tools", "lib", "performance-measurement.mjs"), "utf8")
  const workflowSource = readFileSync(join(REPO_ROOT, ".claude", "workflows", "audit.mjs"), "utf8")
  const normalizedWorkflow = workflowSource.replace(/\r\n/g, "\n")

  T(
    "generate-performance-workflow: the committed workflow is generated from the canonical module",
    renderPerformanceWorkflow(workflowSource, moduleSource) === normalizedWorkflow,
  )
  T(
    "generate-performance-workflow: generation preserves workflow metadata as the first statement",
    normalizedWorkflow.startsWith("export const meta = {")
      && normalizedWorkflow.indexOf(GENERATED_START) > normalizedWorkflow.indexOf("}\n"),
  )
  const generatedBlock = normalizedWorkflow.slice(
    normalizedWorkflow.indexOf(GENERATED_START) + GENERATED_START.length + 1,
    normalizedWorkflow.indexOf(GENERATED_END) - 1,
  )
  T(
    "generate-performance-workflow: the generated block has no module exports in the workflow sandbox",
    generatedBlock === generatedPerformanceSource(moduleSource) && !/^export\s/m.test(generatedBlock),
  )
  const drifted = normalizedWorkflow.replace("const DAYS_PER_MONTH", "const DRIFTED_DAYS_PER_MONTH")
  T(
    "generate-performance-workflow: a one-sided arithmetic edit is detected as drift",
    renderPerformanceWorkflow(drifted, moduleSource) !== drifted,
  )
}
