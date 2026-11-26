import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const script = resolve(dirname(fileURLToPath(import.meta.url)), "record-web-shard-timings.mjs")
// The report of apps/web/vitest/duration-reporter.mjs: one entry for each test file that the shard ran.
const report = (files) => JSON.stringify({ files: Object.entries(files).map(([file, milliseconds]) => ({ project: file.endsWith(".tsx") ? "chromium" : "jsdom", file, milliseconds })) })

function record(reports) {
  const directory = mkdtempSync(join(tmpdir(), "record-web-shard-timings-"))
  try {
    mkdirSync(join(directory, "durations"))
    for (const [name, files] of Object.entries(reports)) writeFileSync(join(directory, "durations", name), report(files))
    const output = join(directory, "shard-timings.json")
    const result = spawnSync(process.execPath, [script, join(directory, "durations"), "43553492530", "--output", output], { encoding: "utf8" })
    const snapshot = result.status === 0 ? JSON.parse(readFileSync(output, "utf8")) : undefined
    return { ...result, snapshot }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test("records one sorted duration map per project with the source run", () => {
  const result = record({
    "chromium-2.json": { "__tests__/b.test.tsx": 2500 },
    "chromium-1.json": { "__tests__/a.test.tsx": 1000.4 },
    "jsdom-1.json": { "__tests__/c.test.ts": 4 },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.snapshot, {
    sourceRun: "43553492530",
    durationMsByFile: {
      chromium: { "__tests__/a.test.tsx": 1000, "__tests__/b.test.tsx": 2500 },
      jsdom: { "__tests__/c.test.ts": 4 },
    },
  })
  assert.deepEqual(Object.keys(result.snapshot.durationMsByFile.chromium), ["__tests__/a.test.tsx", "__tests__/b.test.tsx"])
})

test("rejects a file that two shards ran, an invalid duration and an empty directory", () => {
  const doubled = record({ "chromium-1.json": { "__tests__/a.test.tsx": 1 }, "chromium-2.json": { "__tests__/a.test.tsx": 1 } })
  assert.equal(doubled.status, 1)
  assert.match(doubled.stderr, /ran in two chromium shards/)
  assert.equal(record({ "jsdom-1.json": { "__tests__/a.test.ts": -1 } }).status, 1)
  assert.equal(record({ "jsdom-1.json": {} }).status, 1)
  assert.equal(record({}).status, 1)
})

test("rejects a run id that is not a number and an unknown flag", () => {
  const directory = mkdtempSync(join(tmpdir(), "record-web-shard-timings-"))
  try {
    for (const argumentsList of [[directory, "latest"], [directory, "1", "--write", "x"], [directory]]) {
      assert.equal(spawnSync(process.execPath, [script, ...argumentsList], { encoding: "utf8" }).status, 2, argumentsList.join(" "))
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
