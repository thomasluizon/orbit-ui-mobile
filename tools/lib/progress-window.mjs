import { createReadStream, existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { homedir } from "node:os"
import { createInterface } from "node:readline"
import { openSessionChain, readSessionChain } from "./session-chain.mjs"
import { readSessionMetrics } from "./session-context.mjs"
import { gitDirectoryOf, readRunState } from "./run-state.mjs"

const timestamp = (value, label) => {
  const milliseconds = typeof value === "string" ? Date.parse(value) : NaN
  if (!Number.isFinite(milliseconds)) throw new Error(`${label} must be a timestamp`)
  return milliseconds
}

const transcriptDirectory = (repoRoot, transcriptPath) => {
  if (transcriptPath) return dirname(transcriptPath)
  const gitDirectory = gitDirectoryOf(repoRoot)
  const commonMarker = join(gitDirectory, "commondir")
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || (existsSync(commonMarker)
    ? dirname(resolve(gitDirectory, readFileSync(commonMarker, "utf8").trim())) : repoRoot)
  return join(homedir(), ".claude", "projects", resolve(projectRoot).replace(/[^A-Za-z0-9]/g, "-"))
}

const readTranscript = async (path, visit) => {
  const stream = createReadStream(path, { encoding: "utf8" })
  const lines = createInterface({ input: stream, crlfDelay: Infinity })
  stream.on("error", () => lines.close())
  for await (const line of lines) {
    let row
    try { row = JSON.parse(line) } catch { continue }
    if (typeof row.timestamp === "string" && Number.isFinite(Date.parse(row.timestamp))) visit(row)
  }
  if (stream.errored) throw stream.errored
}

const ownerPrompt = (row) => row.type === "user" && !row.isMeta && !row.isSidechain &&
  row.origin?.kind === "human" && row.turnOrigin === "human"

const ownerProgress = (row) => ownerPrompt(row) && typeof row.message?.content === "string" &&
  /^<command-message>progress<\/command-message>\s*<command-name>\/progress<\/command-name>(?:\s|$)/.test(row.message.content)

const projectSessions = async (directory, now) => {
  if (!existsSync(directory)) return { sessions: [], commands: [] }
  const sessions = []
  const invocations = new Map()
  for (const file of readdirSync(directory, { withFileTypes: true })) {
    if (!file.isFile() || !file.name.endsWith(".jsonl")) continue
    const session = { sessionId: file.name.slice(0, -6), transcriptPath: join(directory, file.name), startedAt: null, endedAt: null }
    await readTranscript(session.transcriptPath, (row) => {
      if (Date.parse(row.timestamp) > Date.parse(now)) return
      if (!session.startedAt || Date.parse(row.timestamp) < Date.parse(session.startedAt)) session.startedAt = row.timestamp
      if (!session.endedAt || Date.parse(row.timestamp) > Date.parse(session.endedAt)) session.endedAt = row.timestamp
      if (ownerPrompt(row) && (!session.lastOwnerTime || Date.parse(row.timestamp) >= Date.parse(session.lastOwnerTime))) {
        session.lastOwnerTime = row.timestamp
        session.lastOwnerProgress = ownerProgress(row)
      }
      if (!ownerProgress(row)) return
      const key = `${session.sessionId}:${row.promptId ?? row.uuid}`
      const previous = invocations.get(key)
      if (!previous || Date.parse(row.timestamp) < Date.parse(previous.time)) {
        invocations.set(key, { sessionId: session.sessionId, time: row.timestamp })
      }
    })
    if (session.startedAt) sessions.push(session)
  }
  return { sessions, commands: [...invocations.values()].sort((left, right) => Date.parse(left.time) - Date.parse(right.time)) }
}

const conversationInWindow = async (path, startedAt, now) => {
  const turns = []
  if (!path) return turns
  await readTranscript(path, (row) => {
    if (Date.parse(row.timestamp) < Date.parse(startedAt) || Date.parse(row.timestamp) > Date.parse(now) ||
      row.isMeta || row.isSidechain || !(ownerPrompt(row) || row.type === "assistant")) return
    const content = row.message?.content
    const text = typeof content === "string" ? content : Array.isArray(content)
      ? content.filter((block) => block.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n") : ""
    if (text) turns.push({ time: row.timestamp, role: row.type,
      text: text.length > 1500 ? text.slice(0, 1500) + "\n[truncated]" : text })
  })
  return turns
}

const chainEntries = async ({ sessionId, repoRoot, transcriptPath, now }) => {
  const chain = openSessionChain(sessionId, repoRoot)
  now ??= new Date().toISOString()
  const currentSessionId = chain?.currentSessionId ?? sessionId
  const recorded = readRunState(repoRoot)
  const state = recorded?.sessionId === currentSessionId ? recorded : null
  const predecessors = chain?.entries.filter((entry) => entry.sessionId !== currentSessionId) ?? []
  const pending = chain?.entries.find((entry) => entry.sessionId === currentSessionId)
  const transcript = transcriptPath ?? state?.transcriptPath ?? state?.relay?.transcriptPath
  // Successor adoption ends the predecessor's ownership, including startup overlap.
  const startedAt = predecessors.at(-1)?.endedAt ?? pending?.startedAt ??
    (transcript ? (await readSessionMetrics(transcript)).startedAt : null)
  if (!startedAt) return null
  const decisions = state?.decisionLogPath ? readFileSync(state.decisionLogPath, "utf8") : pending?.decisions ?? ""
  const entries = [...predecessors, { sessionId: currentSessionId, startedAt, endedAt: now,
    decisions, openOwnerQuestions: state?.openOwnerQuestions ?? pending?.openOwnerQuestions ?? [] }]
  let previousStart = -Infinity
  for (const entry of entries) {
    const start = timestamp(entry.startedAt, `${entry.sessionId} startedAt`)
    const end = timestamp(entry.endedAt, `${entry.sessionId} endedAt`)
    if (start < previousStart || end < start || end > timestamp(now, "now")) {
      throw new Error(`invalid reporting interval for ${entry.sessionId}`)
    }
    previousStart = start
  }
  return entries.map(({ sessionId, startedAt, endedAt, decisions, openOwnerQuestions }) => ({
    sessionId, startedAt, endedAt, decisions: decisions ?? "", openOwnerQuestions: openOwnerQuestions ?? [],
    merges: [], releases: [], closedTickets: [],
  }))
}

const progressEntries = async ({ sessionId, repoRoot, transcriptPath, transcriptsDirectory, now }) => {
  const chain = await chainEntries({ sessionId, repoRoot, transcriptPath, now })
  now = chain?.at(-1).endedAt ?? now ?? new Date().toISOString()
  const state = readRunState(repoRoot)
  const currentSessionId = chain?.at(-1).sessionId ?? sessionId
  transcriptPath ??= state?.sessionId === currentSessionId ? state.transcriptPath ?? state.relay?.transcriptPath : undefined
  const project = await projectSessions(transcriptsDirectory ?? transcriptDirectory(repoRoot, transcriptPath), now)
  const latest = project.commands.at(-1)
  const currentInvocation = project.commands.findLast((command) => command.sessionId === currentSessionId)
  // A nested skill call has no owner command of its own to skip.
  const currentCommand = currentInvocation &&
    project.sessions.find((entry) => entry.sessionId === currentSessionId)?.lastOwnerProgress
  const previous = currentCommand
    ? project.commands.findLast((command) => Date.parse(command.time) < Date.parse(currentInvocation.time)) : latest
  const startedAt = previous?.time ?? chain?.[0].startedAt ?? project.sessions.find((entry) => entry.sessionId === currentSessionId)?.startedAt
  if (!startedAt) return null
  const baselineSource = previous ? "previous-progress" : openSessionChain(sessionId, repoRoot) ? "chain-start" : "session-start"
  const recorded = readSessionChain(repoRoot).chains.flatMap((entry) => entry.entries)
  const candidates = new Map(recorded.map((entry) => [entry.sessionId, entry]))
  for (const entry of project.sessions) candidates.set(entry.sessionId, { ...candidates.get(entry.sessionId), ...entry })
  for (const entry of chain ?? []) candidates.set(entry.sessionId, { ...candidates.get(entry.sessionId), ...entry })
  const entries = []
  for (const entry of candidates.values()) {
    if (Date.parse(entry.startedAt) > Date.parse(now) || Date.parse(entry.endedAt) < Date.parse(startedAt)) continue
    entries.push({ ...entry, startedAt: Date.parse(entry.startedAt) < Date.parse(startedAt) ? startedAt : entry.startedAt,
      endedAt: Date.parse(entry.endedAt) > Date.parse(now) ? now : entry.endedAt,
      decisions: entry.decisions ?? "", openOwnerQuestions: entry.openOwnerQuestions ?? [],
      ...(entry.decisions ? {} : { conversation: await conversationInWindow(entry.transcriptPath, startedAt, now) }),
      merges: [], releases: [], closedTickets: [], createdTickets: [] })
  }
  entries.sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt))
  const current = entries.findIndex((entry) => entry.sessionId === currentSessionId)
  if (current >= 0) {
    entries[current].endedAt = now
    entries.push(...entries.splice(current, 1))
  }
  return { entries, startedAt, now, baselineSource, currentSessionId }
}

const releaseSelection = (run, workflow) => {
  const android = /^Android Release (\S+) \((\d+)\) to (internal|open|production) on (.+)$/.exec(run.display_title)
  const release = /^Release (?:web|API|landing) (production|staging) from (.+)$/.exec(run.display_title)
  if (workflow === "android-release.yml" && android) {
    return { environment: null, track: android[3], branch: android[4], version: android[1], versionCode: android[2] }
  }
  return { environment: release?.[1] ?? null, track: null, branch: release?.[2] ?? null,
    version: null, versionCode: null }
}

const assign = (entries, kind, item, time, now, startedAt) => {
  const instant = timestamp(time, `${kind} time`)
  if (instant < timestamp(startedAt, "window start") || instant > timestamp(now, "now")) return
  // The successor owns the shared boundary; a relay can overlap while it starts up.
  let owner = entries.findLast((entry) => instant >= timestamp(entry.startedAt, "entry start") &&
    instant <= timestamp(entry.endedAt, "entry end"))
  if (!owner) {
    owner = entries.find((entry) => entry.sessionId === null)
    if (!owner) {
      owner = { sessionId: null, startedAt, endedAt: now, decisions: "", openOwnerQuestions: [], conversation: [],
        merges: [], releases: [], closedTickets: [], createdTickets: [] }
      entries.unshift(owner)
    }
  }
  if (!owner[kind].some((existing) => existing.repository === item.repository && existing.id === item.id)) {
    owner[kind].push(item)
  }
}

const pullProjection = "[.[]|{number,title,body,base:{ref:.base.ref},merge_commit_sha,merged_at,html_url}]"
const runProjection = "{total_count,workflow_runs:[.workflow_runs[]|{id,display_title,head_branch,conclusion,status,created_at,updated_at,html_url}]}"
const ticketProjection = "[.[]|{number,title,body,created_at,closed_at,state_reason,html_url,pull_request}]"

export const collectProgressWindow = async ({ sessionId, repoRoot, transcriptPath, now, repositories, ticketRepository, readPages, transcriptsDirectory }) => {
  const progress = await progressEntries({ sessionId, repoRoot, transcriptPath, transcriptsDirectory, now })
  if (!progress) return { baseline: "unavailable", sessionId, window: null, entries: [] }
  const { entries, startedAt, baselineSource, currentSessionId } = progress
  now = progress.now
  const sources = repositories.flatMap(({ key, slug }) => [
    { repository: key, kind: "merges", path: `repos/${slug}/pulls?state=closed&per_page=100`, projection: pullProjection },
    ...["release.yml", ...(key === "ui" ? ["android-release.yml"] : [])].map((workflow) => ({
      repository: key, slug, kind: "releases", workflow, projection: runProjection,
      createdSince: `>=${new Date(startedAt).toISOString().slice(0, 10)}`,
      path: `repos/${slug}/actions/workflows/${workflow}/runs?per_page=100&created=${encodeURIComponent(`>=${new Date(startedAt).toISOString().slice(0, 10)}`)}`,
    })),
  ])
  sources.push({ repository: ticketRepository, kind: "closedTickets", projection: ticketProjection,
    path: `repos/${ticketRepository}/issues?state=all&per_page=100&since=${encodeURIComponent(startedAt)}` })
  const results = await Promise.allSettled(sources.map(async (source) => ({ source,
    pages: await readPages(source.path, source.projection, source) })))
  for (const result of results) {
    if (result.status === "rejected") throw result.reason
    collectSource(entries, result.value.source, result.value.pages, now, startedAt)
  }
  for (const entry of entries) {
    for (const kind of ["merges", "releases", "closedTickets", "createdTickets"]) entry[kind].sort((left, right) => left.time.localeCompare(right.time) || left.id - right.id)
  }
  return { baseline: "available", baselineSource, sessionId: currentSessionId, window: { startedAt, endedAt: now, localStartedAt: new Date(startedAt).toLocaleString(undefined, { timeZoneName: "short" }) }, entries }
}

const collectSource = (entries, source, pages, now, startedAt) => {
  if (!Array.isArray(pages) || pages.length === 0) throw new Error(`missing pages from ${source.path}`)
  if (source.kind === "releases") {
    if (pages.some((page) => !Number.isInteger(page?.total_count) || !Array.isArray(page.workflow_runs)) ||
      pages.flatMap((page) => page.workflow_runs).length !== pages[0].total_count) {
      throw new Error(`incomplete workflow pagination at ${source.path}`)
    }
  } else if (pages.some((page) => !Array.isArray(page))) throw new Error(`invalid response at ${source.path}`)
  const rows = source.kind === "releases" ? pages.flatMap((page) => page.workflow_runs) : pages.flat()
  for (const row of rows) {
    const id = source.kind === "releases" ? row?.id : row?.number
    const title = source.kind === "releases" ? row?.display_title : row?.title
    if (!Number.isInteger(id) || id <= 0 || typeof title !== "string" || typeof row.html_url !== "string") {
      throw new Error(`invalid source identity at ${source.path}`)
    }
    if (source.kind === "merges") {
      if (row.merged_at === null) continue
      if (typeof row.base?.ref !== "string" || typeof row.merge_commit_sha !== "string") throw new Error(`invalid merged pull request at ${source.path}`)
      assign(entries, source.kind, { repository: source.repository, id: row.number, title: row.title, body: row.body,
        baseBranch: row.base.ref, mergeSha: row.merge_commit_sha, time: row.merged_at, url: row.html_url }, row.merged_at, now, startedAt)
    } else if (source.kind === "releases") {
      if (typeof row.display_title !== "string" || typeof row.head_branch !== "string" ||
        typeof row.status !== "string" || !(row.conclusion === null || typeof row.conclusion === "string")) throw new Error(`invalid workflow run at ${source.path}`)
      assign(entries, source.kind, { repository: source.repository, id: row.id, workflow: source.workflow,
        title: row.display_title, ...releaseSelection(row, source.workflow), dispatchBranch: row.head_branch,
        conclusion: row.conclusion, status: row.status, time: row.created_at, updatedAt: row.updated_at, url: row.html_url }, row.created_at, now, startedAt)
    } else {
      if (row.pull_request) continue
      assign(entries, "createdTickets", { repository: source.repository, id: row.number, title: row.title, body: row.body,
        time: row.created_at, url: row.html_url }, row.created_at, now, startedAt)
      if (row.closed_at === null) continue
      assign(entries, source.kind, { repository: source.repository, id: row.number, title: row.title, body: row.body,
        reason: row.state_reason, time: row.closed_at, url: row.html_url }, row.closed_at, now, startedAt)
    }
  }
}
