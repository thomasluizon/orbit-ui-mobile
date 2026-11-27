/** The guard: proves for each test file that loses lines that each lost test is dead with its code or ported. */

import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readFileSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { judgeMutants, mutantKey, readMutants, testFilesOf } from "./compare.mjs"
import { mapLine, mapLines, parseDiff, toRanges } from "./diff.mjs"
import { coveredLines, mutationScope, parseLcov } from "./lcov.mjs"
import { findLostTests, isTestFile } from "./lost-tests.mjs"
import { runStryker } from "./stryker.mjs"
import { projectOf, relatedTests, runCoverage } from "./vitest.mjs"

export const DEFAULT_BUDGET_MS = 10 * 60 * 1000
/** A change to one of these files can alter every test, so a test that loads it is no safe reuse. */
const SETUP_FILE = /(?:^|\/)(?:test-setup[^/]*|test-mocks\/.+|__tests__\/setup\.[cm]?[jt]sx?|vitest\/.+)$/

class BudgetExceeded extends Error {}

export const gitDiff = (repo, base, head) =>
  execFileSync("git", ["-c", "core.quotepath=false", "diff", "-U0", "--no-color", "--no-ext-diff", "-M", base, head], { cwd: repo, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })

/** The test files that lose lines between two commits, from git alone. This is the plan of the CI job. */
export const planLostTests = (repo, base, head) => findLostTests(gitDiff(repo, base, head))

const isSource = (path) => !isTestFile(path) && !path.includes("node_modules/") && !path.endsWith(".d.ts") && !path.includes("/__tests__/")

/** A checkout of the base commit in a temporary folder. It shares the dependency folders of the head checkout. */
const prepareBase = (repo, base, workDirectory) => {
  const directory = join(workDirectory, "base")
  execFileSync("git", ["worktree", "add", "--detach", directory, base], { cwd: repo, stdio: "ignore" })
  const link = (path) => {
    if (existsSync(join(repo, path)) && !existsSync(join(directory, path))) symlinkSync(join(repo, path), join(directory, path))
  }
  link("node_modules")
  for (const parent of ["apps", "packages"]) for (const name of readdirSync(join(repo, parent))) link(`${parent}/${name}/node_modules`)
  return directory
}

/**
 * Runs the guard in the checkout `repo` (the head). `base` and `head` are commits. Returns the result object:
 * `verdict` ("none" when no test file loses lines, "pass" or "fail"), `lost`, `failures`, `review` and `budgetExceeded`.
 * `log` receives one line for each step.
 */
export const runGuard = async ({ repo: rawRepo, base, head = "HEAD", budgetMs = DEFAULT_BUDGET_MS, log = () => {}, workDirectory: given, strykerConcurrency }) => {
  const repo = realpathSync(rawRepo)
  const startedAt = Date.now()
  const remaining = () => {
    const left = budgetMs - (Date.now() - startedAt)
    if (left <= 0) throw new BudgetExceeded()
    return left
  }
  const diffText = gitDiff(repo, base, head)
  const changed = parseDiff(diffText)
  const lostTests = findLostTests(diffText)
  const result = { verdict: "none", budgetExceeded: false, lost: [], failures: [], review: [], reused: 0 }
  if (lostTests.length === 0) return result

  const byOldPath = new Map(changed.filter((file) => file.oldPath !== null).map((file) => [file.oldPath, file]))
  const placeOf = (path) => {
    const entry = byOldPath.get(path)
    return { entry, headPath: entry === undefined ? path : entry.newPath, hunks: entry?.hunks ?? [] }
  }
  if (given !== undefined) mkdirSync(given, { recursive: true })
  // A real path: Vitest and Stryker compare the paths of the files that they read.
  const workDirectory = given === undefined ? mkdtempSync(join(realpathSync(tmpdir()), "orbit-deleted-test-guard-")) : realpathSync(given)
  const tracked = lostTests.map((test) => ({ ...test, project: null, covered: new Map(), scope: new Map(), status: "pending" }))
  result.lost = tracked
  const reviewTest = (test, reason, detail = "") => {
    result.review.push({ file: test.file, reason, detail })
    if (test.status === "pending") test.status = "review"
  }
  let baseCheckout = null
  try {
    for (const test of tracked) if (test.workspace === null) reviewTest(test, "unsupported-workspace", "the guard runs only the tests of apps/web and apps/mobile")
    const runnable = tracked.filter((test) => test.workspace !== null)
    if (runnable.length === 0) {
      result.verdict = "pass"
      return result
    }
    baseCheckout = prepareBase(repo, base, workDirectory)
    log(`base checkout ready (${tracked.length} test file(s) lose lines)`)

    // Part 1: the project of each lost test and the source lines that its base version covers.
    for (const test of runnable) {
      test.project = await projectOf({ checkout: baseCheckout, workspace: test.workspace, file: test.file, timeoutMs: remaining() })
      if (test.project === null) {
        reviewTest(test, "no-project", "no Vitest project runs the test file at the base commit")
        continue
      }
      if (test.project === "chromium") reviewTest(test, "chromium", "the file asserts layout, which coverage and mutants cannot see")
      const run = await runCoverage({ checkout: baseCheckout, workspace: test.workspace, project: test.project, tests: [test.file], coverageDirectory: join(workDirectory, `base-coverage-${tracked.indexOf(test)}`), timeoutMs: remaining() })
      if (run.lcov === "") {
        reviewTest(test, "base-run-failed", run.output)
        continue
      }
      for (const [absolute, lines] of parseLcov(run.lcov, join(baseCheckout, test.workspace))) {
        const path = relative(baseCheckout, absolute)
        const covered = coveredLines(lines)
        if (isSource(path) && !path.startsWith("..") && covered.length > 0) {
          test.covered.set(path, covered)
          test.scope.set(path, mutationScope(lines, readFileSync(absolute, "utf8").split("\n").length))
        }
      }
      log(`base coverage ${test.file}: ${[...test.covered.values()].reduce((sum, lines) => sum + lines.length, 0)} line(s)`)
      // A test that covers no source line guards no code, so its loss is nothing to prove.
      if (test.covered.size === 0 && test.status === "pending") test.status = "proven"
    }

    // Parts 2 to 4, one pass for each workspace and project.
    const groups = new Map()
    for (const test of runnable.filter((candidate) => candidate.project !== null && candidate.covered.size > 0)) {
      const key = `${test.workspace}|${test.project}`
      groups.set(key, [...(groups.get(key) ?? []), test])
    }
    let groupIndex = 0
    for (const [key, tests] of groups) {
      groupIndex++
      const [workspace, project] = key.split("|")
      await proveGroup({ strykerConcurrency, repo, baseCheckout, workDirectory, workspace, project, tests, groupIndex, placeOf, changed, remaining, log, result, reviewTest })
    }
    for (const test of runnable) if (test.status === "pending") test.status = "proven"
  } catch (error) {
    if (!(error instanceof BudgetExceeded)) throw error
    result.budgetExceeded = true
    for (const test of tracked) {
      if (test.status === "pending" || test.status === "proven") reviewTest(test, "budget", `the run passed ${Math.round(budgetMs / 60000)} minutes`)
      test.status = test.status === "failed" ? "failed" : "review"
    }
  } finally {
    if (baseCheckout !== null) {
      try {
        execFileSync("git", ["worktree", "remove", "--force", baseCheckout], { cwd: repo, stdio: "ignore" })
      } catch {
        rmSync(baseCheckout, { recursive: true, force: true })
      }
    }
    if (given === undefined) rmSync(workDirectory, { recursive: true, force: true })
  }
  result.verdict = result.failures.length > 0 ? "fail" : "pass"
  for (const test of tracked) if (result.failures.some((failure) => failure.tests.includes(test.file))) test.status = "failed"
  return result
}

/** Parts 2 to 4 for the lost tests of one project. */
const proveGroup = async ({ strykerConcurrency, repo, baseCheckout, workDirectory, workspace, project, tests, groupIndex, placeOf, changed, remaining, log, result, reviewTest }) => {
  const name = `group${groupIndex}`
  const concurrency = project === "chromium" ? 1 : strykerConcurrency
  const failTest = (kind, file, line, detail, owners) => result.failures.push({ kind, file, line, detail, tests: owners.map((test) => test.file) })

  // The covered base lines of each source file, as head lines. A line that the pull request changed leaves the scope.
  const coveredBase = new Map()
  const scopeBase = new Map()
  for (const test of tests) {
    for (const [file, lines] of test.covered) coveredBase.set(file, [...new Set([...(coveredBase.get(file) ?? []), ...lines])])
    for (const [file, lines] of test.scope) scopeBase.set(file, [...new Set([...(scopeBase.get(file) ?? []), ...lines])])
  }
  const headMutate = new Map()
  const baseMutate = new Map()
  const toHead = new Map()
  const changedLines = []
  for (const [file, lines] of coveredBase) {
    const { entry, headPath, hunks } = placeOf(file)
    baseMutate.set(file, toRanges(scopeBase.get(file)))
    if (entry?.status === "deleted") continue
    toHead.set(file, { headPath, hunks })
    const mapped = mapLines(hunks, scopeBase.get(file))
    if (mapped.ranges.length > 0) headMutate.set(headPath, mapped.ranges)
    const lost = mapLines(hunks, lines).changed
    if (lost.length > 0) changedLines.push({ file, lines: lost })
  }
  for (const test of tests) {
    const mine = changedLines.filter((entry) => test.covered.has(entry.file))
    if (mine.length > 0) reviewTest(test, "changed-source-lines", mine.map((entry) => `${entry.file}: ${entry.lines.length} line(s)`).join("; "))
  }

  // Part 2: the head must still cover each line that the lost tests covered.
  const headSources = [...headMutate.keys()]
  const headTests = await relatedTests({ checkout: repo, workspace, project, files: headSources, timeoutMs: remaining() })
  const headCoverage = new Map()
  if (headTests.length > 0) {
    const run = await runCoverage({ checkout: repo, workspace, project, tests: headTests, coverageDirectory: join(workDirectory, `${name}-head-coverage`), timeoutMs: remaining() })
    for (const [absolute, lines] of parseLcov(run.lcov, join(repo, workspace))) headCoverage.set(relative(repo, absolute), lines)
    log(`head coverage ${project}: ${headTests.length} test file(s), exit ${run.status}`)
  }
  for (const test of tests) {
    for (const [file, lines] of test.covered) {
      const target = toHead.get(file)
      if (target === undefined) continue
      const { ranges } = mapLines(target.hunks, lines)
      const lost = ranges.flatMap(({ start, end }) => Array.from({ length: end - start + 1 }, (_, index) => start + index))
        .filter((line) => !((headCoverage.get(target.headPath)?.get(line) ?? 0) > 0))
      for (const range of toRanges(lost)) failTest("coverage", target.headPath, range.start, `lines ${range.start}-${range.end} lose coverage`, [test])
    }
  }

  // Part 3: the mutants that the lost tests killed on the base commit.
  const baseSources = [...baseMutate.keys()]
  const baseTests = await relatedTests({ checkout: baseCheckout, workspace, project, files: baseSources, timeoutMs: remaining() })
  const baseIncremental = join(workDirectory, `${name}-base-incremental.json`)
  const baseRun = await runStryker({ checkout: baseCheckout, workspace, project, tests: baseTests, mutate: baseMutate, incrementalFile: baseIncremental, reportFile: join(workDirectory, `${name}-base-report.json`), concurrency, workDirectory, name: `${name}-base`, timeoutMs: remaining() })
  if (baseRun.report === null) {
    for (const test of tests) reviewTest(test, "base-mutants-failed", baseRun.output)
    return
  }
  const baseMutants = readMutants(baseRun.report)
  log(`base mutants ${project}: ${baseMutants.length}`)

  // Part 4: the same mutants on the head. The base report seeds the incremental run of the head.
  const headIncremental = join(workDirectory, `${name}-head-incremental.json`)
  copyFileSync(baseIncremental, headIncremental)
  const headRun = (suffix, mutate, force) => runStryker({ checkout: repo, workspace, project, tests: headTests, mutate, incrementalFile: headIncremental, reportFile: join(workDirectory, `${name}-head-${suffix}.json`), force, concurrency, workDirectory, name: `${name}-head-${suffix}`, timeoutMs: remaining() })
  if (headMutate.size === 0) return
  const headByKey = new Map()
  if (headTests.length > 0) {
    const first = await headRun("incremental", headMutate, false)
    if (first.report === null) {
      for (const test of tests) reviewTest(test, "head-mutants-failed", first.output)
      return
    }
    for (const mutant of readMutants(first.report)) headByKey.set(`${mutant.file}|${mutantKey(mutant)}`, mutant)
  }

  // The forced mutants: the Stryker differ misses an edit outside the range of a test (a beforeEach, a mock, a shared variable).
  const forcedTests = new Set(tests.map((test) => test.file))
  const helperChanges = changed.filter((file) => file.newPath !== null && !isTestFile(file.newPath) && !headMutate.has(file.newPath)).map((file) => file.newPath)
  const snapshotOwners = helperChanges.filter((path) => path.endsWith(".snap")).map((path) => path.replace("/__snapshots__/", "/").replace(/\.snap$/, ""))
  for (const owner of snapshotOwners) forcedTests.add(owner)
  const importable = helperChanges.filter((path) => !path.endsWith(".snap"))
  if (importable.length > 0) for (const test of await relatedTests({ checkout: repo, workspace, project, files: importable, timeoutMs: remaining() })) forcedTests.add(test)
  if (importable.some((path) => SETUP_FILE.test(path))) for (const test of headTests) forcedTests.add(test)
  const scope = (mutant) => {
    const target = toHead.get(mutant.file)
    if (target === undefined) return { skipped: "source deleted" }
    const lines = Array.from({ length: mutant.location.end.line - mutant.location.start.line + 1 }, (_, index) => mutant.location.start.line + index)
    if (lines.some((line) => mapLine(target.hunks, line) === null)) return { changed: true }
    return { file: target.headPath, startLine: mapLine(target.hunks, mutant.location.start.line), endLine: mapLine(target.hunks, mutant.location.end.line) }
  }
  const forceRanges = (mutants) => {
    const ranges = new Map()
    for (const mutant of mutants) {
      const place = scope(mutant)
      if (place.file !== undefined) ranges.set(place.file, [...(ranges.get(place.file) ?? []), { start: place.startLine, end: place.endLine }])
    }
    return new Map([...ranges].map(([file, list]) => [file, toRanges(list.flatMap(({ start, end }) => Array.from({ length: end - start + 1 }, (_, index) => start + index)))]))
  }
  // No test of the head runs the source: no test can kill a mutant, so each base kill has no coverage.
  if (headTests.length === 0) {
    for (const mutant of baseMutants) {
      const place = scope(mutant)
      if (place.file !== undefined) headByKey.set(`${place.file}|${mutantKey(mutant, place.startLine)}`, { ...mutant, status: "NoCoverage" })
    }
  }
  const killedBase = baseMutants.filter((mutant) => mutant.status === "Killed" || mutant.status === "Timeout")
  const forced = killedBase.filter((mutant) => testFilesOf(baseRun.report, mutant.killedBy).some((file) => forcedTests.has(file)))
  const override = (report) => { for (const mutant of readMutants(report)) headByKey.set(`${mutant.file}|${mutantKey(mutant)}`, mutant) }
  if (forced.length > 0 && headTests.length > 0) {
    const second = await headRun("forced", forceRanges(forced), true)
    if (second.report === null) {
      for (const test of tests) reviewTest(test, "head-mutants-failed", second.output)
      return
    }
    override(second.report)
  }
  let verdict = judgeMutants({ baseMutants, scope, headByKey })
  if (verdict.retry.length > 0) {
    const again = await headRun("retry", forceRanges(verdict.retry.map(({ mutant }) => mutant)), true)
    if (again.report !== null) override(again.report)
    verdict = judgeMutants({ baseMutants, scope, headByKey })
    const stillTimedOut = verdict.retry.length
    verdict.review.push(...verdict.retry.map(({ mutant }) => ({ mutant, reason: "timeout-on-head" })))
    log(`timeout rerun: ${stillTimedOut} mutant(s) still time out`)
  }
  log(`head mutants ${project}: ${verdict.passed.length} killed, ${verdict.failed.length} survived, ${verdict.review.length} for review`)
  for (const { mutant, place } of verdict.failed) {
    const owners = tests.filter((test) => testFilesOf(baseRun.report, mutant.killedBy).includes(test.file))
    failTest("mutant", place.file, place.startLine, `${mutant.mutatorName} survives${mutant.replacement ? ` (${String(mutant.replacement).slice(0, 60)})` : ""}`, owners.length > 0 ? owners : tests)
  }
  for (const { mutant, reason } of verdict.review) {
    const owners = tests.filter((test) => testFilesOf(baseRun.report, mutant.killedBy).includes(test.file))
    for (const test of owners.length > 0 ? owners : tests) reviewTest(test, reason, `${mutant.file}:${mutant.location.start.line} ${mutant.mutatorName}`)
  }
  result.reused += verdict.passed.length
}
