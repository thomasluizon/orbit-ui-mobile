import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import yaml from "js-yaml"

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const loadWorkflow = (name) => yaml.load(readFileSync(join(repositoryRoot, `.github/workflows/${name}.yml`), "utf8"))
const workflow = loadWorkflow("guards")
const testWorkflow = loadWorkflow("test")
const guardSteps = () => workflow.jobs.guards.steps
const stepById = (id) => guardSteps().find((step) => step.id === id)

test("Astra eval exports temporary paths before evaluation without job-level runner expressions", () => {
  const astra = loadWorkflow("astra-eval")
  assert.deepEqual(Object.keys(astra.on), ["workflow_dispatch"])
  const job = astra.jobs.evaluate
  assert.doesNotMatch(JSON.stringify(job.env), /runner\.temp/)
  const setup = job.steps[0]
  assert.equal(setup["working-directory"], "${{ runner.temp }}")
  const directory = mkdtempSync(join(tmpdir(), "astra eval paths "))
  try {
    const environmentFile = join(directory, "environment")
    const result = spawnSync("bash", ["-e", "-c", setup.run], {
      cwd: directory,
      env: { ...process.env, RUNNER_TEMP: directory, GITHUB_ENV: environmentFile },
      encoding: "utf8",
    })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(readFileSync(environmentFile, "utf8").trim().split("\n"), [
      `ORBIT_EVAL_RESET_SCRIPT=${directory}/astra-reset.sh`,
      `PROMPTFOO_CONFIG_DIR=${directory}/astra-promptfoo`,
    ])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("Guards checks every workflow with a checksum-pinned actionlint and no baseline", () => {
  const step = stepById("workflow-syntax__1")
  assert.ok(step, "workflow syntax must have a guard")
  assert.equal(step.if, "${{ !cancelled() }}")
  assert.match(step.run, /releases\/download\/v1\.7\.12\/actionlint_1\.7\.12_linux_amd64\.tar\.gz/)
  assert.match(step.run, /8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8/)
  assert.match(step.run, /sha256sum -c/)
  assert.ok(step.run.indexOf("sha256sum -c") < step.run.indexOf("tar -xzf"))
  assert.match(step.run, /actionlint" -shellcheck= -pyflakes= \.github\/workflows\/\*\.yml/)
  assert.doesNotMatch(step.run, /-ignore|\|\| true/)
})

test("script guards share one checkout and install and keep independent failure conditions", () => {
  assert.deepEqual(Object.keys(workflow.jobs), ["guards"])
  assert.equal(workflow.jobs.guards.name, "Guards")
  const steps = guardSteps()
  assert.equal(steps.filter((step) => step.uses?.startsWith("actions/checkout@")).length, 1)
  assert.equal(steps.filter((step) => /^npm ci\b/.test(step.run ?? "")).length, 1)
  for (const step of steps.filter((candidate) => candidate.id?.includes("__"))) {
    assert.ok(step.name, `${step.id} must name the guard`)
    assert.match(step.if, /!cancelled\(\)/, `${step.id} must run after a previous failure`)
    assert.doesNotMatch(step.if, /success\(\)/)
  }
  assert.equal(workflow.concurrency["cancel-in-progress"], true)
})

test("relocated guards retain the main branch commands and label conditions", () => {
  const expected = [
    ["timeless__1", "node tools/check-timeless.mjs --base origin/${{ github.base_ref }}"],
    ["root-allowlist__1", "node tools/check-root-allowlist.mjs"],
    ["root-allowlist__2", "node tools/check-workspace-overrides.mjs"],
    ["root-allowlist__3", "node tools/check-docker-registries.mjs"],
    ["dashes__2", "node tools/check-dashes.mjs --check-baseline"],
    ["copy__1", "node tools/check-copy.mjs --check"],
    ["expo-pin__2", "CI=1 npx expo install --check"],
    ["dependency-audit__1", "npm audit --omit=dev --audit-level=critical"],
    ["contract-drift__1", "orval@8.37.0"],
    ["design-guard__1", "Design token guard passed."],
    ["architecture-map__1", "node tools/arch-map.mjs"],
  ]
  for (const [id, command] of expected) assert.ok(stepById(id)?.run.includes(command), `${id} retains ${command}`)
  assert.equal(stepById("ratchet__1"), undefined)
  assert.equal(stepById("parity__1"), undefined)
  assert.equal(stepById("review-harness__1"), undefined)
  assert.match(stepById("expo-pin__2").if, /steps\.mobile-pkg\.outputs\.changed == 'true'/)
  assert.equal(stepById("expo-pin__2")["working-directory"], "apps/mobile")
})

test("architecture artifacts and React Doctor keep their original contracts", () => {
  assert.equal(existsSync(join(repositoryRoot, ".github/workflows/arch-map.yml")), false)
  assert.equal(existsSync(join(repositoryRoot, ".github/workflows/react-doctor.yml")), false)
  assert.match(stepById("architecture-map__2").run, /cmp -s/)
  const artifact = stepById("architecture-map__3")
  assert.equal(artifact.with.name, "architecture-map")
  assert.equal(artifact.with["if-no-files-found"], "error")
  assert.equal(artifact.with["retention-days"], 14)
  assert.equal(stepById("react-doctor__1")["timeout-minutes"], 15)
  assert.match(stepById("react-doctor__1").run, /react-doctor@0\.7\.6/)
})

test("PR tests delegate guards once and run both complete harnesses", () => {
  for (const id of ["dependency-audit", "design-guard", "contract-drift"]) assert.equal(testWorkflow.jobs[id], undefined)
  const job = testWorkflow.jobs["tool-hook-tests"]
  assert.equal(job.needs, undefined)
  assert.equal(testWorkflow.on.pull_request.paths, undefined)
  for (const command of ["node tools/test-tools.mjs", "node .claude/hooks/test-hooks.mjs", "node --test tools/__tests__/guards-consolidation.test.mjs tools/__tests__/ci-minutes.test.mjs .github/scripts/check-pr-metadata.test.mjs"]) {
    assert.ok(job.steps.some((step) => step.run === command), command)
  }
  assert.equal(stepById("performance-workflow__1").if, "${{ !cancelled() && (github.event_name != 'pull_request') }}")
  assert.ok(readFileSync(join(repositoryRoot, "tools/__tests__/generate-performance-workflow.mjs"), "utf8").includes("renderPerformanceWorkflow(workflowSource, moduleSource) === normalizedWorkflow"))
})
