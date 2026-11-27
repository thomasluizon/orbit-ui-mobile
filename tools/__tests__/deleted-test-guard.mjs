import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { judgeMutants, mutantKey, testFilesOf } from "../lib/deleted-test-guard/compare.mjs"
import { mapLine, mapLines, parseDiff, toRanges } from "../lib/deleted-test-guard/diff.mjs"
import { coveredLines, mutationScope, parseLcov } from "../lib/deleted-test-guard/lcov.mjs"
import { findLostTests, isTestFile, workspaceOf } from "../lib/deleted-test-guard/lost-tests.mjs"
import { groupReview, guardMarker, renderComment, renderSummary } from "../lib/deleted-test-guard/report.mjs"
import { runGuard } from "../lib/deleted-test-guard/guard.mjs"
import { REPO_ROOT, T, root, same, toolPath } from "./_harness.mjs"

const git = (cwd, ...args) => execFileSync("git", ["-c", "user.email=gate@orbit.test", "-c", "user.name=Orbit Gate", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })

const SOURCES = {
  "packages/shared/src/clamp.ts": `export function clamp(value: number, low: number, high: number): number {
  if (value < low) return low
  if (value > high) return high
  return value
}
`,
  "apps/web/lib/add.ts": `export function add(a: number, b: number): number {
  return a + b
}
`,
  "apps/web/lib/sub.ts": `export function sub(a: number, b: number): number {
  return a - b
}
`,
  "apps/web/lib/limit.ts": `import { clamp } from '../../../packages/shared/src/clamp'

export function limit(value: number): number {
  return clamp(value, 0, 10)
}
`,
  "apps/web/lib/layout.ts": `export function columns(width: number): number {
  return width > 600 ? 2 : 1
}
`,
  "apps/web/__tests__/add.test.ts": `import { add } from '../lib/add'

describe('add', () => {
  it('adds', () => {
    expect(add(1, 2)).toBe(3)
  })
})
`,
  "apps/web/__tests__/sub.test.ts": `import { sub } from '../lib/sub'

describe('sub', () => {
  it('subtracts', () => {
    expect(sub(5, 2)).toBe(3)
  })
})
`,
  "apps/web/__tests__/limit.test.ts": `import { limit } from '../lib/limit'

describe('limit', () => {
  it('limits', () => {
    expect(limit(20)).toBe(10)
    expect(limit(-5)).toBe(0)
    expect(limit(4)).toBe(4)
  })
})
`,
  "apps/web/__tests__/layout.test.ts": `import { columns } from '../lib/layout'

describe('layout', () => {
  it('uses two columns on a wide screen', () => {
    expect(columns(800)).toBe(2)
    expect(columns(300)).toBe(1)
  })
})
`,
  "apps/web/vitest.config.ts": `import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    projects: [
      { extends: true, test: { name: 'jsdom', include: ['__tests__/**/*.test.ts'], exclude: ['__tests__/layout.test.ts'] } },
      { extends: true, test: { name: 'chromium', include: ['__tests__/layout.test.ts'] } },
    ],
    coverage: { provider: 'v8', include: ['lib/**/*.ts'], thresholds: { lines: 100 } },
  },
})
`,
  "package.json": `{ "name": "fixture", "private": true, "type": "module" }\n`,
}

/** A repository with one commit named `main` and a Vitest config of two projects and a shared folder. */
const stageRepository = () => {
  const repository = join(root, "deleted-test-guard-fixture")
  for (const [path, body] of Object.entries(SOURCES)) {
    mkdirSync(dirname(join(repository, path)), { recursive: true })
    writeFileSync(join(repository, path), body)
  }
  symlinkSync(join(REPO_ROOT, "node_modules"), join(repository, "node_modules"))
  writeFileSync(join(repository, ".gitignore"), "node_modules\n.stryker-guard*\nstryker-setup-*\n")
  git(repository, "init", "-q", "--initial-branch=main")
  git(repository, "add", "-A")
  git(repository, "commit", "-q", "-m", "base")
  return repository
}

/** Starts a branch from `main` and applies the changes: a path with a string body writes it, a path with null deletes it. */
const branch = (repository, name, changes) => {
  git(repository, "checkout", "-q", "-f", "main")
  git(repository, "clean", "-fdq", "-e", "node_modules")
  git(repository, "checkout", "-q", "-b", name)
  for (const [path, body] of Object.entries(changes)) {
    if (body === null) rmSync(join(repository, path))
    else writeFileSync(join(repository, path), body)
  }
  git(repository, "add", "-A")
  git(repository, "commit", "-q", "-m", name)
}

const guard = (repository, options = {}) => runGuard({ repo: repository, base: "main", head: "HEAD", strykerConcurrency: 2, ...options })

const pureCases = () => {
  const diff = [
    "diff --git a/lib/a.ts b/lib/a.ts", "--- a/lib/a.ts", "+++ b/lib/a.ts",
    "@@ -3,2 +3,1 @@", "-  one", "-  two", "+  three",
    "@@ -10,0 +10,2 @@", "+  four", "+  five",
    "diff --git a/lib/gone.ts b/lib/gone.ts", "deleted file mode 100644", "--- a/lib/gone.ts", "+++ /dev/null",
    "@@ -1,2 +0,0 @@", "-x", "-y",
    "diff --git a/lib/old.ts b/lib/new.ts", "similarity index 90%", "rename from lib/old.ts", "rename to lib/new.ts",
    "--- a/lib/old.ts", "+++ b/lib/new.ts", "@@ -1 +1 @@", "-a", "+b", "",
  ].join("\n")
  const files = parseDiff(diff)
  same("the parser reads one entry for each file", files.map((file) => [file.oldPath, file.newPath, file.status]), [["lib/a.ts", "lib/a.ts", "modified"], ["lib/gone.ts", null, "deleted"], ["lib/old.ts", "lib/new.ts", "renamed"]])
  same("the parser reads the removed lines with their base line numbers", files[0].removed, [{ line: 3, text: "  one" }, { line: 4, text: "  two" }])
  same("the parser reads the added lines with their head line numbers", files[0].added.map((line) => line.line), [3, 10, 11])
  const hunks = files[0].hunks
  same("a line before a hunk keeps its number", mapLine(hunks, 2), 2)
  T("a changed line has no head line", mapLine(hunks, 3) === null && mapLine(hunks, 4) === null)
  same("a line after a shrinking hunk moves up", mapLine(hunks, 5), 4)
  same("a line after a pure insertion moves down", mapLine(hunks, 12), 13)
  same("mapLines joins lines that stay in one run and reports the changed lines", mapLines(hunks, [1, 2, 3, 5, 6, 12]), { ranges: [{ start: 1, end: 2 }, { start: 4, end: 5 }, { start: 13, end: 13 }], changed: [3] })
  same("toRanges joins consecutive lines", toRanges([5, 1, 2, 3, 9, 3]), [{ start: 1, end: 3 }, { start: 5, end: 5 }, { start: 9, end: 9 }])

  T("a test file is found by its name", isTestFile("apps/web/__tests__/a/b.test.tsx") && isTestFile("packages/shared/src/x.test.ts") && !isTestFile("apps/web/lib/a.ts"))
  same("the workspace of a test file", [workspaceOf("apps/web/__tests__/a.test.ts"), workspaceOf("apps/mobile/__tests__/a.test.ts"), workspaceOf("packages/shared/src/a.test.ts")], ["apps/web", "apps/mobile", null])
  const testDiff = [
    "diff --git a/apps/web/__tests__/a.test.ts b/apps/web/__tests__/a.test.ts", "--- a/apps/web/__tests__/a.test.ts", "+++ b/apps/web/__tests__/a.test.ts",
    "@@ -4,3 +4,2 @@", "-    expect(a).toBe(1)", "-    // a comment", "-", "+    expect(b).toBe(2)",
    "@@ -20 +19 @@", "-  expect(c).toBe(3)", "+  expect(c).toBe(3)",
    "diff --git a/apps/web/__tests__/b.test.ts b/apps/web/__tests__/b.test.ts", "--- a/apps/web/__tests__/b.test.ts", "+++ b/apps/web/__tests__/b.test.ts",
    "@@ -1,2 +1,1 @@", "-import { x } from './x'", "-})", "+import { y } from './y'",
    "diff --git a/apps/web/__tests__/c.test.ts b/apps/web/__tests__/c.test.ts", "--- a/apps/web/__tests__/c.test.ts", "+++ b/apps/web/__tests__/c.test.ts",
    "@@ -1 +1,2 @@", " keep", "+  expect(1).toBe(1)",
    "diff --git a/packages/shared/src/d.test.ts b/packages/shared/src/d.test.ts", "deleted file mode 100644", "--- a/packages/shared/src/d.test.ts", "+++ /dev/null",
    "@@ -1 +0,0 @@", "-expect(d)", "",
  ].join("\n")
  const lost = findLostTests(testDiff)
  same("a removed assertion is a lost line, and a comment, a blank line, an import and a restored line are not", lost.map((test) => [test.file, test.lostLines.map((line) => line.text.trim())]), [["apps/web/__tests__/a.test.ts", ["expect(a).toBe(1)"]], ["packages/shared/src/d.test.ts", ["expect(d)"]]])
  T("a deleted test file is marked deleted and a test file outside the apps has no workspace", lost[1].deleted && lost[1].workspace === null && lost[0].workspace === "apps/web")

  const lcov = "TN:\nSF:lib/m.ts\nFN:3,add\nFN:7,sub\nFNDA:1,add\nFNDA:0,sub\nDA:4,2\nDA:8,0\nend_of_record\nSF:/abs/x.ts\nDA:1,1\nend_of_record\n"
  const parsed = parseLcov(lcov, "/ws")
  same("lcov reads a relative and an absolute path", [...parsed.keys()], ["/ws/lib/m.ts", "/abs/x.ts"])
  same("a function that ran counts its line, and a line with no hit does not count", coveredLines(parsed.get("/ws/lib/m.ts")), [3, 4])
  same("the mutation scope runs on to the closing line of a block and stops at the next code line", mutationScope(parsed.get("/ws/lib/m.ts"), 10), [3, 4, 5, 6])

  const mutant = (line, status, extra = {}) => ({ id: String(line), file: "f.ts", mutatorName: "M", replacement: "r", status, killedBy: ["t1"], location: { start: { line, column: 1 }, end: { line, column: 9 } }, ...extra })
  const shifted = (line) => ({ file: "f.ts", startLine: line + 1 })
  const headOf = (...mutants) => new Map(mutants.map((m) => [`f.ts|${mutantKey(m)}`, m]))
  const verdict = (base, head, scope = (m) => shifted(m.location.start.line)) => judgeMutants({ baseMutants: base, scope, headByKey: head })
  const key = (m, line) => `f.ts|${mutantKey(m, line)}`
  const headMap = (entries) => new Map(entries.map(([m, line, status]) => [key(m, line), mutant(line, status)]))
  const baseKilled = mutant(1, "Killed")
  same("a mutant that stays killed passes", verdict([baseKilled], headMap([[baseKilled, 2, "Killed"]])).passed.length, 1)
  same("a mutant that survives on the head fails", verdict([baseKilled], headMap([[baseKilled, 2, "Survived"]])).failed.length, 1)
  same("a mutant with no coverage on the head fails", verdict([baseKilled], headMap([[baseKilled, 2, "NoCoverage"]])).failed.length, 1)
  same("a mutant that was not killed on the base is not judged", verdict([mutant(1, "Survived")], headMap([[mutant(1, "Survived"), 2, "Survived"]])), { failed: [], passed: [], review: [], retry: [] })
  same("a mutant that times out on both runs passes", verdict([mutant(1, "Timeout")], headMap([[mutant(1, "Timeout"), 2, "Timeout"]])).passed.length, 1)
  same("a base kill that times out on the head runs again", verdict([baseKilled], headMap([[baseKilled, 2, "Timeout"]])).retry.length, 1)
  same("a mutant on a line that the pull request changed goes to the review", verdict([baseKilled], new Map(), () => ({ changed: true })).review.map((item) => item.reason), ["changed-line"])
  same("a mutant of a deleted source file is skipped", verdict([baseKilled], new Map(), () => ({ skipped: "source deleted" })), { failed: [], passed: [], review: [], retry: [] })
  same("a mutant with no match on the head goes to the review", verdict([baseKilled], new Map()).review.map((item) => item.reason), ["no-head-mutant"])
  same("a mutant that ends in an error on the head goes to the review", verdict([baseKilled], headMap([[baseKilled, 2, "RuntimeError"]])).review.map((item) => item.reason), ["head-RuntimeError"])
  same("testFilesOf maps test ids to their files", testFilesOf({ testFiles: { "a.test.ts": { tests: [{ id: "1" }] }, "b.test.ts": { tests: [{ id: "2" }] } } }, ["2", "9"]), ["b.test.ts"])
  T("headOf is a helper of this file", headOf(baseKilled).size === 1)

  const none = { verdict: "none", lost: [], failures: [], review: [] }
  T("a run with no lost test prints one line and asks no review", renderSummary(none).includes("No test file loses lines") && renderComment(none, "a".repeat(40)) === "")
  const result = { verdict: "pass", budgetExceeded: false, lost: [{ file: "apps/web/__tests__/x.test.ts", project: "chromium", lostLines: [{}], deleted: true, status: "review" }], failures: [], review: [{ file: "apps/web/__tests__/x.test.ts", reason: "chromium", detail: "" }, { file: "apps/web/__tests__/x.test.ts", reason: "changed-line", detail: "a.ts:1 M" }, { file: "apps/web/__tests__/x.test.ts", reason: "changed-line", detail: "a.ts:2 M" }] }
  same("the review items group by file and reason", groupReview(result.review).map((item) => [item.reason, item.count]), [["chromium", 1], ["changed-line", 2]])
  const comment = renderComment(result, "b".repeat(40))
  T("the comment starts with the marker of the head and lists the chromium file", comment.startsWith(guardMarker("b".repeat(40))) && comment.includes("### For the AI review") && comment.includes("chromium project"))
}

const cliCases = (repository) => {
  const run = (...args) => spawnSync(process.execPath, [toolPath("deleted-test-guard.mjs"), ...args], { encoding: "utf8" })
  T("--help exits 0 and prints the usage", run("--help").status === 0 && run("--help").stdout.startsWith("usage: deleted-test-guard.mjs"))
  T("a missing --base exits 2", run().status === 2)
  T("an unknown option exits 2", run("--base", "main", "--nope").status === 2)
  T("--comment-file without a sha exits 2", run("--base", "main", "--comment-file", join(root, "c.md")).status === 2)
  branch(repository, "cli-plan-none", { "apps/web/__tests__/extra.test.ts": SOURCES["apps/web/__tests__/add.test.ts"] })
  const none = run("--plan", "--repo", repository, "--base", "main", "--head", "HEAD")
  T("--plan prints false when no test file loses lines", none.status === 0 && none.stdout.trim() === "deleted-test-guard=false")
  branch(repository, "cli-plan-lost", { "apps/web/__tests__/sub.test.ts": null })
  const lost = run("--plan", "--repo", repository, "--base", "main", "--head", "HEAD")
  T("--plan prints true when a test file loses lines", lost.status === 0 && lost.stdout.trim() === "deleted-test-guard=true")
}

const runCases = async (repository) => {
  branch(repository, "gain-only", { "apps/web/__tests__/extra.test.ts": SOURCES["apps/web/__tests__/add.test.ts"] })
  const none = await guard(repository)
  T("1. a pull request in which no test file loses lines runs no guard", none.verdict === "none" && none.lost.length === 0)

  branch(repository, "delete-live", { "apps/web/__tests__/sub.test.ts": null })
  const live = await guard(repository)
  T("2. a deleted web jsdom test of a function that stays fails with the surviving mutants", live.verdict === "fail" && live.failures.some((failure) => failure.kind === "mutant" && failure.file === "apps/web/lib/sub.ts"), JSON.stringify(live.failures))
  T("2. the coverage of the function is reported as lost", live.failures.some((failure) => failure.kind === "coverage" && failure.file === "apps/web/lib/sub.ts"))

  branch(repository, "move-case", {
    "apps/web/__tests__/sub.test.ts": null,
    "apps/web/__tests__/add.test.ts": `import { add } from '../lib/add'
import { sub } from '../lib/sub'

describe('add', () => {
  it('adds', () => {
    expect(add(1, 2)).toBe(3)
  })
  it('subtracts', () => {
    expect(sub(5, 2)).toBe(3)
  })
})
`,
  })
  const moved = await guard(repository)
  T("3. a test case that moves to another file passes", moved.verdict === "pass" && moved.failures.length === 0 && moved.lost.every((test) => test.status === "proven"), JSON.stringify(moved.failures))

  branch(repository, "delete-with-code", { "apps/web/__tests__/sub.test.ts": null, "apps/web/lib/sub.ts": null })
  const together = await guard(repository)
  T("4. a deleted test with the only source file that it imports passes", together.verdict === "pass" && together.failures.length === 0, JSON.stringify(together.failures))

  branch(repository, "drop-expect", { "apps/web/__tests__/limit.test.ts": SOURCES["apps/web/__tests__/limit.test.ts"].replace("    expect(limit(-5)).toBe(0)\n", "") })
  const dropped = await guard(repository)
  T("5. one removed expect with the same coverage fails", dropped.verdict === "fail" && dropped.failures.some((failure) => failure.kind === "mutant" && failure.file === "packages/shared/src/clamp.ts"), JSON.stringify(dropped.failures))
  T("5. the coverage of the kept lines does not fail", !dropped.failures.some((failure) => failure.kind === "coverage"))

  branch(repository, "delete-chromium", { "apps/web/__tests__/layout.test.ts": null, "apps/web/lib/layout.ts": null })
  const chromium = await guard(repository)
  T("6. a deleted chromium project test file is listed for the AI review", chromium.review.some((item) => item.reason === "chromium" && item.file === "apps/web/__tests__/layout.test.ts"), JSON.stringify(chromium.review))
  T("6. the chromium file passes the mechanical proof when its code goes too", chromium.verdict === "pass")

  branch(repository, "delete-live-again", { "apps/web/__tests__/sub.test.ts": null })
  const late = await guard(repository, { budgetMs: 1 })
  T("7. a run over its budget lists every lost test for the AI review and fails nothing", late.budgetExceeded && late.verdict === "pass" && late.review.some((item) => item.reason === "budget" && item.file === "apps/web/__tests__/sub.test.ts"), JSON.stringify(late.review))

  branch(repository, "unsupported", { "packages/shared/src/clamp.test.ts": "expect(1).toBe(1)\n" })
  git(repository, "checkout", "-q", "-b", "unsupported-delete")
  rmSync(join(repository, "packages/shared/src/clamp.test.ts"))
  git(repository, "add", "-A")
  git(repository, "commit", "-q", "-m", "delete")
  const outside = await runGuard({ repo: repository, base: "unsupported", head: "HEAD", strykerConcurrency: 2 })
  T("8. a lost test of a workspace that the guard cannot run goes to the AI review", outside.review.some((item) => item.reason === "unsupported-workspace"), JSON.stringify(outside))
  T("the fixture keeps its node_modules link", existsSync(join(repository, "node_modules")))
}

export const cases = async () => {
  pureCases()
  const repository = stageRepository()
  cliCases(repository)
  await runCases(repository)
}
