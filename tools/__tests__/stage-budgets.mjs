import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { isDeepStrictEqual } from "node:util"

import { createMemory, judgeStages, parseArguments, recordMergeSamples, runBudgets } from "../drive.mjs"
import { healthRecord } from "../lib/driver-health.mjs"

import { budgetLine, budgetResult, judge, mergeSamples } from "../lib/stage-budgets.mjs"

import { root, same } from "./_harness.mjs"

const UNIT = "lib/stage-budgets.mjs"
const MINUTE = 60 * 1000
const START = Date.parse("2026-11-27T10:00:00Z")
const iso = (minutes) => new Date(START + minutes * MINUTE).toISOString()
/** `count` samples of one key. Sample `n` ends `n` minutes after the start and lasts `lengths[n]` minutes. */
const samplesOf = (key, lengths) => lengths.map((length, n) => ({ at: iso(n), key, ms: length * MINUTE, item: `ui#${n}` }))
const JOBS = JSON.parse(readFileSync(new URL("../__fixtures__/actions-run-jobs.json", import.meta.url), "utf8")).jobs

export const cases = async () => {
  const verdictOf = (samples) => judge(samples)[0]
  same(`${UNIT}: 9 samples are not judged`, budgetLine(verdictOf(samplesOf("pr-open:ui", Array(9).fill(99)))), "pr-open:ui: not judged (9 of 10)")
  same(`${UNIT}: 10 samples with a median of 31 minutes on pr-open:ui are slow`, [verdictOf(samplesOf("pr-open:ui", Array(10).fill(31))).slow, verdictOf(samplesOf("pr-open:ui", Array(10).fill(31))).median], [true, 31])
  same(`${UNIT}: a median of 30 minutes is ok`, verdictOf(samplesOf("pr-open:ui", Array(10).fill(30))).slow, false)
  same(`${UNIT}: the median of an even count is the mean of the two middle values`, verdictOf(samplesOf("pr-open:ui", [1, 1, 1, 1, 29, 33, 99, 99, 99, 99])).median, 31)
  // 20 old slow samples and 10 newer fast ones: the median of all 30 is slow, and the median of the 10 newest is not.
  const old = samplesOf("pr-open:ui", Array(20).fill(100)).map((sample, n) => ({ ...sample, at: iso(-1 - n) }))
  same(`${UNIT}: the 10 newest samples count, so old slow samples do not keep a key slow`, verdictOf([...old, ...samplesOf("pr-open:ui", Array(10).fill(1))]).slow, false)
  same(`${UNIT}: the newest samples win whatever their order in the file`, verdictOf([...samplesOf("pr-open:ui", Array(10).fill(1)), ...old]).slow, false)
  same(`${UNIT}: the budget of ci-run:<repo>:<job> is the budget of its stage`, verdictOf(samplesOf("ci-run:ui:Web unit (chromium 3/16)", Array(10).fill(16))).budget, 15)
  same(`${UNIT}: a key of an unknown stage is not judged and not listed`, judge(samplesOf("mystery:ui", Array(10).fill(99))), [])
  same(`${UNIT}: each key gets its own verdict`, judge([...samplesOf("tick", Array(10).fill(4)), ...samplesOf("pr-open:ui", [5])]).map(({ key, judged }) => [key, judged]), [["tick", true], ["pr-open:ui", false]])
  same(`${UNIT}: the result lists each key over budget`, budgetResult(judge(samplesOf("pr-open:ui", Array(10).fill(31)))), "RESULT: FAIL (pr-open:ui over budget)")
  same(`${UNIT}: the result passes when no key is over budget`, budgetResult(judge(samplesOf("tick", Array(10).fill(1)))), "RESULT: PASS")

  const pull = { createdAt: iso(10), headRef: "chore/ticket-7", comments: [{ kind: "request", createdAt: iso(12) }, { kind: "request", createdAt: iso(40) }, { kind: "record", createdAt: iso(13) }], reviews: [{ submittedAt: iso(30) }, { submittedAt: iso(55) }] }
  const launches = [{ branch: "chore/ticket-7", kind: "build", at: iso(-20) }, { branch: "chore/ticket-7", kind: "fix", at: iso(60) }, { branch: "other", kind: "build", at: iso(-90) }]
  const taken = (extra = {}) => mergeSamples({ repoKey: "ui", item: "ui#30", pull, launches, approvedAt: iso(55), mergedAt: iso(70), jobs: [], ...extra }).map(({ key, ms }) => [key, ms / MINUTE])
  same(`${UNIT}: a merge gives one sample for each stage and one review-round sample for each request`, taken(), [["launch-to-push:ui", 30], ["push-to-request:ui", 2], ["review-round:ui", 18], ["review-round:ui", 15], ["review-to-merge:ui", 15], ["pr-open:ui", 60]])
  same(`${UNIT}: a pull request with no launch, no request and no approval gives only pr-open`, taken({ launches: [], approvedAt: null, pull: { ...pull, comments: [], reviews: [] } }), [["pr-open:ui", 60]])
  same(`${UNIT}: a request with no later review gives no review-round sample`, taken({ pull: { ...pull, reviews: [{ submittedAt: iso(5) }] } }).filter(([key]) => key.startsWith("review-round")), [])

  // The jobs of a real PR Tests run: a job that was skipped gives no sample, and a job with no `started_at` gives none.
  const withoutStart = { ...JOBS.find((job) => job.name === "Build"), name: "Never started", started_at: null }
  const ci = taken({ jobs: [...JOBS, withoutStart] }).filter(([key]) => key.startsWith("ci-"))
  const started = JOBS.filter((job) => job.conclusion !== "skipped" && job.started_at)
  same(`${UNIT}: a merge gives one ci-queue and one ci-run sample for each job that started`, [ci.filter(([key]) => key === "ci-queue:ui").length, ci.filter(([key]) => key.startsWith("ci-run:ui:")).map(([key]) => key.slice("ci-run:ui:".length))], [started.length, started.map((job) => job.name)])
  same(`${UNIT}: the queue of a job is its started_at minus its created_at, and its run is its completed_at minus its started_at`, [ci.find(([key]) => key === "ci-queue:ui")[1], ci.find(([key]) => key === "ci-run:ui:Plan")[1]], [(Date.parse(JOBS[0].started_at) - Date.parse(JOBS[0].created_at)) / MINUTE, (Date.parse(JOBS[0].completed_at) - Date.parse(JOBS[0].started_at)) / MINUTE])

  // The driver: a merge, the hourly judge, the health record and `--budgets`, each on a state directory of its own.
  const stateDir = join(root, "stage-budgets-state")
  mkdirSync(stateDir, { recursive: true })
  const messages = []
  const check = (runId) => ({ __typename: "CheckRun", databaseId: 11, name: "Unit Tests", status: "COMPLETED", conclusion: "SUCCESS", startedAt: iso(0), detailsUrl: `https://example.test/actions/runs/${runId}/job/11`, checkSuite: { app: { databaseId: 15368 } } })
  const env = { stateDir, now: () => START, slugOf: (key) => `example/${key}`, log: (line) => messages.push(line), gh: async (args) => (messages.push(args.join(" ")), JSON.stringify({ jobs: JOBS })) }
  const lines = () => readFileSync(join(stateDir, "stage-times.jsonl"), "utf8").split("\n").filter((line) => line !== "").map((line) => JSON.parse(line))
  const merged = { ...pull, number: 30, checks: [check(9001), check(9001)], reviews: [{ state: "APPROVED", author: "pullfrog", commit: "a", body: "", submittedAt: iso(55), blocking: [] }] }
  await recordMergeSamples(env, createMemory(), { repoKey: "ui", pull: merged, ticket: { comments: [] } })
  same("drive: a merge reads the jobs of each run of its checks once and writes its stage samples", [messages.filter((line) => line.endsWith("runs/9001/jobs?per_page=100")).length, lines().filter((line) => line.key === "push-to-request:ui").length, lines().filter((line) => line.key === "ci-queue:ui").length], [1, 1, JOBS.filter((job) => job.conclusion !== "skipped" && job.started_at).length])

  const judged = createMemory()
  writeFileSync(join(stateDir, "stage-times.jsonl"), samplesOf("pr-open:ui", Array(10).fill(31)).map((sample) => `${JSON.stringify(sample)}\n`).join(""))
  const untouched = { ...createMemory(), wake: judged.wake }
  messages.length = 0
  judgeStages(env, judged)
  judgeStages(env, judged)
  same("drive: a slow key writes one SLOW line, and a second judge with the same verdict writes none", messages.filter((line) => line.includes(" SLOW ")).map((line) => line.replace(/^\S+ /, "")), ["SLOW pr-open:ui: median 31 min, budget 30 min, 10 samples"])
  same("drive: the judge changes only its own two members of the memory, so it changes no plan, hold or order", isDeepStrictEqual({ ...judged, lastJudgeAt: 0, slow: null }, untouched), true)
  const problems = (record) => record.problems.filter((problem) => problem.key.startsWith("slow:")).map(({ key, since, detail, samples }) => [key, since, detail, samples.length])
  const first = healthRecord({ previous: null, now: START, read: null, merged: false, blind: [], failure: null, slow: [...judged.slow.values()] })
  same("drive: a slow key gives the problem slow:<key> with its first judge time, its detail and its 10 samples", problems(first), [["slow:pr-open:ui", iso(0), "median 31 min, budget 30 min", 10]])
  same("drive: a later record keeps the first judge time, keeps the problem before the next judge and drops it when the key is no longer slow", [problems(healthRecord({ previous: first, now: START + 5 * MINUTE, read: null, merged: false, blind: [], failure: null, slow: [...judged.slow.values()] }))[0][1], problems(healthRecord({ previous: first, now: START, read: null, merged: false, blind: [], failure: null })).length, problems(healthRecord({ previous: first, now: START, read: null, merged: false, blind: [], failure: null, slow: [] })).length], [iso(0), 1, 0])

  const printed = []
  same("drive: --budgets prints one line for each key and RESULT: FAIL for a slow key, and exits 0", [runBudgets(env, { out: (line) => printed.push(line) }), printed], [0, ["pr-open:ui: median 31 min, budget 30 min, 10 samples, SLOW", "RESULT: FAIL (pr-open:ui over budget)"]])
  same("drive: --budgets is a mode and takes no other mode", [parseArguments(["--budgets"]).mode, parseArguments(["--budgets", "--once"]).error !== undefined], ["budgets", true])
}
