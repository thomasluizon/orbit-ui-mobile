import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { T, check, root, run } from "./_harness.mjs"

const TOOL = "file-ledger.mjs"
const FIXTURE_DATE = "2026-03-04"

const writeTree = (repository, files) => {
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(repository, path)), { recursive: true })
    writeFileSync(join(repository, path), body)
  }
}

const gitIn = (repository, args, date = FIXTURE_DATE) =>
  spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_DATE: `${date}T12:00:00+0000`, GIT_COMMITTER_DATE: `${date}T12:00:00+0000` },
  })

/** A repository under the suite root with one commit that holds `files`. */
const makeRepository = (label, files, date = FIXTURE_DATE) => {
  const repository = join(root, "file-ledger", label)
  mkdirSync(repository, { recursive: true })
  for (const args of [
    ["init", "-q", "--initial-branch=main"],
    ["config", "user.email", "ledger@orbit.test"],
    ["config", "user.name", "Orbit Ledger"],
  ]) {
    gitIn(repository, args)
  }
  writeTree(repository, files)
  commitAll(repository, "fixture", date)
  return repository
}

const commitAll = (repository, message, date = FIXTURE_DATE) => {
  gitIn(repository, ["add", "-A"], date)
  gitIn(repository, ["commit", "-q", "-m", message], date)
  return gitIn(repository, ["rev-parse", "HEAD"], date).stdout.trim()
}

const emit = (repository, alsoSearch = []) => {
  const result = run(TOOL, ["--repo", repository, ...alsoSearch.flatMap((path) => ["--also-search", path])])
  const rows = result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  return { ...result, rows, row: (path) => rows.find((candidate) => candidate.path === path) }
}

const writeLedger = (label, rows) => {
  const path = join(root, "file-ledger", `${label}.jsonl`)
  writeFileSync(path, rows.map((row) => `${JSON.stringify(row)}\n`).join(""))
  return path
}

const caseEmitRows = () => {
  const repository = makeRepository("rows", { "a.md": "alpha\n", ".gitignore": "ignored.txt\n", "src/code.ts": "export {}\n" })
  writeTree(repository, { "untracked.txt": "x\n", "ignored.txt": "y\n" })
  const { status, rows, stderr } = emit(repository)
  T(`${TOOL}: emit exits 0`, status === 0, String(status))
  T(`${TOOL}: emit writes one row for each tracked file and none for untracked or ignored files`, rows.map((row) => row.path).join() === ".gitignore,a.md,src/code.ts", rows.map((row) => row.path).join())
  T(`${TOOL}: the summary names each untracked file that git does not ignore`, /untracked.txt/.test(stderr) && !/ignored.txt/.test(stderr), stderr)

  const unusual = makeRepository("unusual-paths", { "docs/Orbit Habit Criação.md": "text\n", "docs/plain.md": "text two\n" })
  const unusualRows = emit(unusual).rows.map((row) => row.path)
  T(`${TOOL}: a path with a space and a non-ASCII character gives one exact row`, unusualRows.includes("docs/Orbit Habit Criação.md") && unusualRows.length === 2, unusualRows.join())
}

const caseClasses = () => {
  const files = {
    ".claude/hooks/guard.mjs": "export {}\n",
    "tools/__tests__/runner.mjs": "export {}\n",
    "pages/index.astro": "<p>x</p>\n",
    "design/page.html": "<p>x</p>\n",
    "README.md": "readme\n",
    "notes.txt": "notes\n",
    "package.json": "{}\n",
    "src/value.test.ts": "export {}\n",
    "tests/helper.ts": "export {}\n",
    "src/value.ts": "export {}\n",
    "logo.png": "png\n",
    "CLAUDE.md": "rules\n",
    ".agents/skills/a/SKILL.md": "skill\n",
    "docs/CLAUDE.md": "rules\n",
    "opencode.json": "{}\n",
  }
  const { row } = emit(makeRepository("classes", files))
  const expected = {
    ".claude/hooks/guard.mjs": "agent",
    "tools/__tests__/runner.mjs": "test",
    "pages/index.astro": "source",
    "design/page.html": "asset",
    "README.md": "doc",
    "notes.txt": "doc",
    "package.json": "config",
    "src/value.test.ts": "test",
    "tests/helper.ts": "test",
    "src/value.ts": "source",
    "logo.png": "asset",
  }
  for (const [path, fileClass] of Object.entries(expected)) T(`${TOOL}: ${path} is class ${fileClass}`, row(path)?.class === fileClass, row(path)?.class)
  for (const path of ["CLAUDE.md", ".agents/skills/a/SKILL.md", "docs/CLAUDE.md", "opencode.json"]) {
    T(`${TOOL}: ${path} is an agent instruction`, row(path)?.agentInstruction === true)
  }
  T(`${TOOL}: README.md is not an agent instruction`, row("README.md")?.agentInstruction === false)
}

const caseDuplicates = () => {
  const { row } = emit(makeRepository("duplicates", { "one.png": "same bytes\n", "two/copy.png": "same bytes\n", "empty-one.txt": "", "empty-two.txt": "", "other.png": "different\n" }))
  T(`${TOOL}: two files with the same content name each other in duplicateOf`, row("one.png").duplicateOf.join() === "two/copy.png" && row("two/copy.png").duplicateOf.join() === "one.png")
  T(`${TOOL}: a file with unique content has no duplicate`, row("other.png").duplicateOf.length === 0)
  T(`${TOOL}: two empty files do not name each other and each is empty`, row("empty-one.txt").duplicateOf.length === 0 && row("empty-one.txt").empty === true && row("empty-two.txt").empty === true)
  T(`${TOOL}: a file with content is not empty`, row("other.png").empty === false)
}

const caseTemporaryPatterns = () => {
  const matching = ["notes.bak", "a.orig", "design/superseded/x.html", "brand/unused/y.png", "post-backup.png", "previous-banners/z.png", "draft.tmp~", "x/archive/y.md", "logo copy.png"]
  const clean = ["tools/check-copy.mjs", "hooks/use-astra-allowance-copy.ts", "components/description-copy-button.tsx", "src/archived-note.md"]
  const files = Object.fromEntries([...matching, ...clean].map((path, index) => [path, `body ${index}\n`]))
  const { row } = emit(makeRepository("temporary", files))
  for (const path of matching) T(`${TOOL}: ${path} matches a temporary pattern`, typeof row(path)?.temporaryPattern === "string", String(row(path)?.temporaryPattern))
  for (const path of clean) T(`${TOOL}: ${path} matches no temporary pattern`, row(path)?.temporaryPattern === null, String(row(path)?.temporaryPattern))
}

const caseInboundCounts = () => {
  const repository = makeRepository("inbound", {
    "docs/target.md": "I am the target\n",
    "docs/by-path.md": "see docs/target.md for the target\n",
    "docs/by-basename.md": "see only other-name.md here\n",
    "docs/other-name.md": "other-name.md names itself\n",
    "src/helper.ts": "export const helper = 1\n",
    "src/user.ts": 'import { helper } from "./helper"\n',
  })
  const { row } = emit(repository)
  T(`${TOOL}: a file that another file names by path has inboundByPath 1`, row("docs/target.md").inboundByPath === 1 && row("docs/target.md").inboundByBasename === 1)
  T(`${TOOL}: a file named only by basename has inboundByBasename 1 and inboundByPath 0`, row("docs/other-name.md").inboundByBasename === 1 && row("docs/other-name.md").inboundByPath === 0)
  T(`${TOOL}: a file that names itself counts 0`, row("docs/by-path.md").inboundByPath === 0 && row("docs/by-path.md").inboundByBasename === 0)
  T(`${TOOL}: a source file named by an import without an extension counts by its stem`, row("src/helper.ts").inboundByBasename === 1 && row("src/helper.ts").inboundByPath === 0)
}

const caseCrossRepository = () => {
  const repository = makeRepository("cross-main", { "docs/shared.md": "shared text\n", "docs/lonely.md": "lonely text\n", "docs/twin.png": "twin bytes\n", "empty.txt": "" })
  const sibling = makeRepository("cross-sibling", { "notes.md": "read docs/shared.md here\n", "twin.png": "twin bytes\n", "also-empty.txt": "" })
  const { row } = emit(repository, [sibling])
  const siblingCounts = row("docs/shared.md").crossRepositoryInbound["cross-sibling"]
  T(`${TOOL}: a reference in an --also-search root counts in crossRepositoryInbound only`, siblingCounts.byPath === 1 && siblingCounts.byBasename === 1 && row("docs/shared.md").inboundByPath === 0)
  T(`${TOOL}: an unreferenced file has zero cross counts`, row("docs/lonely.md").crossRepositoryInbound["cross-sibling"].byPath === 0)
  T(`${TOOL}: a file with the same bytes in an --also-search root names that path`, row("docs/twin.png").crossRepositoryDuplicateOf.join() === "cross-sibling/twin.png")
  T(`${TOOL}: an empty file has no crossRepositoryDuplicateOf`, row("empty.txt").crossRepositoryDuplicateOf.length === 0)
}

const caseDatesAndDeterminism = () => {
  const repository = makeRepository("dates", { "a.md": "alpha\n", "b.md": "beta\n" }, "2026-03-04")
  writeTree(repository, { "b.md": "beta two\n" })
  commitAll(repository, "second", "2026-05-06")
  const first = emit(repository)
  const second = emit(repository)
  T(`${TOOL}: lastCommit is the date of the last commit that changed the path`, first.row("a.md").lastCommit === "2026-03-04" && first.row("b.md").lastCommit === "2026-05-06", `${first.row("a.md").lastCommit} ${first.row("b.md").lastCommit}`)
  T(`${TOOL}: two runs give the same bytes`, first.stdout === second.stdout && first.stdout.length > 0)
}

/** A repository with a base commit and a head commit, and the matching filled ledger rows. */
const makeVerifyFixture = (label) => {
  const repository = makeRepository(label, {
    "kept.md": "kept\n",
    "changed.md": "before\n",
    "removed.md": "removed\n",
    "src/code.ts": "export {}\n",
  })
  const base = gitIn(repository, ["rev-parse", "HEAD"]).stdout.trim()
  writeTree(repository, { "changed.md": "after\n", "brand-new.md": "new\n" })
  gitIn(repository, ["rm", "-q", "removed.md"])
  commitAll(repository, "head")
  const rows = emit(repository).rows
  const verdicts = {
    "kept.md": { verdict: "keep", reader: "README", checked: "ran it", note: "" },
    "changed.md": { verdict: "update", reader: "README", checked: "ran it", note: "" },
    "brand-new.md": { verdict: "update", reader: "README", checked: "ran it", note: "" },
    "src/code.ts": { verdict: "other-ticket", reader: "", checked: "", note: "K2" },
  }
  const ledger = [...rows.map((row) => ({ ...row, ...verdicts[row.path] })), { path: "removed.md", class: "doc", verdict: "delete", reader: "", checked: "", note: "searched: removed.md; readers: none" }]
  return { repository, base, ledger }
}

const verifyArguments = ({ repository, base }, ledgerPath, extra = ["--other-ticket", "K2"]) => ["--verify", ledgerPath, "--repo", repository, "--base", base, ...extra]

const caseVerify = () => {
  const fixture = makeVerifyFixture("verify")
  const complete = writeLedger("verify-complete", fixture.ledger)
  const summary = check(TOOL, "verify exits 0 for a complete ledger", verifyArguments(fixture, complete), { status: 0, stdout: /\| total \|/ })
  const labels = [...summary.stdout.matchAll(/^\| ([^|]+?) \| \d/gm)].map((match) => match[1])
  T(`${TOOL}: the verify summary has one row for each class and a total row, and no other row`, labels.join() === "config,agent,doc,asset,test,source,total", labels.join())
  T(`${TOOL}: the verify summary counts each class and the total from the ledger and both trees`,
    summary.stdout.includes("| doc | 3 | 3 | 1 | 2 | 1 | 0 |") && summary.stdout.includes("| source | 1 | 1 | 0 | 0 | 0 | 1 |") && summary.stdout.includes("| total | 4 | 4 | 1 | 2 | 1 | 1 |"), summary.stdout)
  T(`${TOOL}: the verify summary gives the bytes the deletes removed`, summary.stdout.includes("bytes removed by deletes: 8"), summary.stdout)

  const defect = (name, mutate, extra, pattern) => {
    const ledger = mutate(fixture.ledger.map((row) => ({ ...row })))
    check(TOOL, `verify exits 1 and names the path: ${name}`, verifyArguments(fixture, writeLedger(`verify-${name.replaceAll(/\W+/g, "-")}`, ledger), extra), { status: 1, stderr: pattern })
  }
  const withRow = (path, change) => (rows) => rows.map((row) => (row.path === path ? { ...row, ...change } : row))
  const withoutRow = (path) => (rows) => rows.filter((row) => row.path !== path)
  const ticket = ["--other-ticket", "K2"]
  defect("a tracked file with no row", withoutRow("kept.md"), ticket, /kept\.md: tracked file has no row/)
  defect("a row for a path that is not tracked", (rows) => [...rows, { path: "ghost.md", verdict: "keep", reader: "x", checked: "y" }], ticket, /ghost\.md: row for a path that HEAD does not track/)
  defect("a keep row with no reader", withRow("kept.md", { reader: "" }), ticket, /kept\.md: keep row has no real reader/)
  defect("a keep row with no checked", withRow("kept.md", { checked: " " }), ticket, /kept\.md: keep row has no checked value/)
  defect("a keep row whose content changed", withRow("changed.md", { verdict: "keep" }), ticket, /changed\.md: keep row, but the content differs/)
  defect("an update row whose content did not change", withRow("kept.md", { verdict: "update" }), ticket, /kept\.md: update row, but the content equals base/)
  defect("a delete row whose path still exists", withRow("kept.md", { verdict: "delete", note: "searched" }), ticket, /kept\.md: delete row, but HEAD still tracks/)
  defect("a deleted path with no delete row", withoutRow("removed.md"), ticket, /removed\.md: path deleted since base has no delete row/)
  defect("a reader of none", withRow("kept.md", { reader: "None" }), ticket, /kept\.md: keep row has no real reader/)
  defect("a delete row with no note", withRow("removed.md", { note: "" }), ticket, /removed\.md: delete row has no note/)
  defect("an other-ticket row with no ID in the note", withRow("src/code.ts", { note: "later" }), ticket, /src\/code\.ts: other-ticket row note does not hold K2/)
  defect("an other-ticket row with no --other-ticket flag", (rows) => rows, [], /src\/code\.ts: other-ticket row, but --other-ticket was not given/)
  defect("an unknown verdict", withRow("kept.md", { verdict: "maybe" }), ticket, /kept\.md: verdict must be one of/)
}

const caseRender = () => {
  const fixture = makeVerifyFixture("render")
  const many = Array.from({ length: 120 }, (_, index) => ({ path: `bulk/file-${String(index).padStart(3, "0")}.md`, class: "doc", verdict: "keep", reader: "README", checked: `checked ${index} `.repeat(6), note: "" }))
  const folded = Array.from({ length: 4 }, (_, index) => ({ path: `src/other-${index}.ts`, class: "source", verdict: "other-ticket", reader: "", checked: "", note: "K2" }))
  const ledgerPath = writeLedger("render", [...fixture.ledger, ...many, ...folded])
  const outDir = join(root, "file-ledger", "render-out")
  const result = check(TOOL, "render exits 0", ["--render", ledgerPath, "--repo", fixture.repository, "--base", fixture.base, "--out-dir", outDir, "--max-chars", "4000"], { status: 0 })
  const parts = readdirSync(outDir).filter((file) => /^ledger-part-\d+-of-\d+\.md$/.test(file)).sort()
  const texts = parts.map((file) => readFileSync(join(outDir, file), "utf8"))
  T(`${TOOL}: render writes more than one part for a small --max-chars`, parts.length > 1, String(parts.length))
  T(`${TOOL}: render keeps each part under --max-chars`, texts.every((text) => text.length <= 4000), texts.map((text) => text.length).join())
  const head = gitIn(fixture.repository, ["rev-parse", "HEAD"]).stdout.trim()
  T(`${TOOL}: the first line of each part names the repository, the part, the part count and both SHAs`, texts.every((text, index) => text.split("\n")[0] === `render | ledger part ${index + 1} of ${parts.length} | base ${fixture.base} | head ${head}`), texts[0]?.split("\n")[0])
  const all = texts.join("\n")
  const paths = [...all.matchAll(/^\| `([^`]+)` \|/gm)].map((match) => match[1])
  const expectedPaths = [...fixture.ledger, ...many].filter((row) => row.verdict !== "other-ticket").map((row) => row.path)
  T(`${TOOL}: render puts each row in exactly one part`, new Set(paths).size === paths.length && [...expectedPaths].sort().join() === [...paths].sort().join(), `${paths.length} of ${expectedPaths.length}`)
  T(`${TOOL}: render folds the other-ticket rows into one line for each class`, (all.match(/\| other-ticket \|/g) ?? []).length === 1 && /\| 5 files \| source \| other-ticket/.test(all) && !/src\/other-0\.ts/.test(all), all.slice(0, 200))
  T(`${TOOL}: render lists its parts on stdout`, result.stdout.trim().split("\n").length === parts.length)
  check(TOOL, "render refuses a --max-chars below 1000", ["--render", ledgerPath, "--repo", fixture.repository, "--base", fixture.base, "--out-dir", outDir, "--max-chars", "10"], { status: 2 })
}

const caseUsage = () => {
  check(TOOL, "--help exits 0 with usage on stdout", ["--help"], { status: 0, stdout: /usage: file-ledger\.mjs[\s\S]*crossRepositoryDuplicateOf[\s\S]*unresolvedReferences[\s\S]*exit codes/ })
  check(TOOL, "-h exits 0", ["-h"], { status: 0, stdout: /Class rule/ })
  check(TOOL, "an unknown flag exits 2", ["--orbit-not-a-flag"], { status: 2, stderr: /unknown argument/ })
  check(TOOL, "a flag with no value exits 2", ["--repo"], { status: 2 })
  check(TOOL, "--verify without --base exits 2", ["--verify", "ledger.jsonl"], { status: 2, stderr: /needs --base/ })
  check(TOOL, "--render without --out-dir exits 2", ["--render", "ledger.jsonl"], { status: 2, stderr: /needs --out-dir/ })
  check(TOOL, "--verify together with --render exits 2", ["--verify", "a", "--render", "b"], { status: 2 })
  check(TOOL, "a flag from another mode exits 2", ["--base", "main"], { status: 2, stderr: /does not apply/ })
  const notRepository = join(root, "file-ledger", "not-a-repository")
  mkdirSync(notRepository, { recursive: true })
  check(TOOL, "a --repo that is not a git repository exits 2", ["--repo", notRepository], { status: 2, stderr: /not a git repository/ })
  check(TOOL, "a missing --repo exits 2", ["--repo", join(root, "file-ledger", "missing")], { status: 2, stderr: /does not exist/ })
  const fixture = makeVerifyFixture("usage-ledger")
  check(TOOL, "an unreadable ledger exits 2", ["--verify", join(root, "file-ledger", "no-such.jsonl"), "--repo", fixture.repository, "--base", fixture.base], { status: 2, stderr: /cannot read/ })
  check(TOOL, "a base that is not a commit exits 2", ["--verify", writeLedger("usage-bad-base", fixture.ledger), "--repo", fixture.repository, "--base", "no-such-commit"], { status: 2, stderr: /not a commit/ })
}

const caseUnresolvedReferences = () => {
  const repository = makeRepository("references", {
    "docs/guide.md": [
      "Missing path `docs/gone.md` here.",
      "Tracked `docs/present.md`, disk `ignored/local.json`, allowed `generated.json`, sibling `sibling-only/notes.md`.",
      "Noise: `https://example.com/a.md`, `src/*.ts`, `<name>/file.md`, `--flag`, `feature/`, `.dc.html`, `Next.js`, `1.2.3`.",
      "Bare `present.md` resolves, bare `nowhere.md` does not. A [link](docs/gone-link.md#anchor) and a [web](https://example.com/x.md).",
      "Command `node tools/missing-tool.mjs --help` and a relative `./present.md`.",
      "Dot folders: missing `.claude/specs/gone.md` and [a workflow](.github/workflows/gone.yml), present `.claude/rules/core.md` and `.github/workflows/test.yml`, hidden `.env.example`.",
      "```",
      "`fenced/ignored.md`",
      "```",
    ].join("\n"),
    "docs/present.md": "text\n",
    ".claude/rules/core.md": "rules\n",
    ".github/workflows/test.yml": "name: test\n",
    "tools/root-allowlist.json":`${JSON.stringify({ files: ["generated.json"], directories: [] })}\n`,
    ".gitignore": "ignored/\n",
    "src/code.ts": "// `src/not-a-doc.md` in a source file\n",
    "design/page.html": "<p>`design/not-scanned.md`</p>\n",
  })
  writeTree(repository, { "ignored/local.json": "{}\n" })
  const sibling = makeRepository("references-sibling", { "sibling-only/notes.md": "notes\n" })
  const { row } = emit(repository, [sibling])
  const found = row("docs/guide.md").unresolvedReferences
  const expected = [".claude/specs/gone.md", ".github/workflows/gone.yml", "docs/gone-link.md", "docs/gone.md", "nowhere.md", "tools/missing-tool.mjs"]
  T(`${TOOL}: unresolvedReferences holds each missing path and only those`, found.join() === expected.join(), found.join())
  T(`${TOOL}: a missing path under a dot folder is reported and a tracked one resolves`,
    found.includes(".claude/specs/gone.md") && found.includes(".github/workflows/gone.yml") && !found.some((path) => /core\.md|test\.yml/.test(path)), found.join())
  T(`${TOOL}: a bare name that starts with a dot is never a reference`, !found.some((path) => /^\.(?:env|dc)\./.test(path)), found.join())
  T(`${TOOL}: a tracked path, an ignored file on disk, an allowlisted path and an --also-search path resolve`, !found.some((path) => /present|local\.json|generated|sibling-only/.test(path)))
  T(`${TOOL}: a URL, a glob, a placeholder, a flag and a branch prefix are never references`, !found.some((path) => /example|\*|<|--flag|feature|dc\.html|Next|1\.2\.3/.test(path)))
  T(`${TOOL}: a fenced code block is skipped`, !found.includes("fenced/ignored.md"))
  T(`${TOOL}: a source file and an asset get an empty list`, row("src/code.ts").unresolvedReferences.length === 0 && row("design/page.html").unresolvedReferences.length === 0)
  T(`${TOOL}: a folder reference resolves when the folder is tracked`, row("tools/root-allowlist.json").unresolvedReferences.length === 0)
}

export const cases = () => {
  caseEmitRows()
  caseClasses()
  caseDuplicates()
  caseTemporaryPatterns()
  caseInboundCounts()
  caseCrossRepository()
  caseDatesAndDeterminism()
  caseVerify()
  caseRender()
  caseUsage()
  caseUnresolvedReferences()
}
