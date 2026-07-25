#!/usr/bin/env node
// Regression suite for the surviving session hooks. Three layers:
//   1. _lib unit checks: the shared rule logic in isolation.
//   2. Claude Code hooks: run the real hook files with stdin payloads; asserts
//      the adapter preserved the exact block/allow behavior.
//   3. Agent frontmatter: no agent declares a fails-open `Bash(...)` specifier.
// The rest of the old parity suite (copy register, dash ban, secrets, csharp,
// parity nudge, the visual gate, the opencode plugin) migrated to deterministic
// deterministic gates and died with the old harness.
// Run: node .claude/hooks/test-hooks.mjs   (exits non-zero on any failure)

import { mkdirSync, mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync, existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { checkGitCommand, checkGitWorktreeRemove } from "./_lib/rules-git.mjs"
import { checkEfMigrationRawIndex } from "./_lib/rules-source.mjs"
import { checkLinearMutation } from "./_lib/rules-linear.mjs"

const hooksDir = dirname(fileURLToPath(import.meta.url))
let fails = 0
const T = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fails++
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}
const NV = "--no-" + "verify"

// ---------------------------------------------------------------------------
// 1. _lib unit
// ---------------------------------------------------------------------------
console.log("# _lib unit")
T("git: push main blocks", !!checkGitCommand("git push origin main")?.block, true)
T("git: push feature allows", checkGitCommand("git push origin feature/x"), null)
T("git: no-verify blocks", !!checkGitCommand("git commit -m x " + NV)?.block, true)
T("git: commit -n blocks", !!checkGitCommand("git commit -n -m x")?.block, true)
T("git: bare push on main blocks", !!checkGitCommand("git push", { resolveHeadBranch: () => "main", cwd: "." })?.block, true)
T("git: bare push on feature allows", checkGitCommand("git push", { resolveHeadBranch: () => "feature/x", cwd: "." }), null)

// Branch protection is scoped to the three Orbit repos: sibling repos driven
// from this session (the brain vault, thomas-brain) are direct-to-main by design.
const orbitRemote = () => "git@github.com:thomasluizon/orbit-api.git"
const brainRemote = () => "https://github.com/thomasluizon/brain.git"
T("git: push main in an Orbit repo blocks", !!checkGitCommand("git push origin main", { resolveRemoteUrl: orbitRemote, cwd: "." })?.block, true)
T("git: push main in a non-Orbit repo allows", checkGitCommand("git push origin main", { resolveRemoteUrl: brainRemote, cwd: "." }), null)
T("git: cd to a non-Orbit repo then push main allows", checkGitCommand('cd "C:\\x\\brain" && git push origin main', { resolveRemoteUrl: brainRemote, cwd: "." }), null)
T("git: -C into a non-Orbit repo allows", checkGitCommand("git -C /c/brain push origin main", { resolveRemoteUrl: brainRemote, cwd: "." }), null)
T("git: unresolvable remote still blocks (fails safe)", !!checkGitCommand("git push origin main", { resolveRemoteUrl: () => "", cwd: "." })?.block, true)
T("git: throwing remote resolver still blocks (fails safe)", !!checkGitCommand("git push origin main", { resolveRemoteUrl: () => { throw new Error("not a repo") }, cwd: "." })?.block, true)
T("git: bare push on main in a non-Orbit repo allows", checkGitCommand("git push", { resolveHeadBranch: () => "main", resolveRemoteUrl: brainRemote, cwd: "." }), null)
T("git: no-verify blocks even in a non-Orbit repo", !!checkGitCommand("git commit -m x " + NV, { resolveRemoteUrl: brainRemote })?.block, true)

// Every push in a chain is judged on its own target. Bouncing between sibling
// repos in one command is routine, so a chain must not be decided by whichever
// push happens to come first.
const perDirRemote = (dir) => (/brain/.test(String(dir)) ? brainRemote() : orbitRemote())
T(
  "git: chained unprotected push then Orbit push main blocks",
  !!checkGitCommand("git -C /c/brain push origin main && git -C /c/orbit-api push origin main", { resolveRemoteUrl: perDirRemote, cwd: "." })?.block,
  true,
)
T(
  "git: chained Orbit feature push then unprotected push main allows",
  checkGitCommand("git -C /c/orbit-api push origin feature/x && git -C /c/brain push origin main", { resolveRemoteUrl: perDirRemote, cwd: "." }),
  null,
)
T(
  "git: chained unprotected push then bare Orbit push on main blocks",
  !!checkGitCommand("git -C /c/brain push origin main && git -C /c/orbit-api push", { resolveRemoteUrl: perDirRemote, resolveHeadBranch: () => "main", cwd: "." })?.block,
  true,
)

// A heredoc body is data, not flags: writing ABOUT a banned flag in a commit
// message is not using it. But a heredoc feeding a shell IS commands.
T("git: heredoc message mentioning the flag allows", checkGitCommand(`git commit -F - <<'EOF'\nfix: stop passing ${NV} in CI\nEOF`), null)
T("git: heredoc message mentioning push main allows", checkGitCommand("git commit -F - <<'EOF'\ndocs: explain why git push origin main is blocked\nEOF"), null)
T("git: flag outside the heredoc still blocks", !!checkGitCommand(`git commit ${NV} -F - <<'EOF'\nmessage body\nEOF`)?.block, true)
T("git: shell heredoc keeps its body in scope", !!checkGitCommand("bash <<'EOF'\ngit push origin main\nEOF")?.block, true)
// The shell exception must be anchored to each heredoc's own consumer: a body
// that merely mentions `bash <<` must not switch its own stripping back off.
T(
  "git: body mentioning a shell heredoc still gets stripped",
  checkGitCommand(`gh pr create --body "$(cat <<'PRBODY'\nthe bash <<EOF form keeps its body; the cron does git push on main\nPRBODY\n)"`),
  null,
)
// git worktree remove --force follows a Windows junction and deletes the target.
T("git-worktree: --force blocks", !!checkGitWorktreeRemove("git worktree remove --force .claude/worktrees/x")?.block, true)
T("git-worktree: -f short form blocks", !!checkGitWorktreeRemove("git worktree remove -f .claude/worktrees/x")?.block, true)
T("git-worktree: no force allows", checkGitWorktreeRemove("git worktree remove .claude/worktrees/x"), null)
T("git-worktree: unrelated git allows", checkGitWorktreeRemove("git worktree list"), null)
T("git-worktree: -f inside a path is not the flag", checkGitWorktreeRemove("git worktree remove .claude/worktrees/feat-foo"), null)
// A commit message that NAMES the flag is data, not a command (heredoc body stripped).
T(
  "git-worktree: heredoc message naming the flag allows",
  checkGitWorktreeRemove("git commit -F - <<'EOF'\nchore: block git worktree remove --force in the junction guard\nEOF"),
  null,
)
// The force flag must be in the SAME segment as `worktree remove` (segment-scoped
// like checkGitCommand): a later `--force` on an unrelated command must not block.
T(
  "git-worktree: force on a later chained command allows",
  checkGitWorktreeRemove("git worktree remove .claude/worktrees/x && npm test -- --force"),
  null,
)
T(
  "git-worktree: force in the same segment still blocks",
  !!checkGitWorktreeRemove("git worktree remove --force .claude/worktrees/x && npm test")?.block,
  true,
)

// EF raw index SQL must be idempotent: a bare CREATE INDEX throws 42P07 at startup deploy.
T(
  "ef-index: raw CREATE UNIQUE INDEX blocks",
  !!checkEfMigrationRawIndex("/x/orbit-api/src/Orbit.Infrastructure/Migrations/20260101_Add.cs", 'migrationBuilder.Sql("CREATE UNIQUE INDEX ix_foo ON foo (bar)");')?.block,
  true,
)
T(
  "ef-index: raw DROP INDEX without IF EXISTS blocks",
  !!checkEfMigrationRawIndex("/x/orbit-api/src/Orbit.Infrastructure/Migrations/20260101_Add.cs", 'migrationBuilder.Sql("DROP INDEX ix_foo");')?.block,
  true,
)
T(
  "ef-index: IF NOT EXISTS form allows",
  checkEfMigrationRawIndex("/x/orbit-api/src/Orbit.Infrastructure/Migrations/20260101_Add.cs", 'migrationBuilder.Sql("CREATE INDEX IF NOT EXISTS ix_foo ON foo (bar)");'),
  null,
)
T(
  "ef-index: CreateIndex API call allows",
  checkEfMigrationRawIndex("/x/orbit-api/src/Orbit.Infrastructure/Migrations/20260101_Add.cs", 'migrationBuilder.CreateIndex(name: "ix_foo", table: "foo", column: "bar");'),
  null,
)
T("ef-index: off-path skipped", checkEfMigrationRawIndex("/x/orbit-api/src/Orbit.Application/Foo.cs", 'migrationBuilder.Sql("CREATE INDEX ix_foo ON foo (bar)");'), null)
// Multi-statement Sql(): a sibling statement's IF NOT EXISTS must not mask another
// statement in the same call that lacks it (PR #556 review, per-statement check).
T(
  "ef-index: batched Sql with one non-idempotent statement blocks",
  !!checkEfMigrationRawIndex(
    "/x/orbit-api/src/Orbit.Infrastructure/Migrations/20260101_Add.cs",
    'migrationBuilder.Sql("CREATE INDEX IF NOT EXISTS ix_b ON foo (b); CREATE INDEX ix_a ON foo (a);");',
  )?.block,
  true,
)
T(
  "ef-index: batched Sql with all idempotent statements allows",
  checkEfMigrationRawIndex(
    "/x/orbit-api/src/Orbit.Infrastructure/Migrations/20260101_Add.cs",
    'migrationBuilder.Sql("CREATE INDEX IF NOT EXISTS ix_b ON foo (b); CREATE INDEX IF NOT EXISTS ix_a ON foo (a);");',
  ),
  null,
)

// A Linear WRITE goes through orca; only the project overview document, which
// orca cannot reach, may be mutated raw. Reads stay open - /orchestrate depends
// on `project(id) { content }`, which `orca linear project list` does not return.
const LINEAR = "https://api.linear.app/graphql"
const post = (body) => `curl -s ${LINEAR} -H "Authorization: $KEY" -d '{"query":"${body}"}'`
T("linear: issueCreate blocks", !!checkLinearMutation(post('mutation { issueCreate(input: {title: \\"x\\"}) { success } }'))?.block, true)
T("linear: issueUpdate blocks", !!checkLinearMutation(post('mutation { issueUpdate(id: \\"x\\", input: {stateId: \\"y\\"}) { success } }'))?.block, true)
T("linear: commentCreate blocks", !!checkLinearMutation(post('mutation { commentCreate(input: {body: \\"x\\"}) { success } }'))?.block, true)
T("linear: named mutation with variables blocks", !!checkLinearMutation(post("mutation Add($i: IssueCreateInput!) { issueCreate(input: $i) { success } }"))?.block, true)
T("linear: aliased field is judged on the real field", !!checkLinearMutation(post("mutation { made: issueCreate(input: {}) { success } }"))?.block, true)
// The one legitimate raw write, and the read /orchestrate runs every launch.
T("linear: projectUpdate allows", checkLinearMutation(post('mutation { projectUpdate(id: \\"x\\", input: {content: \\"y\\"}) { success } }')), null)
T("linear: project content read allows", checkLinearMutation(post('query { project(id: \\"x\\") { name description content } }')), null)
T("linear: bare selection-set read allows", checkLinearMutation(post('{ issue(id: \\"ORB-1\\") { title } }')), null)
T("linear: a non-Linear endpoint is none of this gate's business", checkLinearMutation('curl https://api.github.com/graphql -d \'{"query":"mutation { issueCreate }"}\''), null)
// An allowed mutation batched with a banned one must not launder it.
T(
  "linear: projectUpdate batched with issueCreate blocks",
  !!checkLinearMutation(post("mutation { projectUpdate(id: $p, input: {}) { success } issueCreate(input: {}) { success } }"))?.block,
  true,
)
// A nested field named like a root mutation is not one: depth decides.
T("linear: nested issueCreate-shaped selection allows", checkLinearMutation(post("mutation { projectUpdate(id: $p, input: {}) { project { issueCreate { id } } } }")), null)
// The batched case above used an EMPTY input object, so it never exercised the
// bypass it looked like it covered (PR #611 review). A `}` inside a string
// argument desyncs a naive brace walk and ends the scan early, hiding every
// field after it. `content` is free prose and is the entire reason projectUpdate
// is allowed raw, so the one permitted mutation carries the payload most likely
// to defeat the parse. Both wire forms, since the quoting differs:
const SMUGGLE = 'mutation { a: projectUpdate(input: {content: "note } trailing"}) { id } b: issueCreate(input: {title: "x"}) { id } }'
T("linear: a brace inside a string argument cannot smuggle issueCreate", !!checkLinearMutation(`curl ${LINEAR} -d '${SMUGGLE}'`)?.block, true)
T("linear: same smuggle inside a JSON payload blocks", !!checkLinearMutation(post(SMUGGLE.replaceAll('"', '\\"')))?.block, true)
// The allowed mutation must still pass when its content legitimately holds a brace.
T(
  "linear: projectUpdate whose content contains a brace still allows",
  checkLinearMutation(post('mutation { projectUpdate(id: $p, input: {content: \\"a snippet: if (x) { y }\\"}) { success } }')),
  null,
)
// Fails safe on anything unreadable: a payload behind a file reference, and a
// mutation keyword with no selection set to parse.
T("linear: file-reference payload blocks", !!checkLinearMutation(`curl -s ${LINEAR} -H "Authorization: $KEY" --data-binary @payload.json`)?.block, true)
T("linear: -d @file payload blocks", !!checkLinearMutation(`curl -s ${LINEAR} -d @payload.json`)?.block, true)
// Prose that merely says the word is not a call: a real operation always parses
// to a root field. The fail-safe lives on the opaque-payload form above, not here.
T("linear: the bare word mutation is prose, allows", checkLinearMutation(`curl ${LINEAR} -d "mutation"`), null)
T("linear: the hook's own hyphenated name is not the keyword", checkLinearMutation(`see forbid-raw-linear-mutation for the ${LINEAR} rules { and a stray brace }`), null)
// Prose shorthand: the operation and its body written without the outer selection
// set, so the first brace is the input object. Both skills document a call this
// way, and the first version of this rule reported both of them.
T(
  "linear: shorthand projectCreate allows",
  checkLinearMutation('POST https://api.linear.app/graphql with mutation `projectCreate(input: { name: "x", teamIds: ["y"] }) { project { id } }`'),
  null,
)
T(
  "linear: shorthand issueCreate still blocks",
  !!checkLinearMutation('POST https://api.linear.app/graphql with mutation `issueCreate(input: { title: "x" }) { success }`')?.block,
  true,
)
T("linear: non-string input allows", checkLinearMutation(undefined), null)

// ---------------------------------------------------------------------------
// 2. Claude Code hooks: run the real files, assert exit codes
// ---------------------------------------------------------------------------
console.log("\n# claude code hooks (real files)")
// One UNIQUE fixture root per run, removed best-effort on exit: a leaked tmp dir
// is garbage, never a verdict.
const root = mkdtempSync(join(tmpdir(), "orbit-hook-parity-"))
process.on("exit", () => {
  try {
    rmSync(root, { recursive: true, force: true })
  } catch {
    /* a transient lock on the fixture root must never mask the suite's verdict */
  }
})
const write = (rel, body) => {
  const p = join(root, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, body)
  return p
}
function runHook(file, payload) {
  const res = spawnSync(process.execPath, [join(hooksDir, file)], { input: JSON.stringify(payload), encoding: "utf8" })
  return res.status
}

T("cc git-guardrails: push main -> 2", runHook("git-guardrails.mjs", { tool_name: "Bash", tool_input: { command: "git push origin main" } }), 2)
T("cc git-guardrails: feature -> 0", runHook("git-guardrails.mjs", { tool_name: "Bash", tool_input: { command: "git push origin feature/x" } }), 0)
T("cc git-guardrails: worktree remove --force -> 2", runHook("git-guardrails.mjs", { tool_name: "Bash", tool_input: { command: "git worktree remove --force .claude/worktrees/x" } }), 2)
T("cc git-guardrails: worktree remove (no force) -> 0", runHook("git-guardrails.mjs", { tool_name: "Bash", tool_input: { command: "git worktree remove .claude/worktrees/x" } }), 0)
const efBad = write("orbit-api/src/Orbit.Infrastructure/Migrations/20260101_Add.cs", 'migrationBuilder.Sql("CREATE UNIQUE INDEX ix_foo ON foo (bar)");\n')
const efGood = write("orbit-api/src/Orbit.Infrastructure/Migrations/20260102_Add.cs", 'migrationBuilder.Sql("CREATE INDEX IF NOT EXISTS ix_foo ON foo (bar)");\n')
T("cc ef-index: raw CREATE INDEX -> 2", runHook("forbid-ef-migration-raw-index.mjs", { tool_name: "Write", tool_input: { file_path: efBad } }), 2)
T("cc ef-index: IF NOT EXISTS -> 0", runHook("forbid-ef-migration-raw-index.mjs", { tool_name: "Write", tool_input: { file_path: efGood } }), 0)

// The Linear guard is wired to BOTH events: the shell call, and the script that
// will make it. Only the second can be pre-empted before anything reaches Linear.
const LINEAR_HOOK = "forbid-raw-linear-mutation.mjs"
T("cc linear: bash issueCreate -> 2", runHook(LINEAR_HOOK, { tool_name: "Bash", tool_input: { command: post("mutation { issueCreate(input: {}) { success } }") } }), 2)
T("cc linear: bash projectUpdate -> 0", runHook(LINEAR_HOOK, { tool_name: "Bash", tool_input: { command: post("mutation { projectUpdate(id: $p, input: {}) { success } }") } }), 0)
T("cc linear: bash content read -> 0", runHook(LINEAR_HOOK, { tool_name: "Bash", tool_input: { command: post("query { project(id: $p) { content } }") } }), 0)
T(
  "cc linear: written script that mutates -> 2",
  runHook(LINEAR_HOOK, { tool_name: "Write", tool_input: { file_path: join(root, "post.mjs"), content: `fetch("${LINEAR}", { body: '{"query":"mutation { issueCreate(input: {}) { id } }"}' })` } }),
  2,
)
T(
  "cc linear: MultiEdit that mutates -> 2",
  runHook(LINEAR_HOOK, { tool_name: "MultiEdit", tool_input: { file_path: join(root, "post.mjs"), edits: [{ new_string: "const x = 1" }, { new_string: `fetch("${LINEAR}", { body: 'mutation { commentCreate(input: {}) { id } }' })` }] } }),
  2,
)
// The gate does not police its own source: a fixture that NAMES the pattern is
// not a call. Without this, adding the tests above reports the tests.
T(
  "cc linear: the gate's own fixtures -> 0",
  runHook(LINEAR_HOOK, { tool_name: "Edit", tool_input: { file_path: join(hooksDir, "test-hooks.mjs"), new_string: post("mutation { issueCreate(input: {}) { id } }") } }),
  0,
)
T("cc linear: unrelated command -> 0", runHook(LINEAR_HOOK, { tool_name: "Bash", tool_input: { command: "npm test" } }), 0)

// ---------------------------------------------------------------------------
// 3. Agent frontmatter: the fails-open `Bash(...)` trap
// ---------------------------------------------------------------------------
// `tools: Bash(gh:*)` does not restrict anything: the specifier is silently
// stripped, the entry resolves to bare `Bash`, and the agent gets a full unscoped
// shell behind frontmatter that reads like a restriction. It does not error, and
// the "fails to launch if nothing resolves" net never fires, because it DOES
// resolve. Prose cannot catch that; this can. See CLAUDE.md, "Agent tool scoping".
console.log("\n# agent frontmatter (fails-open Bash(...) guard)")
const repoRoot = join(hooksDir, "..", "..")

// The sibling repo is resolved off the MAIN checkout: this suite also runs from
// a linked worktree, where `../orbit-api` points into the worktree tree and
// would silently scan nothing.
function mainCheckoutRoot() {
  const res = spawnSync("git", ["-C", repoRoot, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" })
  return res.status === 0 && res.stdout.trim() ? dirname(res.stdout.trim()) : repoRoot
}

function frontmatterToolEntries(body) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body)
  if (!frontmatter) return []
  return frontmatter[1]
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = /^(?:tools|disallowedTools):\s*(.+)$/.exec(line)
      return match ? match[1].split(",").map((entry) => entry.trim()) : []
    })
    .filter(Boolean)
}

// `Agent(type)` is the one parenthesized form the frontmatter genuinely supports.
// Every other `Tool(...)` is the trap.
const failsOpen = (entry) => /^[A-Za-z_]\w*\s*\(/.test(entry) && !/^Agent\s*\(/.test(entry)

const agentDirs = [join(repoRoot, ".claude", "agents"), join(mainCheckoutRoot(), "..", "orbit-api", ".claude", "agents")]
let agentsScanned = 0
for (const dir of agentDirs) {
  if (!existsSync(dir)) {
    console.log(`SKIP ${dir} (not present)`)
    continue
  }
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".md"))) {
    agentsScanned++
    const entries = frontmatterToolEntries(readFileSync(join(dir, file), "utf8"))
    T(`agents: ${file} declares no fails-open parenthesized specifier`, entries.filter(failsOpen), [])
  }
}
// A guard that scanned nothing passes vacuously; make that a failure instead.
T("agents: the guard actually scanned agent files", agentsScanned > 0, true)

console.log(`\n${fails === 0 ? "ORBIT HOOK PARITY OK" : `ORBIT HOOK PARITY FAILED (${fails})`}`)
process.exit(fails === 0 ? 0 : 1)
