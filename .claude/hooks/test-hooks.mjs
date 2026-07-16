#!/usr/bin/env node
// Parity proof for Orbit's dual-target hook engine. Three layers:
//   1. _lib unit checks — the shared rule logic in isolation.
//   2. Claude Code hooks — run the real hook files with stdin payloads; asserts
//      the refactor preserved the exact block/allow behavior (regression guard).
//   3. opencode plugin — drive the real plugin's tool.execute.before/after; the
//      SAME rule, off the SAME _lib, must block/allow identically.
// Run: node .claude/hooks/test-hooks.mjs   (exits non-zero on any failure)

import { mkdirSync, writeFileSync, rmSync, cpSync, readFileSync, readdirSync, existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { checkGitCommand, checkNpmExpoPin } from "./_lib/rules-git.mjs"
import { checkShellAllowlist, PRIMER_SHELL_ALLOWLIST } from "./_lib/rules-shell-allowlist.mjs"
import { checkEmDashes, checkBrandColors } from "./_lib/rules-content.mjs"
import { checkTsAntipatterns, checkNewTodos, checkCsharpAuthz, checkCsharpTimezone, checkCsharpFluentConfig } from "./_lib/rules-source.mjs"
import { classifyScope, parityMessages } from "./_lib/rules-parity.mjs"

const hooksDir = dirname(fileURLToPath(import.meta.url))
let fails = 0
const T = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fails++
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}
const NV = "--no-" + "verify"
const MARK = "TO" + "DO"
const EM = String.fromCharCode(8212) // em dash

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
T("npm: update blocks", !!checkNpmExpoPin("npm update")?.block, true)
T("npm: expo install pin blocks", !!checkNpmExpoPin("npm install expo-router@1.2.3")?.block, true)
T("npm: normal install allows", checkNpmExpoPin("npm install lodash"), null)

T("em: dash in locale blocks", !!checkEmDashes(`a ${EM} b`, "/x/packages/shared/src/i18n/en.json")?.block, true)
T("em: dash in code allows", checkEmDashes(`a ${EM} b`, "/x/apps/web/app/page.tsx"), null)
const fakeGlobals = () => ":root{ --primary: #7f46f7; --primary-rgb: 127, 70, 247; }"
T("brand: hex in web blocks", !!checkBrandColors("color:#7f46f7", "/x/apps/web/components/Foo.tsx", fakeGlobals)?.block, true)
T("brand: token allows", checkBrandColors("color:var(--primary)", "/x/apps/web/components/Foo.tsx", fakeGlobals), null)

T("ts: console.log blocks", !!checkTsAntipatterns("/x/apps/web/a.ts", "console.log(1)")?.block, true)
T("ts: clean allows", checkTsAntipatterns("/x/apps/web/a.ts", "export const a = 1"), null)
T("ts: test file skipped", checkTsAntipatterns("/x/apps/web/a.test.ts", "console.log(1)"), null)
T("todos: marker blocks", !!checkNewTodos("/x/apps/web/a.ts", `// ${MARK}: fix`)?.block, true)
T("todos: tracked ref allows", checkNewTodos("/x/apps/web/a.ts", `// ${MARK} #123: later`), null)
T("csharp-authz: missing blocks", !!checkCsharpAuthz("/x/orbit-api/src/Orbit.Api/Controllers/FooController.cs", "public class FooController {}")?.block, true)
T("csharp-authz: present allows", checkCsharpAuthz("/x/orbit-api/src/Orbit.Api/Controllers/FooController.cs", "[Authorize]\npublic class FooController {}"), null)
T("csharp-tz: UtcNow blocks", !!checkCsharpTimezone("/x/orbit-api/src/Orbit.Application/Foo.cs", "var x = DateTime.UtcNow;")?.block, true)
T("csharp-tz: AtUtc allows", checkCsharpTimezone("/x/orbit-api/src/Orbit.Application/Foo.cs", "var CreatedAtUtc = DateTime.UtcNow;"), null)
T("csharp-fluent: unconfigured blocks", !!checkCsharpFluentConfig("/x/orbit-api/src/Orbit.Infrastructure/Persistence/OrbitDbContext.cs", "DbSet<Habit> Habits {get;}")?.block, true)
T("parity: classify web", classifyScope("/x/apps/web/a.ts"), "web")
T("parity: nudge fires", parityMessages({ web: 3, mobile: 0 }).length > 0, true)

// primer's agent-scoped shell allowlist. The deny cases are the point: a prefix
// allowlist alone is not a fence, so the metacharacter rejection must run first.
const PRIMER = { allowlist: PRIMER_SHELL_ALLOWLIST, agent: "primer" }
T("shell: gh issue view allows", checkShellAllowlist("gh issue view 123 --json title,body", PRIMER), null)
T("shell: git log allows", checkShellAllowlist("git log --oneline -10", PRIMER), null)
T("shell: git branch --show-current allows", checkShellAllowlist("git branch --show-current", PRIMER), null)
T("shell: git -C <dir> log allows (the form /prime actually runs)", checkShellAllowlist('git -C "C:\\Users\\x\\orbit-api" log --oneline -10', PRIMER), null)
T("shell: git -C <dir with spaces> log allows", checkShellAllowlist('git -C "C:\\Program Files\\repo" log', PRIMER), null)
T("shell: echo denied", !!checkShellAllowlist("echo hi", PRIMER)?.block, true)
T("shell: chained bypass denied", !!checkShellAllowlist("git log && echo pwned", PRIMER)?.block, true)
T("shell: chained write to a source file denied", !!checkShellAllowlist("git log && echo pwned > x.ts", PRIMER)?.block, true)
T("shell: redirection denied", !!checkShellAllowlist("git log > /tmp/x", PRIMER)?.block, true)
T("shell: command substitution denied", !!checkShellAllowlist("git log $(whoami)", PRIMER)?.block, true)
T("shell: backtick substitution denied", !!checkShellAllowlist("git log `whoami`", PRIMER)?.block, true)
T("shell: pipe denied", !!checkShellAllowlist("git log | sh", PRIMER)?.block, true)
T("shell: semicolon denied", !!checkShellAllowlist("git log; rm -rf /", PRIMER)?.block, true)
T("shell: newline denied", !!checkShellAllowlist("git log\necho pwned", PRIMER)?.block, true)
T("shell: shell-escaped chaining denied", !!checkShellAllowlist("git log \\&\\& echo pwned", PRIMER)?.block, true)
// `git -c` executes arbitrary code through config, so it must not survive the
// -C stripping that the /prime form depends on.
T("shell: git -c config escape denied", !!checkShellAllowlist("git -c core.pager=sh log", PRIMER)?.block, true)
T("shell: git --exec-path escape denied", !!checkShellAllowlist("git --exec-path=/tmp log", PRIMER)?.block, true)
// Rejecting `>` does NOT make "never writes" structural on its own: a
// subcommand's own flags write files with no shell metacharacter at all. These
// two are the real thing — `git log --format=format:x --output=<path>` was a
// verified arbitrary-file-write through the first version of this allowlist
// (PR #546 review), which is why arguments are allowlisted and not just the
// command prefix.
T("shell: git log --output= (arbitrary file write, no metacharacter) denied", !!checkShellAllowlist("git log --output=/tmp/x", PRIMER)?.block, true)
T("shell: git log --format=format:x --output= (attacker-chosen content) denied", !!checkShellAllowlist("git log -1 --format=format:pwned --output=/tmp/x", PRIMER)?.block, true)
T("shell: git log --ext-diff denied (unlisted flag)", !!checkShellAllowlist("git log --ext-diff", PRIMER)?.block, true)
T("shell: gh issue view --template denied (unlisted flag)", !!checkShellAllowlist("gh issue view 1 --template x", PRIMER)?.block, true)
// The exact entry takes no arguments: git rejects -D alongside --show-current
// today, but that is git's conflict handling, not this fence's.
T("shell: git branch --show-current with trailing tokens denied", !!checkShellAllowlist("git branch --show-current -D main", PRIMER)?.block, true)
// Same binary, same subcommand prefix depth, mutating verb: prove the match is
// per-token and not a loose "starts with git/gh" check.
T("shell: git branch -D denied", !!checkShellAllowlist("git branch -D main", PRIMER)?.block, true)
T("shell: git push denied", !!checkShellAllowlist("git push origin main", PRIMER)?.block, true)
T("shell: gh pr create denied", !!checkShellAllowlist("gh pr create --title x", PRIMER)?.block, true)
T("shell: gh issue edit denied", !!checkShellAllowlist("gh issue edit 1 --body x", PRIMER)?.block, true)

// ---------------------------------------------------------------------------
// 2. Claude Code hooks — run the real files, assert exit codes
// ---------------------------------------------------------------------------
console.log("\n# claude code hooks (real files)")
const root = join(tmpdir(), "orbit-hook-parity")
rmSync(root, { recursive: true, force: true })
mkdirSync(root, { recursive: true })
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
T("cc expo-pin: update -> 2", runHook("forbid-expo-pin-bump.mjs", { tool_name: "Bash", tool_input: { command: "npm update" } }), 2)
T("cc em-dashes: locale dash -> 2", runHook("forbid-em-dashes.mjs", { tool_name: "Write", tool_input: { file_path: join(root, "packages/shared/src/i18n/en.json"), content: `{"k":"a ${EM} b"}` } }), 2)
const tsBad = write("apps/web/bad.ts", "console.log(1)\n")
const tsGood = write("apps/web/good.ts", "export const a = 1\n")
T("cc ts-antipatterns: console -> 2", runHook("forbid-ts-antipatterns.mjs", { tool_name: "Write", tool_input: { file_path: tsBad } }), 2)
T("cc ts-antipatterns: clean -> 0", runHook("forbid-ts-antipatterns.mjs", { tool_name: "Write", tool_input: { file_path: tsGood } }), 0)
const todoBad = write("apps/web/todo.ts", `// ${MARK}: later\n`)
T("cc flag-new-todos: marker -> 2", runHook("flag-new-todos.mjs", { tool_name: "Write", tool_input: { file_path: todoBad } }), 2)
const ctrlBad = write("orbit-api/src/Orbit.Api/Controllers/FooController.cs", "public class FooController {}\n")
T("cc csharp-authz: missing -> 2", runHook("csharp-authz.mjs", { tool_name: "Write", tool_input: { file_path: ctrlBad } }), 2)
const tzBad = write("orbit-api/src/Orbit.Application/Foo.cs", "var x = DateTime.UtcNow;\n")
T("cc csharp-tz: UtcNow -> 2", runHook("csharp-tz.mjs", { tool_name: "Write", tool_input: { file_path: tzBad } }), 2)

// primer's allowlist is wired in .claude/agents/primer.md's own frontmatter, not
// settings.json, so this asserts the file the agent points at really behaves.
const primerShell = (command) => runHook("primer-shell-allowlist.mjs", { tool_name: "Bash", tool_input: { command } })
T("cc primer-allowlist: gh issue view -> 0", primerShell("gh issue view 1"), 0)
T("cc primer-allowlist: git log -> 0", primerShell("git log --oneline -10"), 0)
// The two absolute `-C` forms /prime's step 4 actually runs. A false positive
// here breaks priming outright, so pin them against the real hook, not just _lib.
T("cc primer-allowlist: -C log (the form /prime runs) -> 0", primerShell('git -C "C:\\Users\\x\\orbit-api" log --oneline -10'), 0)
T("cc primer-allowlist: -C branch --show-current -> 0", primerShell('git -C "C:\\Users\\x\\orbit-api" branch --show-current'), 0)
T("cc primer-allowlist: echo -> 2", primerShell("echo hi"), 2)
T("cc primer-allowlist: chained bypass -> 2", primerShell("git log && echo pwned"), 2)
T("cc primer-allowlist: redirection -> 2", primerShell("git log > /tmp/x"), 2)
T("cc primer-allowlist: substitution -> 2", primerShell("git log $(whoami)"), 2)
// Unlike every other adapter here (which exits 0 on error so a broken hook never
// wedges Bash), this one is a security fence: an unvalidated command must not run.
T("cc primer-allowlist: unreadable payload fails CLOSED -> 2", runHook("primer-shell-allowlist.mjs", { tool_name: "Bash", tool_input: {} }), 2)
// The file-write primitive that has no shell metacharacter, through the real hook.
T("cc primer-allowlist: git log --output= -> 2", primerShell("git log -1 --format=format:pwned --output=/tmp/orbit-poc.txt"), 2)

// ---------------------------------------------------------------------------
// 3. opencode plugin — same rules, opencode contract
// ---------------------------------------------------------------------------
console.log("\n# opencode plugin (real plugin, .mjs copy for the Node loader)")
const repoRoot = join(hooksDir, "..", "..")
const pluginSrc = join(repoRoot, ".opencode", "plugin", "orbit-guardrails.js")
const pluginMjs = join(root, "orbit-guardrails.probe.mjs")
cpSync(pluginSrc, pluginMjs)
const plugin = (await import(pathToFileURL(pluginMjs).href)).default
// The plugin resolves _lib from the project directory (the real repo root); the
// fixture files it reads are absolute temp paths, so the directory only anchors _lib.
const hooks = await plugin({ directory: repoRoot })
const before = async (tool, args) => {
  try {
    await hooks["tool.execute.before"]({ tool }, { args })
    return false
  } catch {
    return true
  }
}
const after = async (tool, args) => {
  try {
    await hooks["tool.execute.after"]({ tool }, { args })
    return false
  } catch {
    return true
  }
}
T("oc before: push main throws", await before("bash", { command: "git push origin main" }), true)
T("oc before: feature allows", await before("bash", { command: "git push origin feature/x" }), false)
T("oc before: npm update throws", await before("bash", { command: "npm update" }), true)
T("oc before: em dash throws", await before("write", { filePath: join(root, "packages/shared/src/i18n/en.json"), content: `a ${EM} b` }), true)
T("oc after: console.log throws", await after("edit", { filePath: tsBad, newString: "x" }), true)
T("oc after: clean allows", await after("edit", { filePath: tsGood, newString: "x" }), false)
T("oc after: csharp authz throws", await after("write", { filePath: ctrlBad, content: "x" }), true)
T("oc exposes session.idle guard", typeof hooks["event"], "function")

// ---------------------------------------------------------------------------
// 4. Agent frontmatter — the fails-open `Bash(...)` trap
// ---------------------------------------------------------------------------
// `tools: Bash(gh:*)` does not restrict anything: the specifier is silently
// stripped, the entry resolves to bare `Bash`, and the agent gets a full unscoped
// shell behind frontmatter that reads like a restriction. It does not error, and
// the "fails to launch if nothing resolves" net never fires, because it DOES
// resolve. Prose cannot catch that; this can. See CLAUDE.md, "Agent tool scoping".
console.log("\n# agent frontmatter (fails-open Bash(...) guard)")

// The sibling repo is resolved off the MAIN checkout: this suite also runs from
// .claude/worktrees/<name>, where `../orbit-api` points into the worktree tree
// and would silently scan nothing.
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
    const offenders = frontmatterToolEntries(readFileSync(join(dir, file), "utf8")).filter(failsOpen)
    T(`agents: ${file} declares no parenthesized tool specifier`, offenders, [])
  }
}
// A guard that scanned nothing passes vacuously; make that a failure instead.
T("agents: the guard actually scanned agent files", agentsScanned > 0, true)

rmSync(root, { recursive: true, force: true })
console.log(`\n${fails === 0 ? "ORBIT HOOK PARITY OK" : `ORBIT HOOK PARITY FAILED (${fails})`}`)
process.exit(fails === 0 ? 0 : 1)
