import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import yaml from "js-yaml"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const workflowsDirectory = join(root, ".github/workflows")
const workflows = readdirSync(workflowsDirectory)
  .filter((file) => /\.ya?ml$/.test(file))
  .map((file) => [file, yaml.load(readFileSync(join(workflowsDirectory, file), "utf8"))])
const packageManager = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).packageManager

// setup-node also restores npm automatically when package.json declares its package manager.
// Source: actions/setup-node at 949feb2413d6458794dcd2491c4babbbce0c15c1, src/main.ts.
test("every setup-node npm cache restore has a one-minute segment bound", () => {
  const failures = []
  let restores = 0
  for (const [file, workflow] of workflows) {
    for (const [jobId, job] of Object.entries(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        if (!step.uses?.startsWith("actions/setup-node@")) continue
        const inputs = step.with ?? {}
        const restoresNpm = inputs.cache === "npm" || (!inputs.cache &&
          inputs["package-manager-cache"] !== false && /^npm@/.test(packageManager))
        if (!restoresNpm) continue
        restores++
        const environment = { ...workflow.env, ...job.env, ...step.env }
        if (String(environment.SEGMENT_DOWNLOAD_TIMEOUT_MINS) !== "1") failures.push(`${file}: ${jobId}`)
        assert.equal(step["continue-on-error"], undefined, `${file}: ${jobId} must surface setup failures`)
        assert.equal(step["timeout-minutes"], undefined, `${file}: ${jobId} must let cache timeout continue to npm ci`)
      }
    }
  }
  assert.ok(restores > 0, "the audit must find npm cache restores")
  assert.deepEqual(failures, [], `npm cache restores missing SEGMENT_DOWNLOAD_TIMEOUT_MINS=1:\n${failures.join("\n")}`)
})

test("unit test steps retain their budget with setup and report time outside it", () => {
  const workflow = workflows.find(([file]) => file === "test.yml")[1]
  for (const [jobId, name] of [
    ["web-tests", "Run web shard with coverage"],
    ["workspace-tests", "Run workspace with coverage thresholds"],
  ]) {
    const job = workflow.jobs[jobId]
    const step = job.steps.find((candidate) => candidate.name === name)
    assert.equal(step["timeout-minutes"], 15, `${jobId} owns a separate test budget`)
    assert.equal(job["timeout-minutes"], 25, `${jobId} reserves ten minutes for setup and reports`)
  }
})
