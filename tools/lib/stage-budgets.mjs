/**
 * The time budgets of the delivery stages. A budget warns and never blocks: an over-budget stage is a problem in `health.json`, and
 * it holds, fails or reorders nothing. Each stage is judged on the median of its newest 10 samples. A stage with fewer samples is not judged.
 * A sample is `{ at, key, ms, item }`: `at` is the ISO time that the stage ended, `key` is `<stage>:<repo key>`, `ci-run:<repo key>:<job name>` or `tick`.
 */

/** The budget of each stage, in minutes. Change a budget here. */
export const STAGE_BUDGETS = {
  "launch-to-push": 30,
  "push-to-request": 2,
  "review-round": 15,
  "review-to-merge": 10,
  "ci-queue": 5,
  "ci-run": 15,
  "pr-open": 30,
  tick: 3,
}

export const SAMPLES_JUDGED = 10
export const SAMPLES_KEPT = 5000
const MINUTE_MS = 60 * 1000

/** The stage of a key: the part before the first `:`. */
export const stageOf = (key) => key.split(":", 1)[0]

const median = (numbers) => {
  const sorted = [...numbers].sort((left, right) => left - right)
  const middle = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** One verdict for each key whose stage has a budget. Times are minutes. A key with fewer than `SAMPLES_JUDGED` samples is `{ key, judged: false, count }`. */
export const judge = (samples) => {
  const byKey = new Map()
  for (const sample of samples) {
    if (STAGE_BUDGETS[stageOf(sample.key)] === undefined || !Number.isFinite(Date.parse(sample.at)) || !Number.isFinite(sample.ms)) continue
    byKey.set(sample.key, [...(byKey.get(sample.key) ?? []), sample])
  }
  return [...byKey].map(([key, own]) => {
    if (own.length < SAMPLES_JUDGED) return { key, judged: false, count: own.length }
    const newest = own.sort((left, right) => Date.parse(right.at) - Date.parse(left.at)).slice(0, SAMPLES_JUDGED)
    const budget = STAGE_BUDGETS[stageOf(key)]
    const middle = median(newest.map((sample) => sample.ms)) / MINUTE_MS
    return { key, judged: true, median: middle, budget, slow: middle > budget, samples: newest }
  })
}

const minutes = (value) => Math.round(value * 10) / 10

/** The detail of a slow key in `health.json`. */
export const slowDetail = (verdict) => `median ${minutes(verdict.median)} min, budget ${verdict.budget} min`

/** The one line of a key for `--budgets`. */
export const budgetLine = (verdict) => (verdict.judged
  ? `${verdict.key}: median ${minutes(verdict.median)} min, budget ${verdict.budget} min, ${verdict.samples.length} samples, ${verdict.slow ? "SLOW" : "ok"}`
  : `${verdict.key}: not judged (${verdict.count} of ${SAMPLES_JUDGED})`)

/** The last line of `--budgets`. */
export const budgetResult = (verdicts) => {
  const slow = verdicts.filter((verdict) => verdict.judged && verdict.slow).map((verdict) => `${verdict.key} over budget`)
  return slow.length === 0 ? "RESULT: PASS" : `RESULT: FAIL (${slow.join(", ")})`
}

const span = (from, to) => {
  const ms = Date.parse(to) - Date.parse(from)
  return Number.isFinite(ms) && ms >= 0 ? ms : null
}

/**
 * The samples of one merged pull request. `pull` holds `createdAt`, `headRef`, `comments` and `reviews`. `launches` are the launch
 * records of its ticket, `approvedAt` the time of the newest approving review (or null), `mergedAt` the merge time and `jobs` the jobs
 * of each workflow run at the merged head. A stage with a missing time gives no sample.
 */
export const mergeSamples = ({ repoKey, item, pull, launches, approvedAt, mergedAt, jobs }) => {
  const samples = []
  const add = (key, from, to) => {
    const ms = from ? span(from, to) : null
    if (ms !== null) samples.push({ at: to, key, ms, item })
  }
  const requests = pull.comments.filter((entry) => entry.kind === "request").sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
  const builds = launches.filter((entry) => entry.branch === pull.headRef && (entry.kind === "build" || entry.kind === "build part") && entry.at).sort((left, right) => Date.parse(left.at) - Date.parse(right.at))
  if (builds.length > 0) add(`launch-to-push:${repoKey}`, builds[0].at, pull.createdAt)
  if (requests.length > 0) add(`push-to-request:${repoKey}`, pull.createdAt, requests[0].createdAt)
  for (const request of requests) {
    const answer = pull.reviews.map((entry) => entry.submittedAt).filter((time) => Date.parse(time) > Date.parse(request.createdAt)).sort().at(0)
    if (answer) add(`review-round:${repoKey}`, request.createdAt, answer)
  }
  add(`review-to-merge:${repoKey}`, approvedAt, mergedAt)
  add(`pr-open:${repoKey}`, pull.createdAt, mergedAt)
  for (const job of jobs) {
    if (job.conclusion === "skipped" || !job.started_at) continue
    add(`ci-queue:${repoKey}`, job.created_at, job.started_at)
    add(`ci-run:${repoKey}:${job.name}`, job.started_at, job.completed_at)
  }
  return samples
}
