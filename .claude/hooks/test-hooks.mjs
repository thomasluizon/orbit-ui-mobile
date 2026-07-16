#!/usr/bin/env node
// Parity proof for Orbit's dual-target hook engine. Three layers:
//   1. _lib unit checks — the shared rule logic in isolation.
//   2. Claude Code hooks — run the real hook files with stdin payloads; asserts
//      the refactor preserved the exact block/allow behavior (regression guard).
//   3. opencode plugin — drive the real plugin's tool.execute.before/after; the
//      SAME rule, off the SAME _lib, must block/allow identically.
// Run: node .claude/hooks/test-hooks.mjs   (exits non-zero on any failure)

import { mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { checkGitCommand, checkNpmExpoPin } from "./_lib/rules-git.mjs"
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

rmSync(root, { recursive: true, force: true })
console.log(`\n${fails === 0 ? "ORBIT HOOK PARITY OK" : `ORBIT HOOK PARITY FAILED (${fails})`}`)
process.exit(fails === 0 ? 0 : 1)
