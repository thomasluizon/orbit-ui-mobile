import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import yaml from "js-yaml"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")
const workflow = (path) => yaml.load(read(`.github/workflows/${path}.yml`))

test("the layout check rejects failed, cancelled and skipped prerequisites", () => {
  const layout = workflow("layout")
  const aggregate = Object.values(layout.jobs).find((job) => job.name === "Upgrade layout geometry")
  assert.equal(aggregate.if, "${{ always() }}")
  assert.deepEqual(aggregate.needs, ["build", "shards"])
  const step = aggregate.steps.find((candidate) => candidate.env?.BUILD_RESULT)
  assert.equal(step.env.BUILD_RESULT, "${{ needs.build.result }}")
  assert.equal(step.env.SHARD_RESULT, "${{ needs.shards.result }}")
  for (const build of ["success", "failure", "cancelled", "skipped"]) {
    for (const shards of ["success", "failure", "cancelled", "skipped"]) {
      const result = spawnSync("bash", ["-e", "-c", step.run], {
        env: { ...process.env, BUILD_RESULT: build, SHARD_RESULT: shards },
      })
      assert.equal(result.status === 0, build === "success" && shards === "success", `${build}, ${shards}`)
    }
  }
  assert.equal(layout.jobs.shards.strategy["fail-fast"], false)
  assert.deepEqual(layout.jobs.shards.strategy.matrix.shard, [1, 2, 3])
  assert.equal(layout.jobs.shards.needs, "build")
  assert.equal(layout.jobs.shards.steps.some((step) => step.run?.includes("build:hermetic")), false)
  assert.ok(layout.jobs.shards.steps.some((step) => step.run?.includes("--shard=${{ matrix.shard }}/3")))
  assert.ok(layout.on.pull_request.paths.includes("apps/web/**"))
})

test("CI gives sequential workspace suites the host while local worker caps stay bounded", () => {
  for (const path of ["apps/web", "apps/mobile", "packages/shared"]) {
    for (const ci of [false, true]) {
      const env = { ...process.env }
      if (ci) env.CI = "true"
      else delete env.CI
      const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
        `import config from './${path}/vitest.config.ts'; console.log(JSON.stringify((config.default ?? config).test))`], {
        cwd: root, env, encoding: "utf8",
      })
      assert.equal(result.status, 0, result.stderr)
      const config = JSON.parse(result.stdout)
      assert.equal(config.maxWorkers, ci ? "100%" : "25%", `${path}, CI=${ci}`)
      for (const project of config.projects ?? []) {
        if (["chromium", "mobile-focus"].includes(project.test.name)) assert.equal(project.test.maxWorkers, 1)
      }
    }
  }
  for (const name of ["test", "sonarcloud"]) {
    const owner = Object.values(workflow(name).jobs).find((job) => job.steps?.some((step) => step.run?.includes("turbo run test")))
    assert.ok(owner.steps.some((step) => step.run === "npx turbo run test --concurrency=1 -- --coverage"))
  }
})

test("branch analysis runs nightly for both branches and PR coverage analysis stays present", () => {
  const nightly = workflow("sonarcloud")
  assert.equal(nightly.on.push, undefined)
  assert.ok(nightly.on.schedule.length)
  assert.ok(Object.hasOwn(nightly.on, "workflow_dispatch"))
  assert.deepEqual(nightly.jobs.sonarcloud.strategy.matrix.branch, ["main", "redesign/main"])
  assert.ok(workflow("test").jobs.sonarcloud.steps.some((step) => step.uses?.startsWith("SonarSource/sonarqube-scan-action@")))
})

test("mutation reporting stays off PRs and executes the full nightly set", () => {
  const mutation = workflow("mutation")
  assert.equal(mutation.on.pull_request, undefined)
  assert.ok(mutation.on.schedule.length)
  assert.ok(Object.hasOwn(mutation.on, "workflow_dispatch"))
  assert.ok(mutation.jobs.nightly.steps.some((step) => step.run === "npm run mutation -- --force"))
  assert.ok(mutation.jobs.nightly.steps.some((step) => step.with?.name === "mutation-report-nightly"))
})

test("parallel layout leaves local scheduling unchanged", () => {
  for (const ci of [false, true]) {
    const env = { ...process.env, LAYOUT: "1" }
    if (ci) env.CI = "true"
    else delete env.CI
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
      "import config from './apps/web/playwright.config.ts'; const layout = config.default ?? config; console.log(JSON.stringify({workers:layout.workers, fullyParallel:layout.fullyParallel}))"], {
      cwd: root, env, encoding: "utf8",
    })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), { workers: ci ? 2 : 1, fullyParallel: ci })
  }
})
