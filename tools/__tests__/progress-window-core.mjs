import { readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { collectProgressWindow } from "../lib/progress-window.mjs"
import { writeSessionChain } from "../lib/session-chain.mjs"
import { writeRunState } from "../lib/run-state.mjs"
import { T, root, toolPath } from "./_harness.mjs"

export const fixture = (label) => {
  const repoRoot = join(root, label)
  mkdirSync(join(repoRoot, ".git"), { recursive: true })
  const times = ["2026-10-01T00:00:00Z", "2026-10-01T01:00:00Z", "2026-10-01T02:00:00Z", "2026-10-01T03:00:00Z"]
  writeSessionChain({ chains: [{ id: "chain", currentSessionId: "current", entries: times.slice(0, 3).map((startedAt, index) => ({
    sessionId: `relay-${index}`, startedAt, endedAt: times[index + 1], shipped: [],
    decisions: `Complete decisions ${index}\nReasoning ${index}\n`, openOwnerQuestions: [`Question ${index}`],
  })) }] }, repoRoot)
  const decisionLogPath = join(repoRoot, "decisions.md")
  writeFileSync(decisionLogPath, "Current decision and its complete reasoning\n")
  writeRunState({ sessionId: "current", decisionLogPath, openOwnerQuestions: ["Current question"], readinessLedger: [] }, repoRoot)
  const recorded = JSON.parse(readFileSync(toolPath("__fixtures__/progress-responses.json"), "utf8"))
  const repositories = ["ui", "api", "landing"].map((key) => ({ key, slug: `example/${key}` }))
  const calls = []
  const options = { sessionId: "current", repoRoot, now: "2026-10-01T04:00:00Z", repositories,
    ticketRepository: "example/tickets", readPages: async (path, projection) => {
      calls.push({ path, projection })
      if (path.includes("/pulls?")) return [times.map((time, index) => ({ ...recorded.pull, number: index + 1, merged_at: time })),
        [{ ...recorded.pull, number: 9, merged_at: null }, { ...recorded.pull, number: 10, merged_at: "2026-09-30T23:59:59Z" }]]
      if (path.includes("/issues?")) return [times.map((time, index) => ({ ...recorded.ticket, number: index + 1, closed_at: time, created_at: time }))]
      const android = path.includes("android-release")
      const runs = times.map((time, index) => ({ ...(android ? recorded.android : recorded.run), id: index + 1 + (android ? 100 : 0),
        created_at: time, updated_at: time, ...(index === 3 ? { conclusion: null, status: "in_progress" } : {}) }))
      return [{ total_count: 4, workflow_runs: runs.slice(0, 2) }, { total_count: 4, workflow_runs: runs.slice(2) }]
    } }
  return { options, calls, repoRoot, recorded }
}

const rejects = async (options, pattern) => {
  try { await collectProgressWindow(options); return false } catch (error) { return pattern.test(error.message) }
}

const ownerBoundaryCases = async () => {
  const boundary = fixture("progress-owner-boundary")
  const transcriptsDirectory = join(boundary.repoRoot, "transcripts")
  mkdirSync(transcriptsDirectory)
  const command = (sessionId, time, promptId) => ({ type: "user", sessionId, timestamp: time,
    uuid: `${promptId}-row`, promptId, isSidechain: false, turnOrigin: "human", origin: { kind: "human" },
    message: { role: "user", content: "<command-message>progress</command-message>\n<command-name>/progress</command-name>" } })
  const previous = "2026-09-30T23:00:00Z"
  const current = "2026-10-01T03:30:00Z"
  writeFileSync(join(transcriptsDirectory, "earlier.jsonl"), [command("earlier", previous, "previous"),
    { type: "assistant", timestamp: "2026-09-30T23:30:00Z", message: { role: "assistant", content: [
      { type: "text", text: "Decision: keep the selected release branch. Owner question: which track?" }] } },
  ].map((row) => JSON.stringify(row)).join("\n") + "\n")
  writeFileSync(join(transcriptsDirectory, "current.jsonl"), [command("current", current, "current"),
    command("current", "2026-10-01T03:30:06Z", "current"),
    { type: "user", timestamp: "2026-10-01T03:31:00Z", sourceToolAssistantUUID: "tool-source",
      message: { role: "user", content: [{ type: "tool_result", content: "<command-name>/progress</command-name>" }] } },
    { type: "user", timestamp: "2026-10-01T03:32:00Z", isMeta: true,
      message: { role: "user", content: [{ type: "text", text: "<command-name>/progress</command-name>" }] } },
  ].map((row) => JSON.stringify(row)).join("\n") + "\n")
  const windowReport = await collectProgressWindow({ ...boundary.options, transcriptsDirectory })
  T("progress-window: previous owner invocation precedes a later relay chain",
    windowReport.window.startedAt === previous)
  T("progress-window: merge before chain start survives and session evidence spans the window",
    windowReport.entries.some((entry) => entry.merges.some((merge) => merge.id === 10)) &&
    windowReport.entries.some((entry) => entry.sessionId === "earlier"))
  const earlier = windowReport.entries.find((entry) => entry.sessionId === "earlier")
  T("progress-window: overlapping session conversations retain decision and question evidence",
    earlier?.conversation.some((turn) => turn.text.includes("Owner question: which track?")))
  T("progress-window: baseline source and local start are explicit",
    windowReport.baselineSource === "previous-progress" && typeof windowReport.window.localStartedAt === "string")
  T("progress-window: current session with recorded decisions has no conversation",
    !Object.hasOwn(windowReport.entries.find((entry) => entry.sessionId === "current"), "conversation"))
  const laterPath = join(transcriptsDirectory, "later.jsonl")
  writeFileSync(laterPath, `${JSON.stringify(command("later", "2026-10-01T03:45:00Z", "later"))}\n`)
  const simultaneous = await collectProgressWindow({ ...boundary.options, transcriptsDirectory })
  T("progress-window: another session's later report does not replace this invocation's boundary",
    simultaneous.window.startedAt === previous)
  writeFileSync(laterPath, "")
  const nestedCommand = { ...command("current", "2026-10-01T03:40:00Z", "wrap-up"),
    message: { role: "user", content: "<command-message>wrap-up</command-message>\n<command-name>/wrap-up</command-name>" } }
  const currentPath = join(transcriptsDirectory, "current.jsonl")
  writeFileSync(currentPath, readFileSync(currentPath, "utf8") + JSON.stringify(nestedCommand) + "\n")
  const nested = await collectProgressWindow({ ...boundary.options, transcriptsDirectory })
  T("progress-window: wrap-up and model calls use the latest owner report without skipping it",
    nested.window.startedAt === current)
  writeFileSync(currentPath, JSON.stringify(command("current", current, "current")) + "\n" + JSON.stringify({
    ...command("current", "2026-10-01T03:41:00Z", "owner-text"),
    message: { role: "user", content: [{ type: "text", text: "Give me an update." }] },
  }) + "\n")
  const modelCall = await collectProgressWindow({ ...boundary.options, transcriptsDirectory })
  T("progress-window: owner text blocks before a model call keep the latest report as baseline",
    modelCall.window.startedAt === current)
  writeFileSync(join(transcriptsDirectory, "earlier.jsonl"), "")
  writeFileSync(currentPath, `${JSON.stringify(command("current", current, "first"))}\n`)
  const first = await collectProgressWindow({ ...boundary.options, transcriptsDirectory })
  T("progress-window: first owner report identifies its chain fallback",
    first.baselineSource === "chain-start" && first.window.startedAt === "2026-10-01T00:00:00Z")
  writeSessionChain({ chains: [] }, boundary.repoRoot)
  const firstSession = await collectProgressWindow({ ...boundary.options, transcriptsDirectory })
  T("progress-window: first owner report without a chain identifies its session fallback",
    firstSession.baselineSource === "session-start" && firstSession.window.startedAt === current)
}

const conversationCases = async () => {
  const staged = fixture("progress-conversation")
  const transcriptsDirectory = join(staged.repoRoot, "transcripts")
  mkdirSync(transcriptsDirectory)
  const owner = (content, timestamp = "2026-10-01T02:30:00Z") => ({ type: "user", timestamp,
    origin: { kind: "human" }, turnOrigin: "human", message: { role: "user", content } })
  for (const sessionId of ["relay-1", "current"]) {
    writeFileSync(join(transcriptsDirectory, `${sessionId}.jsonl`),
      JSON.stringify(owner("Already recorded in the decision log.")) + "\n")
  }
  const prompt = "x".repeat(5000)
  const reply = "y".repeat(5000)
  const rows = [owner(prompt),
    { type: "assistant", timestamp: "2026-10-01T02:31:00Z", message: { role: "assistant", content: [
      { type: "thinking", thinking: "Private reasoning" }, { type: "text", text: reply },
      { type: "tool_use", name: "Read", input: { file_path: "decisions.md" } }] } },
    { type: "user", timestamp: "2026-10-01T02:32:00Z", message: { role: "user", content: [
      { type: "tool_result", tool_use_id: "tool-source", content: "Tool output" },
      { type: "text", text: "Tool-result context" }] } },
    { type: "user", timestamp: "2026-10-01T02:33:00Z", message: { role: "user", content: "System notification" } },
    { ...owner("Expanded skill body"), isMeta: true },
    { ...owner("Sidechain prompt"), isSidechain: true },
    owner("Outside the window", "2026-09-30T23:00:00Z"),
    owner("Future prompt", "2026-10-01T05:00:00Z"),
    owner([{ type: "text", text: "Which release track?" }], "2026-10-01T02:34:00Z"),
    { type: "assistant", timestamp: "2026-10-01T02:35:00Z", message: { role: "assistant", content: "Use the internal track." } },
  ]
  writeFileSync(join(transcriptsDirectory, "unrecorded.jsonl"), rows.map((row) => JSON.stringify(row)).join("\n") + "\n")
  const report = await collectProgressWindow({ ...staged.options, transcriptsDirectory })
  for (const sessionId of ["relay-1", "current"]) {
    T(`progress-window: ${sessionId} decision log replaces transcript conversation`,
      !Object.hasOwn(report.entries.find((entry) => entry.sessionId === sessionId), "conversation"))
  }
  const turns = report.entries.find((entry) => entry.sessionId === "unrecorded").conversation
  T("progress-window: fallback retains only owner prompts and assistant text within the window",
    turns.length === 4 && turns.map((turn) => turn.role).join() === "user,assistant,user,assistant" &&
    turns[2].text === "Which release track?" && turns[3].text === "Use the internal track.")
  T("progress-window: fallback caps each long prompt and reply with a visible truncation marker",
    turns[0].text === prompt.slice(0, 1500) + "\n[truncated]" &&
    turns[1].text === reply.slice(0, 1500) + "\n[truncated]")
}

const directoryCases = async () => {
  const staged = fixture("progress-directory")
  const homeDirectory = join(staged.repoRoot, "home")
  const directory = join(homeDirectory, ".claude", "projects", staged.repoRoot.replace(/[^A-Za-z0-9]/g, "-"))
  mkdirSync(directory, { recursive: true })
  const command = (time, promptId) => ({ type: "user", timestamp: time, promptId,
    origin: { kind: "human" }, turnOrigin: "human", message: { role: "user",
      content: "<command-message>progress</command-message>\n<command-name>/progress</command-name>" } })
  writeFileSync(join(directory, "current.jsonl"), [command("2026-09-30T23:00:00Z", "previous"),
    command("2026-10-01T03:30:00Z", "current")].map((row) => JSON.stringify(row)).join("\n") + "\n")
  const originalHome = process.env.HOME
  const originalProject = process.env.CLAUDE_PROJECT_DIR
  try {
    process.env.HOME = homeDirectory
    process.env.CLAUDE_PROJECT_DIR = `${staged.repoRoot}/`
    const report = await collectProgressWindow(staged.options)
    T("progress-window: project directory discovery normalizes a trailing separator",
      report.window.startedAt === "2026-09-30T23:00:00Z")
    delete process.env.CLAUDE_PROJECT_DIR
    const ordinary = await collectProgressWindow({ ...staged.options, repoRoot: `${staged.repoRoot}/` })
    T("progress-window: ordinary checkout discovery uses the repository path",
      ordinary.window.startedAt === "2026-09-30T23:00:00Z")
    const linkedCheckout = join(staged.repoRoot, "linked")
    const gitDirectory = join(staged.repoRoot, ".git", "worktrees", "linked")
    mkdirSync(linkedCheckout)
    mkdirSync(gitDirectory, { recursive: true })
    writeFileSync(join(linkedCheckout, ".git"), `gitdir: ${gitDirectory}\n`)
    writeFileSync(join(gitDirectory, "commondir"), "../..\n")
    const linked = await collectProgressWindow({ ...staged.options, repoRoot: linkedCheckout })
    T("progress-window: linked checkout discovery follows the canonical repository",
      linked.window.startedAt === "2026-09-30T23:00:00Z")
    writeFileSync(join(directory, "current.jsonl"), "")
    const previous = "2026-09-30T23:00:00Z"
    writeFileSync(join(directory, "earlier.jsonl"), [command(previous, "previous"),
      { type: "assistant", timestamp: "2026-09-30T23:30:00Z", message: { role: "assistant",
        content: "Decision: keep the release branch. Owner question: which track?" } },
    ].map((row) => JSON.stringify(row)).join("\n") + "\n")
    const linkedDirectory = join(homeDirectory, ".claude", "projects", linkedCheckout.replace(/[^A-Za-z0-9]/g, "-"))
    mkdirSync(linkedDirectory, { recursive: true })
    const transcriptPath = join(linkedDirectory, "current.jsonl")
    writeFileSync(transcriptPath, JSON.stringify(command("2026-10-01T03:30:00Z", "current")) + "\n")
    writeFileSync(join(linkedDirectory, "overlapping.jsonl"), JSON.stringify({ type: "assistant",
      timestamp: "2026-10-01T02:30:00Z", message: { role: "assistant", content: "Linked checkout decision." } }) + "\n")
    process.env.CLAUDE_PROJECT_DIR = linkedCheckout
    const explicit = await collectProgressWindow({ ...staged.options, repoRoot: linkedCheckout, transcriptPath })
    T("progress-window: explicit linked transcript retains the canonical previous-progress boundary",
      explicit.baselineSource === "previous-progress" && explicit.window.startedAt === previous)
    T("progress-window: explicit linked transcript retains merges before the current session",
      explicit.entries.some((entry) => entry.merges.some((merge) => merge.id === 10)))
    T("progress-window: explicit linked transcript retains canonical conversation evidence",
      explicit.entries.some((entry) => entry.sessionId === "earlier" &&
        entry.conversation.some((turn) => turn.text.includes("Owner question: which track?"))))
    T("progress-window: explicit linked transcript retains other linked sessions",
      explicit.entries.some((entry) => entry.sessionId === "overlapping" &&
        entry.conversation.some((turn) => turn.text === "Linked checkout decision.")))
    T("progress-window: explicit linked transcript keeps the current session",
      explicit.sessionId === "current" && explicit.entries.at(-1).sessionId === "current" &&
      explicit.entries.at(-1).conversation.some((turn) => turn.time === "2026-10-01T03:30:00Z"))
  } finally {
    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome
    if (originalProject === undefined) delete process.env.CLAUDE_PROJECT_DIR
    else process.env.CLAUDE_PROJECT_DIR = originalProject
  }
}

export const cases = async () => {
  await ownerBoundaryCases()
  await conversationCases()
  await directoryCases()
  const staged = fixture("progress-core")
  const report = await collectProgressWindow(staged.options)
  T("progress-window: reports three relays and current session, with the full window", report.entries.map((entry) => entry.sessionId).join(",") === "relay-0,relay-1,relay-2,current" && report.window.startedAt === "2026-10-01T00:00:00Z")
  for (const [index, entry] of report.entries.entries()) {
    T(`progress-window: entry ${index} retains every source at its own boundary`,
      entry.merges.length === 3 && entry.releases.length === 4 && entry.closedTickets.length === 1 && entry.createdTickets.length === 1 &&
      [...entry.merges, ...entry.releases, ...entry.closedTickets].every((item) => item.id % 100 === index + 1))
    T(`progress-window: entry ${index} retains complete decisions and owner questions`,
      entry.decisions === (index === 3 ? "Current decision and its complete reasoning\n" : `Complete decisions ${index}\nReasoning ${index}\n`) &&
      entry.openOwnerQuestions[0] === (index === 3 ? "Current question" : `Question ${index}`))
  }
  T("progress-window: middle relay's merge and release survive empty shipped and readiness ledgers",
    report.entries[1].merges.some((item) => item.repository === "api" && item.id === 2) &&
    report.entries[1].releases.some((item) => item.repository === "api" && item.id === 2))
  const release = report.entries[1].releases.find((item) => item.workflow === "release.yml")
  const android = report.entries[1].releases.find((item) => item.workflow === "android-release.yml")
  T("progress-window: source branch differs from dispatch ref, Android retains track and version",
    release?.environment === "staging" && release.branch === "integration/next" && release.dispatchBranch === "main" &&
    android?.track === "internal" && android.version === "1.3.59" && android.versionCode === "118")
  T("progress-window: pending runs remain visible without a success claim", report.entries.at(-1).releases.every((run) => run.conclusion === null && run.status === "in_progress"))
  T("progress-window: one read per source, without GraphQL", staged.calls.length === 8 && new Set(staged.calls.map((call) => call.path)).size === 8 && staged.calls.every((call) => !call.path.includes("graphql")))
  T("progress-window: workflow date filter uses the verified day form", staged.calls.filter((call) => call.path.includes("/runs?")).every((call) => call.path.endsWith("created=%3E%3D2026-10-01")))
  const ticketKinds = await collectProgressWindow({ ...staged.options, readPages: async (path, projection) => {
    const pages = await staged.options.readPages(path, projection)
    return path.includes("/issues?") ? [[
      { ...staged.recorded.ticket, number: 50, created_at: "2026-10-01T01:30:00Z", closed_at: null },
      { ...staged.recorded.ticket, number: 51, created_at: "2026-09-30T01:30:00Z", closed_at: "2026-10-01T02:30:00Z" },
      { ...staged.recorded.ticket, number: 52, created_at: "2026-10-01T01:30:00Z", pull_request: { url: "https://example.test/pull/52" } },
    ]] : pages
  } })
  T("progress-window: newly created open tickets and older closed tickets use their own event times",
    ticketKinds.entries.flatMap((entry) => entry.createdTickets).map((ticket) => ticket.id).join() === "50" &&
    ticketKinds.entries.flatMap((entry) => entry.closedTickets).map((ticket) => ticket.id).join() === "51")
  const missingTitle = await collectProgressWindow({ ...staged.options, readPages: async (path, projection) => {
    const pages = await staged.options.readPages(path, projection)
    return path.includes("/runs?") ? pages.map((page) => ({ ...page, workflow_runs: page.workflow_runs.map((run) => ({ ...run, display_title: "Release API" })) })) : pages
  } })
  T("progress-window: missing dispatch inputs stay unknown", missingTitle.entries[1].releases.every((run) => run.environment === null && run.branch === null && run.track === null))
  T("progress-window: incomplete workflow pagination is refused", await rejects({ ...staged.options, readPages: async (path, projection) =>
    (await staged.options.readPages(path, projection)).slice(0, 1) }, /incomplete workflow pagination/))
  const standalone = fixture("progress-standalone")
  writeSessionChain({ chains: [] }, standalone.repoRoot)
  const transcriptPath = join(standalone.repoRoot, "current.jsonl")
  writeFileSync(transcriptPath, `${JSON.stringify({ timestamp: "2026-10-01T02:00:00Z", type: "user" })}\n`)
  const single = await collectProgressWindow({ ...standalone.options, transcriptPath })
  T("progress-window: no chain uses only the exact current transcript window", single.entries.length === 1 && single.entries[0].merges.length === 6 && single.window.startedAt === "2026-10-01T02:00:00Z")
  let remoteRead = false
  writeRunState({ sessionId: "foreign", decisionLogPath: join(root, "missing") }, standalone.repoRoot)
  const absent = await collectProgressWindow({ ...standalone.options, readPages: async () => { remoteRead = true; throw new Error("unexpected read") } })
  T("progress-window: foreign state never creates a baseline or reads remote sources", absent.baseline === "unavailable" && !remoteRead)
  T("progress-window: source errors propagate instead of a partial success", await rejects({ ...staged.options, readPages: async () => { throw new Error("source unavailable") } }, /source unavailable/))
  T("progress-window: missing source identity is refused", await rejects({ ...staged.options, readPages: async (path, projection) => {
    const pages = await staged.options.readPages(path, projection)
    if (path.includes("/pulls?")) delete pages[0][0].number
    return pages
  } }, /invalid source identity/))
  const ledgerPath = join(staged.repoRoot, ".git", "orbit-session-chain.json")
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"))
  ledger.chains[0].entries[1].startedAt = "2026-10-01T01:01:00Z"
  ledger.chains[0].entries[0].endedAt = "2026-10-01T00:59:00Z"
  writeSessionChain(ledger, staged.repoRoot)
  const gaps = await collectProgressWindow(staged.options)
  T("progress-window: work between sessions stays in the window without invented session ownership",
    gaps.entries.some((entry) => entry.sessionId === null && entry.merges.some((merge) => merge.id === 2)))
  const recovered = fixture("progress-recovered")
  const recoveringLedger = JSON.parse(readFileSync(join(recovered.repoRoot, ".git", "orbit-session-chain.json"), "utf8"))
  recoveringLedger.chains[0].currentSessionId = "relay-2"
  writeSessionChain(recoveringLedger, recovered.repoRoot)
  writeRunState({ sessionId: "current", relay: { from: "relay-2", successorTerminal: "current-terminal" } }, recovered.repoRoot)
  const OriginalDate = globalThis.Date
  let clock = OriginalDate.parse("2026-10-01T04:00:00Z")
  let recoveryError
  try {
    globalThis.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : [++clock])) }
    }
    await collectProgressWindow({ ...recovered.options, now: undefined })
  } catch (error) { recoveryError = error.message } finally { globalThis.Date = OriginalDate }
  T("progress-window: recovered relay resolves before the window end is sampled", recoveryError === undefined, recoveryError)
}
