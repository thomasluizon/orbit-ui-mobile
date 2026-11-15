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

// A stalled cache segment would hold the job until its time limit. The bound lets npm ci continue with a cold cache.
// Source of the variable: actions/cache at 55cc8345863c7cc4c66a329aec7e433d2d1c52a9 (v6), dist/restore-only/index.js.
test("every npm cache restore has a one-minute segment bound", () => {
  const action = yaml.load(readFileSync(join(root, ".github/actions/restore-npm-cache/action.yml"), "utf8"))
  const inline = workflows.flatMap(([file, workflow]) => Object.entries(workflow.jobs).flatMap(([jobId, job]) =>
    (job.steps ?? []).filter((step) => step.uses?.startsWith("actions/cache/restore@") && String(step.with.key).startsWith("npm-"))
      .map((step) => [`${file}: ${jobId}`, step])))
  const restores = [["restore-npm-cache", action.runs.steps.find((step) => step.id === "restore")], ...inline]
  assert.equal(restores.length, 6, "the shared action and the five release jobs that restore inline")
  for (const [where, step] of restores) {
    assert.equal(String(step.env?.SEGMENT_DOWNLOAD_TIMEOUT_MINS), "1", `${where} must bound a stalled segment`)
    assert.equal(step["continue-on-error"], undefined, `${where} must surface restore failures`)
    assert.equal(step["timeout-minutes"], undefined, `${where} must let cache timeout continue to npm ci`)
    assert.equal(step.with["fail-on-cache-miss"], undefined, `${where} must let a miss continue to npm ci`)
  }
})

test("unit test steps retain their budget with setup and report time outside it", () => {
  const workflow = workflows.find(([file]) => file === "test.yml")[1]
  for (const [job, stepName, stepMinutes, jobMinutes] of [
    ["web-tests", "Run web shard with coverage", 12, 15],
    ["mobile-tests", "Run mobile shard with coverage", 10, 13],
    ["workspace-tests", "Run workspaces with coverage thresholds", 6, 9],
  ]) {
    const step = workflow.jobs[job].steps.find((candidate) => candidate.name === stepName)
    assert.equal(step["timeout-minutes"], stepMinutes, `${job} owns a separate test budget`)
    assert.equal(workflow.jobs[job]["timeout-minutes"], jobMinutes, `${job} reserves three minutes for setup and reports`)
  }
})
