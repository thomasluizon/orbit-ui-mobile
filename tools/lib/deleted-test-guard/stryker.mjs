/** One StrykerJS run of the guard, in place, from the repository root of a checkout. */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import { runBounded } from "../bounded-process.mjs"
import { GENERATED_CONFIG, writeGeneratedConfig } from "./vitest.mjs"

/** `mutate`: `Map<file from the repository root, { start, end }[]>`. Returns the `--mutate` entries with line ranges. */
export const mutateEntries = (mutate) => [...mutate].flatMap(([file, ranges]) => ranges.map(({ start, end }) => `${file}:${start}-${end}`))

export const strykerConfig = ({ vitestConfig, workspace, mutate, incrementalFile, reportFile, force, concurrency, tempDirName }) => ({
  testRunner: "vitest",
  // The Vitest runner ignores coverageAnalysis and always reads per test coverage. The setting only documents the choice.
  coverageAnalysis: "perTest",
  vitest: { configFile: vitestConfig, dir: workspace, pool: "forks" },
  // A throwaway checkout of CI holds the files, and the working copy keeps the paths that the tests read.
  inPlace: true,
  incremental: true,
  incrementalFile,
  force,
  mutate: mutateEntries(mutate),
  reporters: ["json"],
  jsonReporter: { fileName: reportFile },
  concurrency,
  tempDirName,
  timeoutMS: 15000,
  cleanTempDir: true,
})

/**
 * Runs Stryker on `mutate` with the tests of one project. `incrementalFile` is read when it exists and written after the run.
 * The result holds `report` (the parsed JSON report, or null) and `status` (the exit status, or `timeout`).
 */
export const runStryker = async ({ checkout, workspace, project, tests, mutate, incrementalFile, reportFile, force = false, concurrency, workDirectory, name, timeoutMs }) => {
  mkdirSync(workDirectory, { recursive: true })
  const vitestConfig = writeGeneratedConfig({ checkout, workspace, project, include: tests.map((file) => relative(workspace, file)), coverageDirectory: join(workDirectory, `${name}-coverage`) })
  const config = strykerConfig({ vitestConfig, workspace, mutate, incrementalFile, reportFile, force, concurrency, tempDirName: `.stryker-guard-tmp-${name}` })
  const configPath = join(checkout, `.stryker-guard-${name}.conf.json`)
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
  const bin = join(checkout, "node_modules", "@stryker-mutator", "core", "bin", "stryker.js")
  const result = await runBounded(process.execPath, [bin, "run", configPath], { cwd: checkout, env: process.env, timeoutMs })
  const report = existsSync(reportFile) && !result.timedOut ? JSON.parse(readFileSync(reportFile, "utf8")) : null
  return { report, status: result.timedOut ? "timeout" : result.status, output: `${result.stdout}${result.stderr}`.slice(-3000), vitestConfig, generated: GENERATED_CONFIG }
}
