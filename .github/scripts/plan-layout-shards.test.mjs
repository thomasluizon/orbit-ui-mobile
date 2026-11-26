import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

import { coverageDefects, listedTests, partitionTests, testKey, testListLine } from "./plan-layout-shards.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const planner = resolve(here, "plan-layout-shards.mjs")
const recorder = resolve(here, "record-layout-shard-timings.mjs")

// The JSON reporter shape of playwright 1.64.1 (lib/runner/index.js, JSONReporter): file suites hold specs and nested suites;
// each spec holds one test for each project with its projectName and results.
const spec = (file, title, projects = ["layout"], duration = 1000) => ({
  title, file, line: 1, column: 1, id: `${file}-${title}`,
  tests: projects.map((projectName) => ({ projectName, status: "expected", results: [{ status: "passed", duration }] })),
})
const report = {
  config: { rootDir: "/repo/apps/web/e2e" },
  suites: [
    {
      title: "layout/slow.spec.ts", file: "layout/slow.spec.ts", line: 0, column: 0, specs: [],
      suites: [{ title: "slow at 412px", file: "layout/slow.spec.ts", line: 3, column: 1, specs: Array.from({ length: 6 }, (_, index) => spec("layout/slow.spec.ts", `case ${index}`, ["layout"], 9000)) }],
    },
    {
      title: "layout/fast.spec.ts", file: "layout/fast.spec.ts", line: 0, column: 0,
      specs: [spec("layout/fast.spec.ts", "fits"), spec("layout/fast.spec.ts", "fits wide"), spec("layout/fast.spec.ts", "setup only", ["layout-setup"])],
      suites: [{ title: "", file: "layout/fast.spec.ts", line: 9, column: 1, specs: [spec("layout/fast.spec.ts", "in an untitled describe")] }],
    },
  ],
}

test("the report gives each layout test with its file and title path, without other projects or untitled describes", () => {
  assert.deepEqual(listedTests(report).map(testKey), [
    "layout/slow.spec.ts › slow at 412px › case 0", "layout/slow.spec.ts › slow at 412px › case 1",
    "layout/slow.spec.ts › slow at 412px › case 2", "layout/slow.spec.ts › slow at 412px › case 3",
    "layout/slow.spec.ts › slow at 412px › case 4", "layout/slow.spec.ts › slow at 412px › case 5",
    "layout/fast.spec.ts › fits", "layout/fast.spec.ts › fits wide", "layout/fast.spec.ts › in an untitled describe",
  ])
  assert.equal(testListLine(listedTests(report)[0]), "[layout] › layout/slow.spec.ts › slow at 412px › case 0")
})

test("recorded durations spread one slow spec over every shard instead of one contiguous shard", () => {
  const tests = listedTests(report)
  const durations = Object.fromEntries(tests.map((entry) => [testKey(entry), entry.results[0].duration]))
  const shards = partitionTests(tests, durations, 3)
  assert.deepEqual(shards.map((shard) => shard.tests.filter((entry) => entry.file === "layout/slow.spec.ts").length), [2, 2, 2])
  assert.deepEqual(shards.map((shard) => shard.loadMs), [19000, 19000, 19000])
  assert.deepEqual(partitionTests(tests, durations, 3), shards, "every shard job computes the same split")
})

test("a test with no recorded duration costs the mean of the recorded ones", () => {
  const tests = listedTests(report).slice(0, 3)
  const shards = partitionTests(tests, { [testKey(tests[0])]: 4000, [testKey(tests[1])]: 2000 }, 2)
  assert.deepEqual(shards.map((shard) => shard.loadMs), [4000, 5000])
})

test("the coverage check reads lists as Playwright does and finds a test in no list or in two lists", () => {
  const tests = listedTests(report)
  const lines = tests.map(testListLine)
  assert.deepEqual(coverageDefects(tests, [lines.slice(0, 4).join("\n"), lines.slice(4).join("\n")]), [])
  assert.deepEqual(coverageDefects(tests, [lines.slice(0, 4).join("\n"), lines.slice(5).join("\n")]), ["layout/slow.spec.ts › slow at 412px › case 4 matches 0 lists"])
  const describePrefix = "[layout] › layout/slow.spec.ts › slow at 412px"
  assert.equal(coverageDefects(tests, [lines.join("\n"), describePrefix]).length, 6, "a describe line selects every test under it")
  const separatorTitle = [{ file: "layout/a.spec.ts", titles: ["shows a › b"] }]
  assert.deepEqual(coverageDefects(separatorTitle, [separatorTitle.map(testListLine).join("\n")]), ["layout/a.spec.ts › shows a › b matches 0 lists"], "a title Playwright would split fails before the run")
  const padded = [{ file: "layout/a.spec.ts", titles: ["trailing space "] }]
  assert.equal(coverageDefects(padded, [padded.map(testListLine).join("\n")]).length, 1, "a title Playwright would trim fails before the run")
})

const withDirectory = (action) => {
  const directory = mkdtempSync(join(tmpdir(), "plan-layout-shards-"))
  try { return action(directory) } finally { rmSync(directory, { recursive: true, force: true }) }
}

test("the planner writes one list for each shard that together hold every test once", () => withDirectory((directory) => {
  writeFileSync(join(directory, "list.json"), JSON.stringify(report))
  writeFileSync(join(directory, "timings.json"), JSON.stringify({ sourceRun: "1", durationMsByTest: { [testKey(listedTests(report)[0])]: 9000 } }))
  const result = spawnSync(process.execPath, [planner, "--list", join(directory, "list.json"), "--timings", join(directory, "timings.json"), "--shards", "3", "--out-dir", join(directory, "out")], { encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /9 layout tests in 3 lists \(8 at the mean duration\)/)
  const lists = [1, 2, 3].map((index) => readFileSync(join(directory, "out", `shard-${index}.txt`), "utf8"))
  assert.deepEqual(coverageDefects(listedTests(report), lists), [])
  assert.equal(lists.join("").trim().split("\n").length, 9)
}))

test("the planner refuses a report with no layout test and invalid arguments", () => withDirectory((directory) => {
  writeFileSync(join(directory, "empty.json"), JSON.stringify({ suites: [] }))
  writeFileSync(join(directory, "timings.json"), JSON.stringify({ durationMsByTest: {} }))
  const empty = spawnSync(process.execPath, [planner, "--list", join(directory, "empty.json"), "--timings", join(directory, "timings.json"), "--shards", "8", "--out-dir", directory], { encoding: "utf8" })
  assert.equal(empty.status, 1)
  assert.match(empty.stderr, /lists no layout test/)
  for (const argv of [[], ["--shards", "0"], ["--unknown"]]) assert.equal(spawnSync(process.execPath, [planner, ...argv]).status, 2, argv.join(" "))
  assert.equal(spawnSync(process.execPath, [planner, "--help"]).status, 0)
}))

test("the recorder merges every shard report and refuses a test in two reports", () => withDirectory((directory) => {
  const first = { suites: [report.suites[0]] }
  const second = { suites: [report.suites[1]] }
  for (const [name, content] of [["layout-timings-1", first], ["layout-timings-2", second]]) {
    mkdirSync(join(directory, name))
    writeFileSync(join(directory, name, "layout-report.json"), JSON.stringify(content))
  }
  const output = join(directory, "timings.json")
  const result = spawnSync(process.execPath, [recorder, directory, "44216168902", "--output", output], { encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr)
  const recorded = JSON.parse(readFileSync(output, "utf8"))
  assert.deepEqual(recorded.sourceRuns, ["44216168902"])
  assert.equal(Object.keys(recorded.durationMsByTest).length, 9)
  assert.equal(recorded.durationMsByTest["layout/slow.spec.ts › slow at 412px › case 0"], 9000)
  mkdirSync(join(directory, "layout-timings-3"))
  writeFileSync(join(directory, "layout-timings-3", "layout-report.json"), JSON.stringify(second))
  const doubled = spawnSync(process.execPath, [recorder, directory, "1", "--output", output], { encoding: "utf8" })
  assert.equal(doubled.status, 1)
  assert.match(doubled.stderr, /ran in two shards/)
  assert.equal(spawnSync(process.execPath, [recorder, directory]).status, 2)
  assert.equal(spawnSync(process.execPath, [recorder, directory, "1", directory]).status, 2, "each run needs its id")
}))

test("the recorder takes the median of each test over several runs, so one slow runner moves no duration", () => withDirectory((directory) => {
  const runs = [[1000, "1"], [1200, "2"], [9000, "3"]].map(([duration, runId]) => {
    mkdirSync(join(directory, runId))
    const specs = [spec("layout/fast.spec.ts", "fits", ["layout"], duration), ...(runId === "1" ? [spec("layout/fast.spec.ts", "removed later", ["layout"], 50)] : [])]
    writeFileSync(join(directory, runId, "layout-report.json"), JSON.stringify({ suites: [{ title: "layout/fast.spec.ts", file: "layout/fast.spec.ts", specs }] }))
    return [join(directory, runId), runId]
  })
  const output = join(directory, "timings.json")
  const result = spawnSync(process.execPath, [recorder, ...runs.flat(), "--output", output], { encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), {
    sourceRuns: ["1", "2", "3"],
    durationMsByTest: { "layout/fast.spec.ts › fits": 1200, "layout/fast.spec.ts › removed later": 50 },
  })
}))

test("the committed timing file keys each test as the planner does", () => {
  const { sourceRuns, durationMsByTest } = JSON.parse(readFileSync(resolve(here, "../layout-shard-timings.json"), "utf8"))
  assert.ok(sourceRuns.length > 0 && sourceRuns.every((runId) => /^\d+$/.test(runId)), sourceRuns.join())
  const keys = Object.keys(durationMsByTest)
  assert.ok(keys.length > 1000, `${keys.length} recorded tests`)
  for (const key of keys) {
    assert.match(key, /^layout\/[^ ]+\.spec\.ts › /, key)
    assert.ok(Number.isInteger(durationMsByTest[key]) && durationMsByTest[key] >= 0, key)
  }
})
