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
      if (path.includes("/issues?")) return [times.map((time, index) => ({ ...recorded.ticket, number: index + 1, closed_at: time }))]
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

export const cases = async () => {
  const staged = fixture("progress-core")
  const report = await collectProgressWindow(staged.options)
  T("progress-window: reports three relays and current session, with the full window", report.entries.map((entry) => entry.sessionId).join(",") === "relay-0,relay-1,relay-2,current" && report.window.startedAt === "2026-10-01T00:00:00Z")
  for (const [index, entry] of report.entries.entries()) {
    T(`progress-window: entry ${index} retains every source at its own boundary`,
      entry.merges.length === 3 && entry.releases.length === 4 && entry.closedTickets.length === 1 &&
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
    release?.environment === "staging" && release.branch === "redesign/main" && release.dispatchBranch === "main" &&
    android?.track === "internal" && android.version === "1.3.59" && android.versionCode === "118")
  T("progress-window: pending runs remain visible without a success claim", report.entries.at(-1).releases.every((run) => run.conclusion === null && run.status === "in_progress"))
  T("progress-window: one paginated REST read per source, without GraphQL", staged.calls.length === 8 && new Set(staged.calls.map((call) => call.path)).size === 8 && staged.calls.every((call) => !call.path.includes("graphql")))
  T("progress-window: workflow date filter uses the verified day form", staged.calls.filter((call) => call.path.includes("/runs?")).every((call) => call.path.endsWith("created=%3E%3D2026-10-01")))
  const missingTitle = await collectProgressWindow({ ...staged.options, readPages: async (path, projection) => {
    const pages = await staged.options.readPages(path, projection)
    return path.includes("/runs?") ? pages.map((page) => ({ ...page, workflow_runs: page.workflow_runs.map((run) => ({ ...run, display_title: "Release API" })) })) : pages
  } })
  T("progress-window: missing dispatch inputs stay unknown", missingTitle.entries[1].releases.every((run) => run.environment === null && run.branch === null && run.track === null))
  T("progress-window: incomplete workflow pagination is refused", await rejects({ ...staged.options, readPages: async (path, projection) =>
    (await staged.options.readPages(path, projection)).slice(0, 1) }, /incomplete workflow pagination/))
  const standalone = fixture("progress-standalone")
  writeSessionChain({ chains: [] }, standalone.repoRoot)
  const transcriptPath = join(standalone.repoRoot, "session.jsonl")
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
  T("progress-window: work in a gap is reported as an interval error", await rejects(staged.options, /has no chain entry/))
}
