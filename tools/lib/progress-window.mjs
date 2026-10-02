import { readFileSync } from "node:fs"
import { openSessionChain } from "./session-chain.mjs"
import { readSessionMetrics } from "./session-context.mjs"
import { readRunState } from "./run-state.mjs"

const timestamp = (value, label) => {
  const milliseconds = typeof value === "string" ? Date.parse(value) : NaN
  if (!Number.isFinite(milliseconds)) throw new Error(`${label} must be a timestamp`)
  return milliseconds
}

const progressEntries = async ({ sessionId, repoRoot, transcriptPath, now }) => {
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

const releaseSelection = (run, workflow) => {
  const android = /^Android Release (\S+) \((\d+)\) to (internal|open|production) on (.+)$/.exec(run.display_title)
  const release = /^Release (?:web|API|landing) (production|staging) from (.+)$/.exec(run.display_title)
  if (workflow === "android-release.yml" && android) {
    return { environment: null, track: android[3], branch: android[4], version: android[1], versionCode: android[2] }
  }
  return { environment: release?.[1] ?? null, track: null, branch: release?.[2] ?? null,
    version: null, versionCode: null }
}

const assign = (entries, kind, item, time, now) => {
  const instant = timestamp(time, `${kind} time`)
  if (instant < timestamp(entries[0].startedAt, "window start") || instant > timestamp(now, "now")) return
  // The successor owns the shared boundary; a relay can overlap while it starts up.
  const owner = entries.findLast((entry) => instant >= timestamp(entry.startedAt, "entry start") &&
    instant <= timestamp(entry.endedAt, "entry end"))
  if (!owner) throw new Error(`${kind} at ${time} has no chain entry`)
  if (!owner[kind].some((existing) => existing.repository === item.repository && existing.id === item.id)) {
    owner[kind].push(item)
  }
}

const pullProjection = "[.[]|{number,title,body,base:{ref:.base.ref},merge_commit_sha,merged_at,html_url}]"
const runProjection = "{total_count,workflow_runs:[.workflow_runs[]|{id,display_title,head_branch,conclusion,status,created_at,updated_at,html_url}]}"
const ticketProjection = "[.[]|{number,title,body,closed_at,state_reason,html_url}]"

export const collectProgressWindow = async ({ sessionId, repoRoot, transcriptPath, now, repositories, ticketRepository, readPages }) => {
  const entries = await progressEntries({ sessionId, repoRoot, transcriptPath, now })
  if (!entries) return { baseline: "unavailable", sessionId, window: null, entries: [] }
  now = entries.at(-1).endedAt
  const startedAt = entries[0].startedAt
  const sources = repositories.flatMap(({ key, slug }) => [
    { repository: key, kind: "merges", path: `repos/${slug}/pulls?state=closed&per_page=100`, projection: pullProjection },
    ...["release.yml", ...(key === "ui" ? ["android-release.yml"] : [])].map((workflow) => ({
      repository: key, kind: "releases", workflow, projection: runProjection,
      path: `repos/${slug}/actions/workflows/${workflow}/runs?per_page=100&created=${encodeURIComponent(`>=${new Date(startedAt).toISOString().slice(0, 10)}`)}`,
    })),
  ])
  sources.push({ repository: ticketRepository, kind: "closedTickets", projection: ticketProjection,
    path: `repos/${ticketRepository}/issues?state=closed&per_page=100&since=${encodeURIComponent(startedAt)}` })
  const results = await Promise.allSettled(sources.map(async (source) => ({ source,
    pages: await readPages(source.path, source.projection) })))
  for (const result of results) {
    if (result.status === "rejected") throw result.reason
    collectSource(entries, result.value.source, result.value.pages, now)
  }
  for (const entry of entries) {
    for (const kind of ["merges", "releases", "closedTickets"]) entry[kind].sort((left, right) => left.time.localeCompare(right.time) || left.id - right.id)
  }
  return { baseline: "available", sessionId: entries.at(-1).sessionId, window: { startedAt, endedAt: now }, entries }
}

const collectSource = (entries, source, pages, now) => {
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
        baseBranch: row.base.ref, mergeSha: row.merge_commit_sha, time: row.merged_at, url: row.html_url }, row.merged_at, now)
    } else if (source.kind === "releases") {
      if (typeof row.display_title !== "string" || typeof row.head_branch !== "string" ||
        typeof row.status !== "string" || !(row.conclusion === null || typeof row.conclusion === "string")) throw new Error(`invalid workflow run at ${source.path}`)
      assign(entries, source.kind, { repository: source.repository, id: row.id, workflow: source.workflow,
        title: row.display_title, ...releaseSelection(row, source.workflow), dispatchBranch: row.head_branch,
        conclusion: row.conclusion, status: row.status, time: row.created_at, updatedAt: row.updated_at, url: row.html_url }, row.created_at, now)
    } else {
      assign(entries, source.kind, { repository: source.repository, id: row.number, title: row.title, body: row.body,
        reason: row.state_reason, time: row.closed_at, url: row.html_url }, row.closed_at, now)
    }
  }
}
