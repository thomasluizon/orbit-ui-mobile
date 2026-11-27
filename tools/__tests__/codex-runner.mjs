import { spawnSync } from "node:child_process"
import { EventEmitter } from "node:events"
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { agentSkillFolders, codexAccountOf, codexCommand, codexConfigToml, codexEnvironment, codexFinalResult, codexHooksJson, codexLimitReset, codexLogEvent, codexLogFinalResult, codexResultText, codexRules, codexSessionId, codexWeeklyReading, isCodexUsageLimit, plainPrefixes, rolloutFile, writeCodexHome } from "../lib/codex-runner.mjs"
import { WORKER_DENY, codexHookCheck, codexInvocation, codexLoginStatus, isWorkerProcess, launch, probe } from "../lib/worker.mjs"
import { T, root, same, toolPath } from "./_harness.mjs"

const THREAD = "01a21e2d-cd1e-7340-91e8-220da2e54801"
const jsonl = (...records) => `${records.map((record) => JSON.stringify(record)).join("\n")}\n`
const started = { type: "thread.started", thread_id: THREAD }
const message = (text) => ({ type: "item.completed", item: { id: "item_0", type: "agent_message", text } })
const completed = { type: "turn.completed", usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 2 } }
const failed = (text) => [{ type: "error", message: text }, { type: "turn.failed", error: { message: text } }]
const LIMIT = "You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at 3:14 PM."

/** The `token_count` record of a session file, in the shape that a Plus login and a Pro login wrote. */
const tokenCount = (rateLimits) => ({ timestamp: "2026-11-27T18:04:10.000Z", type: "event_msg", payload: { type: "token_count", info: null, rate_limits: rateLimits } })
const plus = { limit_id: "codex", limit_name: null, primary: { used_percent: 4, window_minutes: 300, resets_at: 1795813181 }, secondary: { used_percent: 41, window_minutes: 10080, resets_at: 1796406658 }, credits: { has_credits: false, unlimited: false, balance: "0" }, individual_limit: null, spend_control_reached: null, plan_type: "plus", rate_limit_reached_type: null }
const pro = { ...plus, primary: { used_percent: 41, window_minutes: 10080, resets_at: 1796406658 }, secondary: null, plan_type: "pro" }

const idToken = (claims) => `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`
const AUTH_FILE = JSON.stringify({ auth_mode: "chatgpt", OPENAI_API_KEY: null, tokens: { id_token: idToken({ email: "worker@example.test", "https://api.openai.com/auth": { chatgpt_plan_type: "pro" } }), access_token: "a", refresh_token: "r", account_id: "00000000-0000-4000-8000-000000000009" }, last_refresh: "2026-11-27T00:00:00Z" })

const parseCases = () => {
  const limit = codexFinalResult(jsonl(started, ...failed(LIMIT)))
  same("lib/codex-runner.mjs: a usage-limit error and failed turn stop at a limit and keep the message", [limit.usageLimitReached, limit.authenticationFailed, limit.error, limit.needsDecision], [true, false, LIMIT, null])
  same("lib/codex-runner.mjs: a usage-limit error event with no failed turn is a limit too", codexFinalResult(jsonl(started, { type: "error", message: LIMIT })).usageLimitReached, true)
  same("lib/codex-runner.mjs: the straight and the curly apostrophe both match, and the credit and spend cap texts match", ["You’ve hit your usage limit.", "You've hit your usage limit.", "Your workspace is out of credits.", "You reached the workspace spend cap."].map(isCodexUsageLimit), [true, true, true, true])
  same("lib/codex-runner.mjs: a message that is no limit does not match", ["Reconnecting... 2/5", "stream disconnected", null].map(isCodexUsageLimit), [false, false, false])
  same("lib/codex-runner.mjs: the reset is the clock time after try again at", [codexLimitReset(LIMIT), codexLimitReset("no reset named"), codexLimitReset(null)], ["3:14 PM", null, null])
  same("lib/codex-runner.mjs: thread.started gives the session id, and a log with no thread gives none", [codexSessionId(jsonl(started, { type: "turn.started" })), codexSessionId(jsonl({ type: "turn.started" }))], [THREAD, null])
  const decision = codexFinalResult(jsonl(started, message("Done with part one."), message("The scope is unclear.\nNEEDS_DECISION: Pay for a second seat?"), completed))
  same("lib/codex-runner.mjs: the last agent message with NEEDS_DECISION on its last line gives a decision", [decision.needsDecision, decision.error, decision.usageLimitReached], ["Pay for a second seat?", null, false])
  same("lib/codex-runner.mjs: a decision in an earlier message, or not on the last line, is no decision", [codexFinalResult(jsonl(started, message("NEEDS_DECISION: old"), message("All done."), completed)).needsDecision, codexFinalResult(jsonl(started, message("NEEDS_DECISION: first\nThen more."), completed)).needsDecision], [null, null])
  for (const text of ["unexpected status 401 Unauthorized: Missing bearer", "Your refresh_token was already used.", "Please log in again.", "Not logged in"]) {
    const result = codexFinalResult(jsonl(started, ...failed(text)))
    same(`lib/codex-runner.mjs: the failed turn ${JSON.stringify(text)} is a sign-in failure`, [result.authenticationFailed, result.usageLimitReached, result.error], [true, false, text])
  }
  const other = codexFinalResult(jsonl(started, ...failed("stream disconnected before completion")))
  same("lib/codex-runner.mjs: another failure keeps its text and stops nothing", [other.usageLimitReached, other.authenticationFailed, other.error], [false, false, "stream disconnected before completion"])
  same("lib/codex-runner.mjs: an error that a later completed turn follows is no failure, and a failed turn carries no decision", [codexFinalResult(jsonl(started, { type: "error", message: "Reconnecting... 1/5" }, message("ok"), completed)).error, codexFinalResult(jsonl(started, message("NEEDS_DECISION: q"), ...failed("stream disconnected"))).needsDecision], [null, null])
  same("lib/codex-runner.mjs: the result text is the last agent message, and a failed turn leaves none", [codexResultText(jsonl(started, message("one"), message("two"), completed)), codexResultText(jsonl(started, message("one"), ...failed("x")))], ["two", ""])
}

const readingCases = () => {
  const want = { utilization: 0.41, resetsAt: 1796406658, status: "allowed" }
  same("lib/codex-runner.mjs: the weekly window gives the same reading in secondary (Plus) and in primary (Pro)", [codexWeeklyReading(jsonl(tokenCount(plus))), codexWeeklyReading(jsonl(tokenCount(pro)))], [want, want])
  same("lib/codex-runner.mjs: the newest record wins, and a record with no limits or no weekly window is skipped", codexWeeklyReading(jsonl(tokenCount({ ...plus, secondary: { ...plus.secondary, used_percent: 10 } }), tokenCount(plus), tokenCount(null), tokenCount({ ...plus, secondary: null }))), want)
  same("lib/codex-runner.mjs: a reached limit reads status rejected, and a file with no token_count reads none", [codexWeeklyReading(jsonl(tokenCount({ ...plus, rate_limit_reached_type: "primary" }))).status, codexWeeklyReading(jsonl(started))], ["rejected", null])
  const home = join(root, "codex-rollout-home")
  const directory = join(home, "sessions", "2026", "11", "27")
  const file = join(directory, `rollout-2026-11-27T15-04-08-${THREAD}.jsonl`)
  mkdirSync(directory, { recursive: true })
  mkdirSync(join(home, "sessions", "2026", "10", "05"), { recursive: true })
  writeFileSync(file, jsonl(tokenCount(pro)))
  same("lib/codex-runner.mjs: the session file of a thread is found by the thread id, and a thread with none gives null", [rolloutFile({ codexHome: home, threadId: THREAD }), rolloutFile({ codexHome: home, threadId: "other" }), rolloutFile({ codexHome: join(root, "no-home"), threadId: THREAD })], [file, null, null])
  const log = join(root, "codex-rollout.log")
  writeFileSync(log, jsonl(started, ...failed(LIMIT)))
  same("lib/codex-runner.mjs: a log gives its session, the reading of the session file and its verdict", [codexLogEvent(log, home), codexLogFinalResult(log).usageLimitReached], [{ sessionId: THREAD, ...{ utilization: 0.41, resetsAt: 1796406658, status: "allowed" } }, true])
  same("lib/codex-runner.mjs: a log that cannot be read gives no reading and no stop", [codexLogEvent(join(root, "no.log"), home).utilization, codexLogFinalResult(join(root, "no.log")).error], [null, null])
}

const commandCases = () => {
  const { executable, args } = codexCommand({ worktree: "/work/tree" })
  same("lib/codex-runner.mjs: the command is codex exec with the model, the effort and the bypass flags, and the order on stdin", [executable, args], ["codex", ["exec", "--json", "-C", "/work/tree", "-m", "gpt-6.2-sol", "-c", 'model_reasoning_effort="high"', "--dangerously-bypass-approvals-and-sandbox", "--dangerously-bypass-hook-trust", "-"]])
  T("lib/codex-runner.mjs: the command names no sandbox mode, no resume and no ephemeral flag", !args.some((argument) => ["--sandbox", "-s", "resume", "--ephemeral"].includes(argument)))
  same("lib/codex-runner.mjs: the probe adds the git check flag before the bypass flags", codexCommand({ worktree: "/tmp", skipGitCheck: true }).args.slice(8, 11), ["--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox", "--dangerously-bypass-hook-trust"])
  const parent = { PATH: "/usr/bin", GH_TOKEN: "t", BRAIN_SESSION_CAPTURE: "1", CLAUDE_CODE_TMPDIR: "/x", CLAUDE_CONFIG_DIR: "/y", CODEX_API_KEY: "k", CODEX_ACCESS_TOKEN: "a", ORBIT_WORKER_WORKTREE: "/stale", ORBIT_WORKER_BRANCH: "stale" }
  const kept = { PATH: "/usr/bin", GH_TOKEN: "t", BRAIN_SESSION_CAPTURE: "1", CODEX_HOME: "/home/x/.codex-orbit-workers" }
  same("lib/codex-runner.mjs: the environment holds the Codex home, and no CLAUDE variable, login override or worker identity of its parent", codexEnvironment(parent, "/home/x/.codex-orbit-workers"), kept)
  same("lib/codex-runner.mjs: the environment of a launch names its worktree and branch", codexEnvironment(parent, "/home/x/.codex-orbit-workers", { worktree: "/work/tree", branch: "chore/ticket-9" }), { ...kept, ORBIT_WORKER_WORKTREE: "/work/tree", ORBIT_WORKER_BRANCH: "chore/ticket-9" })
  same("lib/codex-runner.mjs: the environment of a launch with a gate names its run and its head", codexEnvironment(parent, "/home/x/.codex-orbit-workers", { worktree: "/work/tree", branch: "chore/ticket-9" }, { run: "chore-ticket-9-2026", head: "abc123" }), { ...kept, ORBIT_WORKER_WORKTREE: "/work/tree", ORBIT_WORKER_BRANCH: "chore/ticket-9", ORBIT_WORKER_RUN: "chore-ticket-9-2026", ORBIT_WORKER_HEAD: "abc123" })
  same("lib/codex-runner.mjs: a gate with no worktree adds no variable, and a launch with no gate has no run or head", [codexEnvironment(parent, "/home/x/.codex-orbit-workers", null, { run: "r", head: "h" }), Object.keys(codexEnvironment(parent, "/home/x/.codex-orbit-workers", { worktree: "/w", branch: "b" }, null)).filter((key) => /^ORBIT_WORKER_(RUN|HEAD)$/.test(key))], [kept, []])
}

const homeCases = () => {
  same("lib/codex-runner.mjs: the plain prefixes of the deny list are the nine that the order names", plainPrefixes(WORKER_DENY).map((words) => words.join(" ")), ["render", "terraform", "aws", "stripe", "gh workflow", "gh secret", "gh pr merge", "gh auth", "security"])
  same("lib/codex-runner.mjs: the rules file forbids each plain prefix", codexRules([["render"], ["gh", "pr", "merge"]]), 'prefix_rule(pattern=["render"], decision="forbidden")\nprefix_rule(pattern=["gh", "pr", "merge"], decision="forbidden")\n')
  const text = codexConfigToml({ skillFolders: ["orca-cli", "computer-use"] })
  same("lib/codex-runner.mjs: config.toml holds the file login store, the CLAUDE.md fallback, no bundled skill and one off entry for each folder", text, [
    'cli_auth_credentials_store = "file"', 'project_doc_fallback_filenames = ["CLAUDE.md"]', "", "[skills.bundled]", "enabled = false", "",
    "[[skills.config]]", 'name = "orca-cli"', "enabled = false", "", "[[skills.config]]", 'name = "computer-use"', "enabled = false", "",
  ].join("\n"))
  T("lib/codex-runner.mjs: config.toml names no MCP server and no developer instruction", !/mcp_servers|developer_instructions/.test(text))

  const base = join(root, "codex-home-writer")
  const skills = join(base, "skills")
  for (const name of ["orca-cli", "orchestration"]) mkdirSync(join(skills, name), { recursive: true })
  writeFileSync(join(skills, "stray-file.md"), "x")
  same("lib/codex-runner.mjs: the skill folders are the directories under the skills root, and a missing root has none", [agentSkillFolders(skills), agentSkillFolders(join(base, "none"))], [["orca-cli", "orchestration"], []])
  const codexHome = join(base, "home")
  mkdirSync(codexHome, { recursive: true })
  writeFileSync(join(codexHome, "auth.json"), AUTH_FILE)
  const before = statSync(join(codexHome, "auth.json")).mtimeMs
  writeCodexHome({ codexHome, hookPath: "/tools/worker-gh-hook.mjs", sizeHookPath: "/tools/worker-size-hook.mjs", gateHookPath: "/tools/worker-gate-hook.mjs", skillFolders: ["orca-cli"], denyPrefixes: [["render"]] })
  same("lib/codex-runner.mjs: the home writer leaves auth.json as it was", [readFileSync(join(codexHome, "auth.json"), "utf8"), statSync(join(codexHome, "auth.json")).mtimeMs], [AUTH_FILE, before])
  const worktree = '--worktree "${ORBIT_WORKER_WORKTREE-}"'
  const command = `node '/tools/worker-gh-hook.mjs' ${worktree} --branch "\${ORBIT_WORKER_BRANCH-}" --block-log '${join(codexHome, "hook-blocks.log")}' || exit 2`
  const size = (event) => `test -z "\${ORBIT_WORKER_WORKTREE-}" || node '/tools/worker-size-hook.mjs' ${event} ${worktree} || exit 2`
  const stop = `test -z "\${ORBIT_WORKER_RUN-}" || node '/tools/worker-gate-hook.mjs' ${worktree} --run "\${ORBIT_WORKER_RUN-}" --head "\${ORBIT_WORKER_HEAD-}"`
  const expected = { hooks: {
    PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command, timeout: 60 }] }, { matcher: "Bash|apply_patch", hooks: [{ type: "command", command: size("pre"), timeout: 120 }] }],
    PostToolUse: [{ matcher: "Bash|apply_patch", hooks: [{ type: "command", command: size("post"), timeout: 120 }] }],
    Stop: [{ hooks: [{ type: "command", command: stop, timeout: 1500 }] }],
  } }
  same("lib/codex-runner.mjs: the home writer writes config.toml, default.rules and the hooks of the confirmed events and tool names, which read the worker from its environment", [readFileSync(join(codexHome, "config.toml"), "utf8"), readFileSync(join(codexHome, "rules", "default.rules"), "utf8"), JSON.parse(readFileSync(join(codexHome, "hooks.json"), "utf8"))], [codexConfigToml({ skillFolders: ["orca-cli"] }), codexRules([["render"]]), expected])
  same("lib/codex-runner.mjs: the gh hook stays first on Bash, and only the gate hook has no matcher and no exit 2 guard", [expected.hooks.PreToolUse[0].matcher, Object.keys(expected.hooks.Stop[0]), stop.includes("exit 2")], ["Bash", ["hooks"], false])
}

/** A repository with one committed file on `work`, branched from `origin/main`, and the shell runner of a hook command of the worker home. */
const hookWorktree = (name) => {
  const directory = join(root, "codex-hooks", name)
  mkdirSync(directory, { recursive: true })
  const git = (...args) => spawnSync("git", ["-c", "user.email=c@o.test", "-c", "user.name=C", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { cwd: directory, encoding: "utf8" }).stdout.trim()
  git("init", "-q", "--initial-branch=main")
  writeFileSync(join(directory, "kept.ts"), "export const kept = 1\n")
  for (const args of [["add", "-A"], ["commit", "-q", "-m", "base"], ["update-ref", "refs/remotes/origin/main", "HEAD"], ["switch", "-q", "-c", "work"]]) git(...args)
  const base = git("rev-parse", "HEAD")
  const hooks = JSON.parse(codexHooksJson({ hookPath: toolPath("lib/worker-gh-hook.mjs"), sizeHookPath: toolPath("lib/worker-size-hook.mjs"), gateHookPath: toolPath("lib/worker-gate-hook.mjs"), blockLogPath: join(directory, "..", `${name}-blocks.log`) })).hooks
  const outside = join(root, "codex-hooks")
  /** Runs the first hook command of an event and a matcher, with the input that codex 0.172.0 sends and a `cwd` that names no worker. */
  const run = (event, matcher, environment, input) => spawnSync("sh", ["-c", hooks[event].find((entry) => entry.matcher === matcher)?.hooks[0].command ?? hooks[event][0].hooks[0].command], {
    cwd: outside, encoding: "utf8", env: { PATH: process.env.PATH, ...environment },
    input: JSON.stringify({ session_id: "s", turn_id: "t", transcript_path: null, cwd: outside, hook_event_name: event, model: "m", permission_mode: "bypassPermissions", ...input }),
  })
  const worker = { ORBIT_WORKER_WORKTREE: directory, ORBIT_WORKER_BRANCH: "chore/ticket-9" }
  return { directory, git, base, hooks, run, worker, gitDir: git("rev-parse", "--absolute-git-dir") }
}

const SHELL_AND_PATCH = "Bash|apply_patch"
const patchOf = (path) => `*** Begin Patch\n*** Add File: ${path}\n+x\n*** End Patch`

const hookRunCases = () => {
  const { directory, git, base, run, worker, gitDir } = hookWorktree("run")
  const lines = (count) => Array.from({ length: count }, (_, index) => `line ${index}\n`).join("")
  const denial = (result) => (result.stdout === "" ? null : JSON.parse(result.stdout).hookSpecificOutput?.permissionDecisionReason ?? "unexpected")
  writeFileSync(join(directory, "a.ts"), lines(300))
  T("lib/codex-runner.mjs: at 300 lines the pre size hook denies an apply_patch of a new file for a call with a cwd outside the worktree", /^The diff is at 300 lines and 1 files\. The cap is 400 lines/.test(denial(run("PreToolUse", SHELL_AND_PATCH, worker, { cwd: join(directory, "sub"), tool_name: "apply_patch", tool_use_id: "u", tool_input: { command: patchOf("new.ts") } })) ?? ""))
  T("lib/codex-runner.mjs: at 300 lines the pre size hook allows an apply_patch of a file in the diff", denial(run("PreToolUse", SHELL_AND_PATCH, worker, { cwd: directory, tool_name: "apply_patch", tool_use_id: "u", tool_input: { command: patchOf("a.ts").replace("Add File", "Update File") } })) === null)
  writeFileSync(join(directory, "a.ts"), lines(400))
  const shell = run("PreToolUse", SHELL_AND_PATCH, worker, { tool_name: "Bash", tool_use_id: "u", tool_input: { command: "echo x > a.ts" } })
  T("lib/codex-runner.mjs: at 400 lines a Bash call from a cwd outside the worktree is measured on ORBIT_WORKER_WORKTREE and denied", /^The diff is at 400 lines and 1 files\./.test(denial(shell) ?? ""), `${shell.status} ${shell.stderr}`)
  T("lib/codex-runner.mjs: at 400 lines a git call is allowed", denial(run("PreToolUse", SHELL_AND_PATCH, worker, { tool_name: "Bash", tool_use_id: "u", tool_input: { command: "git status" } })) === null)
  const post = run("PostToolUse", SHELL_AND_PATCH, worker, { tool_name: "Bash", tool_use_id: "u", tool_input: { command: "git status" }, tool_response: "" })
  T("lib/codex-runner.mjs: the post size hook records the count of the worktree of ORBIT_WORKER_WORKTREE", post.status === 0 && JSON.parse(readFileSync(join(gitDir, "orbit-size.json"), "utf8")).lines === 400, `${post.status} ${post.stderr}`)
  const probe = run("PreToolUse", SHELL_AND_PATCH, {}, { tool_name: "Bash", tool_use_id: "u", tool_input: { command: "echo x > a.ts" } })
  same("lib/codex-runner.mjs: a run with no worktree in its environment (a probe) gets no size check", [probe.status, probe.stdout], [0, ""])

  // The gate: an uncommitted file is a failure, and a committed branch with no gate command is green.
  const stop = (environment) => run("Stop", undefined, environment, { stop_hook_active: false, last_assistant_message: "done" })
  const gateRecord = () => JSON.parse(readFileSync(join(gitDir, "orbit-gate.json"), "utf8"))
  const red = stop({ ...worker, ORBIT_WORKER_RUN: "run-1", ORBIT_WORKER_HEAD: base })
  const redOutput = red.stdout === "" ? {} : JSON.parse(red.stdout)
  same("lib/codex-runner.mjs: the Stop hook of a Codex run gates the worktree of ORBIT_WORKER_WORKTREE, blocks a red gate and writes the record of its run", [red.status, redOutput.decision, /Failed command: git .*status/.test(redOutput.reason ?? ""), gateRecord().run, gateRecord().green, gateRecord().head], [0, "block", true, "run-1", false, base])
  git("add", "-A")
  git("commit", "-q", "-m", "work")
  const green = stop({ ...worker, ORBIT_WORKER_RUN: "run-1", ORBIT_WORKER_HEAD: base })
  same("lib/codex-runner.mjs: the Stop hook of a Codex run writes green true for a committed branch with a passing gate and lets the run end", [green.status, green.stdout, gateRecord().green, gateRecord().head === git("rev-parse", "HEAD"), gateRecord().blocks], [0, "", true, true, 1])
  const before = readFileSync(join(gitDir, "orbit-gate.json"), "utf8")
  const finder = stop(worker)
  same("lib/codex-runner.mjs: a run with no ORBIT_WORKER_RUN (a find or a replan run) gets no gate and writes no record", [finder.status, finder.stdout, readFileSync(join(gitDir, "orbit-gate.json"), "utf8") === before], [0, "", true])
}

const accountCases = () => {
  same("lib/codex-runner.mjs: the account is the account id, the email claim and the plan claim of auth.json", codexAccountOf(AUTH_FILE), { orgId: "00000000-0000-4000-8000-000000000009", email: "worker@example.test", subscriptionType: "pro" })
  same("lib/codex-runner.mjs: a file with no readable token gives no account", [codexAccountOf("not json"), codexAccountOf(JSON.stringify({ tokens: {} })), codexAccountOf(JSON.stringify({ tokens: { id_token: "a.b", account_id: "x" } }))], [null, null, null])
}

const OWN = { worktree: "/work/tree", branch: "chore/ticket-9" }

/** A home of the driver with an empty Codex worker home, and the session file that a Codex run leaves in it. */
const stageHome = (name) => {
  const home = join(root, "codex-worker", name)
  const codexHome = join(home, ".codex-orbit-workers")
  const sessions = join(codexHome, "sessions", "2026", "11", "27")
  mkdirSync(sessions, { recursive: true })
  return { home, codexHome, session: () => writeFileSync(join(sessions, `rollout-2026-11-27T15-04-08-${THREAD}.jsonl`), jsonl(tokenCount(pro))) }
}

const probeCases = async () => {
  const { home, codexHome, session } = stageHome("probe")
  const invocation = codexInvocation({ home, parentEnvironment: { PATH: "/usr/bin", CLAUDE_CONFIG_DIR: "/y" }, token: "t", cwd: "/tmp/probe" })
  const calls = []
  const run = async (...call) => { calls.push([...call, existsSync(join(codexHome, "hooks.json"))]); return { status: 0, stdout: jsonl(started, message("ok"), completed), stderr: "" } }
  same("lib/worker.mjs: a Codex probe with no session file gives no reading", await probe({ invocation, cwd: "/tmp/probe", run }), null)
  session()
  same("lib/worker.mjs: a Codex probe reads the weekly reading of the session file of its thread", await probe({ invocation, cwd: "/tmp/probe", run }), { sessionId: THREAD, utilization: 0.41, resetsAt: 1796406658, status: "allowed" })
  const [file, args, options, written] = calls[0]
  same("lib/worker.mjs: a Codex probe writes the home first, then runs codex exec with the prompt on stdin and no turn flag", [written, file, args, options.input, options.cwd], [true, "codex", codexCommand({ worktree: "/tmp/probe", skipGitCheck: true }).args, "reply ok", "/tmp/probe"])
  same("lib/worker.mjs: a Codex probe runs with the worker home and token and no worker identity", [options.env.CODEX_HOME, options.env.GH_TOKEN, options.env.BRAIN_SESSION_CAPTURE, Object.keys(options.env).filter((key) => /^(CLAUDE|ORBIT_WORKER)_/.test(key))], [codexHome, "t", "1", []])
}

const launchCases = async () => {
  const { home, codexHome, session } = stageHome("launch")
  session()
  const invocation = codexInvocation({ home, parentEnvironment: {}, token: "t", own: OWN, gate: { run: "worker-run", head: "head-1" } })
  same("lib/worker.mjs: a Codex launch names its gate run and head in its environment, and a Codex launch with no gate names none", [invocation.environment.ORBIT_WORKER_RUN, invocation.environment.ORBIT_WORKER_HEAD, "ORBIT_WORKER_RUN" in codexInvocation({ home, parentEnvironment: {}, token: "t", own: OWN }).environment], ["worker-run", "head-1", false])
  same("lib/worker.mjs: a Codex launch runs in its worktree with the git check on, and names its branch", [invocation.command, invocation.environment.ORBIT_WORKER_WORKTREE, invocation.environment.ORBIT_WORKER_BRANCH], [codexCommand({ worktree: OWN.worktree }), OWN.worktree, OWN.branch])
  const logFile = join(home, "worker.log")
  const child = Object.assign(new EventEmitter(), { pid: 4242, stdin: { on: () => {}, end: () => {} } })
  let written = false
  const running = launch({ invocation, worktree: home, order: "the order", logFile, pidFile: join(home, "worker.pid"), kill: () => {}, spawnChild: () => { written = existsSync(join(codexHome, "config.toml")); return child } })
  appendFileSync(logFile, jsonl(started, ...failed(LIMIT)))
  child.emit("exit", 1, null)
  const facts = await running
  same("lib/worker.mjs: a Codex launch writes the home before it starts, and reads the session, the reading and the usage limit of its log", [written, facts.exitCode, facts.sessionId, facts.utilization, facts.resetsAt, facts.result.usageLimitReached, facts.result.error], [true, 1, THREAD, 0.41, 1796406658, true, LIMIT])
  const ps = (stdout) => ({ run: () => ({ status: 0, stdout }) })
  same("lib/worker.mjs: a codex process counts as a worker, and a word that only holds codex does not", ["node /opt/homebrew/bin/codex exec --json\n", "/opt/homebrew/lib/codex/bin/codex exec\n", "/usr/bin/vim mycodexnotes\n"].map((line) => isWorkerProcess(process.pid, ps(line))), [true, true, false])
}

/** The check against a fake Codex that runs `act` with the options of the run: the rendered hook, the `gh` of the check, or nothing. */
const hookCheckCases = async () => {
  const { home } = stageHome("check")
  const calls = []
  const checked = (act) => codexHookCheck({ home, parentEnvironment: process.env, token: "t", repository: "owner/tickets", run: async (file, args, options) => { calls.push({ args, options }); act(options); return { status: 0, stdout: jsonl(started, completed), stderr: "" } } })
  const hook = (command) => (options) => {
    const { hooks } = JSON.parse(readFileSync(join(options.env.CODEX_HOME, "hooks.json"), "utf8"))
    spawnSync("sh", ["-c", hooks.PreToolUse[0].hooks[0].command], { env: options.env, input: JSON.stringify({ hook_event_name: "PreToolUse", cwd: options.cwd, tool_name: "Bash", tool_input: { command } }) })
  }
  const merge = "gh pr merge 1 --repo owner/tickets"
  same("lib/worker.mjs: the hook check passes when the real hook notes the block and gh never ran", await checked(hook(merge)), { passed: true, reason: null })
  const [{ args, options }] = calls
  T("lib/worker.mjs: the hook check orders the merge on stdin, in a directory of its own, which is gone after the check", options.input.includes(merge) && args.includes(options.cwd) && options.env.ZDOTDIR === options.cwd && !existsSync(options.cwd))
  const idle = await checked(() => {})
  T("lib/worker.mjs: the hook check fails when the hook notes no block in this run, with an older block in the log", idle.passed === false && /noted no block/.test(idle.reason), idle.reason)
  T("lib/worker.mjs: a block of another command does not pass the hook check", (await checked(hook("gh issue close 1"))).passed === false)
  const ran = await checked((run) => { hook(merge)(run); spawnSync("sh", ["-c", merge], { env: run.env }) })
  T("lib/worker.mjs: the hook check fails when gh ran, also with a noted block", ran.passed === false && /ran/.test(ran.reason), ran.reason)
}

const loginStatusCases = async () => {
  const seen = []
  const status = (result, { exists = true, read = () => AUTH_FILE } = {}) => codexLoginStatus({ home: "/home/x", parentEnvironment: { PATH: "/bin", CLAUDE_CONFIG_DIR: "/c", CODEX_API_KEY: "k" }, exists: () => exists, read, run: async (file, args, options) => { seen.push({ file, args, options }); return result } }).catch((error) => ({ thrown: error.message }))
  same("lib/worker.mjs: a missing Codex home is signed out, and the check runs nothing", [await status({ status: 0 }, { exists: false }), seen.length], [{ loggedIn: false }, 0])
  same("lib/worker.mjs: exit 1 of codex login status is signed out", await status({ status: 1 }), { loggedIn: false })
  same("lib/worker.mjs: exit 0 gives the account of auth.json", await status({ status: 0 }), { loggedIn: true, orgId: "00000000-0000-4000-8000-000000000009", email: "worker@example.test", subscriptionType: "pro" })
  const [{ file, args, options }] = seen
  same("lib/worker.mjs: the check runs codex login status on the worker home with no Claude variable and no key override", [file, args, options.env.CODEX_HOME, options.env.CLAUDE_CONFIG_DIR ?? null, options.env.CODEX_API_KEY ?? null], ["codex", ["login", "status"], "/home/x/.codex-orbit-workers", null, null])
  T("lib/worker.mjs: exit 0 with an unreadable auth.json is an error, not a login", /no readable account/.test((await status({ status: 0 }, { read: () => { throw new Error("gone") } })).thrown))
  T("lib/worker.mjs: a codex that cannot start is an error, not a signed-out login", /exit none: spawn codex ENOENT/.test((await status({ status: null, error: new Error("spawn codex ENOENT") })).thrown))
}

export const cases = async () => {
  await loginStatusCases()
  await probeCases()
  await launchCases()
  await hookCheckCases()
  parseCases()
  readingCases()
  commandCases()
  homeCases()
  hookRunCases()
  accountCases()
}
