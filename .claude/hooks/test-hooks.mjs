#!/usr/bin/env node
// Regression suite for the four surviving session hooks. Three layers:
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
import { checkLinearMutation } from "./_lib/rules-linear.mjs"
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

const reviewSkill = readFileSync(join(repoRoot, ".claude", "skills", "pr-review", "SKILL.md"), "utf8")
const reviewRubric = readFileSync(join(repoRoot, ".claude", "skills", "pr-review", "rubric.md"), "utf8")
T("pr-review: contract changes permit only targeted sibling-primary consumer evidence", reviewSkill.includes("targeted read/search in the sibling repository's primary `main` checkout"), true)
T("pr-review: every admitted round-two blocker remains OPEN in the verdict", reviewSkill.includes("no admitted round-2\n   blocker is OPEN") && reviewSkill.includes("Every newly admitted round-2 blocker is appended with `status: \"OPEN\"`"), true)
T("pr-review: external fields require complete live shape evidence", reviewRubric.includes("### 13. External-interface evidence") && reviewRubric.includes("complete selected key/type shape") && reviewRubric.includes("High and Blocking"), true)
T("pr-review: live OIDs pin a base-rubric snapshot across both rounds", reviewSkill.includes("baseRefName,baseRefOid,headRefName,headRefOid") && reviewSkill.includes("git show {baseRefOid}:.claude/skills/pr-review/rubric.md") && reviewSkill.includes("never reload the\nmutable main-checkout copy in round 2"), true)
T("pr-review: API repository-relative sources are classified as backend", reviewSkill.includes("**backend** is `src/` or `tests/` in\norbit-api"), true)
T("pr-review: API review floor drops sub-P1 candidates before receipt or tickets", reviewSkill.includes("Medium/Low/Info candidates are discarded before the receipt and create no ticket"), true)
T("pr-review: public selector never advertises ambiguous blank or bare-number scope", reviewSkill.includes("argument-hint: <ui#N | api#N | pr-url>") && reviewSkill.includes("blank scope is ambiguous"), true)
T("pr-review: the prescribed fixer transition preserves round one and materializes both heads", reviewSkill.includes("single prescribed round-1-to-round-2 fixer head change keeps") && reviewSkill.includes("Fetch both exact reviewed head OIDs from `origin`"), true)
T("pr-review: backend timezone review includes background boundary-hour behavior", reviewRubric.includes("background schedule window, notification cutoff, or streak") && reviewRubric.includes("boundary-hour unit test"), true)

// ---------------------------------------------------------------------------
// 2. Rule units
// ---------------------------------------------------------------------------
console.log("\n# git-guardrails (_lib/rules-git.mjs)")
T("git: push to main blocks", blocks(checkGitCommand("git push origin main")), true)
T("git: force push to main blocks", blocks(checkGitCommand("git push --force origin main")), true)
T("git: force-with-lease to main blocks", blocks(checkGitCommand("git push --force-with-lease origin main")), true)
T("git: push to a feature branch allows", checkGitCommand("git push origin feature/x"), null)
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
T("engine: a cwd inside a linked worktree allows", checkEngineInvocation("codex exec", { cwd: linkedWorktree, repoRoots: [mainCheckout] }), null)
T("engine: the main checkout is not a linked worktree", blocks(checkEngineInvocation("codex exec", { cwd: mainCheckout, repoRoots: [mainCheckout] })), true)
const workerStaging = (command) => checkBroadStaging(command, { cwd: linkedWorktree, repoRoots: [mainCheckout] })
for (const command of [
  "git add -A",
  "git add --all",
  "git add -u",
  "git add --update",
  "git add .",
  "git add -- .",
  "git add \".\"",
  "git add named.ts .",
  "git add \"./\"",
  "git add src/*.ts",
  "git add ':(glob)src/*.ts'",
  "git add apps/web/app/api/[...path]/route.ts",
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
// A salvaged pull request that never re-entered step 7 is unfinished work, not a finished queue.
// PR #690 was opened by hand and reported as done while two required checks were red and a bot
// thread was unresolved, because opening it was treated as the end of salvage.
const salvaged = { ...sleeping, remaining: [], pullRequests: [{ repositoryKey: "ui", prNumber: 690, receiptPath: "C:/receipt.json" }] }
T("sleep-stop: an open pull request with no review verdict blocks the queue from reading as done", blocks(stop({ state: salvaged })), true)
T("sleep-stop: the refusal names the repository-qualified pull request and receipt debt", stop({ state: salvaged })?.message.includes("ui#690") && stop({ state: salvaged })?.message.includes("READY final-head receipt"), true)
T("sleep-stop: a live reviewer allows the turn to end", checkSleepStop({ state: salvaged, wakeSources: [{ pid: 1 }], sessionId: "s1", isAlive: alive }), null)
T("sleep-stop: bare PR numbers are invalid run state and cannot clear readiness", blocks(stop({ state: { ...sleeping, remaining: [], unreviewedPullRequests: [690] } })), true)
T("sleep-stop: nothing remaining and no pull requests allows", checkSleepStop({ state: { ...sleeping, remaining: [], pullRequests: [] }, sessionId: "s1", isAlive: dead }), null)
T("sleep-stop: a run that is not --sleep allows", checkSleepStop({ state: { ...sleeping, sleep: false }, sessionId: "s1", isAlive: dead }), null)
T("sleep-stop: no record at all allows", checkSleepStop({ state: null, sessionId: "s1", isAlive: dead }), null)
// A record from a previous run must never block today's session, and the session id is exact.
T("sleep-stop: a record from another session allows", checkSleepStop({ state: sleeping, sessionId: "s2", isAlive: dead }), null)
// A blocked stop that blocks again is an infinite loop.
T("sleep-stop: the second pass never blocks again", checkSleepStop({ state: sleeping, sessionId: "s1", stopHookActive: true, isAlive: dead }), null)

console.log("\n# forbid-raw-linear-mutation (_lib/rules-linear.mjs)")
// Every Linear WRITE goes through orca. Only the project overview document,
// which orca cannot reach, may be mutated raw. READS stay open: /orchestrate
// depends on `project(id) { content }`, which orca does not return.
const LINEAR = "https://api.linear.app/graphql"
const post = (body) => `curl -s ${LINEAR} -H "Authorization: $KEY" -d '{"query":"${body}"}'`
T("linear: curl issueCreate blocks", blocks(checkLinearMutation(post('mutation { issueCreate(input: {title: \\"x\\"}) { success } }'))), true)
T("linear: curl commentCreate blocks", blocks(checkLinearMutation(post('mutation { commentCreate(input: {body: \\"x\\"}) { success } }'))), true)
T("linear: a named mutation with variables blocks", blocks(checkLinearMutation(post("mutation Add($i: IssueCreateInput!) { issueCreate(input: $i) { success } }"))), true)
T("linear: an aliased field is judged on the real field", blocks(checkLinearMutation(post("mutation { made: issueCreate(input: {}) { success } }"))), true)
T("linear: an inline fetch POST that mutates blocks", blocks(checkLinearMutation(`await fetch("${LINEAR}", { method: "POST", body: JSON.stringify({ query: "mutation { issueUpdate(id: $i, input: {}) { success } }" }) })`)), true)
T("linear: an allowed mutation batched with a banned one blocks", blocks(checkLinearMutation(post("mutation { projectUpdate(id: $p, input: {}) { success } issueCreate(input: {}) { success } }"))), true)
// Fails safe on a body it cannot read: the operation lives in the file, so the
// command string carries no keyword to scan.
T("linear: an @file payload blocks (fails safe)", blocks(checkLinearMutation(`curl -s ${LINEAR} --data-binary @payload.json`)), true)
T("linear: an attached -d@file payload blocks", blocks(checkLinearMutation(`curl -s ${LINEAR} -d@payload.json`)), true)
// The permitted writes and the read /orchestrate runs every launch.
T("linear: projectUpdate allows", checkLinearMutation(post('mutation { projectUpdate(id: \\"x\\", input: {content: \\"y\\"}) { success } }')), null)
T("linear: the project content read allows", checkLinearMutation(post('query { project(id: \\"x\\") { name content } }')), null)
T("linear: an orca invocation allows", checkLinearMutation("orca linear save-issue ORB-1 --state Done"), null)
// `--json` means "send this body" to curl but "print JSON" to orca, and pairing
// it with the opaque-body arm blocked a plain orca read line in a skill doc.
T("linear: an orca --json read line near the endpoint allows", checkLinearMutation(`see ${LINEAR} for reads; run \`orca linear list-issues --project "x" --json\` for the tickets`), null)
T("linear: a non-Linear endpoint is none of this gate's business", checkLinearMutation('curl https://api.github.com/graphql -d \'{"query":"mutation { issueCreate }"}\''), null)
T("linear: the bare word mutation is prose, allows", checkLinearMutation(`curl ${LINEAR} -d "mutation"`), null)
// A document is judged per chunk: a mutation against another service does not
// inherit a Linear endpoint documented elsewhere in the same file.
const githubMutationInDoc = [`Read the overview by POSTing to ${LINEAR}.`, "", "```bash", "gh api graphql -f query='mutation{resolveReviewThread(input:{threadId:\"X\"}){thread{isResolved}}}'", "```"].join("\n")
T("linear: a GitHub mutation does not inherit a Linear endpoint elsewhere in the doc", checkLinearMutation(githubMutationInDoc), null)
// ...but a Linear mutation split from its endpoint by a blank line still blocks:
// a Bash command CAN contain one, and dropping the far chunk let a real write through.
T("linear: a mutation split from its endpoint by a blank line still blocks", blocks(checkLinearMutation([`curl -s ${LINEAR} -d '{"query":"mutation {`, "", 'issueCreate(input:{title:"x"}) { success }', '}"}\''].join("\n"))), true)
// A gate that fires on prose gets switched off, so its false-positive rate is
// part of its contract. Every widening of this rule so far hit a real doc.
const tracked = spawnSync("git", ["-C", repoRoot, "ls-files", "*.md", ".claude/*", "tools/*"], { encoding: "utf8" })
const docPaths = (tracked.status === 0 ? tracked.stdout.trim().split(/\r?\n/) : [])
  .filter(Boolean)
  // The adapter exempts the gate's own source, since a rule module must contain
  // the strings it matches on. Mirror that here rather than reporting it.
  .filter((relative) => !relative.startsWith(".claude/hooks/"))
  .map((relative) => join(repoRoot, relative))
  .filter((absolute) => existsSync(absolute) && statSync(absolute).isFile())
T("linear: blocks none of this repo's tracked docs", docPaths.filter((path) => checkLinearMutation(readFileSync(path, "utf8"))?.block).map((path) => path.slice(repoRoot.length + 1)), [])
T("linear: the doc scan actually read files", docPaths.length > 0, true)

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
const bash = (command) => ({ tool_name: "Bash", tool_input: { command }, cwd: root })

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
T("adapter orchestrator: worker named git add -> 0", runHook(ORCH, bash("git add tools/verify-delivery.mjs"), { ORBIT_LAUNCH_WORKER: "1" }), 0)
T(
  "adapter orchestrator: worker literal bracketed git add -> 0",
  runHook(ORCH, bash("git --literal-pathspecs add apps/web/app/api/[...path]/route.ts"), { ORBIT_LAUNCH_WORKER: "1" }),
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
 * The Stop adapter reads THIS checkout's real run record, because that is the only path a live run
 * writes. The fixture carries its own session id, so even a leaked file cannot block a real session:
 * a session id that does not match is treated as a previous run's and ignored.
 */
const WAKE_HOOK = "require-wake-source.mjs"
const { readWakeSources, runStatePath } = await import("../../tools/lib/run-state.mjs")
const stopPayload = { session_id: "orbit-hooks-gate-session", stop_hook_active: false }
const priorState = existsSync(runStatePath()) ? readFileSync(runStatePath(), "utf8") : null
const liveWakeSources = readWakeSources().length
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
// The Linear guard is wired to BOTH events: the shell call, and the script that
// will make it. Only the second can be pre-empted before anything reaches Linear.
const LINEAR_HOOK = "forbid-raw-linear-mutation.mjs"
T("adapter linear: bash issueCreate -> 2", runHook(LINEAR_HOOK, bash(post("mutation { issueCreate(input: {}) { success } }"))), 2)
T("adapter linear: bash content read -> 0", runHook(LINEAR_HOOK, bash(post("query { project(id: $p) { content } }"))), 0)
const mutatingScript = { tool_name: "Write", tool_input: { file_path: join(root, "post.mjs"), content: `fetch("${LINEAR}", { body: '{"query":"mutation { issueCreate(input: {}) { id } }"}' })` } }
T("adapter linear: a written script that mutates -> 2", runHook(LINEAR_HOOK, mutatingScript), 2)
T("adapter linear: an unrelated command -> 0", runHook(LINEAR_HOOK, bash("npm test")), 0)

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

console.log(`\n${fails === 0 ? "ORBIT HOOKS OK" : `ORBIT HOOKS FAILED (${fails})`}`)
process.exit(fails === 0 ? 0 : 1)
