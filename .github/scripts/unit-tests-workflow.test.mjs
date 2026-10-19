import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import yaml from "js-yaml"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const workflow = yaml.load(readFileSync(resolve(root, ".github/workflows/test.yml"), "utf8"))

test("Unit Tests rejects failed, cancelled and skipped redesign prerequisites", () => {
  const gate = workflow.jobs["unit-tests"]
  assert.equal(gate.name, "Unit Tests")
  assert.equal(gate.if, "${{ always() }}")
  assert.deepEqual(gate.needs, ["build", "web-tests", "workspace-tests"])
  const step = gate.steps.find((candidate) => candidate.name === "Require every test job")
  for (const build of ["success", "failure", "cancelled", "skipped"]) {
    for (const web of ["success", "failure", "cancelled", "skipped"]) {
      for (const workspaces of ["success", "failure", "cancelled", "skipped"]) {
        const result = spawnSync("bash", ["-e", "-c", step.run], {
          env: { ...process.env, BASE_REF: "redesign/main", BUILD_RESULT: build, WEB_RESULT: web, WORKSPACE_RESULT: workspaces },
        })
        assert.equal(result.status === 0, [build, web, workspaces].every((value) => value === "success"), `${build}, ${web}, ${workspaces}`)
      }
    }
  }
  const main = spawnSync("bash", ["-e", "-c", step.run], {
    env: { ...process.env, BASE_REF: "main", BUILD_RESULT: "success", WEB_RESULT: "skipped", WORKSPACE_RESULT: "skipped" },
  })
  assert.equal(main.status, 0, main.stderr)
})

test("redesign distributes Chromium without increasing browser concurrency on a runner", () => {
  const web = workflow.jobs["web-tests"]
  assert.equal(web.if, "github.base_ref == 'redesign/main'")
  assert.equal(web.needs, undefined)
  assert.equal(web.strategy["fail-fast"], false)
  assert.deepEqual(web.strategy.matrix.project, ["chromium"])
  assert.deepEqual(web.strategy.matrix.shard, [1, 2, 3, 4, 5, 6, 7, 8])
  assert.deepEqual(web.strategy.matrix.total, [8])
  assert.deepEqual(web.strategy.matrix.include, [{ project: "jsdom", shard: 1, total: 1 }])
  const run = web.steps.find((step) => step.name === "Run web shard with coverage").run
  assert.match(run, /--project=\$\{\{ matrix.project \}\}/)
  assert.match(run, /--shard=\$\{\{ matrix.shard \}\}\/\$\{\{ matrix.total \}\}/)
  assert.match(run, /--reporter=blob/)
  assert.match(run, /--reporter=json/)
  assert.doesNotMatch(run, /maxWorkers|fileParallelism|passWithNoTests/)
  const upload = web.steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"))
  assert.equal(upload.if, "${{ always() }}")
  assert.equal(upload.with["include-hidden-files"], true)
  assert.equal(upload.with["if-no-files-found"], "error")
})

test("all other workspaces retain coverage and Sonar consumes the combined artifact", () => {
  const workspaces = workflow.jobs["workspace-tests"]
  assert.equal(workspaces.if, "github.base_ref == 'redesign/main'")
  assert.equal(workspaces.needs, undefined)
  assert.ok(workspaces.steps.some((step) => step.run === "npx turbo run test --filter='!@orbit/web' --concurrency=1 -- --coverage"))
  const gate = workflow.jobs["unit-tests"]
  const merge = gate.steps.find((step) => step.name === "Merge web reports and enforce coverage thresholds")
  assert.match(merge.run, /--merge-reports=/)
  assert.match(merge.run, /--coverage/)
  assert.doesNotMatch(merge.run, /thresholds|--project|--shard|--reporter=blob/)
  assert.ok(gate.steps.some((step) => step.with?.name === "unit-test-coverage"))
  assert.equal(workflow.jobs.sonarcloud.needs, "unit-tests")
  assert.ok(workflow.jobs.sonarcloud.steps.some((step) => step.with?.name === "unit-test-coverage"))
})

test("real Vitest reports combine project coverage and reject incomplete coverage", { timeout: 120_000 }, () => {
  const directory = mkdtempSync(join(root, ".tmp-unit-reports-"))
  const shardCommand = workflow.jobs["web-tests"].steps.find((step) => step.name === "Run web shard with coverage").run
  const mergeCommand = workflow.jobs["unit-tests"].steps.find((step) => step.name === "Merge web reports and enforce coverage thresholds").run
  const run = (command, expected) => {
    const result = spawnSync("bash", ["-e", "-c", command], { cwd: directory, env: { ...process.env, CI: "true" }, encoding: "utf8", timeout: 30_000 })
    assert.equal(result.status, expected, `${result.stdout}\n${result.stderr}`)
    return result
  }
  try {
    writeFileSync(join(directory, "subject.mjs"), 'export function choose(value) {\n  if (value) {\n    return "chosen"\n  }\n  return "empty"\n}\n')
    for (const project of ["jsdom", "chromium"]) {
      writeFileSync(join(directory, `${project}.test.mjs`), `import { expect, test } from "vitest"\nimport { choose } from "./subject.mjs"\ntest("${project}", () => expect(choose(${project === "jsdom"})).toBe("${project === "jsdom" ? "chosen" : "empty"}"))\n`)
    }
    writeFileSync(join(directory, "vitest.config.mjs"), `export default ${JSON.stringify({ test: {
      environment: "node",
      maxWorkers: 1,
      coverage: { provider: "v8", include: ["subject.mjs"], reporter: ["lcov"], thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 } },
      projects: ["jsdom", "chromium"].map((name) => ({ extends: true, test: { name, include: [`${name}.test.mjs`] } })),
    } })}`)
    for (const project of ["jsdom", "chromium"]) {
      run(shardCommand.replaceAll("${{ matrix.project }}", project).replaceAll("${{ matrix.shard }}", "1").replaceAll("${{ matrix.total }}", "1"), 0)
    }
    const blob = join(directory, ".artifacts/unit-tests/blobs/chromium-1.json")
    const held = join(directory, "held.json")
    renameSync(blob, held)
    const incomplete = run(mergeCommand, 1)
    assert.match(incomplete.stderr, /does not meet global threshold/)
    renameSync(held, blob)
    run(mergeCommand, 0)
    assert.match(readFileSync(join(directory, "coverage/lcov.info"), "utf8"), /SF:subject\.mjs/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
