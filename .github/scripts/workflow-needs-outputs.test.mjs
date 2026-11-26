import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import yaml from "js-yaml"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const workflowDirectory = join(root, ".github/workflows")
const workflowFiles = readdirSync(workflowDirectory).filter((name) => /\.ya?ml$/.test(name))

// Collect every string value of a parsed workflow, so a reference in any key (if, with, env, run, outputs) counts.
function* strings(node) {
  if (typeof node === "string") yield node
  else if (Array.isArray(node)) for (const item of node) yield* strings(item)
  else if (node && typeof node === "object") for (const value of Object.values(node)) yield* strings(value)
}

// A reference is needs.<job>.outputs.<name> or needs.<job>.outputs['<name>'] or needs['<job>'].outputs.<name>.
const reference = /\bneeds(?:\.([\w-]+)|\['([\w-]+)'\])\.outputs(?:\.([\w-]+)|\['([\w-]+)'\])/g

export function undeclaredOutputs(workflow) {
  const found = []
  for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
    const needed = [job.needs ?? []].flat()
    for (const text of strings(job)) {
      for (const match of text.matchAll(reference)) {
        const source = match[1] ?? match[2]
        const output = match[3] ?? match[4]
        const declared = workflow.jobs[source]?.outputs ?? {}
        if (!needed.includes(source)) found.push(`${jobId}: reads needs.${source}.outputs.${output} but does not list ${source} in needs`)
        else if (!(output in declared)) found.push(`${jobId}: reads needs.${source}.outputs.${output} but ${source} declares no such output`)
      }
    }
  }
  return found
}

test("the detector reports an output that the needed job does not declare", () => {
  const workflow = yaml.load([
    "jobs:",
    "  plan:",
    "    outputs:",
    "      web: ${{ steps.plan.outputs.web }}",
    "  build:",
    "    needs: plan",
    "    if: needs.plan.outputs.web == 'true' && needs.plan.outputs.skip != 'true'",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - run: echo done",
  ].join("\n"))
  assert.deepEqual(undeclaredOutputs(workflow), ["build: reads needs.plan.outputs.skip but plan declares no such output"])
})

for (const name of workflowFiles) {
  test(`${name}: every needs output that a job reads is declared by the job it needs`, () => {
    const workflow = yaml.load(readFileSync(join(workflowDirectory, name), "utf8"))
    assert.deepEqual(undeclaredOutputs(workflow), [])
  })
}
