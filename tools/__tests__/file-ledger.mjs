import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { REPO_ROOT, T, check, root, run, stage, toolPath } from "./_harness.mjs"

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

/** Runs the emit mode with `argv` and the `run` options (`cwd`, `path`), and parses each row. */
const emitWith = (argv, options = {}) => {
  const result = run(TOOL, argv, options)
  const rows = result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  return { ...result, rows, row: (path) => rows.find((candidate) => candidate.path === path) }
}

const emit = (repository, alsoSearch = []) => emitWith(["--repo", repository, ...alsoSearch.flatMap((path) => ["--also-search", path])])

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
    "apps/web/e2e/flow.spec.ts": "export {}\n",
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
    "apps/web/e2e/flow.spec.ts": "test",
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
    "docs/by-path.md": "see docs/target.md for the target, from docs/by-path.md\n",
    "docs/by-basename.md": "see only other-name.md here\n",
    "docs/other-name.md": "other-name.md names itself\n",
    "src/helper.ts": "export const helper = 1\n",
    "src/user.ts": 'import { helper } from "./helper"\n',
  })
  const { row } = emit(repository)
  T(`${TOOL}: a file that another file names by path has inboundByPath 1`, row("docs/target.md").inboundByPath === 1 && row("docs/target.md").inboundByBasename === 1)
  T(`${TOOL}: a file named only by basename has inboundByBasename 1 and inboundByPath 0`, row("docs/other-name.md").inboundByBasename === 1 && row("docs/other-name.md").inboundByPath === 0)
  T(`${TOOL}: a file that names its own path counts 0`, row("docs/by-path.md").inboundByPath === 0 && row("docs/by-path.md").inboundByBasename === 0)
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

const caseRelativePaths = () => {
  // A copy of the tool in a small checkout one folder deeper, so its own root and the working directory differ.
  const checkout = makeRepository("relative-tool/checkout", { [`tools/${TOOL}`]: readFileSync(toolPath(TOOL), "utf8") })
  const fromCheckout = (argv, cwd) => emitWith(argv, { cwd, path: join(checkout, "tools", TOOL) })
  const repository = makeRepository("relative-main", { "docs/shared.md": "shared text\n", "only-here.md": "here\n" })
  makeRepository("relative-sibling", { "notes.md": "read docs/shared.md here\n" })

  const relativeRepository = fromCheckout(["--repo", "."], repository)
  const relativePaths = relativeRepository.rows.map((row) => row.path).join()
  T(`${TOOL}: a relative --repo resolves against the working directory`, relativeRepository.status === 0 && relativePaths === "docs/shared.md,only-here.md", `exit ${relativeRepository.status}, rows ${relativePaths}`)

  const relativeSibling = fromCheckout(["--repo", repository, "--also-search", "../relative-sibling"], repository)
  const siblingCounts = relativeSibling.row("docs/shared.md")?.crossRepositoryInbound["relative-sibling"]
  T(`${TOOL}: a relative --also-search resolves against the working directory`,
    relativeSibling.status === 0 && siblingCounts?.byPath === 1, `exit ${relativeSibling.status}, ${JSON.stringify(siblingCounts)}, ${relativeSibling.stderr.trim().split("\n")[0]}`)

  const defaultRoot = fromCheckout([], repository)
  const defaultPaths = defaultRoot.rows.map((row) => row.path).join()
  T(`${TOOL}: without --repo the rows are the files of the checkout that holds the tool`, defaultRoot.status === 0 && defaultPaths === `tools/${TOOL}`, `exit ${defaultRoot.status}, rows ${defaultPaths}`)
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
  defect("an other-ticket row for a file that this branch changed", withRow("changed.md", { verdict: "other-ticket", note: "K2" }), ticket, /changed\.md: other-ticket row, but this branch changed the file/)
  defect("an other-ticket row for a file that this branch added", withRow("brand-new.md", { verdict: "other-ticket", note: "K2" }), ticket, /brand-new\.md: other-ticket row, but this branch changed the file/)
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
  check(TOOL, "--help names the candidates mode, its four kinds in order and its cap", ["--help"], { status: 0, stdout: /Mode 4, candidates[\s\S]*\(outdated, temporary, duplicate, old\)[\s\S]*at most 300 candidates/ })
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
      "Folder tail `nested/deep/`, sibling by name `../../references-sibling/sibling-only/notes.md`, relative `../top.md`, spaced `docs/Orbit Today.md`.",
      "Line `docs/present.md:3`, missing line `docs/gone-line.md:12`, a [query](docs/present.md?plain=1) and a [missing query](docs/gone-query.md?plain=1).",
      "Spaced: missing `design/old/Orbit Gone.dc.html`, command `cat docs/gone-cat.md`, a [link](Orbit%20Today.md) and a [missing link](Orbit%20Gone.md).",
      "```",
      "`fenced/ignored.md`",
      "```",
    ].join("\n"),
    "docs/present.md": "text\n",
    "docs/Orbit Today.md": "spaced\n",
    "other/nested/deep/file.md": "deep\n",
    "top.md": "top\n",
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
  const expected = [
    ".claude/specs/gone.md", ".github/workflows/gone.yml", "Orbit Gone.md", "design/old/Orbit Gone.dc.html", "docs/gone-cat.md", "docs/gone-line.md", "docs/gone-link.md",
    "docs/gone-query.md", "docs/gone.md", "nowhere.md", "tools/missing-tool.mjs",
  ]
  T(`${TOOL}: unresolvedReferences holds each missing path and only those`, found.join() === expected.join(), found.join())
  T(`${TOOL}: a missing path under a dot folder is reported and a tracked one resolves`,
    found.includes(".claude/specs/gone.md") && found.includes(".github/workflows/gone.yml") && !found.some((path) => /core\.md|test\.yml/.test(path)), found.join())
  T(`${TOOL}: a bare name that starts with a dot is never a reference`, !found.some((path) => /^\.(?:env|dc)\./.test(path)), found.join())
  T(`${TOOL}: a tracked path, an ignored file on disk, an allowlisted path and an --also-search path resolve`, !found.some((path) => /present|local\.json|generated|sibling-only/.test(path)))
  T(`${TOOL}: a URL, a glob, a placeholder, a flag and a branch prefix are never references`, !found.some((path) => /example|\*|<|--flag|feature|^\.dc\.html$|Next|1\.2\.3/.test(path)), found.join())
  T(`${TOOL}: a fenced code block is skipped`, !found.includes("fenced/ignored.md"))
  T(`${TOOL}: a source file and an asset get an empty list`, row("src/code.ts").unresolvedReferences.length === 0 && row("design/page.html").unresolvedReferences.length === 0)
  T(`${TOOL}: a reference to the tail of a tracked folder resolves`, !found.some((path) => path.startsWith("nested/")), found.join())
  T(`${TOOL}: a ../ path into an --also-search root by its name resolves`, !found.some((path) => path.includes("references-sibling")), found.join())
  T(`${TOOL}: a path relative to the folder of the doc resolves`, !found.includes("../top.md"), found.join())
  T(`${TOOL}: a span with a space that names a tracked file resolves as one path`, !found.some((path) => path.includes("Today")), found.join())
  T(`${TOOL}: a missing path with a space is reported whole, never as its last fragment`,
    found.includes("design/old/Orbit Gone.dc.html") && !found.includes("Gone.dc.html"), found.join())
  T(`${TOOL}: a link with an encoded space is checked: a tracked target resolves and a missing one is reported`,
    found.includes("Orbit Gone.md") && !found.includes("Orbit Today.md"), found.join())
  T(`${TOOL}: a command span still reports the missing path it names`, found.includes("docs/gone-cat.md"), found.join())
  T(`${TOOL}: a :line suffix and a ?query are stripped before the check`,
    found.includes("docs/gone-line.md") && found.includes("docs/gone-query.md") && !found.some((path) => path.includes("present")), found.join())
}

const caseRepositoryIdentity = () => {
  const repository = makeRepository("identity", { "docs/a.md": "a\n" })
  check(TOOL, "a --repo below the root of a git repository exits 2", ["--repo", join(repository, "docs")], { status: 2, stderr: /is not the root of a git repository/ })
  const first = makeRepository("shared-name-a/same", { "a.md": "a\n" })
  const second = makeRepository("shared-name-b/same", { "b.md": "b\n" })
  check(TOOL, "two --also-search roots with one name exit 2", ["--repo", repository, "--also-search", first, "--also-search", second], { status: 2, stderr: /share a name: same, same/ })
  gitIn(repository, ["remote", "add", "origin", "https://example.com/acme/real-name.git"])
  check(TOOL, "the summary names the repository by its origin remote, not its folder", ["--repo", repository], { status: 0, stderr: /^file-ledger: real-name: 1 tracked files/m })
}

/** A ledger row with a reader and no signal; `fields` sets the signals of one case. */
const quietRow = (path, fields = {}) => ({
  path, class: "doc", agentInstruction: false, bytes: 1, lastCommit: FIXTURE_DATE, inboundByPath: 1, inboundByBasename: 1,
  crossRepositoryInbound: { sibling: { byPath: 0, byBasename: 0 } }, duplicateOf: [], crossRepositoryDuplicateOf: [],
  unresolvedReferences: [], empty: false, temporaryPattern: null, ...fields,
})
const NO_READER = { inboundByPath: 0, inboundByBasename: 0 }

/** A repository that tracks one file for each row, and the ledger of those rows in path order. */
const makeCandidatesFixture = (label, rows, files = {}) => {
  const bodies = Object.fromEntries(rows.map((row, index) => [row.path, files[row.path] ?? `body ${index}\n`]))
  const repository = makeRepository(label, bodies)
  const ordered = [...rows].sort((left, right) => (left.path < right.path ? -1 : 1))
  return { repository, ledger: writeLedger(label, ordered) }
}

// A copy of the tool in its own checkout, so each candidates file lands under the suite root.
const candidatesTool = () => stage(join("file-ledger", "candidates-checkout", "tools", TOOL), readFileSync(toolPath(TOOL), "utf8"))

const selectCandidates = ({ repository, ledger }) => {
  const result = run(TOOL, ["--candidates", ledger, "--repo", repository], { path: candidatesTool() })
  const entry = result.status === 0 ? JSON.parse(result.stdout) : null
  const rows = entry ? readFileSync(entry.candidatesFile, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : []
  return { ...result, entry, rows }
}

const caseCandidateKinds = () => {
  const rows = [
    quietRow("docs/stale.md", { ...NO_READER, unresolvedReferences: ["docs/gone.md"] }),
    quietRow("app/CLAUDE.md", { agentInstruction: true }),
    quietRow("app/AGENTS.md", { agentInstruction: true }),
    quietRow("web/CLAUDE.md", { agentInstruction: true, duplicateOf: ["web/AGENTS.md"] }),
    quietRow("web/AGENTS.md", { agentInstruction: true, duplicateOf: ["web/CLAUDE.md"] }),
    quietRow("notes.bak", { ...NO_READER, temporaryPattern: "extension:.bak" }),
    quietRow("img/a.png", { ...NO_READER, class: "asset", duplicateOf: ["img/b.png"] }),
    quietRow("img/b.png", { ...NO_READER, class: "asset", duplicateOf: ["img/a.png"] }),
    quietRow("old/newer.md", { ...NO_READER, lastCommit: "2026-01-01" }),
    quietRow("old/older.md", { ...NO_READER, lastCommit: "2025-01-01" }),
    quietRow("old/oldest.md", { ...NO_READER, lastCommit: "2024-06-01" }),
    quietRow("old/sibling-read.md", { ...NO_READER, crossRepositoryInbound: { sibling: { byPath: 0, byBasename: 1 } } }),
    quietRow("kept.md"),
    quietRow(".gitignore", { class: "config" }),
    quietRow("src/Orbit.Infrastructure/Migrations/20260101_Init.cs", { ...NO_READER, class: "source" }),
    quietRow("2 Areas/Decisions/choice.md", NO_READER),
    quietRow("5 Journal/2026-01-01.md", NO_READER),
    quietRow("0 Inbox/raw/2026-01-01.md", NO_READER),
    quietRow("posts/hello/meta.md"),
    quietRow("posts/hello/caption.md", NO_READER),
    quietRow("posts/hello/post.png", { ...NO_READER, class: "asset" }),
    quietRow("posts/draft/meta.md"),
    quietRow("posts/draft/caption.md", NO_READER),
    quietRow("skills-lock.json", { class: "config" }),
    quietRow(".claude/skills/VENDOR.md", { class: "agent" }),
    quietRow(".claude/skills/locked/SKILL.md", { ...NO_READER, class: "agent" }),
    quietRow(".claude/skills/named/SKILL.md", { ...NO_READER, class: "agent" }),
    quietRow(".claude/skills/own/SKILL.md", { ...NO_READER, class: "agent" }),
  ]
  const fixture = makeCandidatesFixture("candidates-kinds", rows, {
    "app/CLAUDE.md": "claude rules\n",
    "app/AGENTS.md": "other rules\n",
    "web/CLAUDE.md": "same rules\n",
    "web/AGENTS.md": "same rules\n",
    ".gitignore": "ignored.log\n",
    "posts/hello/meta.md": "- **Status**: Published\n",
    "posts/draft/meta.md": "- **Status:** Draft\n",
    "skills-lock.json": `${JSON.stringify({ version: 2, skills: { locked: { source: "owner/repository" } } })}\n`,
    ".claude/skills/VENDOR.md": "`named` is copied from a source repository.\n",
  })
  writeTree(fixture.repository, { "scratch.txt": "untracked\n", "ignored.log": "ignored\n" })
  const { status, stdout, stderr, entry, rows: judged } = selectCandidates(fixture)
  T(`${TOOL}: candidates exits 0 and prints one JSON line with the root, the candidates file and the counts`,
    status === 0 && stdout.trim().split("\n").length === 1 && Object.keys(entry ?? {}).join() === "root,candidatesFile,counts" && entry.root === realpathSync(fixture.repository), `exit ${status} ${stdout} ${stderr}`)
  T(`${TOOL}: candidates counts each kind`,
    JSON.stringify(entry?.counts) === JSON.stringify({ outdated: { judged: 3, deferred: 0 }, temporary: { judged: 2, deferred: 0 }, duplicate: { judged: 4, deferred: 0 }, old: { judged: 6, deferred: 0 } }), JSON.stringify(entry?.counts))
  const order = judged.map((row) => `${row.kind}:${row.path}`)
  const expected = [
    "outdated:app/AGENTS.md", "outdated:app/CLAUDE.md", "outdated:docs/stale.md", "temporary:notes.bak", "temporary:scratch.txt",
    "duplicate:img/a.png", "duplicate:img/b.png", "duplicate:web/AGENTS.md", "duplicate:web/CLAUDE.md",
    "old:old/oldest.md", "old:old/older.md", "old:old/newer.md", "old:.claude/skills/own/SKILL.md", "old:posts/draft/caption.md", "old:posts/hello/post.png",
  ]
  T(`${TOOL}: the candidates file holds the first kind that fires for each row, by kind, with the oldest old row first`, order.join() === expected.join(), order.join("\n"))
  T(`${TOOL}: an untracked file that git does not ignore is a temporary candidate marked untracked`,
    judged.find((row) => row.path === "scratch.txt")?.untracked === true && !judged.some((row) => row.path === "ignored.log"))
  T(`${TOOL}: two instruction files of one folder with the same content are duplicates, not outdated`,
    judged.filter((row) => row.path.startsWith("web/") && row.kind === "duplicate").length === 2 && !judged.some((row) => row.path.startsWith("web/") && row.kind !== "duplicate"))
  T(`${TOOL}: a migration, a decision, a journal note, a raw inbox note, a published post and a pinned skill are records, never candidates`,
    stderr.includes("7 records left out") && ![".cs", "Decisions", "Journal", "Inbox", "hello/caption", "skills/locked", "skills/named"].some((part) => judged.some((row) => row.path.includes(part))), stderr)
  T(`${TOOL}: the candidates file lands in .claude/sweeps/hygiene of the checkout that holds the tool`,
    entry?.candidatesFile === join(root, "file-ledger", "candidates-checkout", ".claude", "sweeps", "hygiene", "candidates-kinds.jsonl"), entry?.candidatesFile)
  const ignored = spawnSync("git", ["-C", REPO_ROOT, "check-ignore", "-q", ".claude/sweeps/hygiene/orbit-ui-mobile.jsonl"])
  T(`${TOOL}: git ignores the candidates folder of this repository`, ignored.status === 0, `git check-ignore exit ${ignored.status}`)
}

const caseCandidateCap = () => {
  const rowsOf = (kind, count, fields) => Array.from({ length: count }, (_, index) => quietRow(`${kind}/${String(index).padStart(3, "0")}.md`, { ...NO_READER, ...fields }))
  const signals = { outdated: { unresolvedReferences: ["gone.md"] }, temporary: { temporaryPattern: "segment:drafts" }, duplicate: { duplicateOf: ["twin.md"] }, old: {} }
  const mixed = selectCandidates(makeCandidatesFixture("candidates-mixed", [
    ...rowsOf("old", 300, signals.old), ...rowsOf("outdated", 29, signals.outdated), ...rowsOf("temporary", 5, signals.temporary), ...rowsOf("duplicate", 10, signals.duplicate),
  ]))
  T(`${TOOL}: the cap judges every outdated, temporary and duplicate candidate before old rows use up the cap`,
    JSON.stringify(mixed.entry?.counts) === JSON.stringify({ outdated: { judged: 29, deferred: 0 }, temporary: { judged: 5, deferred: 0 }, duplicate: { judged: 10, deferred: 0 }, old: { judged: 256, deferred: 44 } }),
    JSON.stringify(mixed.entry?.counts))
  T(`${TOOL}: the candidates file holds exactly the judged rows, the outdated rows first`,
    mixed.rows.length === 300 && mixed.rows[0].kind === "outdated" && mixed.rows.filter((row) => row.kind === "old").length === 256, `${mixed.rows.length} ${mixed.rows[0]?.kind}`)
  const crowded = selectCandidates(makeCandidatesFixture("candidates-crowded", Object.entries(signals).flatMap(([kind, fields]) => rowsOf(kind, 100, fields))))
  T(`${TOOL}: each kind gets an equal share of the cap when every kind exceeds it`,
    Object.values(crowded.entry?.counts ?? {}).length === 4 && Object.values(crowded.entry.counts).every((count) => count.judged === 75 && count.deferred === 25) && crowded.rows.length === 300,
    JSON.stringify(crowded.entry?.counts))
}

const caseCandidateRefusals = () => {
  const fixture = makeCandidatesFixture("candidates-refusals", [quietRow("a.md"), quietRow("b.md")])
  const tool = { path: candidatesTool() }
  check(TOOL, "candidates refuses a ledger that misses a tracked file", ["--candidates", writeLedger("candidates-short", [quietRow("a.md")]), "--repo", fixture.repository], { status: 2, stderr: /does not list exactly the tracked files/ }, tool)
  check(TOOL, "candidates refuses a ledger with a path that is not tracked", ["--candidates", writeLedger("candidates-ghost", [quietRow("a.md"), quietRow("b.md"), quietRow("ghost.md")]), "--repo", fixture.repository], { status: 2, stderr: /does not list exactly/ }, tool)
  check(TOOL, "candidates refuses --also-search", ["--candidates", fixture.ledger, "--also-search", fixture.repository], { status: 2, stderr: /does not apply to the candidates mode/ }, tool)
  check(TOOL, "--candidates together with --render exits 2", ["--candidates", fixture.ledger, "--render", fixture.ledger], { status: 2, stderr: /separate modes/ }, tool)
}

export const cases = () => {
  caseEmitRows()
  caseClasses()
  caseDuplicates()
  caseTemporaryPatterns()
  caseInboundCounts()
  caseCrossRepository()
  caseRelativePaths()
  caseDatesAndDeterminism()
  caseVerify()
  caseRender()
  caseUsage()
  caseUnresolvedReferences()
  caseRepositoryIdentity()
  caseCandidateKinds()
  caseCandidateCap()
  caseCandidateRefusals()
}
