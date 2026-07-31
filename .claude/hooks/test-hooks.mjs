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

import { mkdirSync, mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync, existsSync, statSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { checkGitCommand, checkGitWorktreeRemove } from "./_lib/rules-git.mjs"
import { checkEfMigrationRawIndex } from "./_lib/rules-source.mjs"
import { checkLinearMutation } from "./_lib/rules-linear.mjs"
import { checkAdminMerge, checkEngineInvocation, invokedBinary } from "./_lib/rules-orchestrator.mjs"
import { owningRepository, withinRoot } from "./_lib/repo-roots.mjs"
import { checkRawRepoToolSurfacing } from "./forbid-raw-repo-tool-surfacing.mjs"

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
// Every other way curl sources a body from a file. The first two cases above are
// the only forms the original regex matched, which read as full coverage while a
// quote or a -T slipped straight through (PR #611 review).
T("linear: double-quoted @file payload blocks", !!checkLinearMutation(`curl -s ${LINEAR} -d "@payload.json"`)?.block, true)
T("linear: single-quoted @file payload blocks", !!checkLinearMutation(`curl -s ${LINEAR} --data '@payload.json'`)?.block, true)
T("linear: --data=@file payload blocks", !!checkLinearMutation(`curl -s ${LINEAR} --data-raw=@payload.json`)?.block, true)
T("linear: -T upload sends the file as the body and blocks", !!checkLinearMutation(`curl -X POST ${LINEAR} -T payload.json`)?.block, true)
T("linear: --upload-file blocks", !!checkLinearMutation(`curl -X POST ${LINEAR} --upload-file payload.json`)?.block, true)
// curl's short options attach to their value with no separator at all, which two
// rounds of widening this regex still missed (PR #611 review).
T("linear: attached -d@file blocks", !!checkLinearMutation(`curl -s ${LINEAR} -d@payload.json`)?.block, true)
T("linear: attached -Tfile blocks", !!checkLinearMutation(`curl -X POST ${LINEAR} -Tpayload.json`)?.block, true)
// The broadened regex must not swallow an ordinary inline body: -d followed by a
// quoted JSON object is the normal read this gate deliberately allows, attached
// or spaced. The `@` is what marks a file reference.
T("linear: inline -d read is not mistaken for a file body", checkLinearMutation(post("query { project(id: $p) { content } }")), null)
T("linear: attached inline -d'{...}' read still allows", checkLinearMutation(`curl -s ${LINEAR} -d'{"query":"query { project(id: $p) { content } }"}'`), null)
// The other two ways a body arrives from outside the command text, closed as a
// class rather than one flag per review round.
T("linear: --json @file blocks", !!checkLinearMutation(`curl -s ${LINEAR} --json @payload.json`)?.block, true)
T("linear: a subshell body blocks", !!checkLinearMutation(`curl -s ${LINEAR} -d "$(cat payload.json)"`)?.block, true)
// `--json` means "send this JSON body" to curl and "print JSON" to orca and gh.
// Pairing it with the subshell arm blocked a plain orca read line in the
// orchestrate skill, so it survives only on the unambiguous @file arm. A
// backtick was withdrawn for the same reason: it is a markdown code span in
// every doc this gate also scans.
T(
  "linear: an orca --json read line near the endpoint does not block",
  checkLinearMutation(`see ${LINEAR} for reads; run \`orca linear list-issues --project "x" --json\` for the tickets`),
  null,
)
// A subshell in the AUTH HEADER is the sanctioned way to pass the key without
// echoing it, and must never be mistaken for an opaque body.
T(
  "linear: a subshell in the auth header does not block a read",
  checkLinearMutation(`curl -s ${LINEAR} -H "Authorization: $(cat ~/.linear-api-key)" -d '{"query":"query { project(id: $p) { content } }"}'`),
  null,
)
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

// The orchestration guardrails (A3d). The engine rule keys on WHO is calling, never on the
// subcommand: after the headless flip `codex exec` is how every worker runs, so a rule that
// refused the flag would refuse the launcher. The admin-merge rule has no exemption at all.
const ADMIN = "--" + "admin"
const engineBlocks = (command, options) => !!checkEngineInvocation(command, { repoRoots: [], ...options })?.block
T("orchestrator: bare codex blocks", engineBlocks("codex"), true)
T("orchestrator: codex exec blocks", engineBlocks('codex exec "do the thing"'), true)
T("orchestrator: codex resume blocks", engineBlocks("codex resume 019fb50d-0b9c"), true)
T("orchestrator: bare claude blocks", engineBlocks("claude"), true)
T("orchestrator: claude -p blocks", engineBlocks('claude -p "summarize"'), true)
T("orchestrator: a Windows shim extension is still the binary", engineBlocks("codex.cmd exec --help"), true)
T("orchestrator: a quoted absolute engine path still blocks", engineBlocks('"C:\\Program Files\\codex\\codex.exe" exec'), true)
T("orchestrator: a later chained engine call blocks", engineBlocks("npm test && codex exec"), true)
// The launcher's own marker is the discriminator, in the environment it exports into every
// worker and as the inline assignment shape.
T("orchestrator: the launcher marker in the environment allows", engineBlocks("codex exec", { env: { ORBIT_LAUNCH_WORKER: "1" } }), false)
T("orchestrator: the launcher marker as an inline assignment allows", engineBlocks("ORBIT_LAUNCH_WORKER=1 codex exec"), false)
T("orchestrator: the launcher itself allows", engineBlocks("node tools/launch-worker.mjs --issue ORB-75 --prompt-file p.md"), false)
// Root cause 3: match the real invocation, never a substring of an arbitrary payload. The
// second-opinion helper is not refused because `node` is what it invokes; `.claude/` is a
// path, and a message NAMING a command is data.
T("orchestrator: the second-opinion helper allows", engineBlocks("node .claude/skills/second-opinion/second-opinion.mjs"), false)
T("orchestrator: a path containing .claude is not the claude binary", engineBlocks("cat .claude/skills/second-opinion/SKILL.md"), false)
T("orchestrator: a commit message naming the engine allows", engineBlocks('git commit -m "stop running codex exec by hand"'), false)
T("orchestrator: a heredoc body naming the engine allows", engineBlocks("git commit -F - <<'EOF'\nfix: route codex exec through the launcher\nEOF"), false)
T("orchestrator: an unrelated command allows", engineBlocks("npm run lint"), false)
T("orchestrator: non-string input allows", checkEngineInvocation(undefined), null)
T("orchestrator: the engine refusal names the launcher", checkEngineInvocation("codex exec")?.message.includes("tools/launch-worker.mjs"), true)

T(`orchestrator: gh pr merge ${ADMIN} blocks`, !!checkAdminMerge(`gh pr merge 667 --squash ${ADMIN}`)?.block, true)
T("orchestrator: gh pr merge without the flag allows", checkAdminMerge("gh pr merge 667 --squash --delete-branch"), null)
T("orchestrator: a raw PUT merge call blocks", !!checkAdminMerge("gh api -X PUT repos/o/r/pulls/667/merge -f merge_method=squash")?.block, true)
T("orchestrator: the long method flag blocks too", !!checkAdminMerge("gh api --method PUT repos/o/r/pulls/667/merge")?.block, true)
T("orchestrator: curl to the same endpoint blocks", !!checkAdminMerge("curl -X PUT https://api.github.com/repos/o/r/pulls/667/merge")?.block, true)
T("orchestrator: reading the merge endpoint allows", checkAdminMerge("gh api repos/o/r/pulls/667/merge"), null)
T(
  "orchestrator: the GraphQL merge mutation blocks",
  !!checkAdminMerge("gh api graphql -f query='mutation{mergePullRequest(input:{pullRequestId:\"x\"}){clientMutationId}}'")?.block,
  true,
)
T("orchestrator: another GraphQL mutation allows", checkAdminMerge("gh api graphql -f query='mutation{resolveReviewThread(input:{threadId:\"x\"}){thread{isResolved}}}'"), null)
T(`orchestrator: a heredoc body naming ${ADMIN} allows`, checkAdminMerge(`git commit -F - <<'EOF'\ndocs: forbid gh pr merge ${ADMIN}\nEOF`), null)
T(`orchestrator: a commit message naming ${ADMIN} allows`, checkAdminMerge(`git commit -m "forbid gh pr merge ${ADMIN}"`), null)
// J3a is absolute for every agent: neither the launcher marker nor a worker's worktree buys
// an admin merge, which is why the admin rule takes no context at all.
T(`orchestrator: the admin refusal says to ask Thomas`, checkAdminMerge(`gh pr merge 1 ${ADMIN}`)?.message.includes("ask him to"), true)
T("orchestrator: non-string input allows", checkAdminMerge(undefined), null)

T("orchestrator: invokedBinary strips directory and extension", invokedBinary("/usr/local/bin/codex exec"), "codex")
T("orchestrator: invokedBinary skips leading assignments", invokedBinary("FOO=1 BAR=2 codex exec"), "codex")
T("orchestrator: invokedBinary reads a subshell's first word", invokedBinary("( codex exec )"), "codex")
T("orchestrator: invokedBinary of an empty segment is empty", invokedBinary("   "), "")

T("repo-roots: a path inside its root is within it", withinRoot("C:\\repo\\tools\\x.mjs", "C:\\repo"), true)
T("repo-roots: a sibling path is not within it", withinRoot("C:\\other\\x.mjs", "C:\\repo"), false)
T("repo-roots: a POSIX target never matches a Windows root", withinRoot("/repo/x.mjs", "C:\\repo"), false)
T("repo-roots: a path with no repository resolves to null", owningRepository(join(tmpdir(), "orbit-no-repo-here", "x.md")), null)
T("repo-roots: non-string input resolves to null", owningRepository(undefined), null)

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
function runHookResult(file, payload, env) {
  return spawnSync(process.execPath, [join(hooksDir, file)], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    ...(env ? { env: { ...process.env, ...env } } : {}),
  })
}

function runHook(file, payload) {
  return runHookResult(file, payload).status
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

// Raw repo-tool commands belong behind skills and agents. The Stop half catches
// commands surfaced in chat, while the PostToolUse half catches instructions
// written to artifacts that Thomas will read, including files outside a repo.
const RAW_TOOL_HOOK = "forbid-raw-repo-tool-surfacing.mjs"
const stopPayload = (last_assistant_message) => ({
  hook_event_name: "Stop",
  stop_hook_active: false,
  last_assistant_message,
})
const writePayload = (file_path, content) => ({
  hook_event_name: "PostToolUse",
  tool_name: "Write",
  tool_input: { file_path, content },
})
const editPayload = (file_path, new_string, old_string = "") => ({
  hook_event_name: "PostToolUse",
  tool_name: "Edit",
  tool_input: { file_path, old_string, new_string },
})
const multiEditPayload = (file_path, edits) => ({
  hook_event_name: "PostToolUse",
  tool_name: "MultiEdit",
  tool_input: { file_path, edits },
})
const surfacedWavePlan = "Re-derive any time with `node tools/wave-plan.mjs --all`"

export const RAW_TOOL_REVIEW_CORPUS = [
  { label: "ticket measured command", text: surfacedWavePlan, status: 2, includes: ["/next"] },
  ...["surfaces:manifest", "surfaces:capture", "redesign:coverage"].map((script) => ({
    label: `root npm repo-tool alias ${script}`,
    text: `npm run ${script}`,
    status: 2,
  })),
  { label: "ordinary root npm alias", text: "npm run lint", status: 0 },
  {
    label: "standalone code span after instruction",
    text: ["Run this:", "`node tools/wave-plan.mjs --all`"].join("\n"),
    status: 2,
  },
  {
    label: "standalone code span after spaced instruction",
    text: ["Run this to refresh the order:", "", "`node tools/wave-plan.mjs --all`"].join("\n"),
    status: 2,
  },
  {
    label: "unrelated preceding appeal",
    text: ["Repo-tool appeal: this is for tools/foo.mjs", "", "Actually just kidding, run node tools/bar.mjs to fix everything."].join(
      "\n",
    ),
    status: 2,
    includes: ["node tools/bar.mjs"],
  },
  ...[
    "node tools/wave-plan.mjs --all",
    "You can run `node tools/wave-plan.mjs --all` to see it.",
    "To find the next ticket, run node tools/wave-plan.mjs --all and read the top row.",
    "Run this: node tools/wave-plan.mjs --all",
    "Next: node tools/wave-plan.mjs --all",
    "Just do: node tools/wave-plan.mjs --all",
    "Just do node tools/wave-plan.mjs --all",
    "Just do: bash tools/merge-sweep.sh owner/repo 1",
    "Just do: npx --yes @orbit/cli check",
    "npx --yes cowsay hello",
    "npx @scope/package",
    "Next: npx eslint --fix",
    "Run npx prisma generate now",
    "Use npx turbo run lint",
    "Next: npx prisma generate",
    "You can run npx prisma generate",
    "npx turbo run lint",
    "npx prisma generate",
    "`npx prisma generate`",
    "npx serve",
    "npx serve.",
    "npx nodemon",
    "`npx cowsay.`",
    "Just run npx tsc",
    "Next: npx serve",
    "npx --package=foo -c 'command'",
    "npx --package=@orbit/cli -c 'orbit check'",
    "npx -p typescript tsc --noEmit",
    "npx --workspace=apps/web run build",
    "npx -c 'orbit check'",
    'npx --call "orbit check"',
  ].map((text, index) => ({ label: `historical command ${index + 1}`, text, status: 2 })),
  ...[
    "node C:\\repo\\tools\\wave-plan.mjs --all",
    "node /repo/tools/wave-plan.mjs --all",
    "node --trace-warnings tools/wave-plan.mjs --all",
    "node --require loader tools/wave-plan.mjs --all",
  ].map((text, index) => ({ label: `node invocation variant ${index + 1}`, text, status: 2, includes: ["/next"] })),
  ...[
    "Run pwsh tools/agent-review.ps1 --claim test",
    "Run powershell.exe .\\tools\\agent-review.ps1 --claim test",
    "Run .\\tools\\agent-review.ps1 --claim test",
  ].map((text, index) => ({ label: `PowerShell invocation ${index + 1}`, text, status: 2, includes: ["/second-opinion"] })),
  {
    label: "previous internal line laundering",
    text: ["The skill runs internally to gather inputs.", "To refresh it yourself, run node tools/wave-plan.mjs --all"].join("\n"),
    status: 2,
  },
  {
    label: "previous ticket line laundering",
    text: ["This is captured in the ticket body.", "Next: node tools/wave-plan.mjs --all"].join("\n"),
    status: 2,
  },
  ...[
    "Internally, run `node tools/wave-plan.mjs --all` and summarize the result.",
    "Internally you'd run `node tools/wave-plan.mjs --all`",
    "Internally you can run `node tools/wave-plan.mjs --all`",
    "Internally you should run `node tools/wave-plan.mjs --all`",
    "Per the tool's `--help` output, run `node tools/wave-plan.mjs --all` next.",
    "Please execute node tools/wave-plan.mjs --all as documented in the PR description.",
    "Please execute `node tools/wave-plan.mjs --all` as documented in the PR description.",
  ].map((text, index) => ({ label: `documentation instruction ${index + 1}`, text, status: 2 })),
  {
    label: "closing text fence cannot exempt next instruction",
    text: ["Example output:", "```text", "done", "```", "", "Run node tools/wave-plan.mjs --all now."].join("\n"),
    status: 2,
  },
  {
    label: "unintroduced text fence is executable",
    text: ["Run this command:", "```text", "node tools/wave-plan.mjs --all", "```"].join("\n"),
    status: 2,
  },
  {
    label: "unintroduced JSON fence is executable",
    text: ["Run this command:", "```json", '"command": "node tools/wave-plan.mjs --all"', "```"].join("\n"),
    status: 2,
  },
  ...["markdown", "yaml"].map((language) => ({
    label: `unintroduced ${language} fence is executable`,
    text: ["Run this command:", `\`\`\`${language}`, "node tools/wave-plan.mjs --all", "```"].join("\n"),
    status: 2,
  })),
  {
    label: "instruction wins over tool-help fence wording",
    text: ["Tool help: run this command:", "```text", "node tools/wave-plan.mjs --all", "```"].join("\n"),
    status: 2,
  },
  {
    label: "unclosed data fence fails closed",
    text: ["The configuration value is:", "```json", '"command": "node tools/wave-plan.mjs --all"'].join("\n"),
    status: 2,
  },
  {
    label: "self help is not tool help",
    text: ["Self-help output follows:", "```bash", "node tools/wave-plan.mjs --all", "```"].join("\n"),
    status: 2,
  },
  {
    label: "one appeal cannot cover chain",
    text: "node tools/wave-plan.mjs --all && node tools/rollup.mjs # Repo-tool appeal: wave plan is required",
    status: 2,
    includes: ["node tools/rollup.mjs"],
  },
  {
    label: "one appeal cannot cover three command chain",
    text: "node tools/wave-plan.mjs --all && node tools/rollup.mjs && node tools/arch-map.mjs # Repo-tool appeal: wave plan is required",
    status: 2,
    includes: ["node tools/rollup.mjs"],
  },
  {
    label: "preceding line appeal cannot authorize command",
    text: ["Repo-tool appeal: reason", "node tools/wave-plan.mjs --all"].join("\n"),
    status: 2,
  },
  {
    label: "single command appeal",
    text: "node tools/wave-plan.mjs --all # Repo-tool appeal: The user explicitly requested the exact diagnostic command for a local shell.",
    status: 0,
    includes: ["Repo-tool appeal recorded"],
  },
  {
    label: "each chained command appealed",
    text: "node tools/wave-plan.mjs --all # Repo-tool appeal: wave plan is required && node tools/rollup.mjs # Repo-tool appeal: rollup is required",
    status: 0,
    includes: ["wave plan is required", "rollup is required"],
  },
  ...[
    "npx is a great tool for running one-off packages.",
    "npx invocations without --yes will prompt for confirmation.",
    "npx runs whatever package you name, unlike a pinned devDependency.",
    "The package is invoked as npx cowsay.",
    "The npx --package option tells npx which package to install.",
    "The --package flag tells npx which package provides the binary.",
    "Node supports --trace-warnings when diagnosing warnings.",
    "The implementation derives the wave order with `node tools/wave-plan.mjs --all` inside its automation.",
    "The skill runs internally to gather inputs.",
    "Internally the orchestrator calls node tools/wave-plan.mjs to build the table.",
    "Internally the orchestrator would run `node tools/wave-plan.mjs --all` to build the table.",
    "Internally the skill can run `node tools/wave-plan.mjs --all` when rebuilding the graph.",
    "The ticket body says you can run `node tools/wave-plan.mjs --all` as an example.",
  ].map((text, index) => ({ label: `historical prose control ${index + 1}`, text, status: 0 })),
  {
    label: "imperative as npx remains executable",
    text: "You should run this as npx --yes @orbit/cli deploy.",
    status: 2,
  },
  ...[
    "Run this as npx --yes @orbit/cli deploy.",
    "Please run it as npx --yes @orbit/cli deploy.",
    "Internally you should run this as npx --yes @orbit/cli deploy.",
    "You should run this as `npx --yes @orbit/cli deploy`.",
  ].map((text, index) => ({ label: `imperative npx connector ${index + 1}`, text, status: 2 })),
  ...[
    "The command is documented as npx --yes @orbit/cli deploy.",
    "The package is described as npx --yes @orbit/cli deploy.",
    "The tool described as npx serve is deprecated.",
  ].map((text, index) => ({ label: `descriptive npx connector ${index + 1}`, text, status: 0 })),
  ...[
    "The tool described as node tools/wave-plan.mjs --all is deprecated.",
    "The command mentioned as tools/rollup.sh runs nightly.",
  ].map((text, index) => ({ label: `npx description cannot exempt repo tool ${index + 1}`, text, status: 2 })),
  {
    label: "overlap resolution keeps the accepted outer command",
    text: "node --require tools/npx-a.mjs --loader tools/npx-b.mjs tools/wave-plan.mjs",
    status: 2,
    includes: ["node --require tools/npx-a.mjs --loader tools/npx-b.mjs tools/wave-plan.mjs"],
  },
  {
    label: "quoted help fence",
    text: ["The captured `--help` output is:", "", "```bash", "node tools/wave-plan.mjs --all", "```"].join("\n"),
    status: 0,
  },
  {
    label: "documentation opened fence",
    text: ["The skill runs internally to gather inputs.", "```bash", "node tools/wave-plan.mjs --all", "```"].join("\n"),
    status: 0,
  },
  {
    label: "quoted configuration fence",
    text: ["The configuration value is:", "```json", '"command": "node tools/wave-plan.mjs --all"', "```"].join("\n"),
    status: 0,
  },
  {
    label: "quoted YAML configuration fence",
    text: ["The YAML configuration is:", "```yaml", "command: node tools/wave-plan.mjs --all", "```"].join("\n"),
    status: 0,
  },
  ...["Downloads/notes-1.md", "Downloads/NOTES-1.md", "Downloads/step-3.md", "Downloads/draft-42.md", "Downloads/log-99.txt"].map(
    (filePath, index) => ({
      label: `artifact filename lookalike ${index + 1}`,
      text: "Run node tools/wave-plan.mjs --all",
      status: 2,
      source: "artifact",
      filePath,
    }),
  ),
  ...["ORB-999.md", "pr-description.md", "/tmp/pr649-review.md", "/tmp/pr-649-review.md", "Downloads/wave-plan--help-output.txt"].map((filePath, index) => ({
    label: `document artifact basename ${index + 1}`,
    text: "Run node tools/wave-plan.mjs --all",
    status: 0,
    source: "artifact",
    filePath,
  })),
  {
    label: "skill artifact owns its internal command",
    text: ["---", "name: next", "---", "", "Internally, run `node tools/wave-plan.mjs --all` and summarize the result."].join(
      "\n",
    ),
    status: 0,
    source: "artifact",
    filePath: ".claude/skills/next/SKILL.md",
  },
  {
    label: "agent artifact owns its internal command",
    text: ["---", "name: planner", "---", "", "Use `node tools/wave-plan.mjs --all` to gather the wave data."].join("\n"),
    status: 0,
    source: "artifact",
    filePath: ".claude/agents/planner.md",
  },
]

for (const fixture of RAW_TOOL_REVIEW_CORPUS) {
  const verdict = checkRawRepoToolSurfacing(fixture.text, { source: fixture.source, filePath: fixture.filePath })
  T(`cc raw-tool corpus: ${fixture.label}`, verdict?.block ? 2 : 0, fixture.status)
  for (const expected of fixture.includes ?? []) {
    T(`cc raw-tool corpus: ${fixture.label} includes ${expected}`, verdict?.message?.includes(expected) ?? false, true)
  }
}

const overlapReason = "the exact node diagnostic was requested"
const appealedOverlap = checkRawRepoToolSurfacing(
  `node --require tools/npx-a.mjs --loader tools/npx-b.mjs tools/wave-plan.mjs # Repo-tool appeal: ${overlapReason}`,
)
T("cc raw-tool: one overlapping node invocation needs one appeal", appealedOverlap?.appeal, true)
T("cc raw-tool: overlapping node invocation yields one command", appealedOverlap?.commands?.length, 1)

const slashHeavyQuotedPathProbe = spawnSync(
  process.execPath,
  [
    "--input-type=module",
    "--eval",
    `
      import { checkRawRepoToolSurfacing } from ${JSON.stringify(new URL("./forbid-raw-repo-tool-surfacing.mjs", import.meta.url).href)}
      for (const quote of ['"', "'"]) {
        const text = "node " + quote + "segment/".repeat(2048) + "not-a-tool.js" + quote
        if (checkRawRepoToolSurfacing(text) !== null) process.exit(1)
      }
    `,
  ],
  { encoding: "utf8", timeout: 5000 },
)
T(
  "cc raw-tool: slash-heavy quoted nonmatch completes within the fixed probe timeout",
  { error: slashHeavyQuotedPathProbe.error?.code ?? null, status: slashHeavyQuotedPathProbe.status },
  { error: null, status: 0 },
)

export const RAW_TOOL_CLAUSE_FUZZ_BUDGET = 1600
const fuzzFirst = "node tools/wave-plan.mjs --all"
const fuzzSecond = "node tools/rollup.mjs"
const fuzzDocuments = [
  ["internal", "The skill runs internally to gather inputs"],
  ["ticket", "This is captured in the ticket body"],
]
const fuzzSeparators = [
  ["period", ". "],
  ["comma", ", "],
  ["semicolon", "; "],
  ["colon", ": "],
]
const fuzzFrames = [
  ["next", "Next:"],
  ["run", "To refresh it yourself, run"],
]
const fuzzLayouts = [
  ["single", fuzzFirst],
  ["period-two", `${fuzzFirst}. Then run ${fuzzSecond}`],
  ["semicolon-two", `${fuzzFirst}; ${fuzzSecond}`],
  ["and-chain", `${fuzzFirst} && ${fuzzSecond}`],
  ["imperative-as-npx", "this as npx --yes @orbit/cli deploy"],
]
const fuzzBoundaries = [
  ["plain", (frame, body) => `${frame} ${body}`],
  ["inline", (frame, body) => `${frame} \`${body}\``],
  ["nested", (frame, body) => `${frame} \`\`Example: \`${body}\` end\`\``],
  ["fence", (frame, body) => [frame, "```bash", body, "```"].join("\n")],
  ["ambiguous-backticks", (frame, body) => `${frame} \`\`Example: \`${body}\``],
]
const fuzzPlacements = ["outside-before", "outside-after", "inside-before", "inside-after"]
const clauseFuzzCases = []

for (const placement of fuzzPlacements) {
  for (const [boundaryId, boundary] of fuzzBoundaries) {
    for (const [layoutId, layout] of fuzzLayouts) {
      for (const [documentId, documentText] of fuzzDocuments) {
        for (const [frameId, frame] of fuzzFrames) {
          for (const [separatorId, separator] of fuzzSeparators) {
            let payload = layout
            if (placement === "inside-before") payload = `${documentText}${separator}${layout}`
            if (placement === "inside-after") payload = `${layout}${separator}${documentText}`
            const instruction = boundary(frame, payload)
            const text =
              placement === "outside-before"
                ? `${documentText}${separator}${instruction}`
                : placement === "outside-after"
                  ? `${instruction}${separator}${documentText}.`
                  : instruction
            clauseFuzzCases.push({
              id: [placement, boundaryId, layoutId, documentId, frameId, separatorId].join("/"),
              text,
            })
          }
        }
      }
    }
  }
}

T("cc raw-tool: deterministic clause fuzz budget", clauseFuzzCases.length, RAW_TOOL_CLAUSE_FUZZ_BUDGET)
const unexpectedClauseFuzzPasses = clauseFuzzCases.flatMap(({ id, text }) =>
  checkRawRepoToolSurfacing(text)?.block ? [] : [id],
)
T(
  "cc raw-tool: deterministic clause fuzz has zero unexpected passes",
  { count: unexpectedClauseFuzzPasses.length, first: unexpectedClauseFuzzPasses.slice(0, 10) },
  { count: 0, first: [] },
)

const chatSurfacing = runHookResult(RAW_TOOL_HOOK, stopPayload(surfacedWavePlan))
T("cc raw-tool: measured chat instruction -> 2", chatSurfacing.status, 2)
T("cc raw-tool: measured chat instruction names /next", chatSurfacing.stderr.includes("/next"), true)

const stringTranscript = write(
  "transcripts/string-content.jsonl",
  [
    JSON.stringify({ type: "user", message: { content: "What should I do next?" } }),
    JSON.stringify({ type: "assistant", message: { content: "Next: node tools/wave-plan.mjs --all" } }),
  ].join("\n"),
)
const stringTranscriptFallback = runHookResult(RAW_TOOL_HOOK, {
  hook_event_name: "Stop",
  stop_hook_active: false,
  transcript_path: stringTranscript,
})
T("cc raw-tool: transcript fallback reads trailing string assistant content -> 2", stringTranscriptFallback.status, 2)
T("cc raw-tool: string transcript fallback names /next", stringTranscriptFallback.stderr.includes("/next"), true)

const blockTranscript = write(
  "transcripts/block-content.jsonl",
  [
    JSON.stringify({ type: "user", message: { content: "Give me the command." } }),
    JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "Next: node tools/rollup.mjs" }] },
    }),
  ].join("\n"),
)
const blockTranscriptFallback = runHookResult(RAW_TOOL_HOOK, {
  hook_event_name: "Stop",
  stop_hook_active: false,
  transcript_path: blockTranscript,
})
T("cc raw-tool: transcript fallback reads trailing text block content -> 2", blockTranscriptFallback.status, 2)
T(
  "cc raw-tool: block transcript fallback reports the extracted command",
  blockTranscriptFallback.stderr.includes("node tools/rollup.mjs"),
  true,
)

for (const [label, text] of [
  ["bare command", "node tools/wave-plan.mjs --all"],
  ["absolute Windows path", "node C:\\repo\\tools\\wave-plan.mjs --all"],
  ["absolute POSIX path", "node /repo/tools/wave-plan.mjs --all"],
  ["Node option before the script", "node --trace-warnings tools/wave-plan.mjs --all"],
  ["Node option with a value", "node --require loader tools/wave-plan.mjs --all"],
  ["inline command", "You can run `node tools/wave-plan.mjs --all` to see it."],
  ["prose-prefixed run", "To find the next ticket, run node tools/wave-plan.mjs --all and read the top row."],
  ["colon-prefixed run", "Run this: node tools/wave-plan.mjs --all"],
  ["next prefix", "Next: node tools/wave-plan.mjs --all"],
  ["just-do colon prefix", "Just do: node tools/wave-plan.mjs --all"],
  ["just-do prefix", "Just do node tools/wave-plan.mjs --all"],
  ["bash script prefix", "Just do: bash tools/merge-sweep.sh owner/repo 1"],
  ["npx prefix", "Just do: npx --yes @orbit/cli check"],
]) {
  T(`cc raw-tool: round 3 ${label} -> 2`, runHook(RAW_TOOL_HOOK, stopPayload(text)), 2)
}

const standaloneCodeSpan = runHookResult(
  RAW_TOOL_HOOK,
  stopPayload(["Run this to refresh the order:", "", "`node tools/wave-plan.mjs --all`"].join("\n")),
)
T("cc raw-tool: instructed standalone code span -> 2", standaloneCodeSpan.status, 2)
T("cc raw-tool: instructed standalone code span names /next", standaloneCodeSpan.stderr.includes("/next"), true)
T(
  "cc raw-tool: inline code span in explanatory prose -> 0",
  runHook(
    RAW_TOOL_HOOK,
    stopPayload("The implementation derives the wave order with `node tools/wave-plan.mjs --all` inside its automation."),
  ),
  0,
)
T(
  "cc raw-tool: option-bearing Node prose without a tool path -> 0",
  runHook(RAW_TOOL_HOOK, stopPayload("Node supports --trace-warnings when diagnosing warnings.")),
  0,
)

const npxSurfacing = runHookResult(
  RAW_TOOL_HOOK,
  stopPayload(["Run this command:", "", "```bash", "npx turbo run lint", "```"].join("\n")),
)
T("cc raw-tool: npx instruction -> 2", npxSurfacing.status, 2)
T("cc raw-tool: npx gap says no skill exists", npxSurfacing.stderr.toLowerCase().includes("no skill"), true)
T("cc raw-tool: npx gap says to build a skill", npxSurfacing.stderr.toLowerCase().includes("build"), true)
T(
  "cc raw-tool: explicit npx confirmation instruction -> 2",
  runHook(RAW_TOOL_HOOK, stopPayload("npx --yes cowsay hello")),
  2,
)
T(
  "cc raw-tool: scoped npx instruction -> 2",
  runHook(RAW_TOOL_HOOK, stopPayload("npx @scope/package")),
  2,
)
for (const prose of [
  "npx is a great tool for running one-off packages.",
  "npx invocations without --yes will prompt for confirmation.",
  "npx runs whatever package you name, unlike a pinned devDependency.",
]) {
  T(`cc raw-tool: npx prose "${prose}" -> 0`, runHook(RAW_TOOL_HOOK, stopPayload(prose)), 0)
}
T("cc raw-tool: ambiguous bare npx name -> 0", runHook(RAW_TOOL_HOOK, stopPayload("The package is invoked as npx cowsay.")), 0)
for (const [label, command] of [
  ["standalone turbo", "npx turbo run lint"],
  ["standalone prisma", "npx prisma generate"],
  ["inline-code prisma", "`npx prisma generate`"],
]) {
  T(`cc raw-tool: ${label} npx instruction -> 2`, runHook(RAW_TOOL_HOOK, stopPayload(command)), 2)
}
T("cc raw-tool: npx package followed by a flag -> 2", runHook(RAW_TOOL_HOOK, stopPayload("Next: npx eslint --fix")), 2)
T("cc raw-tool: imperative npx with positional arguments -> 2", runHook(RAW_TOOL_HOOK, stopPayload("Run npx prisma generate now")), 2)
for (const [label, command] of [
  ["use prefix", "Use npx turbo run lint"],
  ["next prefix", "Next: npx prisma generate"],
  ["modal run prefix", "You can run npx prisma generate"],
]) {
  T(`cc raw-tool: prefixed bare npx ${label} -> 2`, runHook(RAW_TOOL_HOOK, stopPayload(command)), 2)
}
for (const [label, command] of [
  ["assigned package and call options", "npx --package=@orbit/cli -c 'orbit check'"],
  ["separate package option value", "npx -p typescript tsc --noEmit"],
  ["assigned workspace option", "npx --workspace=apps/web run build"],
  ["short quoted call option", "npx -c 'orbit check'"],
  ["long quoted call option", 'npx --call "orbit check"'],
]) {
  T(`cc raw-tool: flag-first ${label} -> 2`, runHook(RAW_TOOL_HOOK, stopPayload(command)), 2)
}
T(
  "cc raw-tool: explanatory npx option mention -> 0",
  runHook(RAW_TOOL_HOOK, stopPayload("The npx --package option tells npx which package to install.")),
  0,
)

const bareToolSurfacing = runHookResult(
  RAW_TOOL_HOOK,
  stopPayload(["Run this command:", "", "```bash", "tools/rollup.sh", "```"].join("\n")),
)
T("cc raw-tool: bare tools script instruction -> 2", bareToolSurfacing.status, 2)
for (const [label, command, skills] of [
  ["rollup", "tools/rollup.sh", ["/rollup"]],
  ["worker watch", "node tools/worker-watch.mjs", ["/watch"]],
  ["PR watch", "node tools/pr-watch.mjs --repo owner/repo --pr 1", ["/orchestrate"]],
  ["ticket creation", "node tools/new-ticket.mjs --help", ["/ticket", "/feature"]],
  ["web port", "node tools/orca-web-port.mjs", ["/dev-server"]],
  ["second opinion", "tools/agent-review.sh --claim test", ["/second-opinion"]],
  ["PowerShell second opinion", "pwsh tools/agent-review.ps1 --claim test", ["/second-opinion"]],
  ["Windows PowerShell second opinion", "powershell.exe .\\tools\\agent-review.ps1 --claim test", ["/second-opinion"]],
  ["direct PowerShell second opinion", ".\\tools\\agent-review.ps1 --claim test", ["/second-opinion"]],
]) {
  const result = runHookResult(RAW_TOOL_HOOK, stopPayload(`Run ${command}`))
  T(`cc raw-tool: ${label} wrapper instruction -> 2`, result.status, 2)
  for (const skill of skills) T(`cc raw-tool: ${label} names ${skill}`, result.stderr.includes(skill), true)
  T(`cc raw-tool: ${label} does not claim a missing skill`, result.stderr.includes("No skill currently"), false)
}
const missingSkillSurfacing = runHookResult(RAW_TOOL_HOOK, stopPayload("Run node tools/arch-map.mjs"))
T("cc raw-tool: unmapped tool instruction -> 2", missingSkillSurfacing.status, 2)
T(
  "cc raw-tool: unmapped tool says no skill currently exposes it",
  missingSkillSurfacing.stderr.includes("No skill currently exposes this capability"),
  true,
)

const outsideRepoArtifactBody = ["# Instructions", "", "Run this to refresh the order:", "", "```bash", "node tools/wave-plan.mjs --all", "```"].join("\n")
const outsideRepoArtifact = write("Downloads/order.md", outsideRepoArtifactBody)
const artifactSurfacing = runHookResult(
  RAW_TOOL_HOOK,
  writePayload(outsideRepoArtifact, outsideRepoArtifactBody),
)
T("cc raw-tool: outside-repo instruction artifact -> 2", artifactSurfacing.status, 2)
T("cc raw-tool: artifact block names /next", artifactSurfacing.stderr.includes("/next"), true)
for (const [label, relativePath] of [
  ["ordinary numbered note", "Downloads/notes-1.md"],
  ["uppercase ticket lookalike", "Downloads/NOTES-1.md"],
  ["help-like parent directory", "Downloads/wave--help-output/notes.md"],
]) {
  T(
    `cc raw-tool: ${label} remains a scanned artifact -> 2`,
    runHook(RAW_TOOL_HOOK, writePayload(write(relativePath, outsideRepoArtifactBody), outsideRepoArtifactBody)),
    2,
  )
}

const rawToolRepoRoot = join(hooksDir, "..", "..")
for (const [name, filePath, newString] of [
  ["repo CLAUDE edit ignores pre-existing commands", join(rawToolRepoRoot, "CLAUDE.md"), "A harmless wording update."],
  ["repo tool edit ignores pre-existing commands", join(rawToolRepoRoot, "tools", "check-dashes.mjs"), "const harmless = true"],
  [
    "repo doc new raw command remains artifact-out-of-scope",
    join(rawToolRepoRoot, "README.md"),
    "Run node tools/wave-plan.mjs --all",
  ],
]) {
  const result = runHookResult(RAW_TOOL_HOOK, editPayload(filePath, newString))
  T(`cc raw-tool: ${name} -> 0`, result.status, 0)
  T(`cc raw-tool: ${name} emits no verdict`, result.stdout === "" && result.stderr === "", true)
}

const declaredRepos = JSON.parse(readFileSync(join(rawToolRepoRoot, ".claude", "orchestrator.json"), "utf8")).repos
for (const [repoName, repoPath] of Object.entries(declaredRepos)) {
  T(
    `cc raw-tool: declared ${repoName} repo source is artifact-out-of-scope -> 0`,
    runHook(RAW_TOOL_HOOK, editPayload(`${repoPath}\\internal.md`, "Run node tools/wave-plan.mjs --all")),
    0,
  )
}

// ORB-165. Declared roots are the three ROOT checkouts, so a worker editing a real
// repository file inside an Orca worktree (C:\Users\thoma\orca\workspaces\...) fell under
// none of them, got its content scanned as an arbitrary payload, and was blocked by any
// legitimate repo-tool string in it. tools/README.md is full of those by design. The
// exemption now follows a linked worktree's `.git` FILE back to its main checkout. These
// cases pin both directions: the exemption must reach a worktree, and must not become
// purchasable with `git init`.
// The `.git` file's one line is written in the shape read off this worktree's real one.
const stageWorktree = (name, gitFileBody) => {
  const worktreeRoot = dirname(dirname(write(`${name}/tools/README.md`, "placeholder\n")))
  writeFileSync(join(worktreeRoot, ".git"), gitFileBody)
  return worktreeRoot
}
const worktreeFile = (worktreeRoot) => join(worktreeRoot, "tools", "README.md")
const linkedWorktreeRoot = stageWorktree(
  "linked-worktree",
  `gitdir: ${rawToolRepoRoot.replace(/\\/g, "/")}/.git/worktrees/orb-165-fixture\n`,
)
T(
  "cc raw-tool: repo file in a linked worktree of a declared root -> 0",
  runHook(RAW_TOOL_HOOK, writePayload(worktreeFile(linkedWorktreeRoot), outsideRepoArtifactBody)),
  0,
)
T(
  "cc raw-tool: repo file in the root checkout stays exempt -> 0",
  runHook(RAW_TOOL_HOOK, writePayload(join(rawToolRepoRoot, "tools", "README.md"), outsideRepoArtifactBody)),
  0,
)
// The exemption is not for "any git repository": `git init` in a scratch directory must not
// buy it, or root cause 3 is back through a different door.
write("foreign-repo/.git/HEAD", "ref: refs/heads/main\n")
T(
  "cc raw-tool: repo file in an undeclared repository is still scanned -> 2",
  runHook(RAW_TOOL_HOOK, writePayload(join(root, "foreign-repo", "tools", "README.md"), outsideRepoArtifactBody)),
  2,
)
T(
  "cc raw-tool: artifact with no .git ancestor is still scanned -> 2",
  runHook(RAW_TOOL_HOOK, writePayload(join(root, "scratchpad", "order.md"), outsideRepoArtifactBody)),
  2,
)
// Fail CLOSED on both unrecognised shapes: scan, never exempt on a `.git` we cannot read.
T(
  "cc raw-tool: malformed .git file falls through to scanning -> 2",
  runHook(RAW_TOOL_HOOK, writePayload(stageWorktree("malformed-worktree", "this is not a gitdir line\n"), outsideRepoArtifactBody)),
  2,
)
T(
  "cc raw-tool: gitdir with no worktrees segment falls through to scanning -> 2",
  runHook(RAW_TOOL_HOOK, writePayload(stageWorktree("detached-worktree", "gitdir: C:/somewhere/else/.git\n"), outsideRepoArtifactBody)),
  2,
)

// A3d. The orchestration guardrails through the real hook file, on the payload shapes the
// tools actually send. The cwd cases are the reason the rule takes a cwd at all: a worker
// runs in a LINKED worktree, the orchestrating session runs in the main checkout, and only
// the first may spend model budget outside the launcher.
const ORCHESTRATOR_HOOK = "orchestrator-guardrails.mjs"
const commandPayload = (command, cwd) => ({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, ...(cwd ? { cwd } : {}) })
// A staged MAIN checkout, `.git` a directory, standing in for the orchestrating session's
// cwd. It is staged rather than taken from this repository because this suite runs from a
// linked worktree locally and from a main checkout in CI, and a fixture whose verdict depends
// on which one would prove nothing in one of the two places.
const mainCheckoutCwd = dirname(write("main-checkout/.git/HEAD", "ref: refs/heads/main\n"))
const undeclaredWorktreeCwd = stageWorktree("undeclared-worktree", `gitdir: ${join(root, "foreign-repo").replace(/\\/g, "/")}/.git/worktrees/x\n`)
const rawEngine = runHookResult(ORCHESTRATOR_HOOK, commandPayload('codex exec "do the thing"', mainCheckoutCwd))
T("cc orchestrator: raw codex exec from a main checkout -> 2", rawEngine.status, 2)
T("cc orchestrator: the refusal names the launcher", rawEngine.stderr.includes("tools/launch-worker.mjs"), true)
T(
  "cc orchestrator: raw claude from a main checkout -> 2",
  runHook(ORCHESTRATOR_HOOK, commandPayload('claude -p "summarize"', mainCheckoutCwd)),
  2,
)
T(
  "cc orchestrator: codex exec from a launcher worktree -> 0",
  runHook(ORCHESTRATOR_HOOK, commandPayload("codex exec", linkedWorktreeRoot)),
  0,
)
// The exemption is for a launcher-created worktree of a DECLARED repository, so it cannot be
// bought by pointing a hand-written `.git` file at some other repository.
T(
  "cc orchestrator: codex exec from a worktree of an undeclared repository -> 2",
  runHook(ORCHESTRATOR_HOOK, commandPayload("codex exec", undeclaredWorktreeCwd)),
  2,
)
T(
  "cc orchestrator: codex exec carrying the launcher marker -> 0",
  runHookResult(ORCHESTRATOR_HOOK, commandPayload("codex exec", mainCheckoutCwd), { ORBIT_LAUNCH_WORKER: "1" }).status,
  0,
)
T(
  "cc orchestrator: the second-opinion helper -> 0",
  runHook(ORCHESTRATOR_HOOK, commandPayload("node .claude/skills/second-opinion/second-opinion.mjs", mainCheckoutCwd)),
  0,
)
// The hook reads tool_input.command and nothing else, so a Write carrying the literal text is
// not an invocation. This is the payload shape root cause 3 got wrong.
T(
  "cc orchestrator: a file write containing the literal text -> 0",
  runHook(ORCHESTRATOR_HOOK, writePayload(join(root, "Downloads", "engine-notes.md"), "Never run codex exec by hand.")),
  0,
)
T("cc orchestrator: an unrelated command -> 0", runHook(ORCHESTRATOR_HOOK, commandPayload("npm run lint", mainCheckoutCwd)), 0)
const adminMerge = runHookResult(ORCHESTRATOR_HOOK, commandPayload(`gh pr merge 667 --squash ${ADMIN}`, linkedWorktreeRoot))
T("cc orchestrator: an admin merge from a worktree is still refused -> 2", adminMerge.status, 2)
T("cc orchestrator: the admin refusal says to ask Thomas", adminMerge.stderr.includes("ask him to"), true)
T(
  "cc orchestrator: an admin merge carrying the launcher marker is still refused -> 2",
  runHookResult(ORCHESTRATOR_HOOK, commandPayload(`gh pr merge 667 ${ADMIN}`, mainCheckoutCwd), { ORBIT_LAUNCH_WORKER: "1" }).status,
  2,
)
T(
  "cc orchestrator: an ordinary squash merge -> 0",
  runHook(ORCHESTRATOR_HOOK, commandPayload("gh pr merge 667 --squash --delete-branch", mainCheckoutCwd)),
  0,
)

const existingOutsideArtifact = write("Downloads/existing-order.md", outsideRepoArtifactBody)
const safeOutsideEdit = runHookResult(RAW_TOOL_HOOK, editPayload(existingOutsideArtifact, "Updated heading only."))
T("cc raw-tool: outside edit scans only its safe new string -> 0", safeOutsideEdit.status, 0)
T("cc raw-tool: outside safe edit emits no verdict", safeOutsideEdit.stdout === "" && safeOutsideEdit.stderr === "", true)
T(
  "cc raw-tool: outside edit blocks a raw command in its new string -> 2",
  runHook(RAW_TOOL_HOOK, editPayload(existingOutsideArtifact, "Run node tools/wave-plan.mjs --all")),
  2,
)
T(
  "cc raw-tool: outside MultiEdit checks new strings independently -> 2",
  runHook(
    RAW_TOOL_HOOK,
    multiEditPayload(existingOutsideArtifact, [
      { old_string: "old", new_string: "The captured `--help` output is:" },
      { old_string: "older", new_string: "node tools/wave-plan.mjs --all" },
    ]),
  ),
  2,
)
T(
  "cc raw-tool: outside MultiEdit ignores pre-existing commands -> 0",
  runHook(
    RAW_TOOL_HOOK,
    multiEditPayload(existingOutsideArtifact, [
      { old_string: "node tools/wave-plan.mjs --all", new_string: "Updated heading." },
      { old_string: "old details", new_string: "Updated details." },
    ]),
  ),
  0,
)

// These are machine-to-machine bodies or quoted reference material, not steps
// presented to Thomas. Each is a distinct correct use of the same command.
const skillBody = [
  "---",
  "name: next",
  "---",
  "",
  "Internally, run `node tools/wave-plan.mjs --all` and summarize the result.",
].join("\n")
T(
  "cc raw-tool: skill body -> 0",
  runHook(RAW_TOOL_HOOK, writePayload(join(root, ".claude", "skills", "next", "SKILL.md"), skillBody)),
  0,
)

const agentBody = [
  "---",
  "name: planner",
  "---",
  "",
  "Use `node tools/wave-plan.mjs --all` to gather the wave data.",
].join("\n")
T(
  "cc raw-tool: agent body -> 0",
  runHook(RAW_TOOL_HOOK, writePayload(join(root, ".claude", "agents", "planner.md"), agentBody)),
  0,
)

const ticketBodyPath = write("ORB-999.md", outsideRepoArtifactBody)
T("cc raw-tool: ticket body -> 0", runHook(RAW_TOOL_HOOK, writePayload(ticketBodyPath, outsideRepoArtifactBody)), 0)

const prDescriptionPath = write("pr-description.md", outsideRepoArtifactBody)
T("cc raw-tool: PR description -> 0", runHook(RAW_TOOL_HOOK, writePayload(prDescriptionPath, outsideRepoArtifactBody)), 0)
const prReviewPath = write("pr649-review.md", outsideRepoArtifactBody)
T("cc raw-tool: PR review report -> 0", runHook(RAW_TOOL_HOOK, writePayload(prReviewPath, outsideRepoArtifactBody)), 0)
const dashedPrReviewPath = write("pr-649-review.md", outsideRepoArtifactBody)
T("cc raw-tool: dashed PR review report -> 0", runHook(RAW_TOOL_HOOK, writePayload(dashedPrReviewPath, outsideRepoArtifactBody)), 0)
const helpOutputPath = write("Downloads/wave-plan--help-output.txt", outsideRepoArtifactBody)
T("cc raw-tool: help output basename -> 0", runHook(RAW_TOOL_HOOK, writePayload(helpOutputPath, outsideRepoArtifactBody)), 0)
T(
  "cc raw-tool: quoted --help output -> 0",
  runHook(
    RAW_TOOL_HOOK,
    stopPayload(["The captured `--help` output is:", "", "```bash", "node tools/wave-plan.mjs --all", "```"].join("\n")),
  ),
  0,
)
for (const [label, text] of [
  [
    "previous skill context cannot exempt an instruction",
    ["The skill runs internally to gather inputs.", "To refresh it yourself, run node tools/wave-plan.mjs --all"].join("\n"),
  ],
  [
    "previous ticket context cannot exempt an instruction",
    ["This is captured in the ticket body.", "Next: node tools/wave-plan.mjs --all"].join("\n"),
  ],
]) {
  const result = runHookResult(RAW_TOOL_HOOK, stopPayload(text))
  T(`cc raw-tool: ${label} -> 2`, result.status, 2)
  T(`cc raw-tool: ${label} names the command`, result.stderr.includes("node tools/wave-plan.mjs --all"), true)
}
T(
  "cc raw-tool: documentation prose without a command -> 0",
  runHook(RAW_TOOL_HOOK, stopPayload("The skill runs internally to gather inputs.")),
  0,
)
T(
  "cc raw-tool: same-line internal command remains documentation -> 0",
  runHook(
    RAW_TOOL_HOOK,
    stopPayload("Internally the orchestrator calls node tools/wave-plan.mjs to build the table."),
  ),
  0,
)
const sameLineDocumentedInstruction = runHookResult(
  RAW_TOOL_HOOK,
  stopPayload("Internally, run `node tools/wave-plan.mjs --all` and summarize the result."),
)
T("cc raw-tool: same-line documentation cannot exempt an instruction -> 2", sameLineDocumentedInstruction.status, 2)
T(
  "cc raw-tool: same-line documented instruction names the command",
  sameLineDocumentedInstruction.stderr.includes("node tools/wave-plan.mjs --all"),
  true,
)
for (const [label, text] of [
  ["contracted modal", "Internally you'd run `node tools/wave-plan.mjs --all`"],
  ["explicit modal", "Internally you can run `node tools/wave-plan.mjs --all`"],
]) {
  const result = runHookResult(RAW_TOOL_HOOK, stopPayload(text))
  T(`cc raw-tool: internal ${label} user framing -> 2`, result.status, 2)
  T(`cc raw-tool: internal ${label} names the command`, result.stderr.includes("node tools/wave-plan.mjs --all"), true)
}
for (const [label, text] of [
  ["orchestrator modal", "Internally the orchestrator would run `node tools/wave-plan.mjs --all` to build the table."],
  ["skill modal", "Internally the skill can run `node tools/wave-plan.mjs --all` when rebuilding the graph."],
  ["quoted ticket instruction", "The ticket body says you can run `node tools/wave-plan.mjs --all` as an example."],
]) {
  T(`cc raw-tool: ${label} remains documentation -> 0`, runHook(RAW_TOOL_HOOK, stopPayload(text)), 0)
}
T(
  "cc raw-tool: documentation line opens a fenced command block -> 0",
  runHook(
    RAW_TOOL_HOOK,
    stopPayload(
      ["The skill runs internally to gather inputs.", "```bash", "node tools/wave-plan.mjs --all", "```"].join("\n"),
    ),
  ),
  0,
)
T(
  "cc raw-tool: command quoted in a non-shell fence -> 0",
  runHook(
    RAW_TOOL_HOOK,
    stopPayload(["The configuration value is:", "```json", "\"command\": \"node tools/wave-plan.mjs --all\"", "```"].join("\n")),
  ),
  0,
)
T(
  "cc raw-tool: closing fence does not scan following prose -> 0",
  runHook(
    RAW_TOOL_HOOK,
    stopPayload(["Example output:", "```text", "done", "```", "", "node tools/wave-plan.mjs --all runs internally inside the skill."].join("\n")),
  ),
  0,
)
T(
  "cc raw-tool: self-help is not help documentation -> 2",
  runHook(RAW_TOOL_HOOK, stopPayload(["Self-help output follows:", "```bash", "node tools/wave-plan.mjs --all", "```"].join("\n"))),
  2,
)

for (const command of ["git status", "gh pr checks", "dotnet test", "npm run lint"]) {
  T(
    `cc raw-tool: ordinary instruction "${command}" -> 0`,
    runHook(RAW_TOOL_HOOK, stopPayload(["Run this command:", "", "```bash", command, "```"].join("\n"))),
    0,
  )
}

const appealReason = "The user explicitly requested the exact diagnostic command for a local shell."
const appealedSurfacing = runHookResult(
  RAW_TOOL_HOOK,
  stopPayload(["Run this command:", "", "```bash", `node tools/wave-plan.mjs --all # Repo-tool appeal: ${appealReason}`, "```"].join("\n")),
)
T("cc raw-tool: explicit reason appeal -> 0", appealedSurfacing.status, 0)
T("cc raw-tool: explicit reason appeal is recorded", appealedSurfacing.stdout.includes(`Repo-tool appeal recorded: ${appealReason}`), true)

const mixedAppeals = runHookResult(
  RAW_TOOL_HOOK,
  stopPayload(
    [
      "Run these commands:",
      "```bash",
      "node tools/wave-plan.mjs --all # Repo-tool appeal: first command is required",
      "node tools/rollup.mjs",
      "```",
    ].join("\n"),
  ),
)
T("cc raw-tool: one appeal cannot cover another command -> 2", mixedAppeals.status, 2)
T("cc raw-tool: unappealed command is reported", mixedAppeals.stderr.includes("node tools/rollup.mjs"), true)

const separatelyAppealed = runHookResult(
  RAW_TOOL_HOOK,
  stopPayload(
    [
      "Run these commands:",
      "```bash",
      "node tools/wave-plan.mjs --all # Repo-tool appeal: first command is required",
      "node tools/rollup.mjs # Repo-tool appeal: second command is required",
      "```",
    ].join("\n"),
  ),
)
T("cc raw-tool: every command has its own appeal -> 0", separatelyAppealed.status, 0)
T("cc raw-tool: first command reason is recorded", separatelyAppealed.stdout.includes("first command is required"), true)
T("cc raw-tool: second command reason is recorded", separatelyAppealed.stdout.includes("second command is required"), true)

const oneAppealForChain = runHookResult(
  RAW_TOOL_HOOK,
  stopPayload("node tools/wave-plan.mjs --all && node tools/rollup.mjs # Repo-tool appeal: wave plan is required"),
)
T("cc raw-tool: one appeal cannot cover a chained command -> 2", oneAppealForChain.status, 2)
T("cc raw-tool: chained appeal reports the second command", oneAppealForChain.stderr.includes("node tools/rollup.mjs"), true)

const oneAppealForThreeCommandChain = runHookResult(
  RAW_TOOL_HOOK,
  stopPayload(
    "node tools/wave-plan.mjs --all && node tools/rollup.mjs && node tools/arch-map.mjs # Repo-tool appeal: wave plan is required",
  ),
)
T("cc raw-tool: one appeal cannot cover a three-command chain -> 2", oneAppealForThreeCommandChain.status, 2)
T(
  "cc raw-tool: three-command appeal reports the earliest remaining command",
  oneAppealForThreeCommandChain.stderr.split("\n")[0],
  "Raw repo-tool command surfaced for Thomas: node tools/rollup.mjs",
)

const appealedChain = runHookResult(
  RAW_TOOL_HOOK,
  stopPayload(
    "node tools/wave-plan.mjs --all # Repo-tool appeal: wave plan is required && node tools/rollup.mjs # Repo-tool appeal: rollup is required",
  ),
)
T("cc raw-tool: every chained command has its own appeal -> 0", appealedChain.status, 0)
T("cc raw-tool: chained wave-plan reason is recorded", appealedChain.stdout.includes("wave plan is required"), true)
T("cc raw-tool: chained rollup reason is recorded", appealedChain.stdout.includes("rollup is required"), true)

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

// ---------------------------------------------------------------------------
// 4. The Linear gate must not block this repo's own docs
// ---------------------------------------------------------------------------
// A gate that fires on prose gets switched off, so its false-positive rate is
// part of its contract, not an afterthought. Every widening of the rule so far
// hit a real doc: the hook's own hyphenated name read as a GraphQL keyword, the
// shorthand `mutation \`projectCreate(...)\`` both skills document, and
// `orca linear list-issues --json` read as a curl JSON body. Each was found by
// running this scan BY HAND after the change, which is exactly the check that
// stops happening. Here it runs every time.
console.log("\n# linear gate false positives (this repo's tracked docs)")
const trackedDocs = spawnSync("git", ["-C", repoRoot, "ls-files", "*.md", ".claude/*", "tools/*"], { encoding: "utf8" })
const docPaths = (trackedDocs.status === 0 ? trackedDocs.stdout.trim().split(/\r?\n/) : [])
  .filter(Boolean)
  // The gate exempts its own source at the adapter, since a rule module must
  // contain the strings it matches on. Mirror that here rather than reporting it.
  .filter((relative) => !relative.startsWith(".claude/hooks/"))
  .map((relative) => join(repoRoot, relative))
  .filter((absolute) => existsSync(absolute) && statSync(absolute).isFile())

const blockedDocs = docPaths.filter((path) => checkLinearMutation(readFileSync(path, "utf8"))?.block)
T("linear gate: blocks none of this repo's tracked docs", blockedDocs.map((p) => p.slice(repoRoot.length + 1)), [])
T("linear gate: the doc scan actually read files", docPaths.length > 0, true)

function scanHookPathReferences(bodies) {
  const references = bodies.flatMap((body) =>
    [...body.matchAll(/(?<!~\/)\.claude\/hooks\/[A-Za-z0-9._/-]+\.mjs/g)].map((match) => match[0]),
  )
  return {
    references,
    missing: [...new Set(references)].filter((relative) => !existsSync(join(repoRoot, relative))),
  }
}

const hookPathScan = scanHookPathReferences(docPaths.map((path) => readFileSync(path, "utf8")))
const hookPathReferences = hookPathScan.references
const missingHookPathReferences = hookPathScan.missing
T("docs: every named .claude/hooks/*.mjs path resolves", missingHookPathReferences, [])
T("docs: the hook path guard actually found references", hookPathReferences.length > 0, true)

function configuredHookPathScan(settings) {
  const eventEntries = settings?.hooks && typeof settings.hooks === "object" ? Object.values(settings.hooks) : []
  const commands = eventEntries
    .flatMap((entries) => (Array.isArray(entries) ? entries : []))
    .flatMap((entry) => (Array.isArray(entry?.hooks) ? entry.hooks : []))
    .filter((hook) => hook?.type === "command" && typeof hook.command === "string")
    .map((hook) => hook.command)
  return scanHookPathReferences(commands)
}

const settings = JSON.parse(readFileSync(join(repoRoot, ".claude", "settings.json"), "utf8"))
const configuredHookPathReferences = configuredHookPathScan(settings)
T("settings: every configured hook path resolves", configuredHookPathReferences.missing, [])
T("settings: configured hook path scan is nonempty", configuredHookPathReferences.references.length > 0, true)

const renamedHookSettingsFixture = JSON.parse(JSON.stringify(settings))
renamedHookSettingsFixture.hooks.Stop[0].hooks[0].command =
  'node "$CLAUDE_PROJECT_DIR/.claude/hooks/forbid-raw-repo-tool-surfacing-renamed.mjs"'
T(
  "settings: renamed configured hook fixture reports the missing file",
  configuredHookPathScan(renamedHookSettingsFixture).missing,
  [".claude/hooks/forbid-raw-repo-tool-surfacing-renamed.mjs"],
)

const hookPathDecisionFixture = [
  "The repo hook is .claude/hooks/does-not-exist.mjs.",
  "The user hook is ~/.claude/hooks/user-level.mjs.",
].join("\n")
T(
  "docs: hook path scan reports only a missing repo-relative path",
  scanHookPathReferences([hookPathDecisionFixture]).missing,
  [".claude/hooks/does-not-exist.mjs"],
)

// A DOCUMENT is judged per chunk, so a mutation against another service does not
// inherit a Linear endpoint documented elsewhere in the same file. Measured
// 2026-07-27 on `.claude/skills/orchestrate/SKILL.md`, which has documented the
// Linear project-overview READ since D36: adding a GitHub `resolveReviewThread`
// mutation turned the whole file red even though `gh api graphql` cannot reach
// Linear. The three cases below are that regression, its fail-closed twin, and
// the single-command form that must not change.
const otherServiceMutation = [
  "Read the project overview by POSTing to https://api.linear.app/graphql with",
  "query \\`project(id: \"<id>\") { name content }\\`.",
  "",
  "Resolve the review thread:",
  "",
  "```bash",
  "gh api graphql -f query='mutation{resolveReviewThread(input:{threadId:\"X\"}){thread{isResolved}}}'",
  "```",
].join("\n")
T("linear gate: a GitHub mutation does not inherit a Linear endpoint elsewhere in the doc", checkLinearMutation(otherServiceMutation), null)

const linearMutationInDoc = [
  "Some prose about tickets that mentions nothing in particular.",
  "",
  "```bash",
  "curl https://api.linear.app/graphql -d '{\"query\":\"mutation{issueUpdate(id:\\\"x\\\"){success}}\"}'",
  "```",
].join("\n")
T("linear gate: still blocks a real Linear mutation inside one chunk of a doc", checkLinearMutation(linearMutationInDoc)?.block, true)

T(
  "linear gate: a single-command string is still judged whole",
  checkLinearMutation("curl https://api.linear.app/graphql -d '{\"query\":\"mutation{issueDelete(id:\\\"x\\\"){success}}\"}'")?.block,
  true,
)

// The regression a reviewer caught on the FIRST version of the per-chunk scan,
// which kept only the chunks carrying the endpoint. A Bash tool_input.command can
// contain a blank line, so the URL landed in one chunk and the mutation field in
// the next, and dropping the second let a genuine Linear write through as null.
// This is the case that must stay blocked forever: it is the call site that
// matters most, an actual command about to run.
const splitCommand = [
  'curl -s https://api.linear.app/graphql -d \'{"query":"mutation {',
  "",
  'issueCreate(input:{title:"x"}) { success }',
  '}"}\'',
].join("\n")
T("linear gate: a mutation split from its endpoint by a blank line still blocks", checkLinearMutation(splitCommand)?.block, true)

const splitAcrossFence = [
  "Post to https://api.linear.app/graphql:",
  "",
  "```bash",
  'curl -d \'{"query":"mutation{issueArchive(id:\\"x\\"){success}}"}\'',
  "```",
].join("\n")
T("linear gate: a mutation in a different chunk from the endpoint still blocks", checkLinearMutation(splitAcrossFence)?.block, true)

console.log(`\n${fails === 0 ? "ORBIT HOOK PARITY OK" : `ORBIT HOOK PARITY FAILED (${fails})`}`)
process.exit(fails === 0 ? 0 : 1)
