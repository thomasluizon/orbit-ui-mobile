import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const script = resolve(dirname(fileURLToPath(import.meta.url)), "record-vitest-shard-timings.mjs")
// The report of packages/shared/vitest/duration-reporter.mjs: one entry for each test file that the shard ran.
const report = (files) => JSON.stringify({ files: Object.entries(files).map(([file, [milliseconds, testSpanMilliseconds]]) =>
  ({ project: file.endsWith(".tsx") ? "chromium" : "jsdom", file, milliseconds, testSpanMilliseconds })) })

function record(...runs) {
  const directory = mkdtempSync(join(tmpdir(), "record-vitest-shard-timings-"))
  try {
    const pairs = runs.flatMap((reports, index) => {
      const durations = join(directory, String(index), "durations")
      mkdirSync(durations, { recursive: true })
      for (const [name, files] of Object.entries(reports)) writeFileSync(join(durations, name), report(files))
      return [durations, String(43553492530 + index)]
    })
    const output = join(directory, "shard-timings.json")
    const result = spawnSync(process.execPath, [script, "web", ...pairs, "--output", output], { encoding: "utf8" })
    const snapshot = result.status === 0 ? JSON.parse(readFileSync(output, "utf8")) : undefined
    return { ...result, snapshot }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test("records one sorted map of each time per project with the source runs", () => {
  const result = record({
    "chromium-2.json": { "__tests__/b.test.tsx": [2500, 2000] },
    "chromium-1.json": { "__tests__/a.test.tsx": [1000.4, 900] },
    "jsdom-1.json": { "__tests__/c.test.ts": [4, 1] },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.snapshot, {
    sourceRuns: ["43553492530"],
    durationMsByFile: {
      chromium: { "__tests__/a.test.tsx": 1000, "__tests__/b.test.tsx": 2500 },
      jsdom: { "__tests__/c.test.ts": 4 },
    },
    testSpanMsByFile: {
      chromium: { "__tests__/a.test.tsx": 900, "__tests__/b.test.tsx": 2000 },
      jsdom: { "__tests__/c.test.ts": 1 },
    },
  })
  assert.deepEqual(Object.keys(result.snapshot.durationMsByFile.chromium), ["__tests__/a.test.tsx", "__tests__/b.test.tsx"])
})

test("takes the median of each file over several runs, and the mean of the two middle values for an even count", () => {
  const run = (milliseconds, extra = {}) => ({ "jsdom-1.json": { "__tests__/c.test.ts": [milliseconds, milliseconds / 10], ...extra } })
  const odd = record(run(100), run(900), run(120, { "__tests__/new.test.ts": [30, 3] }))
  assert.equal(odd.status, 0, odd.stderr)
  assert.deepEqual(odd.snapshot.durationMsByFile.jsdom, { "__tests__/c.test.ts": 120, "__tests__/new.test.ts": 30 })
  assert.deepEqual(odd.snapshot.testSpanMsByFile.jsdom, { "__tests__/c.test.ts": 12, "__tests__/new.test.ts": 3 })
  assert.equal(record(run(100), run(200)).snapshot.durationMsByFile.jsdom["__tests__/c.test.ts"], 150)
})

test("rejects a file that two shards ran, an invalid duration and an empty directory", () => {
  const doubled = record({ "chromium-1.json": { "__tests__/a.test.tsx": [1, 1] }, "chromium-2.json": { "__tests__/a.test.tsx": [1, 1] } })
  assert.equal(doubled.status, 1)
  assert.match(doubled.stderr, /ran in two chromium shards/)
  assert.equal(record({ "jsdom-1.json": { "__tests__/a.test.ts": [-1, 1] } }).status, 1)
  assert.equal(record({ "jsdom-1.json": { "__tests__/a.test.ts": [1, null] } }).status, 1)
  assert.equal(record({ "jsdom-1.json": {} }).status, 1)
  assert.equal(record({}).status, 1)
})

test("rejects another app, a run id that is not a number, a run with no id and an unknown flag", () => {
  const directory = mkdtempSync(join(tmpdir(), "record-vitest-shard-timings-"))
  try {
    for (const argumentsList of [["desktop", directory, "1"], ["web", directory, "latest"], ["web", directory, "1", "--write", "x"], ["web", directory, "1", directory], ["web"], [directory, "1"]]) {
      assert.equal(spawnSync(process.execPath, [script, ...argumentsList], { encoding: "utf8" }).status, 2, argumentsList.join(" "))
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
