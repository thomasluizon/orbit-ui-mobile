#!/usr/bin/env node
// Regression suite for the seven surviving session hooks. Three layers:
//   1. Wiring: settings.json and the hooks directory must agree in BOTH
//      directions. A hook deleted while settings.json still names it is exactly
//      how this suite was broken on 2026-08-04, and nothing else catches it.
//   2. Rule units: the pure cores in _lib/ judged in isolation.
//   3. Real hook files: run each one with a stdin payload and assert the exit
//      code, so the thin adapter is proven to preserve block/allow.
// Plus a cheap frontmatter check over the agents and skills this repo ships.
// Run: node .claude/hooks/test-hooks.mjs   (exits non-zero on any failure)

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { checkGitCommand, checkGitWorktreeRemove } from "./_lib/rules-git.mjs"
import { checkEfMigrationRawIndex } from "./_lib/rules-source.mjs"
import { checkTicketMutation } from "./_lib/rules-tickets.mjs"
import { checkInventedIdentifier, extractNodeIds } from "./_lib/rules-identifier.mjs"
import { checkAdminMerge, checkBroadStaging, checkEngineInvocation } from "./_lib/rules-orchestrator.mjs"
import { checkSleepStop } from "./_lib/rules-sleep.mjs"
import { checkWorkerBrowser } from "./_lib/rules-worker.mjs"

const hooksDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(hooksDir, "..", "..")
let fails = 0
const T = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fails++
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}
const blocks = (verdict) => !!verdict?.block
const NV = "--no-" + "verify"
const ADMIN = "--" + "admin"

// One unique fixture root per run, removed best-effort on exit: a leaked tmp dir
// is garbage, never a verdict.
const root = mkdtempSync(join(tmpdir(), "orbit-hooks-"))
process.on("exit", () => {
  try {
    rmSync(root, { recursive: true, force: true })
  } catch {
    /* a transient lock on the fixture root must never mask the suite's verdict */
  }
})

// ---------------------------------------------------------------------------
// 1. Wiring: settings.json and the hooks directory agree, both directions
// ---------------------------------------------------------------------------
console.log("# wiring (settings.json <-> hooks on disk)")
const settings = JSON.parse(readFileSync(join(repoRoot, ".claude", "settings.json"), "utf8"))
const wired = new Set(
  Object.values(settings.hooks ?? {})
    .flat()
    .flatMap((entry) => entry?.hooks ?? [])
    .map((hook) => /\.claude[/\\]hooks[/\\]([A-Za-z0-9._-]+\.mjs)/.exec(hook?.command ?? "")?.[1])
    .filter(Boolean),
)
const onDisk = readdirSync(hooksDir).filter((name) => name.endsWith(".mjs") && name !== "test-hooks.mjs")
T("wiring: every hook settings.json names exists on disk", [...wired].filter((name) => !existsSync(join(hooksDir, name))), [])
T("wiring: every hook on disk is wired in settings.json", onDisk.filter((name) => !wired.has(name)), [])
T("wiring: the scan is not vacuous", wired.size > 0 && onDisk.length > 0, true)

const guardsWorkflow = readFileSync(join(repoRoot, ".github", "workflows", "guards.yml"), "utf8")
const parityGuidance = "a platform adapter or an enumerated layout-shell divergence only: navigation chrome (sidebar vs tab bar), desktop stats rail, command palette and keyboard shortcuts, or hover affordances on shell chrome. Screens, components, data flows, error paths, and behavior remain parity-bound."
T("parity guidance: both one-sided failures name the complete narrow exception", guardsWorkflow.split(parityGuidance).length - 1, 2)
T("parity guidance: obsolete platform-adapters-only help is gone", guardsWorkflow.includes("(platform adapters only)"), false)
T("parity gate: parity:exempt remains the only label bypass", guardsWorkflow.includes("if: github.event_name == 'pull_request' && !contains(github.event.pull_request.labels.*.name, 'parity:exempt') && github.actor != 'dependabot[bot]'"), true)
T("parity gate: both one-sided file-count failures remain enforced", (guardsWorkflow.match(/if \[ \"\$(?:web|mobile)\" -gt 0 \] && \[ \"\$(?:mobile|web)\" -eq 0 \]; then/g) ?? []).length, 2)

// ---------------------------------------------------------------------------
// 2. Rule units
// ---------------------------------------------------------------------------
console.log("\n# git-guardrails (_lib/rules-git.mjs)")
T("git: push to main blocks", blocks(checkGitCommand("git push origin main")), true)
T("git: force push to main blocks", blocks(checkGitCommand("git push --force origin main")), true)
T("git: force-with-lease to main blocks", blocks(checkGitCommand("git push --force-with-lease origin main")), true)
T("git: push to a feature branch allows", checkGitCommand("git push origin feature/x"), null)
// A ref ENDING in /main is a different branch. redesign/main takes direct pushes by convention,
// and blocking it produced a refusal indistinguishable from a real one (2026-08-22).
T("git: push to redesign/main allows", checkGitCommand("git push origin redesign/main"), null)
T("git: push to refs/heads/redesign/main allows", checkGitCommand("git push origin refs/heads/redesign/main"), null)
T("git: push to refs/heads/main still blocks", blocks(checkGitCommand("git push origin refs/heads/main")), true)
T("git: HEAD:main still blocks", blocks(checkGitCommand("git push origin HEAD:main")), true)
T("git: deleting main still blocks", blocks(checkGitCommand("git push origin :main")), true)
T("git: +main force syntax still blocks", blocks(checkGitCommand("git push origin +main")), true)
// The destination decides, not the source: this one really does land on main.
T("git: redesign/main:refs/heads/main still blocks", blocks(checkGitCommand("git push origin redesign/main:refs/heads/main")), true)
// And the reverse lands on redesign/main, so it is ordinary work.
T("git: main:refs/heads/redesign/main allows", checkGitCommand("git push origin main:refs/heads/redesign/main"), null)
// The rule reads the git SUBCOMMAND, not the word push anywhere on the line. A branch name carrying
// that word blocked its own checkout while `main` sat later on the same command (2026-08-22).
T("git: checkout of a branch named for push allows", checkGitCommand("git checkout -b chore/x-push-guard main"), null)
T("git: log naming a push branch allows", checkGitCommand("git log --oneline main..chore/push-guard"), null)
T("git: -C before push still blocks", blocks(checkGitCommand("git -C . push origin main")), true)
// The segment is raw shell text, so a token can arrive quoted. Reading `"push"` as a different
// subcommand would wave a shell-valid push straight through (Pullfrog, PR #743).
T("git: a quoted push subcommand still blocks", blocks(checkGitCommand('git "push" origin main')), true)
T("git: a quoted main ref still blocks", blocks(checkGitCommand('git push origin "main"')), true)
T("git: single-quoted push still blocks", blocks(checkGitCommand("git 'push' origin main")), true)
T("git: quoted bare push while HEAD is on main blocks", blocks(checkGitCommand('git "push" origin', { resolveHeadBranch: () => "main", cwd: "." })), true)
// The shell removes escapes and embedded quotes before git sees argv, so these are all one command.
T("git: backslash-escaped push still blocks", blocks(checkGitCommand("git \\push origin main")), true)
T("git: embedded quotes in the subcommand still block", blocks(checkGitCommand("git p''ush origin main")), true)
T("git: embedded quotes in the ref still block", blocks(checkGitCommand('git push origin "ma"in')), true)
T("git: an escaped ref still blocks", blocks(checkGitCommand("git push origin ma\\in")), true)
// And normalizing must not invent a match where none exists.
T("git: escaped redesign/main still allows", checkGitCommand("git push origin redesign/\\main"), null)
// An environment assignment is not the command word. Matching the first textual `git` let one
// stand in for it and the push went unjudged (Pullfrog, PR #743).
T("git: env assignment naming git still blocks", blocks(checkGitCommand("FOO=git git push origin main")), true)
T("git: a PATH prefix naming git still blocks", blocks(checkGitCommand("PATH=/opt/git/bin:$PATH git push origin main")), true)
T("git: an absolute git path still blocks", blocks(checkGitCommand("/usr/bin/git push origin main")), true)
T("git: a wrapper before git still blocks", blocks(checkGitCommand("sudo git push origin main")), true)
T("git: bare push while HEAD is on main blocks", blocks(checkGitCommand("git push", { resolveHeadBranch: () => "main", cwd: "." })), true)
T("git: bare push while HEAD is on a feature branch allows", checkGitCommand("git push", { resolveHeadBranch: () => "feature/x", cwd: "." }), null)
T(`git: ${NV} blocks`, blocks(checkGitCommand("git commit -m x " + NV)), true)
// Branch protection is Orbit's, not universal: a session driven from this repo
// routinely pushes sibling repos whose sanctioned workflow IS direct-to-main.
const brainRemote = () => "https://github.com/thomasluizon/brain.git"
T("git: push to main in a non-Orbit repo allows", checkGitCommand("git push origin main", { resolveRemoteUrl: brainRemote, cwd: "." }), null)
T("git: an unresolvable remote still blocks (fails safe)", blocks(checkGitCommand("git push origin main", { resolveRemoteUrl: () => "", cwd: "." })), true)
// A heredoc body is data: writing ABOUT a banned flag is not using it.
T(`git: a heredoc message naming ${NV} allows`, checkGitCommand(`git commit -F - <<'EOF'\nfix: stop passing ${NV} in CI\nEOF`), null)
T("git: a heredoc feeding a shell keeps its body in scope", blocks(checkGitCommand("bash <<'EOF'\ngit push origin main\nEOF")), true)
// git worktree remove --force follows a Windows junction and deletes the target.
T("git-worktree: --force blocks", blocks(checkGitWorktreeRemove("git worktree remove --force .claude/worktrees/x")), true)
T("git-worktree: no force allows", checkGitWorktreeRemove("git worktree remove .claude/worktrees/x"), null)
T("git-worktree: force on a later chained command allows", checkGitWorktreeRemove("git worktree remove .claude/worktrees/x && npm test -- --force"), null)

console.log("\n# orchestrator-guardrails (_lib/rules-orchestrator.mjs)")
// The admin-merge prohibition is absolute for every agent and takes no context:
// banning only the CLI flag would leave both raw API paths open, which is the
// exact bypass shape it exists to close. (The rule lives in rules-orchestrator,
// not rules-git; both hooks are wired to Bash and PowerShell.)
T(`admin-merge: gh pr merge ${ADMIN} blocks`, blocks(checkAdminMerge(`gh pr merge 667 --squash ${ADMIN}`)), true)
T("admin-merge: an ordinary gh pr merge --squash allows", checkAdminMerge("gh pr merge 667 --squash --delete-branch"), null)
for (const [label, method] of [
  ["a separated short flag", "-X PUT"],
  ["a concatenated short flag", "-XPUT"],
  ["gh's long flag", "--method PUT"],
  ["a lowercase method", "-X put"],
]) {
  T(`admin-merge: ${label} on the merge endpoint blocks`, blocks(checkAdminMerge(`gh api ${method} repos/o/r/pulls/667/merge -f merge_method=squash`)), true)
}
T("admin-merge: curl PUT to the merge endpoint blocks", blocks(checkAdminMerge("curl -X PUT https://api.github.com/repos/o/r/pulls/667/merge")), true)
T("admin-merge: wget PUT to the merge endpoint blocks", blocks(checkAdminMerge("wget --method=PUT https://api.github.com/repos/o/r/pulls/667/merge")), true)
// KNOWN GAP, measured 2026-08-04 and stated rather than implied: the method is
// matched only as a FLAG, so httpie's positional form `http PUT <merge-url>` is
// allowed. `httpie` is in the rule's client set but the shape it actually types
// is not covered. Fixing it belongs in _lib/rules-orchestrator.mjs, not here.
T("admin-merge: the GraphQL mergePullRequest mutation blocks", blocks(checkAdminMerge("gh api graphql -f query='mutation{mergePullRequest(input:{pullRequestId:\"x\"}){clientMutationId}}'")), true)
T("admin-merge: a PUT to another endpoint allows", checkAdminMerge("gh api -XPUT repos/o/r/issues/667/labels"), null)
T("admin-merge: reading the merge endpoint allows", checkAdminMerge("gh api repos/o/r/pulls/667/merge"), null)
T("admin-merge: another GraphQL mutation allows", checkAdminMerge("gh api graphql -f query='mutation{resolveReviewThread(input:{threadId:\"x\"}){thread{isResolved}}}'"), null)
T(`admin-merge: a commit message naming ${ADMIN} allows`, checkAdminMerge(`git commit -m "forbid gh pr merge ${ADMIN}"`), null)
T("admin-merge: the refusal says to ask Thomas", checkAdminMerge(`gh pr merge 1 ${ADMIN}`)?.message.includes("ask him to"), true)

const engine = (command, options) => checkEngineInvocation(command, { repoRoots: [], ...options })
T("engine: codex exec blocks", blocks(engine('codex exec "do the thing"')), true)
T("engine: bare claude blocks", blocks(engine("claude")), true)
T("engine: claude -p blocks", blocks(engine('claude -p "summarize"')), true)
T("engine: a Windows shim extension is still the binary", blocks(engine("codex.cmd exec")), true)
T("engine: a later chained engine call blocks", blocks(engine("npm test && codex exec")), true)
T("engine: the refusal names the launcher", engine("codex exec")?.message.includes("tools/launch-worker.mjs"), true)
T("engine: codex cloud list allows", engine("codex cloud list --json"), null)
T("engine: codex cloud status allows", engine("codex cloud status task_123"), null)
T("engine: codex cloud diff allows", engine("codex cloud diff task_123"), null)
T("engine: a nested dollar command substitution revokes the cloud read exemption", blocks(engine('codex cloud list "$(codex exec \'do work\')"')), true)
T("engine: a nested backtick command substitution revokes the cloud read exemption", blocks(engine("codex cloud list `codex exec 'do work'`")), true)
T("engine: a help flag cannot launder a nested engine call", blocks(engine('codex cloud list --help "$(codex exec \'do work\')"')), true)
T("engine: input process substitution revokes the cloud read exemption", blocks(engine("codex cloud list <(codex exec 'do work')")), true)
T("engine: output process substitution revokes the cloud read exemption", blocks(engine("codex cloud list >(codex exec 'do work')")), true)
T("engine: an escaped inner executable revokes the cloud read exemption", blocks(engine("codex cloud list co\\dex exec")), true)
T("engine: a leading assignment falls outside the complete cloud read shape", blocks(engine("SAFE_READ=1 codex cloud list")), true)
T("engine: codex cloud exec blocks", blocks(engine('codex cloud exec --env env_1 "do the thing"')), true)
T("engine: codex cloud apply blocks", blocks(engine("codex cloud apply task_123")), true)
T('engine: "list" inside a prompt exempts nothing', blocks(engine('codex exec "cloud list things"')), true)
T("engine: the cloud allowance is codex-only", blocks(engine("claude cloud list")), true)
T("engine: the refusal names the cloud submitter", engine("codex cloud exec")?.message.includes("tools/submit-cloud-worker.mjs"), true)
// The launcher exports its marker into every worker it spawns; that is the
// discriminator, and it is read from the ENVIRONMENT only.
T("engine: the launcher marker in the environment allows", engine("codex exec", { env: { ORBIT_LAUNCH_WORKER: "1" } }), null)
T("engine: a typed marker with no such environment still blocks", blocks(engine("ORBIT_LAUNCH_WORKER=1 codex exec")), true)
// A worker already inside a launcher-created worktree is the sanctioned caller.
// A linked worktree carries a `.git` FILE pointing into <main>/.git/worktrees/<name>;
// an ordinary checkout carries a `.git` DIRECTORY, which is what separates them.
const mainCheckout = join(root, "main")
const linkedWorktree = join(root, "worktrees", "feat")
mkdirSync(join(mainCheckout, ".git", "worktrees", "feat"), { recursive: true })
mkdirSync(linkedWorktree, { recursive: true })
writeFileSync(join(linkedWorktree, ".git"), `gitdir: ${join(mainCheckout, ".git", "worktrees", "feat")}\n`)
mkdirSync(join(linkedWorktree, "named-dir"), { recursive: true })
T("engine: a cwd inside a linked worktree allows", checkEngineInvocation("codex exec", { cwd: linkedWorktree, repoRoots: [mainCheckout] }), null)
T("engine: the main checkout is not a linked worktree", blocks(checkEngineInvocation("codex exec", { cwd: mainCheckout, repoRoots: [mainCheckout] })), true)
const stagingMain = join(root, "staging-main")
const stagingWorktree = join(root, "staging-worktree")
mkdirSync(stagingMain, { recursive: true })
const stagingGit = (args, cwd = stagingMain) => spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true })
T("staging: temporary repository initializes", stagingGit(["init", "--initial-branch=main"]).status, 0)
T("staging: temporary repository configures identity", stagingGit(["config", "user.email", "hooks@example.invalid"]).status, 0)
T("staging: temporary repository configures name", stagingGit(["config", "user.name", "Hook Test"]).status, 0)
mkdirSync(join(stagingMain, ".claude"), { recursive: true })
writeFileSync(join(stagingMain, ".claude", "tracked.md"), "tracked\n")
writeFileSync(join(stagingMain, "named.ts"), "export {}\n")
T("staging: temporary repository stages fixture", stagingGit(["add", ".claude/tracked.md", "named.ts"]).status, 0)
T("staging: temporary repository commits fixture", stagingGit(["commit", "-m", "fixture"]).status, 0)
T("staging: real linked worktree initializes", stagingGit(["worktree", "add", "-b", "feat", stagingWorktree]).status, 0)
mkdirSync(join(stagingWorktree, "named-dir"), { recursive: true })
rmSync(join(stagingWorktree, ".claude"), { recursive: true })
const workerStaging = (command) => checkBroadStaging(command, { cwd: stagingWorktree, repoRoots: [stagingMain] })
for (const command of [
  "git add -A",
  "git add --all",
  "git add --a",
  "git add -u",
  "git add --update",
  "git add --up",
  "git add .",
  "git add -- .",
  "git add \".\"",
  "git add named.ts .",
  "git add \"./\"",
  "git add src/*.ts",
  "git add ':(glob)src/*.ts'",
  "git add :",
  "git add :/",
  "git add ':(literal)'",
  "git add apps/web/app/api/[...path]/route.ts",
  "git add named-dir",
  "git add .claude",
  "git stage .",
  "git add --pathspec-from-file paths.txt",
  "git add --pathspec-from-file=paths.txt",
  "git add --pathspec-from-f paths.txt",
  "git add --pathspec-from-file paths.txt --pathspec-file-nul",
  "git commit -am 'sweep everything'",
  "git commit --all -m 'sweep everything'",
  "git commit . -m 'sweep everything'",
  "git commit ':(glob)**' -m 'sweep everything'",
  "git commit --pathspec-from-file paths.txt -m 'sweep everything'",
  "git commit -p",
  "git commit --patch",
  "git commit -i",
  "git commit --interactive",
  "git commit --intera",
  "git commit --patc",
  "git commit named-dir -m 'sweep subtree'",
  `git -C "${linkedWorktree}" add .`,
]) {
  T(`staging: ${command} blocks in a worker worktree`, blocks(workerStaging(command)), true)
}
T("staging: explicitly named paths are allowed", workerStaging("git add tools/verify-delivery.mjs .claude/skills/orchestrate/SKILL.md"), null)
T(
  "staging: a literal bracketed filename is allowed",
  workerStaging("git --literal-pathspecs add apps/web/app/api/[...path]/route.ts"),
  null,
)
T("staging: literal pathspec magic is allowed", workerStaging("git add ':(literal)apps/web/app/api/[...path]/route.ts'"), null)
T("staging: an explicitly named commit path is allowed", workerStaging("git commit tools/verify-delivery.mjs -m 'named only'"), null)
T("staging: a literal bracketed commit path is allowed", workerStaging("git commit ':(literal)apps/web/app/api/[...path]/route.ts' -m 'named only'"), null)
T("staging: an attached -m value containing broad flag letters is allowed", workerStaging("git commit -mapi"), null)
T("staging: an attached -F value containing broad flag letters is allowed", workerStaging("git commit -Fpath-to-message"), null)
T("staging: an attached -S key ID containing broad flag letters is allowed", workerStaging("git commit -Sapi"), null)
T("staging: broad add outside a worker is untouched", checkBroadStaging("git add -A", { cwd: mainCheckout, repoRoots: [mainCheckout] }), null)
// REGRESSION (fixed 2026-08-04). The previous revision split the command on a
// bare /[&|;\n]/, so the `|` inside the quoted search pattern produced a phantom
// segment whose first token resolved to `codex`, and a read-only grep was
// refused. A search PATTERN is data, never an invocation.
T("engine: a grep whose PATTERN contains the engine names allows", engine("grep -rnE 'claude|codex' tools/"), null)
T("engine: the same grep with double quotes allows", engine('grep -rn "claude|codex" tools/'), null)
// REGRESSION (fixed 2026-08-04). The previous revision keyed on the binary alone
// and refused `codex --version`, which starts no model session: the refusal
// protected no budget and only broke ordinary preflight.
T("engine: codex --version allows", engine("codex --version"), null)
T("engine: claude --help allows", engine("claude --help"), null)
T("engine: an unrelated command allows", engine("npm run lint"), null)
T("engine: a commit message naming the engine allows", engine('git commit -m "stop running codex exec by hand"'), null)
T("engine: a path containing .claude is not the claude binary", engine("cat .claude/skills/second-opinion/SKILL.md"), null)

console.log("\n# forbid-worker-browser (_lib/rules-worker.mjs)")
// A worker never opens a browser and never starts a server, unconditionally. Measured 2026-08-06:
// ORB-39 and ORB-98 both finished their tickets, then spent the rest of their budgets on a dev
// server and a login page a worktree can never authenticate against, and both needed rescuing.
// The discrimination is the CALLER, never the command: Thomas runs /dev-server whenever he likes.
const worker = (command, options) => checkWorkerBrowser(command, { env: { ORBIT_LAUNCH_WORKER: "1" }, repoRoots: [], ...options })
for (const command of ["npm run dev", "next dev --port 3920", "pnpm dev", "expo start", "npx playwright test", "maestro test flow.yaml", "curl http://localhost:3920/login", "adb shell input tap 1 1"]) {
  T(`worker-browser: ${command} blocks`, blocks(worker(command)), true)
}
T("worker-browser: the refusal says who owes the visual check", worker("npm run dev")?.message.includes("owed by a HUMAN"), true)
T("worker-browser: a later chained dev server blocks", blocks(worker("npm test && npm run dev")), true)
// The same commands from a session that is NOT a worker are none of this gate's business.
T("worker-browser: npm run dev outside a worker allows", checkWorkerBrowser("npm run dev", { env: {}, cwd: "", repoRoots: [] }), null)
T("worker-browser: a cwd inside a linked worktree IS a worker", blocks(checkWorkerBrowser("npm run dev", { env: {}, cwd: linkedWorktree, repoRoots: [mainCheckout] })), true)
T("worker-browser: the main checkout is not a worker", checkWorkerBrowser("npm run dev", { env: {}, cwd: mainCheckout, repoRoots: [mainCheckout] }), null)
// Ordinary work a worker MUST still be able to do. A gate that blocks the test run gets switched off.
for (const command of ["npm test", "npm run build", "npm run lint", "dotnet test", "npx vitest run apps/web", "git commit -m 'stop npm run dev in CI'", "curl https://api.github.com/repos/o/r"]) {
  T(`worker-browser: ${command} allows`, worker(command), null)
}
// The rule judges the INVOKED PROGRAM, never stray argument text. Scanning the whole segment refused
// `rg -n playwright .`, so a worker could not inspect or delete the very code this bans, which
// aborts executable work for no safety. Same defect rules-orchestrator fixed for grep-over-engines.
for (const command of ["rg -n playwright .", 'grep -rn "npm run dev" tools/', "cat apps/web/e2e/visual/orb-39.ts", "rm -rf apps/web/e2e", 'sed -i "s/expo start//" README.md']) {
  T(`worker-browser: read-only work whose ARGUMENTS name a browser tool allows: ${command}`, worker(command), null)
}
// ...and the package runners that front the real program are still resolved through.
T("worker-browser: npx playwright still blocks through the runner prefix", blocks(worker("npx playwright test")), true)
T("worker-browser: pnpm dlx cypress still blocks", blocks(worker("pnpm dlx cypress run")), true)
T("worker-browser: a dev script under a runner still blocks", blocks(worker("npm run dev -- --port 4000")), true)
T("worker-browser: an unrelated npm script named dev-docs allows", worker("npm run dev:docs"), null)
T("worker-browser: curl to a public host allows while localhost blocks", worker("curl https://example.com") === null && blocks(worker("curl http://localhost:3000")), true)

console.log("\n# require-wake-source (_lib/rules-sleep.mjs)")
// Under --sleep the ONLY thing that continues the run is a background task completing and
// re-invoking the session. On 2026-08-06 the orchestrator ended a turn saying "CI will wake me"
// with nothing scheduled; the night stopped there and its artifacts looked like a finished run.
const alive = () => true
const dead = () => false
const sleeping = { sessionId: "s1", sleep: true, remaining: ["ORB-2", "ORB-3"] }
const stop = (options) => checkSleepStop({ sessionId: "s1", isAlive: dead, ...options })
T("sleep-stop: work remaining and no live wake source blocks", blocks(stop({ state: sleeping })), true)
T("sleep-stop: the refusal names the tickets and the action", stop({ state: sleeping })?.message.includes("LAUNCH THE NEXT TICKET"), true)
T("sleep-stop: a live wake source allows", checkSleepStop({ state: sleeping, wakeSources: [{ pid: 1 }], sessionId: "s1", isAlive: alive }), null)
// A leaked file from a crashed launcher is not a wake source, which is why liveness is checked at
// all rather than the file's existence being trusted.
T("sleep-stop: a registered but DEAD wake source is not one", blocks(stop({ state: sleeping, wakeSources: [{ pid: 1 }] })), true)
T("sleep-stop: an exhausted queue allows", checkSleepStop({ state: { ...sleeping, remaining: [] }, sessionId: "s1", isAlive: dead }), null)
// A salvaged pull request with no READY final-head receipt is unfinished work, not a finished
// queue. PR #690 was opened by hand and reported as done while two required checks were red,
// because opening it was treated as the end of salvage. Pullfrog now reviews every pull request in
// GitHub Actions and `pullfrog-approval` is a required check, so the review verdict reaches the
// receipt through the required contexts and needs no separate axis here.
const salvaged = { ...sleeping, remaining: [], pullRequests: [{ repositoryKey: "ui", prNumber: 690, receiptPath: "C:/receipt.json" }] }
T("sleep-stop: an open pull request with no READY receipt blocks the queue from reading as done", blocks(stop({ state: salvaged })), true)
T("sleep-stop: the refusal names the repository-qualified pull request and receipt debt", stop({ state: salvaged })?.message.includes("ui#690") && stop({ state: salvaged })?.message.includes("READY final-head receipt"), true)
T("sleep-stop: a live worker allows the turn to end", checkSleepStop({ state: salvaged, wakeSources: [{ pid: 1 }], sessionId: "s1", isAlive: alive }), null)
T("sleep-stop: bare PR numbers are invalid run state and cannot clear readiness", blocks(stop({ state: { ...sleeping, remaining: [], pullRequests: [690] } })), true)
T("sleep-stop: an append-only ledger survives a cleared pullRequests list", blocks(stop({ state: { ...sleeping, remaining: [], pullRequests: [], readinessLedger: salvaged.pullRequests } })), true)
T("sleep-stop: a mechanically READY ledger permits queue completion", checkSleepStop({ state: { ...sleeping, remaining: [], pullRequests: [], readinessLedger: salvaged.pullRequests }, sessionId: "s1", isAlive: dead, receiptVerdict: () => "READY" }), null)
T("sleep-stop: nothing remaining and no pull requests allows", checkSleepStop({ state: { ...sleeping, remaining: [], pullRequests: [] }, sessionId: "s1", isAlive: dead }), null)
T("sleep-stop: a run that is not --sleep allows", checkSleepStop({ state: { ...sleeping, sleep: false }, sessionId: "s1", isAlive: dead }), null)
T("sleep-stop: no record at all allows", checkSleepStop({ state: null, sessionId: "s1", isAlive: dead }), null)
// A record from a previous run must never block today's session, and the session id is exact.
T("sleep-stop: a record from another session allows", checkSleepStop({ state: sleeping, sessionId: "s2", isAlive: dead }), null)
// A blocked stop that blocks again is an infinite loop.
T("sleep-stop: the second pass never blocks again", checkSleepStop({ state: sleeping, sessionId: "s1", stopHookActive: true, isAlive: dead }), null)

/**
 * A run that CANNOT reach READY needs a legitimate terminal state. On 2026-08-08 a named blocker
 * made READY unreachable and the only exits left were fabricating a receipt or clearing the ledger,
 * both forbidden. That deadlock burned five turns.
 *
 * The bar is a RECORDED blocker string. A blocker is a fact the run writes down, never a verdict it
 * asserts about its own work, which is what stops "ended blocked" becoming a cheaper "finished".
 */
const blockedEntry = { repositoryKey: "ui", prNumber: 698, receiptPath: "C:/receipt.json", receiptWritten: true, blocker: "SonarCloud new-code coverage 66.7% on a deletion-only diff" }
const blockedRun = { ...sleeping, remaining: [], pullRequests: [], readinessLedger: [blockedEntry] }
T("sleep-stop: a pull request with a RECORDED blocker may end the run", blocks(stop({ state: blockedRun })), false)
T("sleep-stop: the blocked ending is reported as BLOCKED, never as finished", stop({ state: blockedRun })?.terminal, "BLOCKED")
T("sleep-stop: the BLOCKED banner names the pull request and its blocker", stop({ state: blockedRun })?.message.includes("ui#698") && stop({ state: blockedRun })?.message.includes("SonarCloud"), true)
// Without the recorded blocker the very same entry still blocks, which is what keeps the state honest.
T("sleep-stop: the same entry with NO recorded blocker still blocks the stop", blocks(stop({ state: { ...blockedRun, readinessLedger: [{ ...blockedEntry, blocker: null }] } })), true)
T("sleep-stop: an empty blocker string is not a blocker", blocks(stop({ state: { ...blockedRun, readinessLedger: [{ ...blockedEntry, blocker: "" }] } })), true)
// A finished run must stay silent, or a BLOCKED banner on every ending means nothing.
T("sleep-stop: a genuinely READY queue reports no terminal banner", checkSleepStop({ state: blockedRun, sessionId: "s1", isAlive: dead, receiptVerdict: () => "READY" }), null)
// A live wake source means the TURN is ending, not the RUN. Announcing a final state there would be
// the mirror of the defect: reporting an ending while work is still in flight.
T(
  "sleep-stop: a blocked pull request with a LIVE wake source reports nothing, because the run has not ended",
  checkSleepStop({ state: blockedRun, wakeSources: [{ pid: 1 }], sessionId: "s1", isAlive: alive }),
  null,
)

/** The ledger accepted four rows on 2026-08-08 whose receipt files were never written, and the hook
 * read them as unreadable rather than as absent, which is quieter and easier to mistake for a fault. */
const unwritten = { ...sleeping, remaining: [], pullRequests: [], readinessLedger: [{ repositoryKey: "ui", prNumber: 699, receiptPath: "C:/never-written.json", receiptWritten: false }] }
T("sleep-stop: a ledger row whose receipt was never written blocks", blocks(stop({ state: unwritten })), true)
T("sleep-stop: the refusal names the receipt path that was never written", stop({ state: unwritten })?.message.includes("C:/never-written.json"), true)

console.log("\n# forbid-raw-ticket-mutation (_lib/rules-tickets.mjs)")
const TICKET_REPO = "thomasluizon/orbit-tickets"
const CODE_REPO = "thomasluizon/orbit-ui-mobile"
T("tickets: issue edit in the ticket repository blocks", blocks(checkTicketMutation(`gh issue edit 215 --repo ${TICKET_REPO} --add-label Bug`)), true)
T("tickets: attached short repo flag still blocks", blocks(checkTicketMutation(`gh issue close 215 -R${TICKET_REPO}`)), true)
T("tickets: host-qualified ticket repository still blocks", blocks(checkTicketMutation(`gh issue delete 215 --repo github.com/${TICKET_REPO} --confirm`)), true)
T("tickets: issue create in the ticket repository blocks", blocks(checkTicketMutation(`gh issue create --repo ${TICKET_REPO} --title x --body y`)), true)
T("tickets: issue comment by ticket URL blocks", blocks(checkTicketMutation(`gh issue comment https://github.com/${TICKET_REPO}/issues/215 --body fixed`)), true)
T("tickets: issue mutation with no target fails closed", blocks(checkTicketMutation("gh issue close 215")), true)
T("tickets: issue edit in a code repository allows", checkTicketMutation(`gh issue edit 12 --repo ${CODE_REPO} --add-label Bug`), null)
T("tickets: issue reads need no target", checkTicketMutation("gh issue list --state open"), null)
T("tickets: every pull request command allows", checkTicketMutation(`gh pr view 12 --repo ${TICKET_REPO}`), null)
T("tickets: ticket board item edit blocks", blocks(checkTicketMutation("gh project item-edit 2 --owner thomasluizon --id PVTI_x --field-id PVTSSF_x --single-select-option-id x")), true)
T("tickets: project item mutation with no owner fails closed", blocks(checkTicketMutation("gh project item-delete 2 --id PVTI_x")), true)
T("tickets: project node-id mutation fails closed", blocks(checkTicketMutation("gh project item-edit --owner thomasluizon --id PVTI_x --field-id x --project-id PVT_x --text value")), true)
T("tickets: @me project owner fails closed", blocks(checkTicketMutation("gh project item-delete 2 --owner @me --id PVTI_x")), true)
T("tickets: another project item mutation allows", checkTicketMutation("gh project item-edit 9 --owner octocat --id PVTI_x --field-id x --text value"), null)
T("tickets: label create in the ticket repository blocks", blocks(checkTicketMutation(`gh label create urgent --repo ${TICKET_REPO}`)), true)
T("tickets: label edit in a code repository allows", checkTicketMutation(`gh label edit bug --repo ${CODE_REPO} --color ff0000`), null)
T("tickets: REST issue mutation in the ticket repository blocks", blocks(checkTicketMutation(`gh api repos/${TICKET_REPO}/issues/215 -X PATCH -f title=x`)), true)
T("tickets: attached REST method and field flags still block", blocks(checkTicketMutation(`gh api repos/${TICKET_REPO}/issues/215 -XPATCH -ftitle=x`)), true)
T("tickets: REST milestone mutation in the ticket repository blocks", blocks(checkTicketMutation(`gh api repos/${TICKET_REPO}/milestones -f title=Launch`)), true)
T("tickets: REST issue read in the ticket repository allows", checkTicketMutation(`gh api repos/${TICKET_REPO}/issues/215`), null)
T("tickets: REST issue mutation in a code repository allows", checkTicketMutation(`gh api repos/${CODE_REPO}/issues/12 -X PATCH -f title=x`), null)
T("tickets: REST mutation with a placeholder target fails closed", blocks(checkTicketMutation("gh api repos/{owner}/{repo}/issues/12 -X PATCH -f title=x")), true)
T("tickets: GraphQL project item mutation fails closed on an opaque node id", blocks(checkTicketMutation("gh api graphql -f query='mutation { deleteProjectV2Item(input: {projectId: $p, itemId: $i}) { deletedItemId } }'")), true)
T("tickets: GraphQL closeIssue fails closed on an opaque node id", blocks(checkTicketMutation("gh api graphql -f query='mutation { closeIssue(input: {issueId: $i}) { issue { id } } }'")), true)
T("tickets: GraphQL addComment fails closed on an opaque subject id", blocks(checkTicketMutation("gh api graphql -f query='mutation { addComment(input: {subjectId: $i, body: $b}) { commentEdge { node { id } } } }'")), true)
T("tickets: opaque GraphQL input fails closed", blocks(checkTicketMutation("gh api graphql --input payload.json")), true)
T("tickets: GraphQL pull request mutation allows", checkTicketMutation("gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: $i}) { thread { isResolved } } }'"), null)
T("tickets: a repository tool invocation allows", checkTicketMutation("node tools/sync-issue-state.mjs --issue ORB-215 --repo ui --state ready"), null)
T("tickets: the ticket skill milestone read allows", checkTicketMutation(`gh api repos/${TICKET_REPO}/milestones?state=all&per_page=100 --paginate --jq .[].title`), null)
T("tickets: the sanctioned milestone creator allows", checkTicketMutation("node tools/create-milestone.mjs --title Launch --description-file draft.md"), null)
T("tickets: the sanctioned ticket creator allows", checkTicketMutation("node tools/create-ticket.mjs --title x --body-file draft.md --label repo:ui --label Improvement"), null)
T("tickets: the post-merge completion preflight allows", checkTicketMutation('node tools/complete-ticket.mjs --issue "#221" --preflight'), null)
T("tickets: the post-merge completion write allows", checkTicketMutation('node tools/complete-ticket.mjs --issue "#221"'), null)

/** The endpoint used to be read as the single word after `api`, so any flag placed first made that
 * word `--method` and the guard allowed the mutation. `gh` accepts every one of these shapes. */
T("tickets: a leading long method flag no longer hides the endpoint", blocks(checkTicketMutation(`gh api --method DELETE repos/${TICKET_REPO}/issues/1`)), true)
T("tickets: a leading short method flag no longer hides the endpoint", blocks(checkTicketMutation(`gh api -X DELETE repos/${TICKET_REPO}/issues/1`)), true)
T("tickets: a leading boolean flag no longer hides the endpoint", blocks(checkTicketMutation(`gh api --silent -X PATCH repos/${TICKET_REPO}/issues/1`)), true)
T("tickets: an attached leading method flag no longer hides the endpoint", blocks(checkTicketMutation(`gh api -XDELETE repos/${TICKET_REPO}/issues/1`)), true)
T("tickets: a leading flag before a read is still allowed", checkTicketMutation(`gh api --method GET repos/${TICKET_REPO}/issues/1`), null)
T("tickets: a leading flag before a code-repository write is still allowed", checkTicketMutation(`gh api -X DELETE repos/${CODE_REPO}/issues/1`), null)
T("tickets: an API write with no endpoint at all fails closed", blocks(checkTicketMutation("gh api -X DELETE")), true)
T("tickets: an API write behind a flag of unknown arity fails closed", blocks(checkTicketMutation(`gh api --newflag -X DELETE repos/${CODE_REPO}/issues/1`)), true)
T("tickets: a leading flag before a GraphQL mutation still fails closed", blocks(checkTicketMutation("gh api --silent graphql -f query='mutation { closeIssue(input: {issueId: $i}) { issue { id } } }'")), true)

/** The second fail-open: quote state never recovered, so an unbalanced quote absorbed the rest of
 * the command and the gh invocation inside it was never parsed as its own segment. */
T("tickets: a ticket write after an unbalanced quote blocks", blocks(checkTicketMutation(`echo " ; gh issue edit 5 --repo ${TICKET_REPO} --title "X"`)), true)
T("tickets: a ticket API write after an unbalanced quote blocks", blocks(checkTicketMutation(`echo ' && gh api -X DELETE repos/${TICKET_REPO}/issues/1`)), true)
T("tickets: a balanced-quote ticket write still blocks", blocks(checkTicketMutation(`gh issue edit 5 --repo ${TICKET_REPO} --title "X"`)), true)
T("tickets: an unbalanced quote around a code-repository write still allows", checkTicketMutation(`echo " ; gh issue edit 5 --repo ${CODE_REPO} --title "X"`), null)
T("tickets: an unbalanced quote around a sanctioned tool still allows", checkTicketMutation(`echo " ; node tools/comment-ticket.mjs --issue "#5" --body-file -`), null)

/** gh clusters short flags the POSIX way, so `-iX` is `-i` plus `-X` and `-iFtitle=x` is `-i` plus
 * `-F title=x`. Read raw, `-iX` matched no flag, the method defaulted to GET, and a real DELETE was
 * allowed. The shell also concatenates `g''h` and `\gh` into gh before gh ever runs. */
T("tickets: a clustered short method flag no longer reads as GET", blocks(checkTicketMutation(`gh api -iX DELETE repos/${TICKET_REPO}/issues/1`)), true)
T("tickets: a clustered short field flag no longer reads as GET", blocks(checkTicketMutation(`gh api -iFtitle=x repos/${TICKET_REPO}/issues/215`)), true)
T("tickets: a clustered write against a code repository still allows", checkTicketMutation(`gh api -iX DELETE repos/${CODE_REPO}/issues/1`), null)
T("tickets: a cluster carrying an unclassifiable character fails closed", blocks(checkTicketMutation(`gh api -iZ repos/${TICKET_REPO}/issues/1`)), true)
T("tickets: a lone boolean short flag before a read still allows", checkTicketMutation(`gh api -i repos/${TICKET_REPO}/issues/1`), null)
T("tickets: a quote-concatenated gh api write blocks", blocks(checkTicketMutation(`g''h api -X DELETE repos/${TICKET_REPO}/issues/1`)), true)
T("tickets: a quote-concatenated gh issue write blocks", blocks(checkTicketMutation(`g"h" issue edit 5 --repo ${TICKET_REPO} --title X`)), true)
T("tickets: a backslash-escaped gh write blocks", blocks(checkTicketMutation(`\\gh api -X DELETE repos/${TICKET_REPO}/issues/1`)), true)
T("tickets: an opaque GraphQL payload hidden in a cluster fails closed", blocks(checkTicketMutation("gh api graphql -iFquery=@payload.graphql")), true)
T("tickets: an opaque GraphQL payload behind an attached short flag fails closed", blocks(checkTicketMutation("gh api graphql -Fquery=@payload.graphql")), true)
// A gate that fires on prose gets switched off, so its false-positive rate remains part of its contract.
const tracked = spawnSync("git", ["-C", repoRoot, "ls-files", "*.md", ".claude/*", "tools/*"], { encoding: "utf8" })
const docPaths = (tracked.status === 0 ? tracked.stdout.trim().split(/\r?\n/) : [])
  .filter(Boolean)
  // The adapter exempts the gate's own source, since a rule module must contain
  // the strings it matches on. Mirror that here rather than reporting it.
  .filter((relative) => !relative.startsWith(".claude/hooks/"))
  .map((relative) => join(repoRoot, relative))
  .filter((absolute) => existsSync(absolute) && statSync(absolute).isFile())
T("tickets: blocks none of this repo's tracked docs", docPaths.filter((path) => checkTicketMutation(readFileSync(path, "utf8"))?.block).map((path) => path.slice(repoRoot.length + 1)), [])
T("tickets: the doc scan actually read files", docPaths.length > 0, true)

console.log("\n# forbid-ef-migration-raw-index (_lib/rules-source.mjs)")
// EF applies migrations at startup on Render, so raw index SQL must be
// idempotent: a bare CREATE INDEX for an index that already exists throws
// Postgres 42P07 and fails the deploy. Scoped to orbit-api Migrations/*.cs.
const migration = "/x/orbit-api/src/Orbit.Infrastructure/Migrations/20260101_Add.cs"
T("ef-index: a raw CREATE UNIQUE INDEX blocks", blocks(checkEfMigrationRawIndex(migration, 'migrationBuilder.Sql("CREATE UNIQUE INDEX ix_foo ON foo (bar)");')), true)
T("ef-index: a raw DROP INDEX without IF EXISTS blocks", blocks(checkEfMigrationRawIndex(migration, 'migrationBuilder.Sql("DROP INDEX ix_foo");')), true)
T("ef-index: the IF NOT EXISTS form allows", checkEfMigrationRawIndex(migration, 'migrationBuilder.Sql("CREATE INDEX IF NOT EXISTS ix_foo ON foo (bar)");'), null)
T("ef-index: the CreateIndex API call allows", checkEfMigrationRawIndex(migration, 'migrationBuilder.CreateIndex(name: "ix_foo", table: "foo", column: "bar");'), null)
T("ef-index: a file off the migrations path is skipped", checkEfMigrationRawIndex("/x/orbit-api/src/Orbit.Application/Foo.cs", 'migrationBuilder.Sql("CREATE INDEX ix_foo ON foo (bar)");'), null)
// One statement's IF NOT EXISTS must not mask a sibling in the same batched call.
T("ef-index: a batched Sql with one non-idempotent statement blocks", blocks(checkEfMigrationRawIndex(migration, 'migrationBuilder.Sql("CREATE INDEX IF NOT EXISTS ix_b ON foo (b); CREATE INDEX ix_a ON foo (a);");')), true)
T("ef-index: a batched Sql with all idempotent statements allows", checkEfMigrationRawIndex(migration, 'migrationBuilder.Sql("CREATE INDEX IF NOT EXISTS ix_b ON foo (b); CREATE INDEX IF NOT EXISTS ix_a ON foo (a);");'), null)

// An identifier a run WRITES with must have been READ by that run. On 2026-08-08 a typed
// PRRT_ id resolved to a live thread on a stranger's public repository and replied there,
// because node ids are globally unique and a wrong one does not fail.
const OBSERVED = "PRRT_kwDOR5Siws6Wfy_V"
const INVENTED = "PRRT_kwDOR5Siws6XdcAt"
const TRAILING_HYPHEN = "PRRT_kwDOR5Siws6d9bF-"
const TRAILING_UNDERSCORE = "PRRT_kwDOR5Siws6d9bF_"
const seen = new Set([OBSERVED])
const invented = (command, options = {}) => checkInventedIdentifier(command, { observedIdentifiers: seen, ...options })
// THE incident, verbatim in shape: a typed id, and a `||` fallback that makes the write the probe.
T(
  "identifier: the incident command blocks",
  blocks(invented(`printf 'fixed in %s' "$sha" | node tools/resolve-bot-thread.mjs --thread ${INVENTED} --repo ui --pr 699 || node tools/list-bot-threads.mjs --pr 699 --repo ui`)),
  true,
)
T("identifier: the blocked message names the unknown id", invented(`gh api graphql -f thread=${INVENTED}`)?.message?.includes(INVENTED) === true, true)
T("identifier: an observed id allows", invented(`node tools/resolve-bot-thread.mjs --thread ${OBSERVED} --repo ui --pr 699`), null)
// One known id must not launder an unknown one in the same command.
T("identifier: a known id beside an unknown one still blocks", blocks(invented(`gh api graphql -f a=${OBSERVED} -f b=${INVENTED}`)), true)
T("identifier: only the unknown id is named", invented(`gh api graphql -f a=${OBSERVED} -f b=${INVENTED}`)?.message?.includes(OBSERVED) === true, false)
// An id in text is not a target. A guard that fired on grep or an editor would be bypassed by habit.
T("identifier: an id in a command that cannot reach GitHub allows", invented(`grep -n ${INVENTED} notes.md`), null)
T("identifier: a gh command with no id at all allows", invented("gh pr view 699 --repo thomasluizon/orbit-ui-mobile"), null)
// Ordinary upper-case shell words share the prefixes and are not node ids.
T("identifier: PR_NUMBER is not a node id", extractNodeIds("gh pr view $PR_NUMBER"), [])
T("identifier: IC_CONFIG is not a node id", extractNodeIds("gh api $IC_CONFIG"), [])
T("identifier: a short body is not a node id", extractNodeIds("gh api PRRT_abc"), [])
T("identifier: an ordinary node id is extracted once, deduped", extractNodeIds(`gh api ${INVENTED} ${INVENTED}`), [INVENTED])
T("identifier: a node id ending in a hyphen is extracted whole", extractNodeIds(`gh api ${TRAILING_HYPHEN}`), [TRAILING_HYPHEN])
T("identifier: a node id ending in an underscore is extracted whole", extractNodeIds(`gh api ${TRAILING_UNDERSCORE}`), [TRAILING_UNDERSCORE])
T(
  "identifier: an unobserved node id ending in a hyphen is refused whole",
  invented(`gh api graphql -f thread=${TRAILING_HYPHEN}`)?.message?.includes(TRAILING_HYPHEN) === true,
  true,
)
T("identifier: PR_ and IC_ shapes are guarded too", extractNodeIds("gh api PR_kwDOR5Siws6abc IC_kwDOR5Siws6def").length, 2)
T("identifier: an empty command allows", invented(""), null)
// A heredoc BODY is data the command carries, not the command. This gate refused a
// /second-opinion call whose body QUOTED the incident, and a guard that fires on writing ABOUT
// the incident is one everybody learns to work around. The bypass it leaves is disclosed.
T(
  "identifier: an id quoted inside a heredoc body allows",
  invented(`node .claude/skills/second-opinion/second-opinion.mjs <<'F'\nthe incident passed --thread ${INVENTED} to tools/resolve-bot-thread.mjs\nF`),
  null,
)
T(
  "identifier: the same id on the COMMAND LINE beside a heredoc still blocks",
  blocks(invented(`node tools/resolve-bot-thread.mjs --thread ${INVENTED} --repo ui --pr 699 <<'F'\nfixed in abc\nF`)),
  true,
)

// ---------------------------------------------------------------------------
// 3. The real hook files: stdin payload in, exit code out
// ---------------------------------------------------------------------------
console.log("\n# hook adapters (real files, real exit codes)")
const runHook = (file, payload, env) =>
  spawnSync(process.execPath, [join(hooksDir, file)], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, ORBIT_LAUNCH_WORKER: "", ...env },
  }).status
const bash = (command, cwd = root) => ({ tool_name: "Bash", tool_input: { command }, cwd })

T("adapter git-guardrails: push main -> 2", runHook("git-guardrails.mjs", bash("git push origin main")), 2)
T("adapter git-guardrails: push feature -> 0", runHook("git-guardrails.mjs", bash("git push origin feature/x")), 0)
T("adapter git-guardrails: worktree remove --force -> 2", runHook("git-guardrails.mjs", bash("git worktree remove --force .claude/worktrees/x")), 2)

const ORCH = "orchestrator-guardrails.mjs"
T("adapter orchestrator: codex exec -> 2", runHook(ORCH, bash('codex exec "do the thing"')), 2)
T(`adapter orchestrator: gh pr merge ${ADMIN} -> 2`, runHook(ORCH, bash(`gh pr merge 1 --squash ${ADMIN}`)), 2)
T("adapter orchestrator: gh pr merge --squash -> 0", runHook(ORCH, bash("gh pr merge 1 --squash")), 0)
T("adapter orchestrator: codex --version -> 0", runHook(ORCH, bash("codex --version")), 0)
T("adapter orchestrator: grep over a codex pattern -> 0", runHook(ORCH, bash("grep -rnE 'claude|codex' tools/")), 0)
T("adapter orchestrator: the launcher marker -> 0", runHook(ORCH, bash("codex exec"), { ORBIT_LAUNCH_WORKER: "1" }), 0)
T("adapter orchestrator: worker git add -A -> 2", runHook(ORCH, bash("git add -A"), { ORBIT_LAUNCH_WORKER: "1" }), 2)
T("adapter orchestrator: worker git add -u -> 2", runHook(ORCH, bash("git add -u"), { ORBIT_LAUNCH_WORKER: "1" }), 2)
T("adapter orchestrator: worker named git add -> 0", runHook(ORCH, bash("git add tools/verify-delivery.mjs", repoRoot), { ORBIT_LAUNCH_WORKER: "1" }), 0)
T(
  "adapter orchestrator: worker literal bracketed git add -> 0",
  runHook(ORCH, bash("git --literal-pathspecs add apps/web/app/api/[...path]/route.ts", repoRoot), { ORBIT_LAUNCH_WORKER: "1" }),
  0,
)

// The launcher marker means the opposite for the browser ban: it identifies the worker, which is
// the only caller this gate refuses.
const BROWSER = "forbid-worker-browser.mjs"
T("adapter worker-browser: a worker starting a dev server -> 2", runHook(BROWSER, bash("npm run dev"), { ORBIT_LAUNCH_WORKER: "1" }), 2)
T("adapter worker-browser: a worker running playwright -> 2", runHook(BROWSER, bash("npx playwright test"), { ORBIT_LAUNCH_WORKER: "1" }), 2)
T("adapter worker-browser: a worker running the tests -> 0", runHook(BROWSER, bash("npm test"), { ORBIT_LAUNCH_WORKER: "1" }), 0)
T("adapter worker-browser: the same dev server outside a worker -> 0", runHook(BROWSER, bash("npm run dev")), 0)

/**
 * The invented-identifier adapter, on both of its evidence sources. The ledger case writes THIS
 * checkout's real ledger, because that is the only path list-bot-threads.mjs writes, and restores
 * whatever was there. The scratchpad case stages a session directory under the real scratchpad
 * layout, so the id-in-an-artifact path is exercised without touching any repository.
 */
const IDENT_HOOK = "forbid-invented-identifier.mjs"
const IDENT_SESSION = "orbit-hooks-gate-identifier-session"
const resolveCommand = (id) => `node tools/resolve-bot-thread.mjs --thread ${id} --repo ui --pr 699`
const identPayload = (command, sessionId = IDENT_SESSION) => ({ tool_name: "Bash", tool_input: { command }, cwd: repoRoot, session_id: sessionId })

T("adapter identifier: an id this run never read -> 2", runHook(IDENT_HOOK, identPayload(resolveCommand(INVENTED))), 2)
T("adapter identifier: a command with no id at all -> 0", runHook(IDENT_HOOK, identPayload("node tools/list-bot-threads.mjs --pr 699 --repo ui")), 0)
T(
  "adapter identifier: the PowerShell tool is guarded too, not only Bash -> 2",
  runHook(IDENT_HOOK, { tool_name: "PowerShell", tool_input: { command: resolveCommand(INVENTED) }, cwd: repoRoot, session_id: IDENT_SESSION }),
  2,
)

const scratchpadArtifact = join(tmpdir(), "claude", "orbit-hooks-gate-project", IDENT_SESSION, "scratchpad", "threads.json")
mkdirSync(dirname(scratchpadArtifact), { recursive: true })
writeFileSync(scratchpadArtifact, JSON.stringify({ threads: [{ id: INVENTED }] }))
try {
  T("adapter identifier: the same id read from a session artifact -> 0", runHook(IDENT_HOOK, identPayload(resolveCommand(INVENTED))), 0)
  T("adapter identifier: another session cannot borrow that artifact -> 2", runHook(IDENT_HOOK, identPayload(resolveCommand(INVENTED), "a-different-session")), 2)
} finally {
  rmSync(join(tmpdir(), "claude", "orbit-hooks-gate-project"), { recursive: true, force: true })
}

const { identifierLedgerPath, recordObservedIdentifiers } = await import("../../tools/lib/identifier-ledger.mjs")
const ledgerPath = identifierLedgerPath(repoRoot)
const priorLedger = existsSync(ledgerPath) ? readFileSync(ledgerPath, "utf8") : null
try {
  recordObservedIdentifiers([INVENTED], { repoRoot, tool: "test-hooks.mjs", runIdentifier: "an-earlier-session" })
  T("adapter identifier: an id recorded by an earlier run -> 2", runHook(IDENT_HOOK, identPayload(resolveCommand(INVENTED))), 2)
  recordObservedIdentifiers([INVENTED], { repoRoot, tool: "test-hooks.mjs", runIdentifier: IDENT_SESSION })
  T("adapter identifier: an id recorded by this run -> 0", runHook(IDENT_HOOK, identPayload(resolveCommand(INVENTED))), 0)
} finally {
  if (priorLedger === null) rmSync(ledgerPath, { force: true })
  else writeFileSync(ledgerPath, priorLedger)
}
T("adapter identifier: the ledger is restored, so the id blocks again -> 2", runHook(IDENT_HOOK, identPayload(resolveCommand(INVENTED))), 2)

/**
 * The Stop adapter reads THIS checkout's real run record, because that is the only path a live run
 * writes. The fixture carries its own session id, so even a leaked file cannot block a real session:
 * a session id that does not match is treated as a previous run's and ignored.
 */
const WAKE_HOOK = "require-wake-source.mjs"
const { readWakeSources, runStatePath } = await import("../../tools/lib/run-state.mjs")
const stopPayload = { session_id: "orbit-hooks-gate-session", stop_hook_active: false }
const priorState = existsSync(runStatePath()) ? readFileSync(runStatePath(), "utf8") : null
/**
 * LIVE, not merely registered. `readWakeSources` returns every registration file; the hook then
 * proves each pid with `process.kill(pid, 0)` before honouring it. Counting registrations made this
 * gate take the "a live wake source allows the stop" arm whenever an old overnight run had left a
 * file behind for a process that has since died, and then fail because the hook correctly blocked.
 * Measured on this checkout 2026-08-10: red on main and on the branch alike, for stale state alone.
 */
const isAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const liveWakeSources = readWakeSources().filter((source) => isAlive(source.pid)).length
try {
  writeFileSync(runStatePath(), JSON.stringify({ sessionId: stopPayload.session_id, sleep: true, remaining: ["ORB-2"] }))
  // A live wake source is a legitimate reason NOT to block, so assert the blocking case only when
  // this checkout genuinely has none. A conditional that silently passes would be vacuous, so it
  // reports which arm it took.
  T(
    liveWakeSources === 0 ? "adapter wake-source: a sleeping queue with nothing live -> 2" : "adapter wake-source: a live wake source allows the stop -> 0",
    runHook(WAKE_HOOK, stopPayload),
    liveWakeSources === 0 ? 2 : 0,
  )
  writeFileSync(runStatePath(), JSON.stringify({ sessionId: stopPayload.session_id, sleep: true, remaining: [] }))
  T("adapter wake-source: an exhausted queue -> 0", runHook(WAKE_HOOK, stopPayload), 0)
  T("adapter wake-source: another session's record -> 0", runHook(WAKE_HOOK, { ...stopPayload, session_id: "someone-else" }), 0)
} finally {
  if (priorState === null) rmSync(runStatePath(), { force: true })
  else writeFileSync(runStatePath(), priorState)
}
// The ticket guard is wired to BOTH events: the shell call and source that would issue it later.
const TICKET_HOOK = "forbid-raw-ticket-mutation.mjs"
T("adapter tickets: raw issue edit -> 2", runHook(TICKET_HOOK, bash(`gh issue edit 215 --repo ${TICKET_REPO} --add-label Bug`)), 2)
T("adapter tickets: pull request read -> 0", runHook(TICKET_HOOK, bash(`gh pr view 12 --repo ${CODE_REPO}`)), 0)
const mutatingScript = { tool_name: "Write", tool_input: { file_path: join(root, "post.mjs"), content: `gh issue comment 215 --repo ${TICKET_REPO} --body fixed` } }
T("adapter tickets: a written script that mutates -> 2", runHook(TICKET_HOOK, mutatingScript), 2)
T("adapter tickets: a repository tool source edit -> 0", runHook(TICKET_HOOK, { ...mutatingScript, tool_input: { ...mutatingScript.tool_input, file_path: join(repoRoot, "tools", "ticket-write.mjs") } }), 0)
T("adapter tickets: an unrelated command -> 0", runHook(TICKET_HOOK, bash("npm test")), 0)

// The EF adapter re-reads the file from disk after the edit lands, so these need real files.
const EF_HOOK = "forbid-ef-migration-raw-index.mjs"
const migrationsDir = join(root, "orbit-api", "src", "Orbit.Infrastructure", "Migrations")
mkdirSync(migrationsDir, { recursive: true })
const efPayload = (name, sql) => {
  const filePath = join(migrationsDir, name)
  writeFileSync(filePath, `migrationBuilder.Sql("${sql}");\n`)
  return { tool_name: "Write", tool_input: { file_path: filePath } }
}
T("adapter ef-index: a raw CREATE INDEX -> 2", runHook(EF_HOOK, efPayload("20260101_Add.cs", "CREATE UNIQUE INDEX ix_foo ON foo (bar)")), 2)
T("adapter ef-index: the IF NOT EXISTS form -> 0", runHook(EF_HOOK, efPayload("20260102_Add.cs", "CREATE INDEX IF NOT EXISTS ix_foo ON foo (bar)")), 0)

// ---------------------------------------------------------------------------
// 4. Agent and skill frontmatter
// ---------------------------------------------------------------------------
console.log("\n# agent and skill frontmatter")
// A `description:` that is the LAST key is terminated by the closing `---`, not
// by another `key:`. A parser that looks for the next key instead runs straight
// into the body and swallows it. The block bound is the fence, and only the
// fence. Folded scalars (`>-`) continue on the indented lines that follow.
const frontmatterOf = (body) => {
  const block = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(body)
  if (!block) return null
  const fields = {}
  let key = null
  for (const line of block[1].split(/\r?\n/)) {
    const opener = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(line)
    if (opener) {
      key = opener[1]
      fields[key] = /^[>|][-+]?$/.test(opener[2].trim()) ? "" : opener[2].trim()
      continue
    }
    if (key && /^[ \t]+\S/.test(line)) fields[key] = `${fields[key]} ${line.trim()}`.trim()
  }
  return fields
}

const trailingDescription = ["---", "name: probe", "description: >-", "  a folded description", "  that is the last key", "---", "", "# Body", "tools: not-frontmatter"].join("\n")
T("frontmatter: a folded trailing description ends at the closing fence", frontmatterOf(trailingDescription)?.description, "a folded description that is the last key")
T("frontmatter: the body is not parsed as frontmatter", frontmatterOf(trailingDescription)?.tools, undefined)
T("frontmatter: a file without a fence has none", frontmatterOf("# Just a heading\n"), null)

const agentFiles = readdirSync(join(repoRoot, ".claude", "agents")).filter((name) => name.endsWith(".md")).map((name) => join(".claude", "agents", name))
// A skill directory with no SKILL.md is shared prose (`_shared/`), not a skill.
const skillFiles = readdirSync(join(repoRoot, ".claude", "skills"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(".claude", "skills", entry.name, "SKILL.md"))
  .filter((relative) => existsSync(join(repoRoot, relative)))
const definitionFiles = [...agentFiles, ...skillFiles]
for (const relative of definitionFiles) {
  const fields = frontmatterOf(readFileSync(join(repoRoot, relative), "utf8"))
  T(`frontmatter: ${relative} declares a name and a description`, { name: !!fields?.name, description: !!fields?.description }, { name: true, description: true })
}
// A guard that scanned nothing passes vacuously; make that a failure instead.
T("frontmatter: the scan actually read definitions", definitionFiles.length > 0, true)

/**
 * Every `node tools/<tool>.mjs --flag` a skill prescribes must name flags that tool accepts.
 *
 * The GitHub migration renamed tools and changed their flags, and the skills kept prescribing the
 * old ones. `record-readiness.mjs --linear <json>` and a `teardown-worktree.mjs` call with no
 * `--repo` both survived every gate and both would have failed at 03:00, after a worker had already
 * done the work. Prose that names a command is an interface claim, and an unchecked interface claim
 * is the defect class this repository exists to prevent.
 */
const toolFlagSets = new Map()
const flagsAcceptedBy = (tool) => {
  if (toolFlagSets.has(tool)) return toolFlagSets.get(tool)
  const path = join(repoRoot, "tools", tool)
  if (!existsSync(path)) {
    toolFlagSets.set(tool, null)
    return null
  }
  const source = readFileSync(path, "utf8")
  const flags = new Set(source.match(/--[a-z][a-z0-9-]*/g) ?? [])
  toolFlagSets.set(tool, flags)
  return flags
}

const prescribed = []
for (const relative of skillFiles) {
  const text = readFileSync(join(repoRoot, relative), "utf8")
  for (const line of text.split(/\r?\n/)) {
    const invocation = line.match(/^\s*node\s+tools\/([a-z0-9-]+\.mjs)\s+(.*)$/)
    if (!invocation) continue
    // A trailing shell comment is prose, not an argument. `--board  # --auto` names one flag.
    const [, tool, restWithComment] = invocation
    const rest = restWithComment.split("#")[0]
    const accepted = flagsAcceptedBy(tool)
    if (accepted === null) {
      prescribed.push([relative, tool, "the tool does not exist"])
      continue
    }
    for (const flag of rest.match(/--[a-z][a-z0-9-]*/g) ?? []) {
      if (!accepted.has(flag)) prescribed.push([relative, tool, `does not accept ${flag}`])
    }
  }
}
for (const [relative, tool, problem] of prescribed) {
  T(`skill commands: ${relative} prescribes ${tool} which ${problem}`, false)
}
T("skill commands: every prescribed tool invocation names flags the tool accepts", prescribed.length === 0, true)
T("skill commands: the scan actually found invocations", toolFlagSets.size > 0, true)

/**
 * Unresolved conflict markers, committed twice during the GitHub migration and caught both times by
 * looking rather than by any gate. A pre-commit hook does not check for them and neither did
 * anything else, so a merge resolved by a substitution that silently matched nothing shipped.
 */
const markerHits = []
const scanForMarkers = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      scanForMarkers(full)
      continue
    }
    if (!/\.(mjs|js|ts|tsx|json|md|ya?ml)$/.test(entry.name)) continue
    for (const line of readFileSync(full, "utf8").split(/\r?\n/)) {
      if (/^(<{7}|>{7}) /.test(line)) markerHits.push(`${full.slice(repoRoot.length + 1)}: ${line.slice(0, 40)}`)
    }
  }
}
for (const top of ["tools", ".claude"]) scanForMarkers(join(repoRoot, top))
for (const hit of markerHits) T(`conflict markers: ${hit}`, false)
T("conflict markers: no unresolved merge markers are committed", markerHits.length === 0, true)

console.log(`\n${fails === 0 ? "ORBIT HOOKS OK" : `ORBIT HOOKS FAILED (${fails})`}`)
process.exit(fails === 0 ? 0 : 1)
