import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import yaml from "js-yaml"
import { BaseSequencer } from "vitest/node"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const workflow = yaml.load(readFileSync(resolve(root, ".github/workflows/test.yml"), "utf8"))
const chromiumShardCount = workflow.jobs["web-tests"].strategy.matrix.total[0]

test("configured Chromium shards leave room for measured durations, growth and coverage", async () => {
  const web = workflow.jobs["web-tests"]
  const { shard: indexes, total: [count] } = web.strategy.matrix
  assert.deepEqual(indexes, Array.from({ length: count }, (_, index) => index + 1))
  const step = web.steps.find((candidate) => candidate.name === "Run web shard with coverage")
  assert.equal(step["timeout-minutes"], 15)
  const { durationMsByFile } = JSON.parse(readFileSync(join(root, ".github/scripts/fixtures/web-chromium-timings.json"), "utf8"))
  const webRoot = join(root, "apps/web")
  const files = Object.keys(durationMsByFile).map((name) => ({ moduleId: join(webRoot, name) }))
  const selected = []
  for (const index of indexes) {
    const sequencer = new BaseSequencer({ config: { root: webRoot, shard: { index, count } } })
    const shard = await sequencer.shard(files)
    assert.deepEqual(await sequencer.shard([...files].reverse()), shard, "input order must not affect assignment")
    selected.push(...shard)
    const measured = shard.reduce((sum, file) => sum + durationMsByFile[file.moduleId.slice(webRoot.length + 1)], 0)
    // WHY: JSON timings omit setup and coverage work; reserve four minutes plus 25% test growth. https://github.com/thomasluizon/orbit-tickets/issues/1886
    const projected = measured * 1.25 + 240_000
    assert.ok(projected < step["timeout-minutes"] * 60_000, `Chromium ${index}/${count}: ${(measured / 1000).toFixed(3)}s measured, ${(projected / 1000).toFixed(3)}s with headroom exceeds the step limit`)
  }
  assert.equal(selected.length, files.length)
  assert.deepEqual(new Set(selected), new Set(files), "every measured file must run exactly once")
})

test("Unit Tests rejects failed, cancelled and skipped prerequisites for every pull request", () => {
  const gate = workflow.jobs["unit-tests"]
  assert.equal(gate.name, "Unit Tests")
  assert.equal(gate.if, "${{ always() }}")
  assert.deepEqual(gate.needs, ["build", "web-tests", "workspace-tests"])
  const step = gate.steps.find((candidate) => candidate.name === "Require every test job")
  assert.deepEqual(step.env, {
    BUILD_RESULT: "${{ needs.build.result }}",
    WEB_RESULT: "${{ needs.web-tests.result }}",
    WORKSPACE_RESULT: "${{ needs.workspace-tests.result }}",
  })
  for (const build of ["success", "failure", "cancelled", "skipped"]) {
    for (const web of ["success", "failure", "cancelled", "skipped"]) {
      for (const workspaces of ["success", "failure", "cancelled", "skipped"]) {
        const result = spawnSync("bash", ["-e", "-c", step.run], {
          env: { ...process.env, BUILD_RESULT: build, WEB_RESULT: web, WORKSPACE_RESULT: workspaces },
        })
        assert.equal(result.status === 0, [build, web, workspaces].every((value) => value === "success"), `${build}, ${web}, ${workspaces}`)
      }
    }
  }
})

test("every pull request distributes Chromium without increasing browser concurrency on a runner", () => {
  const web = workflow.jobs["web-tests"]
  assert.equal(web.if, undefined)
  assert.equal(web.needs, undefined)
  assert.equal(web.strategy["fail-fast"], false)
  assert.deepEqual(web.strategy.matrix.project, ["chromium"])
  assert.deepEqual(web.strategy.matrix.shard, Array.from({ length: chromiumShardCount }, (_, index) => index + 1))
  assert.deepEqual(web.strategy.matrix.total, [chromiumShardCount])
  assert.deepEqual(web.strategy.matrix.include, [
    { project: "jsdom", shard: 1, total: 2 },
    { project: "jsdom", shard: 2, total: 2 },
  ])
  const run = web.steps.find((step) => step.name === "Run web shard with coverage").run
  assert.match(run, /--project=\$\{\{ matrix.project \}\}/)
  assert.match(run, /--shard=\$\{\{ matrix.shard \}\}\/\$\{\{ matrix.total \}\}/)
  assert.match(run, /--reporter=blob/)
  assert.match(run, /--reporter=json/)
  assert.doesNotMatch(run, /maxWorkers|fileParallelism|passWithNoTests/)
  const upload = web.steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"))
  assert.equal(upload.with.name, "web-unit-shard-${{ matrix.project }}-${{ matrix.shard }}-attempt-${{ github.run_attempt }}")
  assert.equal(upload.if, "${{ always() }}")
  assert.equal(upload.with["include-hidden-files"], true)
  assert.equal(upload.with["if-no-files-found"], "error")
})

test("Unit Tests requires every jsdom and Chromium shard blob and timing report to be nonempty", () => {
  const step = workflow.jobs["unit-tests"].steps.find((candidate) => candidate.name === "Verify every web report arrived")
  assert.equal(step.if, undefined)
  const directory = mkdtempSync(join(root, ".tmp-unit-reports-"))
  const reportRoot = join(directory, "apps/web/.artifacts/unit-tests")
  const reports = ["blobs", "timings"].flatMap(kind => ["jsdom-1.json", "jsdom-2.json", ...Array.from({ length: chromiumShardCount }, (_, index) => `chromium-${index + 1}.json`)].map(name => `${kind}/${name}`))
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

test("every non-web test workspace has an independent coverage job", () => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  const directories = manifest.workspaces.flatMap((pattern) => pattern.endsWith("/*")
    ? readdirSync(join(root, pattern.slice(0, -2)), { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).map((entry) => `${pattern.slice(0, -2)}/${entry.name}`)
    : [pattern])
  const expected = directories.flatMap((directory) => {
    const workspace = JSON.parse(readFileSync(join(root, directory, "package.json"), "utf8"))
    return workspace.scripts?.test && workspace.name !== "@orbit/web"
      ? [{ workspace: workspace.name.replace(/^@orbit\//, ""), directory }]
      : []
  })
  const workspaces = workflow.jobs["workspace-tests"]
  assert.equal(workspaces.if, undefined)
  assert.equal(workspaces.needs, undefined)
  assert.ok(workspaces.strategy, "each non-web test workspace must run in the matrix")
  assert.equal(workspaces.strategy["fail-fast"], false)
  assert.deepEqual(Object.keys(workspaces.strategy.matrix), ["include"])
  const byWorkspace = (left, right) => left.workspace.localeCompare(right.workspace)
  assert.deepEqual([...workspaces.strategy.matrix.include].sort(byWorkspace), expected.sort(byWorkspace))
  assert.equal(workspaces.name, "Workspace unit (${{ matrix.workspace }})")
  assert.ok(workspaces.steps.some((step) => step.run === 'npx turbo run test --filter="@orbit/${{ matrix.workspace }}" --concurrency=1 -- --coverage'))
  const upload = workspaces.steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"))
  assert.equal(upload.with.name, "workspace-unit-coverage-${{ matrix.workspace }}-attempt-${{ github.run_attempt }}")
  assert.equal(upload.with.path, ".artifacts/workspace-coverage")
  assert.equal(upload.with["include-hidden-files"], true)
  assert.equal(upload.with["if-no-files-found"], "error")
})

test("workspace coverage keeps its directory tree and the gate rejects missing reports", () => {
  const workspaces = workflow.jobs["workspace-tests"]
  const stage = workspaces.steps.find((step) => step.name === "Stage workspace coverage").run
  const gate = workflow.jobs["unit-tests"]
  const verify = gate.steps.find((step) => step.name === "Verify coverage reports").run
  const directory = mkdtempSync(join(root, ".tmp-unit-reports-"))
  const run = (command) => spawnSync("bash", ["-e", "-c", command], { cwd: directory, encoding: "utf8" })
  try {
    mkdirSync(join(directory, "apps/web/coverage"), { recursive: true })
    writeFileSync(join(directory, "apps/web/coverage/lcov.info"), "web coverage")
    for (const { directory: workspace } of workspaces.strategy.matrix.include) {
      const coverage = join(directory, workspace, "coverage/lcov.info")
      const staged = join(directory, ".artifacts/workspace-coverage", workspace, "coverage/lcov.info")
      mkdirSync(dirname(coverage), { recursive: true })
      const command = stage.replaceAll("${{ matrix.directory }}", workspace)
      assert.notEqual(run(command).status, 0, `missing ${workspace} coverage must fail staging`)
      writeFileSync(coverage, "")
      assert.notEqual(run(command).status, 0, `empty ${workspace} coverage must fail staging`)
      writeFileSync(coverage, `${workspace} coverage`)
      const result = run(command)
      assert.equal(result.status, 0, result.stderr)
      assert.equal(readFileSync(staged, "utf8"), readFileSync(coverage, "utf8"))
    }
    assert.equal(run(verify).status, 0)
    for (const workspace of ["apps/web", ...workspaces.strategy.matrix.include.map((entry) => entry.directory)]) {
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

test("Unit Tests preserves merged coverage thresholds and Sonar consumes the combined artifact", () => {
  const gate = workflow.jobs["unit-tests"]
  const download = gate.steps.find((step) => step.name === "Download workspace coverage")
  assert.equal(download.if, undefined)
  assert.equal(download.with.pattern, "workspace-unit-coverage-*")
  assert.equal(download.with["merge-multiple"], false)
  assert.equal(download.with.path, ".artifacts/downloads/workspaces")
  const merge = gate.steps.find((step) => step.name === "Merge web reports and enforce coverage thresholds")
  assert.match(merge.run, /--merge-reports=/)
  assert.match(merge.run, /--coverage/)
  assert.doesNotMatch(merge.run, /thresholds|--project|--shard|--reporter=blob/)
  const upload = gate.steps.find((step) => step.with?.name === "unit-test-coverage")
  assert.equal(upload.with["if-no-files-found"], "error")
  for (const directory of ["apps/web", ...workflow.jobs["workspace-tests"].strategy.matrix.include.map((entry) => entry.directory)]) {
    assert.ok(upload.with.path.split("\n").includes(`${directory}/coverage/lcov.info`))
  }
  assert.equal(workflow.jobs.sonarcloud.needs, "unit-tests")
  assert.ok(workflow.jobs.sonarcloud.steps.some((step) => step.with?.name === "unit-test-coverage"))
})

test("Sonar coverage merge normalizes desktop scripts measured by the web workspace", () => {
  const step = workflow.jobs.sonarcloud.steps.find((candidate) => candidate.name === "Merge Coverage Reports")
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

test("aggregate downloads retain attempt directories until selection before verification", () => {
  const steps = workflow.jobs["unit-tests"].steps
  const download = steps.find((step) => step.name === "Download web shard reports")
  assert.equal(download.with["merge-multiple"], false)
  assert.equal(download.with.path, ".artifacts/downloads/web")
  const select = steps.findIndex((step) => step.name === "Select latest report attempts")
  assert.ok(select > steps.indexOf(download))
  assert.ok(select > steps.findIndex((step) => step.name === "Download workspace coverage"))
  assert.ok(select < steps.findIndex((step) => step.name === "Verify every web report arrived"))
  assert.match(steps[select].run, /node tools\/select-artifact-attempts\.mjs --input-dir \.artifacts\/downloads\/web --output-dir apps\/web\/\.artifacts\/unit-tests/)
  assert.match(steps[select].run, /node tools\/select-artifact-attempts\.mjs --input-dir \.artifacts\/downloads\/workspaces --output-dir \./)
})

test("workflow selects partial reruns before the existing missing-report gate", () => {
  const gate = workflow.jobs["unit-tests"].steps
  const directory = mkdtempSync(join(root, ".tmp-unit-reports-"))
  const select = gate.find((step) => step.name === "Select latest report attempts")
  const invoke = (command) => spawnSync("bash", ["-e", "-c", command], { cwd: directory, encoding: "utf8" })
  const stageArtifact = (job, stepName, matrix, attempt, files) => {
    const template = workflow.jobs[job].steps.find((step) => step.uses?.startsWith("actions/upload-artifact@")).with.name
    let name = template.replaceAll("${{ github.run_attempt }}", String(attempt))
    for (const [key, value] of Object.entries(matrix)) name = name.replaceAll(`\${{ matrix.${key} }}`, String(value))
    const download = gate.find((step) => step.name === stepName).with.path
    const artifact = join(directory, download, name)
    for (const [path, contents] of Object.entries(files)) {
      mkdirSync(dirname(join(artifact, path)), { recursive: true })
      writeFileSync(join(artifact, path), contents)
    }
    return artifact
  }
  try {
    assert.ok(select, "aggregate must select attempts before merging reports")
    for (const [project, total] of [["jsdom", 2], ["chromium", chromiumShardCount]]) {
      for (let shard = 1; shard <= total; shard++) {
        stageArtifact("web-tests", "Download web shard reports", { project, shard }, 1, { [`blobs/${project}-${shard}.json`]: "original report", [`timings/${project}-${shard}.json`]: "original timing" })
      }
    }
    const older = stageArtifact("web-tests", "Download web shard reports", { project: "chromium", shard: 10 }, 1, { "stale-only.json": "must not survive" })
    const newer = stageArtifact("web-tests", "Download web shard reports", { project: "chromium", shard: 10 }, 2, { "blobs/chromium-10.json": "passing rerun", "timings/chromium-10.json": "passing timing" })
    for (const { workspace, directory: path } of workflow.jobs["workspace-tests"].strategy.matrix.include) {
      stageArtifact("workspace-tests", "Download workspace coverage", { workspace }, 1, { [`${path}/coverage/lcov.info`]: `${workspace} coverage` })
    }
    const command = select.run.replaceAll("node tools/select-artifact-attempts.mjs", `node "${join(root, "tools/select-artifact-attempts.mjs")}"`)
    const result = invoke(command)
    assert.equal(result.status, 0, result.stderr)
    const reports = join(directory, "apps/web/.artifacts/unit-tests")
    assert.equal(readFileSync(join(reports, "blobs/chromium-10.json"), "utf8"), "passing rerun")
    assert.equal(readdirSync(reports).includes("stale-only.json"), false)
    assert.equal(invoke(gate.find((step) => step.name === "Verify every web report arrived").run).status, 0)
    for (const { workspace, directory: path } of workflow.jobs["workspace-tests"].strategy.matrix.include) {
      assert.equal(readFileSync(join(directory, path, "coverage/lcov.info"), "utf8"), `${workspace} coverage`)
    }
    rmSync(older, { recursive: true })
    rmSync(join(directory, "apps/web"), { recursive: true })
    rmSync(newer, { recursive: true })
    assert.equal(invoke(command).status, 0)
    assert.notEqual(invoke(gate.find((step) => step.name === "Verify every web report arrived").run).status, 0, "a shard missing at every attempt must still fail")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
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
