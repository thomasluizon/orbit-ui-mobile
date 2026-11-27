/** The CI queue of the ui repository: the queued and running jobs, and the pace that the driver keeps because of them. */

/** The jobs that the GitHub account runs at one time. A GitHub Pro account runs at most 40. */
export const RUNNER_LIMIT = 40
/** The driver starts no new build while the queued jobs hold more than this many minutes of work. */
export const HOLD_BACKLOG_MINUTES = 60
/** A queued job that is older than this many minutes is a late check. */
export const LATE_QUEUED_MINUTES = 60
/** The minutes of one job when no finished job gives a mean. */
export const DEFAULT_JOB_MINUTES = 6
/** The runs whose jobs one read lists. The summary names the runs it left out. */
export const MAX_RUNS_READ = 40

const QUEUED = ["queued", "waiting", "pending", "requested"]
const MINUTE_MS = 60 * 1000

/** The ids of every run of one repository with one status. `--paginate` reads each page of 100, and `--jq` gives one id on each line. */
const runIdsOf = async (gh, slug, status) => (await gh(["api", `repos/${slug}/actions/runs?status=${status}&per_page=100`, "--paginate", "--jq", ".workflow_runs[].id"])).split("\n").filter((line) => line.trim() !== "").map(Number)

/** The jobs of one run with the fields that the pace reads. */
const jobsOf = async (gh, slug, runId) => JSON.parse(await gh(["api", `repos/${slug}/actions/runs/${runId}/jobs?per_page=100`, "--jq", "[.jobs[] | {status, created_at, started_at, completed_at}]"]))

/**
 * The reading of a job list: the queued and running jobs, the mean minutes of a finished job, the minutes that the queue needs when
 * every runner slot works, and the age of the oldest queued job. `jobs` holds the fields status, created_at, started_at and completed_at.
 */
export const summarizeJobs = (jobs, now) => {
  const queued = jobs.filter((job) => QUEUED.includes(job.status))
  const running = jobs.filter((job) => job.status === "in_progress")
  const finished = jobs.filter((job) => job.status === "completed" && job.started_at && job.completed_at)
  const minutes = finished.map((job) => (Date.parse(job.completed_at) - Date.parse(job.started_at)) / MINUTE_MS).filter((value) => Number.isFinite(value) && value >= 0)
  const meanJobMinutes = minutes.length === 0 ? DEFAULT_JOB_MINUTES : minutes.reduce((sum, value) => sum + value, 0) / minutes.length
  const created = queued.map((job) => Date.parse(job.created_at)).filter(Number.isFinite)
  return {
    queued: queued.length,
    running: running.length,
    meanJobMinutes,
    backlogMinutes: (queued.length * meanJobMinutes) / RUNNER_LIMIT,
    oldestQueuedMinutes: created.length === 0 ? 0 : Math.max(0, (now - Math.min(...created)) / MINUTE_MS),
  }
}

/**
 * Reads the queued and in-progress runs of one repository and sums their jobs. `gh(args)` returns the text of one `gh` call.
 * GitHub lists runs newest first. A run id rises with its creation time, so the ids go oldest first before the cut: the oldest runs hold
 * most of the queued jobs and the oldest queued check.
 */
export const readCiQueue = async ({ gh, slug, now }) => {
  const ids = [...new Set([...await runIdsOf(gh, slug, "queued"), ...await runIdsOf(gh, slug, "in_progress")])].sort((left, right) => left - right)
  const read = ids.slice(0, MAX_RUNS_READ)
  const jobs = []
  for (const id of read) jobs.push(...await jobsOf(gh, slug, id))
  return { ...summarizeJobs(jobs, now), runs: ids.length, runsRead: read.length }
}

/** The reason that the driver starts no new build, or null. */
export const holdReason = (queue) => (queue !== null && queue.backlogMinutes > HOLD_BACKLOG_MINUTES ? `the CI queue holds ${Math.round(queue.backlogMinutes)} minutes of work: ${queue.queued} queued jobs` : null)

/** The reason that the oldest queued check is late, or null. */
export const lateReason = (queue) => (queue !== null && queue.oldestQueuedMinutes > LATE_QUEUED_MINUTES ? `the oldest queued check waited ${Math.round(queue.oldestQueuedMinutes)} minutes` : null)
