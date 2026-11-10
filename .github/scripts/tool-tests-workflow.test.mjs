import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import yaml from "js-yaml"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const workflow = yaml.load(readFileSync(resolve(root, ".github/workflows/test.yml"), "utf8"))

test("Tool and Hook Tests keeps its required name and rejects a failed, cancelled or skipped shard or hook run", () => {
  const gate = workflow.jobs["tool-hook-tests"]
  assert.equal(gate.name, "Tool and Hook Tests")
  assert.equal(gate.if, "${{ always() }}")
  assert.deepEqual(gate.needs, ["tool-tests", "hook-tests"])
  const step = gate.steps.find((candidate) => candidate.name === "Require every tool shard and the hook tests")
  assert.deepEqual(step.env, {
    TOOL_RESULT: "${{ needs.tool-tests.result }}",
    HOOK_RESULT: "${{ needs.hook-tests.result }}",
  })
  for (const tool of ["success", "failure", "cancelled", "skipped"]) {
    for (const hook of ["success", "failure", "cancelled", "skipped"]) {
      const result = spawnSync("bash", ["-e", "-c", step.run], { env: { ...process.env, TOOL_RESULT: tool, HOOK_RESULT: hook } })
      assert.equal(result.status === 0, tool === "success" && hook === "success", `${tool}, ${hook}`)
    }
  }
})

test("tool shards number from one to the total and each runs its own --shard share", () => {
  const job = workflow.jobs["tool-tests"]
  const { shard: indexes, total: [count] } = job.strategy.matrix
  assert.equal(job.strategy["fail-fast"], false)
  assert.deepEqual(indexes, Array.from({ length: count }, (_, index) => index + 1))
  assert.ok(job.steps.some((step) => step.run === "node tools/test-tools.mjs --shard ${{ matrix.shard }}/${{ matrix.total }}"))
})

test("the shard jobs run the checks the single job ran before", () => {
  const hook = workflow.jobs["hook-tests"]
  assert.equal(hook.needs, undefined)
  const commands = hook.steps.map((step) => step.run ?? "")
  assert.ok(commands.some((command) => command === "node .claude/hooks/test-hooks.mjs"))
  assert.ok(commands.some((command) => command.includes("tools/__tests__/guards-changed-paths.test.mjs")))
  assert.ok(commands.some((command) => command.includes(".github/scripts/tool-tests-workflow.test.mjs")))
})
