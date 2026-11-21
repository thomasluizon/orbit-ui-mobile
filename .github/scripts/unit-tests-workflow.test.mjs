import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import yaml from "js-yaml"
import { TimedSequencer } from "../../apps/web/vitest/timed-sequencer.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const workflow = yaml.load(readFileSync(resolve(root, ".github/workflows/test.yml"), "utf8"))
const chromiumShardCount = workflow.jobs["web-tests"].strategy.matrix.total[0]
const jsdomShards = workflow.jobs["web-tests"].strategy.matrix.include
const mobileShardCount = workflow.jobs["mobile-tests"].strategy.matrix.total[0]
const workspaceDirectories = ["apps/desktop", "packages/shared", "eslint-rules"]
const unitSteps = workflow.jobs["unit-tests"].steps
const stepNamed = (steps, name) => steps.find((step) => step.name === name)
const webLegs = [...jsdomShards, ...Array.from({ length: chromiumShardCount }, (_, index) => ({ project: "chromium", shard: index + 1, total: chromiumShardCount }))]
const mobileLegs = Array.from({ length: mobileShardCount }, (_, index) => ({ shard: index + 1, total: mobileShardCount }))
const webReports = ({ project, shard }, label) => ({
  [`apps/web/.artifacts/unit-tests/blobs/${project}-${shard}.json`]: `${label} report`,
  [`apps/web/.artifacts/unit-tests/timings/${project}-${shard}.json`]: `${label} timing`,
})
const mobileReports = ({ shard }, label) => ({ [`apps/mobile/.artifacts/unit-tests/blobs/mobile-${shard}.json`]: `${label} report` })
const workspaceReports = (label) => Object.fromEntries(workspaceDirectories.map((path) => [`${path}/coverage/lcov.info`, `${path} ${label}`]))
const aggregateGroups = [
  ["Download web shard reports", "Select latest web report attempts", "Verify every web report arrived"],
  ["Download mobile shard reports", "Select latest mobile report attempts", "Verify every mobile report arrived"],
  ["Download workspace coverage", "Select latest workspace coverage attempt"],
]
const runIn = (directory, command, environment = {}) => spawnSync("bash", ["-e", "-c", command], { cwd: directory, env: { ...process.env, ...environment }, encoding: "utf8" })
const localTool = (command) => command.replaceAll("node tools/select-artifact-attempts.mjs", `node "${join(root, "tools/select-artifact-attempts.mjs")}"`)
const writeFiles = (directory, files) => {
  for (const [path, contents] of Object.entries(files)) {
    if (existsSync(join(directory, path))) assert.fail(`two artifacts write ${path}, and download-artifact downloads in parallel`)
    mkdirSync(dirname(join(directory, path)), { recursive: true })
    writeFileSync(join(directory, path), contents)
  }
}
const expandExpressions = (template, values) => template.replace(/\$\{\{ ([\w.-]+) \}\}/g, (expression, key) => {
  assert.ok(key in values, `the artifact model cannot resolve ${expression}`)
  return String(values[key])
})

// actions/upload-artifact v7.0.2 src/shared/search.ts roots a one-directory `path` at that directory.
// Runs the steps between the test run and the upload, then returns the artifact's name and files.
const uploadArtifact = (jobId, { attempt, matrix = {}, reports }) => {
  const job = workflow.jobs[jobId]
  const values = { "github.run_attempt": attempt, ...Object.fromEntries(Object.entries(matrix).map(([key, value]) => [`matrix.${key}`, value])) }
  const environment = Object.fromEntries(Object.entries(job.env ?? {}).map(([key, value]) => [key, expandExpressions(value, values)]))
  for (const [key, value] of Object.entries(environment)) values[`env.${key}`] = value
  const uploadIndex = job.steps.findIndex((step) => step.uses?.startsWith("actions/upload-artifact@"))
  const upload = job.steps[uploadIndex]
  assert.equal(upload.uses, "actions/upload-artifact@v7", "the artifact model reads upload-artifact v7")
  assert.doesNotMatch(upload.with.path, /[\n*?]/, "the artifact model covers a one-directory upload path")
  const runner = mkdtempSync(join(root, ".tmp-unit-runner-"))
  try {
    writeFiles(runner, reports)
    const testIndex = job.steps.findLastIndex((step, index) => index < uploadIndex && step.name?.startsWith("Run "))
    for (const step of job.steps.slice(testIndex + 1, uploadIndex)) {
      const result = runIn(runner, expandExpressions(step.run, values), environment)
      assert.equal(result.status, 0, `${step.name}: ${result.stderr}`)
    }
    const artifactRoot = join(runner, upload.with.path)
    const files = Object.fromEntries(readdirSync(artifactRoot, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => [relative(artifactRoot, join(entry.parentPath, entry.name)), readFileSync(join(entry.parentPath, entry.name), "utf8")]))
    return { name: expandExpressions(upload.with.name, values), files }
  } finally {
    rmSync(runner, { recursive: true, force: true })
  }
}

// actions/download-artifact v8.0.2 src/download-artifact.ts extracts at `path` for a name download, for
// merge-multiple: true, or for exactly one match, and under `path/<artifact name>` only for several matches.
const downloadArtifacts = (directory, stepName, artifacts) => {
  const step = stepNamed(unitSteps, stepName)
  assert.equal(step.uses, "actions/download-artifact@v8", "the artifact model reads download-artifact v8")
  assert.match(step.with.pattern, /^[\w-]+\*$/, "the artifact model covers a prefix pattern")
  const matched = artifacts.filter(({ name }) => name.startsWith(step.with.pattern.slice(0, -1)))
  for (const { name, files } of matched) {
    const extractsAtPath = step.with["merge-multiple"] === true || matched.length === 1
    writeFiles(join(directory, step.with.path, extractsAtPath ? "" : name), files)
  }
}
const firstAttemptArtifacts = () => [
  ...webLegs.map((leg) => uploadArtifact("web-tests", { attempt: 1, matrix: leg, reports: webReports(leg, "first") })),
  ...mobileLegs.map((leg) => uploadArtifact("mobile-tests", { attempt: 1, matrix: leg, reports: mobileReports(leg, "first") })),
  uploadArtifact("workspace-tests", { attempt: 1, reports: workspaceReports("first") }),
]
const selectAndVerify = (directory, artifacts) => {
  for (const [download, select, verify] of aggregateGroups) {
    downloadArtifacts(directory, download, artifacts)
    const selected = runIn(directory, localTool(stepNamed(unitSteps, select).run))
    assert.equal(selected.status, 0, `${select}: ${selected.stderr}`)
    if (verify) assert.equal(runIn(directory, stepNamed(unitSteps, verify).run).status, 0, `${verify} must pass`)
  }
}

test("every Chromium shard fits the step time limit with room for growth and coverage", async () => {
  const web = workflow.jobs["web-tests"]
  const { shard: indexes, total: [count] } = web.strategy.matrix
  assert.deepEqual(indexes, Array.from({ length: count }, (_, index) => index + 1))
  const step = stepNamed(web.steps, "Run web shard with coverage")
  assert.equal(step["timeout-minutes"], 16)
  const { durationMsByFile: { chromium: durationMsByFile } } = JSON.parse(readFileSync(join(root, "apps/web/vitest/shard-timings.json"), "utf8"))
  const growthFactor = 1.25
  const webRoot = join(root, "apps/web")
  const files = Object.keys(durationMsByFile).map((name) => ({ moduleId: join(webRoot, name), project: { name: "chromium" } }))
  const selected = []
  for (const index of indexes) {
    const sequencer = new TimedSequencer({ config: { root: webRoot, shard: { index, count } } })
    const shard = await sequencer.shard(files)
    assert.deepEqual(await sequencer.shard([...files].reverse()), shard, "input order must not affect assignment")
    selected.push(...shard)
    const measured = shard.reduce((sum, file) => sum + durationMsByFile[file.moduleId.slice(webRoot.length + 1)], 0)
    // WHY: JSON timings omit setup and coverage work; reserve four minutes plus 25% test growth.
    const projected = measured * growthFactor + 240_000
    assert.ok(projected < step["timeout-minutes"] * 60_000, `Chromium ${index}/${count}: ${(measured / 1000).toFixed(3)}s measured, ${(projected / 1000).toFixed(3)}s with headroom exceeds the step limit`)
  }
  assert.equal(selected.length, files.length)
  assert.deepEqual(new Set(selected), new Set(files), "every measured file must run exactly once")
})

test("every recorded web test duration names a test file that exists", () => {
  const { durationMsByFile } = JSON.parse(readFileSync(join(root, "apps/web/vitest/shard-timings.json"), "utf8"))
  const absentFiles = Object.entries(durationMsByFile).flatMap(([project, files]) =>
    Object.keys(files).filter((file) => !existsSync(join(root, "apps/web", file))).map((file) => `${project}: ${file}`))
  assert.deepEqual(absentFiles, [], "delete the recorded duration of a test file that was deleted or moved")
})

test("an unrecorded file counts as the project median and equal durations still spread by count", async () => {
  const webRoot = join(root, "apps/web")
  const files = Array.from({ length: 12 }, (_, index) => ({ moduleId: join(webRoot, `__tests__/new-${index}.test.tsx`), project: { name: "unrecorded" } }))
  const shards = await Promise.all([1, 2, 3].map((index) => new TimedSequencer({ config: { root: webRoot, shard: { index, count: 3 } } }).shard(files)))
  assert.deepEqual(shards.map((shard) => shard.length), [4, 4, 4])
  assert.deepEqual(new Set(shards.flat()), new Set(files))
})

test("Unit Tests passes only when the plan and every test group passed", () => {
  const gate = workflow.jobs["unit-tests"]
  assert.equal(gate.name, "Unit Tests")
  assert.equal(gate.if, "${{ !cancelled() }}")
  assert.deepEqual(gate.needs, ["plan", "web-tests", "mobile-tests", "workspace-tests"])
  const step = stepNamed(gate.steps, "Require every test job")
  assert.equal(gate.steps.indexOf(step), 0)
  const results = ["success", "failure", "cancelled", "skipped"]
  for (const plan of results) {
    for (const web of results) {
      for (const others of results) {
        const env = { PLAN_RESULT: plan, WEB_RESULT: web, MOBILE_RESULT: others, WORKSPACE_RESULT: "success" }
        const result = spawnSync("bash", ["-e", "-c", step.run], { env: { ...process.env, ...env } })
        assert.equal(result.status === 0, plan === "success" && web === "success" && others === "success", JSON.stringify(env))
      }
    }
  }
})

test("every required check keeps its name, and a path filter never hides it", () => {
  assert.equal(workflow.on.pull_request.paths, undefined)
  const required = { build: "Build", "type-check": "Type Check", lint: "Lint", "unit-tests": "Unit Tests", "tool-tests": "Tool Tests" }
  for (const [id, name] of Object.entries(required)) {
    assert.equal(workflow.jobs[id].name, name)
    assert.equal(workflow.jobs[id].strategy, undefined, `${name} must keep its literal check name when its condition skips it`)
  }
})

test("the SonarCloud scan runs last, after the merged coverage, on a full clone", () => {
  assert.equal(unitSteps.at(-1).uses, "SonarSource/sonarqube-scan-action@59202af334b4ba7b5db01b701b8e79f8b3bef0f4")
  assert.equal(unitSteps.at(-1).if, undefined)
  assert.equal(unitSteps.at(-2).name, "Merge Coverage Reports")
  assert.equal(unitSteps.find((step) => step.uses?.startsWith("actions/checkout@")).with["fetch-depth"], 0, "Sonar reads the new-code blame")
})

test("Unit Tests requires every jsdom and Chromium shard blob and timing report to be nonempty", () => {
  const step = stepNamed(unitSteps, "Verify every web report arrived")
  assert.equal(step.if, "needs.web-tests.result == 'success'")
  const directory = mkdtempSync(join(root, ".tmp-unit-reports-"))
  const reportRoot = join(directory, "apps/web/.artifacts/unit-tests")
  const names = [...jsdomShards.map(({ shard }) => `jsdom-${shard}.json`), ...Array.from({ length: chromiumShardCount }, (_, index) => `chromium-${index + 1}.json`)]
  const reports = ["blobs", "timings"].flatMap((kind) => names.map((name) => `${kind}/${name}`))
  const verify = () => spawnSync("bash", ["-e", "-c", step.run], { cwd: directory, encoding: "utf8" })
  try {
    mkdirSync(join(reportRoot, "blobs"), { recursive: true })
    mkdirSync(join(reportRoot, "timings"), { recursive: true })
    for (const report of reports) writeFileSync(join(reportRoot, report), "{}")
    const complete = verify()
    assert.equal(complete.status, 0, complete.stderr)
    for (const report of reports) {
      const path = join(reportRoot, report)
      const held = join(directory, "held.json")
      renameSync(path, held)
      assert.notEqual(verify().status, 0, `missing ${report} must fail verification`)
      writeFileSync(path, "")
      assert.notEqual(verify().status, 0, `empty ${report} must fail verification`)
      renameSync(held, path)
    }
    assert.equal(verify().status, 0)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("every test workspace runs in exactly one test job", () => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  const directories = manifest.workspaces.flatMap((pattern) => pattern.endsWith("/*")
    ? readdirSync(join(root, pattern.slice(0, -2)), { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).map((entry) => `${pattern.slice(0, -2)}/${entry.name}`)
    : [pattern])
  const tested = directories.filter((directory) => JSON.parse(readFileSync(join(root, directory, "package.json"), "utf8")).scripts?.test).sort()
  assert.deepEqual(tested, ["apps/web", "apps/mobile", ...workspaceDirectories].sort())
  const workspaces = workflow.jobs["workspace-tests"]
  assert.equal(workspaces.strategy, undefined)
  assert.equal(stepNamed(workspaces.steps, "Run workspaces with coverage thresholds").run,
    "./node_modules/.bin/turbo run test --filter=@orbit/desktop --filter=@orbit/shared --filter=@orbit/eslint-rules --concurrency=1 -- --coverage")
  assert.equal(workspaces.env.ARTIFACT_NAME, "workspace-unit-coverage-attempt-${{ github.run_attempt }}")
  const upload = workspaces.steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"))
  assert.equal(upload.with.name, "${{ env.ARTIFACT_NAME }}")
  assert.equal(upload.with.path, ".artifacts/workspace-coverage")
  assert.equal(upload.with["include-hidden-files"], true)
  assert.equal(upload.with["if-no-files-found"], "error")
})

test("workspace coverage keeps its directory tree and the gate rejects missing reports", () => {
  const stage = stepNamed(workflow.jobs["workspace-tests"].steps, "Stage workspace coverage").run
  const verify = stepNamed(unitSteps, "Verify coverage reports").run
  const directory = mkdtempSync(join(root, ".tmp-unit-reports-"))
  const artifactName = "workspace-unit-coverage-attempt-1"
  const run = (command) => spawnSync("bash", ["-e", "-c", command], { cwd: directory, env: { ...process.env, ARTIFACT_NAME: artifactName }, encoding: "utf8" })
  try {
    for (const workspace of ["apps/web", "apps/mobile"]) {
      mkdirSync(join(directory, workspace, "coverage"), { recursive: true })
      writeFileSync(join(directory, workspace, "coverage/lcov.info"), `${workspace} coverage`)
    }
    for (const workspace of workspaceDirectories) mkdirSync(join(directory, workspace, "coverage"), { recursive: true })
    assert.notEqual(run(stage).status, 0, "missing workspace coverage must fail staging")
    for (const workspace of workspaceDirectories) writeFileSync(join(directory, workspace, "coverage/lcov.info"), "")
    assert.notEqual(run(stage).status, 0, "empty workspace coverage must fail staging")
    for (const workspace of workspaceDirectories) writeFileSync(join(directory, workspace, "coverage/lcov.info"), `${workspace} coverage`)
    const staged = run(stage)
    assert.equal(staged.status, 0, staged.stderr)
    for (const workspace of workspaceDirectories) {
      assert.equal(readFileSync(join(directory, ".artifacts/workspace-coverage", artifactName, workspace, "coverage/lcov.info"), "utf8"), `${workspace} coverage`)
    }
    assert.equal(run(verify).status, 0)
    for (const workspace of ["apps/web", "apps/mobile", ...workspaceDirectories]) {
      const coverage = join(directory, workspace, "coverage/lcov.info")
      const held = join(directory, "held.info")
      renameSync(coverage, held)
      assert.notEqual(run(verify).status, 0, `missing ${workspace} coverage must fail the gate`)
      writeFileSync(coverage, "")
      assert.notEqual(run(verify).status, 0, `empty ${workspace} coverage must fail the gate`)
      renameSync(held, coverage)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("Sonar coverage merge normalizes desktop scripts measured by the web workspace", () => {
  const step = stepNamed(unitSteps, "Merge Coverage Reports")
  const directory = mkdtempSync(join(root, ".tmp-unit-reports-"))
  const desktopPath = "apps/desktop/src-tauri/src/palette.js"
  const record = (source) => `TN:\nSF:${source}\nFNF:0\nFNH:0\nDA:1,4\nLF:1\nLH:1\nBRF:0\nBRH:0\nend_of_record\n`
  try {
    mkdirSync(join(directory, "apps/web/coverage"), { recursive: true })
    for (const source of ["../desktop/src-tauri/src/palette.js", "..\\desktop\\src-tauri\\src\\palette.js", "apps/web/../desktop/src-tauri/src/palette.js"]) {
      writeFileSync(join(directory, "apps/web/coverage/lcov.info"), record(source))
      const result = spawnSync("bash", ["-e", "-c", step.run], { cwd: directory, encoding: "utf8" })
      assert.equal(result.status, 0, result.stderr)
      assert.equal(readFileSync(join(directory, "coverage/lcov.info"), "utf8"), record(desktopPath))
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("a first attempt of every test job reaches the coverage gate through the pinned artifact actions", () => {
  const directory = mkdtempSync(join(root, ".tmp-unit-reports-"))
  try {
    selectAndVerify(directory, firstAttemptArtifacts())
    for (const path of workspaceDirectories) assert.equal(readFileSync(join(directory, path, "coverage/lcov.info"), "utf8"), `${path} first`)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("workflow selects partial reruns before the existing missing-report gate", () => {
  const directory = mkdtempSync(join(root, ".tmp-unit-reports-"))
  const rerunLeg = { project: "chromium", shard: 10, total: chromiumShardCount }
  const rerunLegName = uploadArtifact("web-tests", { attempt: 1, matrix: rerunLeg, reports: webReports(rerunLeg, "probe") }).name
  const isRerunLeg = (name) => name === rerunLegName
  try {
    const firstAttempt = firstAttemptArtifacts().map((artifact) => isRerunLeg(artifact.name)
      ? uploadArtifact("web-tests", { attempt: 1, matrix: rerunLeg, reports: { ...webReports(rerunLeg, "failed"), "apps/web/.artifacts/unit-tests/stale-only.json": "must not survive" } })
      : artifact)
    const rerun = [
      uploadArtifact("web-tests", { attempt: 2, matrix: rerunLeg, reports: webReports(rerunLeg, "passing") }),
      uploadArtifact("workspace-tests", { attempt: 2, reports: workspaceReports("second") }),
    ]
    selectAndVerify(directory, [...firstAttempt, ...rerun])
    const reports = join(directory, "apps/web/.artifacts/unit-tests")
    assert.equal(readFileSync(join(reports, "blobs/chromium-10.json"), "utf8"), "passing report")
    assert.equal(readFileSync(join(reports, "timings/chromium-10.json"), "utf8"), "passing timing")
    assert.equal(readdirSync(reports).includes("stale-only.json"), false)
    for (const path of workspaceDirectories) assert.equal(readFileSync(join(directory, path, "coverage/lcov.info"), "utf8"), `${path} second`)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
  const missing = mkdtempSync(join(root, ".tmp-unit-reports-"))
  try {
    downloadArtifacts(missing, "Download web shard reports", firstAttemptArtifacts().filter(({ name }) => !isRerunLeg(name)))
    assert.equal(runIn(missing, localTool(stepNamed(unitSteps, "Select latest web report attempts").run)).status, 0)
    assert.notEqual(runIn(missing, stepNamed(unitSteps, "Verify every web report arrived").run).status, 0, "a shard missing at every attempt must still fail")
  } finally {
    rmSync(missing, { recursive: true, force: true })
  }
})

test("every pattern download in every workflow extracts at one path whatever the match count", () => {
  const workflows = resolve(root, ".github/workflows")
  for (const file of readdirSync(workflows).filter((name) => /\.ya?ml$/.test(name))) {
    for (const [id, job] of Object.entries(yaml.load(readFileSync(join(workflows, file), "utf8")).jobs)) {
      for (const step of job.steps ?? []) {
        if (!step.uses?.startsWith("actions/download-artifact@") || step.with?.pattern === undefined) continue
        assert.equal(step.with["merge-multiple"], true, `${file} ${id} "${step.name ?? step.with.pattern}": without merge-multiple, one match extracts at the path and several matches each get a folder`)
      }
    }
  }
})

test("real Vitest reports combine project coverage and reject incomplete coverage", { timeout: 120_000 }, () => {
  const shardStep = stepNamed(workflow.jobs["web-tests"].steps, "Run web shard with coverage")
  const mergeStep = stepNamed(unitSteps, "Merge web reports and enforce coverage thresholds")
  assert.equal(shardStep["working-directory"], mergeStep["working-directory"])
  // Each command runs the Vitest binary by a path relative to its working directory, so the scratch project takes the place of that directory.
  const directory = mkdtempSync(join(root, dirname(shardStep["working-directory"]), ".tmp-unit-reports-"))
  const shardCommand = shardStep.run
  const mergeCommand = mergeStep.run
  const run = (command, expected) => {
    const result = spawnSync("bash", ["-e", "-c", command], { cwd: directory, env: { ...process.env, CI: "true" }, encoding: "utf8", timeout: 30_000 })
    assert.equal(result.status, expected, `${result.stdout}\n${result.stderr}`)
    return result
  }
  try {
    writeFileSync(join(directory, "subject.mjs"), 'export function choose(value) {\n  if (value) {\n    return "chosen"\n  }\n  return "empty"\n}\n')
    for (const project of ["jsdom-1", "jsdom-2", "chromium"]) {
      const jsdom = project.startsWith("jsdom")
      writeFileSync(join(directory, `${project}.test.mjs`), `import { expect, test } from "vitest"\nimport { choose } from "./subject.mjs"\ntest("${project}", () => expect(choose(${jsdom})).toBe("${jsdom ? "chosen" : "empty"}"))\n`)
    }
    writeFileSync(join(directory, "vitest.config.mjs"), `export default ${JSON.stringify({ test: {
      environment: "node",
      maxWorkers: 1,
      coverage: { provider: "v8", include: ["subject.mjs"], reporter: ["lcov"], thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 } },
      projects: ["jsdom", "chromium"].map((name) => ({ extends: true, test: { name, include: [`${name}*.test.mjs`] } })),
    } })}`)
    for (const { project, shard, total } of [{ project: "jsdom", shard: 1, total: 2 }, { project: "jsdom", shard: 2, total: 2 }, { project: "chromium", shard: 1, total: 1 }]) {
      run(shardCommand.replaceAll("${{ matrix.project }}", project).replaceAll("${{ matrix.shard }}", String(shard)).replaceAll("${{ matrix.total }}", String(total)), 0)
      for (const kind of ["blobs", "timings"]) {
        assert.ok(readFileSync(join(directory, `.artifacts/unit-tests/${kind}/${project}-${shard}.json`), "utf8").length > 0)
      }
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
