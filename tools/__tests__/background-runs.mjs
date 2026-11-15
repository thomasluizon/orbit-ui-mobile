import { appendFileSync, existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs"
import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { STUCK_RUN_MILLISECONDS, observeBackgroundRuns, readBackgroundRuns, readDrainBlockers } from "../lib/background-runs.mjs"
import { processStartIdentity, readRunState, updateRunState, writeRunState } from "../lib/run-state.mjs"
import { T, stageRepo, subagentTranscript } from "./_harness.mjs"

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"))
const launches = fixture("claude-background-launches.json")
const agentMeta = fixture("claude-agent-meta.json")

export const cases = async () => {
  const repoRoot = stageRepo("background-runs").path
  const claudeDirectory = join(repoRoot, ".git", "claude")
  mkdirSync(join(claudeDirectory, "sessions"), { recursive: true })
  writeFileSync(join(claudeDirectory, "sessions", `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: "parent" }))
  const options = { repoRoot, claudeDirectory }
  const input = { session_id: "parent", transcript_path: join(claudeDirectory, "parent.jsonl"), hook_event_name: "PostToolUse" }
  for (const [type, tool] of [["workflow", "Workflow"], ["subagent", "Agent"]]) {
    observeBackgroundRuns({ ...input, tool_name: tool, tool_response: launches[type] }, options)
  }
  T("background-runs: both observed launches survive until completion", readBackgroundRuns("parent", repoRoot).length === 2)
  T("background-runs: another session cannot borrow live work", readBackgroundRuns("other", repoRoot).length === 0)
  observeBackgroundRuns({ ...input, hook_event_name: "SubagentStop", background_tasks: [] }, options)
  T("background-runs: a subagent Stop is not parent completion evidence", readBackgroundRuns("parent", repoRoot).length === 2)
  const workflowDirectory = join(claudeDirectory, "parent", "workflows")
  mkdirSync(workflowDirectory, { recursive: true })
  for (const status of ["completed", "failed", "killed"]) {
    observeBackgroundRuns({ ...input, tool_name: "Workflow", tool_response: launches.workflow }, options)
    writeFileSync(join(workflowDirectory, "wf_fixture.json"), JSON.stringify({ status }))
    T(`background-runs: persisted ${status} workflow does not strand the drain`, readBackgroundRuns("parent", repoRoot).map((run) => run.type).join() === "subagent")
  }
  const recordPath = join(repoRoot, ".git", "orbit-background-runs", "parent", "agent-task.json")
  const record = JSON.parse(readFileSync(recordPath, "utf8"))
  writeFileSync(recordPath, JSON.stringify({ ...record, processStartIdentity: "previous process" }))
  T("background-runs: reused pid with a different start identity is stale", readBackgroundRuns("parent", repoRoot).length === 0)
  observeBackgroundRuns({ ...input, tool_name: "Agent", tool_response: launches.subagent }, options)
  observeBackgroundRuns({ ...input, hook_event_name: "Stop", background_tasks: [] }, options)
  T("background-runs: empty owning Stop clears the remaining work", readBackgroundRuns("parent", repoRoot).length === 0)
  let invalidLaunch = false
  try { observeBackgroundRuns({ ...input, tool_name: "Agent", tool_response: { ...launches.subagent, agentId: "" } }, options) }
  catch (error) { invalidLaunch = /no task id/.test(error.message) }
  T("background-runs: a launch with no id is rejected", invalidLaunch)
  const unresolved = { ...input, session_id: "unresolved" }
  for (const [type, tool] of [["workflow", "Workflow"], ["subagent", "Agent"]]) {
    let ownerMissing = false
    try { observeBackgroundRuns({ ...unresolved, tool_name: tool, tool_response: launches[type] }, options) }
    catch (error) { ownerMissing = /cannot identify/.test(error.message) }
    T(`background-runs: ${type} identity probe failure is reported`, ownerMissing)
  }
  T("background-runs: failed identity probes retain both launches", readBackgroundRuns("unresolved", repoRoot).length === 2)
  const unresolvedWorkflows = join(claudeDirectory, "unresolved", "workflows")
  mkdirSync(unresolvedWorkflows, { recursive: true })
  writeFileSync(join(unresolvedWorkflows, "wf_fixture.json"), JSON.stringify({ status: "killed" }))
  T("background-runs: terminal snapshot settles a workflow without identity", readBackgroundRuns("unresolved", repoRoot).map((run) => run.type).join() === "subagent")
  observeBackgroundRuns({ ...unresolved, hook_event_name: "Stop", background_tasks: [] }, options)
  T("background-runs: empty owning Stop settles launches without identity", readBackgroundRuns("unresolved", repoRoot).length === 0)
  const liveTasks = [{ id: "agent-task", type: "subagent", status: "running", description: "Background work" }]
  try { observeBackgroundRuns({ ...unresolved, hook_event_name: "Stop", background_tasks: liveTasks }, options) }
  catch (error) { if (!/cannot identify/.test(error.message)) throw error }
  T("background-runs: owning Stop publishes live inventory before its identity probe", readBackgroundRuns("unresolved", repoRoot).length === 1)
  writeFileSync(join(claudeDirectory, "sessions", "unresolved.json"), JSON.stringify({ pid: process.pid, sessionId: "unresolved" }))
  observeBackgroundRuns({ ...unresolved, hook_event_name: "Stop", background_tasks: liveTasks }, options)
  const enriched = readBackgroundRuns("unresolved", repoRoot)[0]
  T("background-runs: subsequent owning Stop enriches the surviving launch", enriched?.processStartIdentity === processStartIdentity(process.pid))
  const enrichedPath = join(repoRoot, ".git", "orbit-background-runs", "unresolved", "agent-task.json")
  writeFileSync(enrichedPath, JSON.stringify({ ...enriched, processStartIdentity: "previous process" }))
  T("background-runs: enriched launches retain stale-owner recovery", readBackgroundRuns("unresolved", repoRoot).length === 0)
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" })
  const exited = new Promise((resolve) => child.once("exit", resolve))
  const childIdentity = processStartIdentity(child.pid)
  try {
    T("background-runs: stale-process fixture starts with a real live owner", childIdentity !== null)
    writeFileSync(recordPath, JSON.stringify({ ...record, pid: child.pid, processStartIdentity: childIdentity }))
    T("background-runs: real running owner holds the drain", readBackgroundRuns("parent", repoRoot).length === 1)
  } finally { child.kill(); await exited }
  T("background-runs: exited owning process clears a stale run", readBackgroundRuns("parent", repoRoot).length === 0)
  await stuckCases()
}

/** A subagent that waits on a prompt writes nothing more to its transcript, so the limit ends the wait on it. */
const stuckCases = async () => {
  const repo = stageRepo("background-stuck")
  const repoRoot = repo.path
  // The agent works in a linked worktree on its own branch, as a real fix agent does. The coordinator stays on main.
  const agentWorktree = join(dirname(repoRoot), "background-stuck-agent")
  repo.git(["worktree", "add", "-q", "-b", "fix/agent-work", agentWorktree])
  repo.git(["commit", "-q", "--allow-empty", "-m", "agent work"], agentWorktree)
  const agentHead = repo.git(["rev-parse", "HEAD"], agentWorktree).stdout.trim()
  const coordinatorHead = repo.git(["rev-parse", "HEAD"]).stdout.trim()
  const scratchpad = join(dirname(repoRoot), "background-stuck-scratchpad")
  mkdirSync(scratchpad, { recursive: true })
  const realTranscript = subagentTranscript({ worktree: agentWorktree, sessionDirectory: repoRoot, otherRepository: stageRepo("background-stuck-notes").path, scratchpad })
  const claudeDirectory = join(repoRoot, ".git", "claude")
  mkdirSync(join(claudeDirectory, "sessions"), { recursive: true })
  writeFileSync(join(claudeDirectory, "sessions", `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: "coordinator" }))
  writeRunState({ sessionId: "coordinator", sleep: true, remaining: [] }, repoRoot)
  const launchedAt = Date.parse("2026-01-05T10:00:00.000Z")
  const input = { session_id: "coordinator", transcript_path: join(claudeDirectory, "coordinator.jsonl"), hook_event_name: "PostToolUse" }
  const options = { repoRoot, claudeDirectory, now: launchedAt }
  observeBackgroundRuns({ ...input, tool_name: "Agent", tool_response: launches.subagent }, options)
  const subagents = join(claudeDirectory, "coordinator", "subagents")
  const transcript = join(subagents, "agent-agent-task.jsonl")
  const record = readBackgroundRuns("coordinator", repoRoot)[0]
  T("background-runs: a launch records the transcript that Claude Code writes for the subagent", record.transcript === transcript && record.observedAt === new Date(launchedAt).toISOString(), JSON.stringify(record))
  const minutes = (count) => launchedAt + count * 60_000
  const at = (count) => new Date(minutes(count)).toISOString()
  const drain = (count) => readDrainBlockers("coordinator", repoRoot, minutes(count))
  const recorded = () => readRunState(repoRoot).stuckBackgroundRuns
  const touch = (path, count) => utimesSync(path, new Date(minutes(count)), new Date(minutes(count)))
  T("background-runs: the limit is 30 minutes", STUCK_RUN_MILLISECONDS === 30 * 60_000)

  T("background-runs: a subagent with no transcript on disk holds the wait below the limit", drain(29).waiting.length === 1 && recorded() === undefined)
  const unwritten = drain(30)
  T("background-runs: a subagent with no transcript on disk counts from its first observation, so no wait is without a limit",
    unwritten.waiting.length === 0 && unwritten.stuck.length === 1 && unwritten.stuck[0].lastProgressAt === at(0) && unwritten.stuck[0].worktree === null, JSON.stringify(unwritten))

  mkdirSync(subagents, { recursive: true })
  writeFileSync(transcript, realTranscript)
  touch(transcript, 20)
  T("background-runs: transcript progress restarts the limit", drain(49).waiting.length === 1 && drain(49).stuck.length === 0)
  T("background-runs: a run that makes progress again leaves the stuck record of the run state", recorded() === undefined, JSON.stringify(recorded()))
  const stuck = drain(50)
  T("background-runs: 30 minutes with no transcript progress leaves the wait", stuck.waiting.length === 0 && stuck.stuck.length === 1, JSON.stringify(stuck))
  T("background-runs: the run state records the worktree, branch and last commit of the stuck agent, not of the coordinator", recorded().length === 1 && recorded()[0].id === "agent-task" &&
    recorded()[0].type === "subagent" && recorded()[0].sessionId === "coordinator" && recorded()[0].worktree === agentWorktree && recorded()[0].branch === "fix/agent-work" &&
    recorded()[0].lastCommit === agentHead && agentHead !== coordinatorHead && recorded()[0].lastProgressAt === at(20) && recorded()[0].stuckAt === at(50), JSON.stringify(recorded()))
  // The branch of the agent has no upstream, and no remote holds its one commit: a lost worktree would lose that commit.
  T("background-runs: the record says that the worktree holds no uncommitted change and one commit that no remote holds",
    recorded()[0].uncommittedChanges === 0 && recorded()[0].unpushedCommits === 1 && recorded()[0].upstream === null && recorded()[0].workStateError === undefined, JSON.stringify(recorded()))
  T("background-runs: a later read returns the stuck record and writes it once", drain(55).stuck[0].lastCommit === agentHead && recorded().length === 1 && recorded()[0].stuckAt === at(50))
  T("background-runs: a stuck run stays on record until its owner ends it", readBackgroundRuns("coordinator", repoRoot).length === 1)

  // A parent that waits on its own agent writes nothing: Claude Code names the parent in the meta file of the child.
  const agentFile = (id, parentAgentId, count) => {
    writeFileSync(join(subagents, `agent-${id}.meta.json`), JSON.stringify(parentAgentId ? { ...agentMeta.launchedByAgent, parentAgentId } : agentMeta.launchedBySession))
    writeFileSync(join(subagents, `agent-${id}.jsonl`), `${JSON.stringify({ type: "assistant", agentId: id })}\n`)
    touch(join(subagents, `agent-${id}.jsonl`), count)
  }
  agentFile("child", "agent-task", 45)
  agentFile("stranger", null, 74)
  const waitsOnChild = drain(60)
  T("background-runs: an agent that waits on its own live child is not stuck while the child makes progress", waitsOnChild.waiting.length === 1 && waitsOnChild.stuck.length === 0 && recorded() === undefined, JSON.stringify(waitsOnChild))
  T("background-runs: the limit counts from the last progress of the child", drain(74).stuck.length === 0 && drain(75).stuck[0]?.lastProgressAt === at(45), JSON.stringify(drain(75)))
  T("background-runs: the progress of an agent that another owner launched does not hold the wait", drain(75).waiting.length === 0)
  agentFile("grandchild", "child", 70)
  T("background-runs: the progress of a child's child also holds the wait", drain(99).waiting.length === 1 && drain(100).stuck[0]?.lastProgressAt === at(70), JSON.stringify(drain(100)))
  // No subagent on this machine launched a workflow, so this line takes the launch reply shape of a session transcript.
  const launchedWorkflow = join(subagents, "workflows", "wf_owned")
  mkdirSync(launchedWorkflow, { recursive: true })
  appendFileSync(transcript, `${JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "<value>", content: "<value>" }] },
    toolUseResult: { ...launches.workflow, taskId: "owned-workflow", runId: "wf_owned", transcriptDir: launchedWorkflow } })}\n`)
  touch(transcript, 20)
  writeFileSync(join(launchedWorkflow, "agent-step.jsonl"), `${JSON.stringify({ type: "assistant" })}\n`)
  touch(join(launchedWorkflow, "agent-step.jsonl"), 95)
  T("background-runs: the progress of a workflow that the agent launched holds the wait", drain(124).waiting.length === 1 && drain(125).stuck[0]?.lastProgressAt === at(95), JSON.stringify(drain(125)))
  // A subagent command that runs past the subagent cap moves to the background, and the agent waits on it with no transcript write.
  // The launch reply copies the shape of a real subagent transcript line. The output file of the shell shows its progress.
  const shellOutput = join(dirname(repoRoot), "background-stuck-tasks", "shell-task.output")
  mkdirSync(dirname(shellOutput), { recursive: true })
  appendFileSync(transcript, `${JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "<value>",
    content: `Command was moved to the background (ID: shell-task) after running for 180s. Output is being written to: ${shellOutput}. You will be notified when it completes.` }] },
    toolUseResult: { stdout: "", stderr: "", interrupted: false, isImage: false, noOutputExpected: false, backgroundTaskId: "shell-task", timedOutAfterMs: 180_000, subagentCapApplied: true } })}\n`)
  touch(transcript, 20)
  writeFileSync(shellOutput, "PASS one\n")
  touch(shellOutput, 130)
  T("background-runs: the output of a shell that the agent waits on holds the wait, and the stuck record leaves", drain(159).waiting.length === 1 && recorded() === undefined, JSON.stringify(drain(159)))
  T("background-runs: the limit counts from the last output of that shell", drain(160).stuck[0]?.lastProgressAt === at(130), JSON.stringify(drain(160)))
  T("background-runs: the stuck agent keeps its own worktree with a child and a workflow on record", recorded()[0].worktree === agentWorktree && recorded()[0].branch === "fix/agent-work")

  // The directory of the session is the answer only when the agent names no checkout.
  const largeLine = JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "<value>", content: "x".repeat(200_000) }] }, cwd: repoRoot })
  const excursionLast = `${[...realTranscript.trim().split("\n").filter((line) => !line.includes("background-stuck-notes")), realTranscript.split("\n").find((line) => line.includes("background-stuck-notes")), largeLine].join("\n")}\n`
  const worktreeOf = (text) => {
    writeFileSync(transcript, text)
    touch(transcript, 130)
    drain(131)
    return drain(160).stuck[0]?.worktree
  }
  writeFileSync(join(agentWorktree, "draft.txt"), "draft\n")
  T("background-runs: one late visit to another repository and one large last line do not change the worktree", worktreeOf(excursionLast) === agentWorktree)
  T("background-runs: the record counts the uncommitted change in the worktree, read when the run became stuck", recorded()[0].uncommittedChanges === 1 && recorded()[0].unpushedCommits === 1, JSON.stringify(recorded()))
  T("background-runs: a worktree that git cannot read records that it could not be read",
    worktreeOf(`${JSON.stringify({ type: "user", cwd: scratchpad, message: { role: "user", content: "<value>" } })}\n`) === scratchpad && recorded()[0].uncommittedChanges === null &&
    recorded()[0].unpushedCommits === null && recorded()[0].workStateError?.includes(`git could not read ${scratchpad}`), JSON.stringify(recorded()))
  T("background-runs: an agent that names no checkout worked in the directory of the session", worktreeOf(`${realTranscript.split("\n")[0]}\n`) === repoRoot && recorded()[0].branch === "main" && recorded()[0].lastCommit === coordinatorHead, JSON.stringify(recorded()))
  T("background-runs: a transcript that names no directory records an unknown worktree", worktreeOf(`${JSON.stringify({ type: "assistant", agentId: "agent-task" })}\n`) === null && recorded()[0].branch === null && recorded()[0].lastCommit === null &&
    recorded()[0].uncommittedChanges === null && recorded()[0].workStateError === "no worktree is known", JSON.stringify(recorded()))

  // The successor inherits the entries of its predecessor as work to recover. This one stays: its worktree holds a commit that no remote holds.
  const inherited = { id: "old-task", type: "subagent", sessionId: "predecessor", worktree: agentWorktree, branch: "fix/agent-work", lastCommit: agentHead, lastProgressAt: at(0), stuckAt: at(30) }
  updateRunState((state) => ({ ...state, stuckBackgroundRuns: [inherited, ...state.stuckBackgroundRuns] }), repoRoot, { sessionId: "coordinator" })
  observeBackgroundRuns({ ...input, hook_event_name: "Stop", background_tasks: [] }, options)
  const ended = drain(161)
  T("background-runs: a run that ended leaves the stuck record, and the entry of an earlier session stays", ended.stuck.length === 0 && recorded().length === 1 && recorded()[0].id === "old-task", JSON.stringify(recorded()))

  // A run first seen at a Stop gets its first observation time there, and a workflow gets the transcripts of the session's workflows.
  const seenAt = 200
  const liveTasks = [{ id: "late-task", type: "subagent", status: "running", description: "Background work" }, { id: "late-workflow", type: "workflow", status: "running", description: "Background work" }]
  const stop = (count, tasks = liveTasks) => observeBackgroundRuns({ ...input, hook_event_name: "Stop", background_tasks: tasks }, { ...options, now: minutes(count) })
  stop(seenAt)
  stop(seenAt + 10)
  const late = Object.fromEntries(readBackgroundRuns("coordinator", repoRoot).map((run) => [run.id, run]))
  T("background-runs: a Stop keeps the first observation time of a live run", late["late-task"].observedAt === at(seenAt) && late["late-task"].transcript === join(subagents, "agent-late-task.jsonl"), JSON.stringify(late))
  T("background-runs: a workflow first seen at a Stop takes the workflow transcripts of its session", late["late-workflow"].observedAt === at(seenAt) && late["late-workflow"].transcript === join(subagents, "workflows"), JSON.stringify(late))
  writeFileSync(late["late-task"].transcript, `${JSON.stringify({ type: "assistant", agentId: "late-task" })}\n`)
  touch(late["late-task"].transcript, 60)
  touch(join(launchedWorkflow, "agent-step.jsonl"), seenAt + 15)
  T("background-runs: a transcript older than the first observation counts from the observation", drain(seenAt + 29).stuck.length === 0)
  const lateDrain = drain(seenAt + 30)
  T("background-runs: a silent subagent first seen at a Stop is stuck after the limit", lateDrain.stuck.map((run) => run.id).join() === "late-task", JSON.stringify(lateDrain))
  T("background-runs: a workflow first seen at a Stop waits while a workflow agent of its session makes progress", lateDrain.waiting.map((run) => run.id).join() === "late-workflow")
  T("background-runs: a workflow first seen at a Stop is stuck 30 minutes after that progress", drain(seenAt + 44).waiting.length === 1 && drain(seenAt + 45).waiting.length === 0, JSON.stringify(drain(seenAt + 45)))
  stop(seenAt + 46, [])
  // A record that an earlier version wrote has no observation time and no transcript. Its age is unknown until the next Stop.
  const legacyPath = join(repoRoot, ".git", "orbit-background-runs", "coordinator", "legacy-workflow.json")
  writeFileSync(legacyPath, JSON.stringify({ id: "legacy-workflow", type: "workflow", sessionId: "coordinator" }))
  T("background-runs: a record with no observation time holds the wait until a Stop observes it", drain(seenAt + 600).waiting.map((run) => run.id).join() === "legacy-workflow")
  stop(seenAt + 600, [{ id: "legacy-workflow", type: "workflow", status: "running", description: "Background work" }])
  touch(join(launchedWorkflow, "agent-step.jsonl"), 0)
  T("background-runs: a workflow with no transcript progress is stuck 30 minutes after the Stop that first observed it", drain(seenAt + 629).waiting.length === 1 && drain(seenAt + 630).stuck.map((run) => run.id).join() === "legacy-workflow", JSON.stringify(drain(seenAt + 630)))
  stop(seenAt + 631, [])

  const workflowDirectory = join(subagents, "workflows", "wf_fixture")
  mkdirSync(workflowDirectory, { recursive: true })
  observeBackgroundRuns({ ...input, tool_name: "Workflow", tool_response: { ...launches.workflow, transcriptDir: workflowDirectory } }, options)
  for (const [name, count] of [["agent-one.jsonl", 5], ["agent-two.jsonl", 40]]) {
    writeFileSync(join(workflowDirectory, name), realTranscript)
    touch(join(workflowDirectory, name), count)
  }
  T("background-runs: a workflow waits while one of its agents makes progress", drain(69).waiting.length === 1)
  const workflowStuck = drain(70)
  T("background-runs: a workflow with no agent progress for the limit is stuck", workflowStuck.waiting.length === 0 && workflowStuck.stuck.some((run) => run.id === "workflow-task" && run.worktree === agentWorktree && run.lastCommit === agentHead), JSON.stringify(workflowStuck))
  T("background-runs: another session's read records nothing", readDrainBlockers("other", repoRoot, minutes(500)).stuck.length === 0)
  inheritedCases()
}

/** A successor removes an inherited stuck entry whose work no worktree can lose, and keeps every other one. */
const inheritedCases = () => {
  const repo = stageRepo("background-inherited")
  const repoRoot = repo.path
  const worktree = (name, setup) => {
    const path = join(dirname(repoRoot), `background-inherited-${name}`)
    repo.git(["worktree", "add", "-q", "-b", `fix/${name}`, path])
    setup(path)
    return path
  }
  const pushed = (path) => repo.git(["push", "-q", "-u", "origin", "HEAD"], path)
  const worktrees = {
    carried: worktree("carried", (path) => { repo.git(["commit", "-q", "--allow-empty", "-m", "carried work"], path); pushed(path) }),
    uncommitted: worktree("uncommitted", (path) => { pushed(path); writeFileSync(join(path, "draft.txt"), "draft\n") }),
    unpushed: worktree("unpushed", (path) => { pushed(path); repo.git(["commit", "-q", "--allow-empty", "-m", "unpushed work"], path) }),
    unreadable: join(dirname(repoRoot), "background-inherited-plain-directory"),
    gone: join(dirname(repoRoot), "background-inherited-removed-worktree"),
  }
  mkdirSync(worktrees.unreadable, { recursive: true })
  // A removed worktree keeps its commits on the branch: `git worktree remove` deletes the directory, not the branch.
  const removed = (name, afterCommit) => {
    const path = worktree(name, (directory) => repo.git(["commit", "-q", "--allow-empty", "-m", `${name} work`], directory))
    const lastCommit = repo.git(["rev-parse", "HEAD"], path).stdout.trim()
    afterCommit(path)
    repo.git(["worktree", "remove", "--force", path])
    return { path, lastCommit }
  }
  const removedUnpushed = removed("removed-unpushed", () => {})
  const removedPushedLater = removed("removed-pushed-later", pushed)
  const entry = (id, path, recorded = {}) => ({ id, type: "subagent", sessionId: "predecessor", worktree: path, branch: `fix/${id}`, lastCommit: null, lastProgressAt: "2026-01-05T10:00:00.000Z", stuckAt: "2026-01-05T10:30:00.000Z", ...recorded })
  const inherited = [
    ...Object.entries(worktrees).map(([id, path]) => entry(id, path, id === "gone" ? { uncommittedChanges: 2, unpushedCommits: 0 } : {})),
    entry("unknown", null),
    entry("removed-unpushed", removedUnpushed.path, { lastCommit: removedUnpushed.lastCommit, uncommittedChanges: 0, unpushedCommits: 1 }),
    entry("removed-pushed-later", removedPushedLater.path, { lastCommit: removedPushedLater.lastCommit, uncommittedChanges: 0, unpushedCommits: 1 }),
  ]
  writeRunState({ sessionId: "successor", sleep: true, remaining: [], stuckBackgroundRuns: inherited }, repoRoot)
  T("background-inherited: the fixture holds a gone worktree and a clean pushed worktree", !existsSync(worktrees.gone) && repo.git(["status", "--porcelain"], worktrees.carried).stdout === "" &&
    repo.git(["rev-list", "--count", "@{upstream}..HEAD"], worktrees.carried).stdout.trim() === "0")
  T("background-inherited: the fixture removed two worktrees, and the branch of one still holds a commit that no remote holds",
    !existsSync(removedUnpushed.path) && !existsSync(removedPushedLater.path) && repo.git(["rev-list", "--count", "fix/removed-unpushed", "--not", "--remotes"]).stdout.trim() === "1")
  const drain = readDrainBlockers("successor", repoRoot, Date.parse("2026-01-05T12:00:00.000Z"))
  const kept = (readRunState(repoRoot).stuckBackgroundRuns ?? []).map((run) => run.id)
  T("background-inherited: an entry whose worktree no longer exists and whose record counted no unpushed commit leaves", !kept.includes("gone"), JSON.stringify(kept))
  T("background-inherited: an entry whose worktree is clean and holds nothing unpushed leaves, because its work is carried", !kept.includes("carried"), JSON.stringify(kept))
  T("background-inherited: an entry whose removed worktree left its commit on the branch stays", kept.includes("removed-unpushed"), JSON.stringify(kept))
  T("background-inherited: an entry whose removed worktree left a commit that a remote now holds leaves", !kept.includes("removed-pushed-later"), JSON.stringify(kept))
  T("background-inherited: every other entry stays: uncommitted changes, an unpushed commit, an unreadable worktree, an unknown worktree",
    kept.join() === "uncommitted,unpushed,unreadable,unknown,removed-unpushed", JSON.stringify(kept))
  T("background-inherited: the kept entries are unchanged", JSON.stringify(readRunState(repoRoot).stuckBackgroundRuns) === JSON.stringify(inherited.filter((run) => kept.includes(run.id))))
  T("background-inherited: the drain of the successor waits on none of them", drain.waiting.length === 0 && drain.stuck.length === 0, JSON.stringify(drain))
  T("background-inherited: a run state of another session is not changed", readDrainBlockers("other", repoRoot).stuck.length === 0 && readRunState(repoRoot).stuckBackgroundRuns.length === 5)
}
