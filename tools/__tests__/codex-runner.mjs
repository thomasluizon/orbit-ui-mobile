import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { agentSkillFolders, codexAccountOf, codexCommand, codexConfigToml, codexEnvironment, codexFinalResult, codexLimitReset, codexLogEvent, codexLogFinalResult, codexResultText, codexRules, codexSessionId, codexWeeklyReading, isCodexUsageLimit, plainPrefixes, rolloutFile, writeCodexHome } from "../lib/codex-runner.mjs"
import { WORKER_DENY } from "../lib/worker.mjs"
import { T, root, same } from "./_harness.mjs"

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
  same("lib/codex-runner.mjs: the environment holds the Codex home and no CLAUDE variable", codexEnvironment({ PATH: "/usr/bin", GH_TOKEN: "t", BRAIN_SESSION_CAPTURE: "1", CLAUDE_CODE_TMPDIR: "/x", CLAUDE_CONFIG_DIR: "/y" }, "/home/x/.codex-orbit-workers"), { PATH: "/usr/bin", GH_TOKEN: "t", BRAIN_SESSION_CAPTURE: "1", CODEX_HOME: "/home/x/.codex-orbit-workers" })
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
  const [first, second, gone] = ["one", "two", "gone"].map((name) => join(base, `tree-${name}`))
  for (const tree of [first, second, gone]) mkdirSync(tree)
  const write = (own) => writeCodexHome({ codexHome, hookPath: "/tools/worker-gh-hook.mjs", skillFolders: ["orca-cli"], denyPrefixes: [["render"]], own })
  write({ worktree: first, branch: "chore/ticket-1" })
  write({ worktree: second, branch: "chore/ticket-2" })
  write({ worktree: gone, branch: "chore/ticket-3" })
  same("lib/codex-runner.mjs: the home writer leaves auth.json as it was", [readFileSync(join(codexHome, "auth.json"), "utf8"), statSync(join(codexHome, "auth.json")).mtimeMs], [AUTH_FILE, before])
  same("lib/codex-runner.mjs: the home writer writes config.toml, default.rules and the one Bash hook with the targets file and the exit 2 guard", [readFileSync(join(codexHome, "config.toml"), "utf8"), readFileSync(join(codexHome, "rules", "default.rules"), "utf8"), JSON.parse(readFileSync(join(codexHome, "hooks.json"), "utf8"))], [codexConfigToml({ skillFolders: ["orca-cli"] }), codexRules([["render"]]), { hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: `node '/tools/worker-gh-hook.mjs' --targets '${join(codexHome, "worker-targets.json")}' || exit 2`, timeout: 60 }] }] } }])
  const targets = () => JSON.parse(readFileSync(join(codexHome, "worker-targets.json"), "utf8"))
  same("lib/codex-runner.mjs: each launch adds its worktree and branch to the targets file, so parallel workers share one hook", targets(), { [first]: "chore/ticket-1", [second]: "chore/ticket-2", [gone]: "chore/ticket-3" })
  spawnSync(process.execPath, ["-e", `require("fs").rmSync(${JSON.stringify(gone)}, { recursive: true })`])
  write(null)
  same("lib/codex-runner.mjs: a write with no launch keeps the targets of the workers that run and drops a worktree that is gone", targets(), { [first]: "chore/ticket-1", [second]: "chore/ticket-2" })
}

const accountCases = () => {
  same("lib/codex-runner.mjs: the account is the account id, the email claim and the plan claim of auth.json", codexAccountOf(AUTH_FILE), { orgId: "00000000-0000-4000-8000-000000000009", email: "worker@example.test", subscriptionType: "pro" })
  same("lib/codex-runner.mjs: a file with no readable token gives no account", [codexAccountOf("not json"), codexAccountOf(JSON.stringify({ tokens: {} })), codexAccountOf(JSON.stringify({ tokens: { id_token: "a.b", account_id: "x" } }))], [null, null, null])
}

export const cases = async () => {
  parseCases()
  readingCases()
  commandCases()
  homeCases()
  accountCases()
}
