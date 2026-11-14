import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"
import test from "node:test"
import yaml from "js-yaml"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")
const workflow = (path) => yaml.load(read(`.github/workflows/${path}.yml`))

function selectsAndroidJob(job, track, result = "success", cancelled = false, branch = "main") {
  const condition = (job.if ?? "success()").replace(/^\$\{\{\s*|\s*\}\}$/g, "")
  const context = {
    inputs: { track },
    github: { ref_name: branch },
    needs: { "publish-design-bundles": { result, outputs: {} } },
    always: () => true,
    cancelled: () => cancelled,
    failure: () => result === "failure",
    success: () => result === "success" && !cancelled,
  }
  const checksStatus = /\b(always|cancelled|failure|success)\s*\(/.test(condition)
  return (checksStatus || context.success()) && runInNewContext(condition, context)
}

test("every Android track builds its embedded bundle without design publication", () => {
  const jobs = workflow("android-release").jobs
  assert.equal(jobs["publish-design-bundles"], undefined)
  const build = jobs["release-android"]
  assert.equal(build.needs, undefined)
  for (const track of ["internal", "open", "production"]) {
    assert.equal(selectsAndroidJob(build, track), true, track)
    assert.equal(selectsAndroidJob(build, track, "success", true), false, track)
  }
  assert.doesNotMatch(JSON.stringify(jobs), /eas-cli|EXPO_TOKEN|"path":"legacy"|"path":"redesign"/)
})

test("Android release branch guards accept internal on every branch and require main for public tracks", () => {
  const jobs = workflow("android-release").jobs
  const buildGuard = jobs["release-android"].steps.find((step) => step.name === "Validate track branch")
  for (const track of ["internal", "open", "production"]) {
    for (const branch of ["main", "integration/next", "feature/release"]) {
      const env = { ...process.env, RELEASE_TRACK: track, GITHUB_REF_NAME: branch }
      const build = spawnSync("bash", ["-e", "-c", buildGuard.run], { env, encoding: "utf8" })
      assert.equal(build.status, track === "internal" || branch === "main" ? 0 : 1, `${track}: ${branch}: ${build.stderr}`)
    }
  }
})

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

test("CI gives each suite runner the host while local worker caps stay bounded", () => {
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
  const workspaces = workflow("test").jobs["workspace-tests"]
  assert.ok(workspaces.steps.some((step) => step.run === 'npx turbo run test --filter="@orbit/${{ matrix.workspace }}" --concurrency=1 -- --coverage'))
})

test("PR coverage analysis stays present", () => {
  assert.ok(workflow("test").jobs.sonarcloud.steps.some((step) => step.uses?.startsWith("SonarSource/sonarqube-scan-action@")))
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
