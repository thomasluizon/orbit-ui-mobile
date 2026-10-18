import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import yaml from "js-yaml"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")
const workflow = (path) => yaml.load(read(`.github/workflows/${path}.yml`))

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
  const steps = nightly.jobs.sonarcloud.steps
  const checkoutIndex = steps.findIndex((step) => step.uses?.startsWith("actions/checkout@"))
  const scanIndex = steps.findIndex((step) => step.uses?.startsWith("SonarSource/sonarqube-scan-action@"))
  const scanArguments = steps[scanIndex].with.args
  assert.ok(scanArguments.includes("-Dsonar.branch.name=${{ matrix.branch }}"))
  const revisionArgument = scanArguments.match(/-Dsonar\.scm\.revision=\$\{\{ steps\.([\w-]+)\.outputs\.([\w-]+) \}\}/)
  assert.ok(revisionArgument, "Sonar must use the checked-out revision through a step output")
  const [, revisionStepId, revisionOutput] = revisionArgument
  const revisionIndex = steps.findIndex((step) => step.id === revisionStepId)
  assert.ok(checkoutIndex >= 0 && checkoutIndex < revisionIndex && revisionIndex < scanIndex)
  assert.equal(steps[checkoutIndex].with.ref, "${{ matrix.branch }}")
  const outputDirectory = mkdtempSync(resolve(tmpdir(), "sonar-revision-"))
  try {
    const outputFile = resolve(outputDirectory, "github-output")
    const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" })
    assert.equal(head.status, 0, head.stderr)
    const revision = spawnSync("bash", ["-e", "-c", steps[revisionIndex].run], {
      cwd: root,
      env: { ...process.env, GITHUB_OUTPUT: outputFile, GITHUB_SHA: "0".repeat(40) },
      encoding: "utf8",
    })
    assert.equal(revision.status, 0, revision.stderr)
    assert.equal(readFileSync(outputFile, "utf8").trim(), `${revisionOutput}=${head.stdout.trim()}`)
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true })
  }
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
