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
  const { jobs } = workflow("test")
  const aggregate = Object.values(jobs).find((job) => job.name === "Upgrade layout geometry")
  assert.equal(aggregate.if, "${{ !cancelled() && github.event_name == 'pull_request' && needs.plan.outputs.web == 'true' }}")
  assert.deepEqual(aggregate.needs, ["plan", "build", "layout-shards"])
  const step = aggregate.steps.find((candidate) => candidate.env?.BUILD_RESULT)
  assert.equal(step.env.BUILD_RESULT, "${{ needs.build.result }}")
  assert.equal(step.env.SHARD_RESULT, "${{ needs.layout-shards.result }}")
  for (const build of ["success", "failure", "cancelled", "skipped"]) {
    for (const shards of ["success", "failure", "cancelled", "skipped"]) {
      const result = spawnSync("bash", ["-e", "-c", step.run], {
        env: { ...process.env, BUILD_RESULT: build, SHARD_RESULT: shards },
      })
      assert.equal(result.status === 0, build === "success" && shards === "success", `${build}, ${shards}`)
    }
  }
  const shards = jobs["layout-shards"]
  assert.equal(shards.strategy["fail-fast"], false)
  assert.deepEqual(shards.strategy.matrix.shard, [1, 2, 3, 4, 5, 6, 7, 8])
  assert.deepEqual(shards.needs, ["plan", "build"])
  assert.equal(shards.steps.some((step) => step.run?.includes("build:hermetic")), false)
  assert.ok(shards.steps.some((step) => step.run?.includes("--shard=${{ matrix.shard }}/${{ matrix.total }}")))
})
