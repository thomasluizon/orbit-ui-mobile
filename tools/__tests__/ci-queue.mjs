import { DEFAULT_JOB_MINUTES, HOLD_BACKLOG_MINUTES, LATE_QUEUED_MINUTES, MAX_RUNS_READ, RUNNER_LIMIT, holdReason, lateReason, readCiQueue, summarizeJobs } from "../lib/ci-queue.mjs"

import { T, same } from "./_harness.mjs"

const UNIT = "lib/ci-queue.mjs"
const NOW = Date.parse("2026-11-26T12:00:00Z")
const MINUTE = 60 * 1000
const iso = (offsetMinutes) => new Date(NOW + offsetMinutes * MINUTE).toISOString()
const queued = (count, ageMinutes = 5) => Array.from({ length: count }, () => ({ status: "queued", created_at: iso(-ageMinutes), started_at: null, completed_at: null }))
const finished = (count, minutes) => Array.from({ length: count }, () => ({ status: "completed", created_at: iso(-90), started_at: iso(-60), completed_at: iso(minutes - 60) }))

export const cases = async () => {
  same(`${UNIT}: the account runs 40 jobs at a time and the hold is at 60 minutes of work`, [RUNNER_LIMIT, HOLD_BACKLOG_MINUTES, LATE_QUEUED_MINUTES], [40, 60, 60])

  const empty = summarizeJobs([], NOW)
  same(`${UNIT}: no job gives no queue, the default job length and no age`, [empty.queued, empty.running, empty.meanJobMinutes, empty.backlogMinutes, empty.oldestQueuedMinutes], [0, 0, DEFAULT_JOB_MINUTES, 0, 0])

  const mixed = summarizeJobs([...queued(80, 30), ...queued(40, 70), ...finished(3, 9), { status: "in_progress", created_at: iso(-3), started_at: iso(-2), completed_at: null }], NOW)
  same(`${UNIT}: 120 queued jobs of 9 minutes at 40 at a time need 27 minutes, and the oldest queued job is 70 minutes old`, [mixed.queued, mixed.running, mixed.meanJobMinutes, mixed.backlogMinutes, mixed.oldestQueuedMinutes], [120, 1, 9, 27, 70])
  same(`${UNIT}: waiting, pending and requested jobs count as queued`, summarizeJobs(["waiting", "pending", "requested", "queued"].map((status) => ({ status, created_at: iso(-1) })), NOW).queued, 4)

  T(`${UNIT}: a backlog of exactly 60 minutes holds nothing and 61 holds`, holdReason({ backlogMinutes: 60, queued: 10 }) === null && holdReason({ backlogMinutes: 61, queued: 10 }) !== null)
  same(`${UNIT}: the hold reason names the minutes and the queued jobs`, holdReason({ backlogMinutes: 63.6, queued: 256 }), "the CI queue holds 64 minutes of work: 256 queued jobs")
  T(`${UNIT}: an unknown queue holds nothing and is late for nothing`, holdReason(null) === null && lateReason(null) === null)
  T(`${UNIT}: a queued check is late after 60 minutes`, lateReason({ oldestQueuedMinutes: 60 }) === null && lateReason({ oldestQueuedMinutes: 61 }) === "the oldest queued check waited 61 minutes")

  const calls = []
  const jobsByRun = { 101: queued(2, 90), 102: finished(2, 12) }
  const gh = async (args) => {
    calls.push(args[1])
    if (args[1].includes("status=queued")) return "[101]"
    if (args[1].includes("status=in_progress")) return "[102, 101]"
    return JSON.stringify(jobsByRun[/runs\/(\d+)\/jobs/.exec(args[1])[1]])
  }
  const queue = await readCiQueue({ gh, slug: "thomasluizon/orbit-ui-mobile", now: NOW })
  same(`${UNIT}: the read lists the queued runs, then the running runs, then the jobs of each run once`, calls, [
    "repos/thomasluizon/orbit-ui-mobile/actions/runs?status=queued&per_page=100",
    "repos/thomasluizon/orbit-ui-mobile/actions/runs?status=in_progress&per_page=100",
    "repos/thomasluizon/orbit-ui-mobile/actions/runs/101/jobs?per_page=100",
    "repos/thomasluizon/orbit-ui-mobile/actions/runs/102/jobs?per_page=100",
  ])
  same(`${UNIT}: the read sums the jobs of the runs and names the runs it read`, [queue.queued, queue.meanJobMinutes, queue.runs, queue.runsRead], [2, 12, 2, 2])

  const many = Array.from({ length: MAX_RUNS_READ + 7 }, (_, index) => index + 1)
  const wide = await readCiQueue({ gh: async (args) => (args[1].includes("status=queued") ? JSON.stringify(many) : args[1].includes("status=in_progress") ? "[]" : "[]"), slug: "x/y", now: NOW })
  same(`${UNIT}: a read of more runs than the limit names the runs it left out`, [wide.runs, wide.runsRead], [MAX_RUNS_READ + 7, MAX_RUNS_READ])
}
