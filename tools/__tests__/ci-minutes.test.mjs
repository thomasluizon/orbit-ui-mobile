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

test("no aggregate layout job repeats a red layout shard, and a shard runs only without a pass", () => {
  const { jobs } = workflow("test")
  assert.equal(Object.values(jobs).some((job) => job.name === "Upgrade layout geometry"), false)
  assert.equal(Object.values(jobs).some((job) => job.name === "Authed Today Lighthouse budget"), false)
  const shards = jobs["layout-shards"]
  assert.equal(shards.strategy["fail-fast"], false)
  assert.equal(shards.strategy.matrix.shard, "${{ fromJSON(needs.plan.outputs.layout-pending || '[]') }}")
  assert.match(shards.if, /needs\.plan\.outputs\.layout-pending != '\[\]'/)
  assert.deepEqual(shards.needs, ["plan", "build"])
  assert.equal(shards.steps.some((step) => step.run?.includes("build:hermetic")), false)
  assert.ok(shards.steps.some((step) => step.run?.includes('--test-list "$RUNNER_TEMP/layout-shards/shard-${{ matrix.shard }}.txt" --max-failures=3')))
})
