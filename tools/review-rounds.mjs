#!/usr/bin/env node
/** Freeze the review-round definition and measure it over a pull request set, fail-closed. */

import { execFileSyncHidden as execFileSync } from "./lib/subprocess-options.mjs"
import { readFileSync, writeFileSync } from "node:fs"

const USAGE = `usage: review-rounds.mjs --repo <owner/name> --pr <number|first-last> [--pr ...] [options]
       review-rounds.mjs --responses-file <path> [options]

  --repo <owner/name>       GitHub repository to read (required for a live read)
  --pr <number|first-last>  pull request number, or an inclusive range; repeat for more
  --responses-file <path>   measure a recorded capture instead of calling GitHub
  --save-responses <path>   write this live read to <path> as a re-recordable capture
  --as-of <ISO-8601>        count only submissions made AT OR BEFORE this instant
  --json                    print the machine-readable measurement
  --help, -h                print this usage and exit 0

THE FROZEN DEFINITION
  One review round is one DISTINCT HEAD COMMIT that received a review submission from
  either review bot, counted over the given pull requests. Four alternative definitions
  are printed beside it so two of them can never be merged into one figure again.

  A submission counts as a bot's because GraphQL types its author as a Bot, never
  because its login matched a string. The CI reviewer's GraphQL login is 'claude';
  'claude[bot]' is only the REST spelling, and a counter filtering on 'claude[bot]' over
  GraphQL reports 0 rounds on a pull request carrying 15 bot submissions. The per-bot
  rows accept both spellings, and a Bot login outside the known set is REFUSED rather
  than counted, so no login change can silently zero this metric.

THE SNAPSHOT
  Every measurement prints the instant it was taken, because a live pull request keeps
  accumulating reviews: four of the five figures first measured over #641-#661 had moved
  within hours. Pass --as-of to reproduce a past measurement. The cutoff is INCLUSIVE: a
  submission stamped exactly --as-of is counted.

REFUSALS (exit 3)
  A truncated review page (reviews.pageInfo.hasNextPage true) is REFUSED, never
  paginated and never counted, because a partial page silently understates every figure.
  A failed lookup, an errored or unparseable payload, a pull request that does not exist,
  a review missing the author, submittedAt or commit the count needs, and an unknown Bot
  login are all refused the same way.

exit codes: 0 measured, 2 usage error, 3 refused`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE)
  process.exit(0)
}

const QUERY =
  "query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){number reviews(first:100){pageInfo{hasNextPage}nodes{state submittedAt author{__typename login} commit{oid}}}}}}"

const CLAUDE_LOGINS = new Set(["claude", "claude[bot]"])
const CODEX_LOGINS = new Set(["chatgpt-codex-connector", "chatgpt-codex-connector[bot]"])
const isBot = (review) => review.author.__typename === "Bot"
const DEFINITIONS = [
  { key: "both-bots", label: "both bots (FROZEN)", frozen: true, keep: isBot },
  { key: "claude", label: "claude alone", frozen: false, keep: (review) => CLAUDE_LOGINS.has(review.author.login) },
  { key: "codex", label: "codex alone", frozen: false, keep: (review) => CODEX_LOGINS.has(review.author.login) },
  { key: "all-authors", label: "all authors", frozen: false, keep: () => true },
  { key: "bots-changes-requested", label: "bots, CHANGES_REQUESTED only", frozen: false, keep: (review) => isBot(review) && review.state === "CHANGES_REQUESTED" },
]

const usageError = (message) => {
  console.error(`${USAGE}\n\n${message}`)
  process.exit(2)
}
const refuse = (reasons) => {
  for (const reason of reasons) console.error(`REFUSED ${reason}`)
  process.exit(3)
}

const KNOWN_FLAGS = new Set(["--repo", "--pr", "--responses-file", "--save-responses", "--as-of", "--json", "--help", "-h"])
const argv = process.argv.slice(2)
const unknown = argv.filter((value) => value.startsWith("-") && !KNOWN_FLAGS.has(value))
if (unknown.length) usageError(`unknown option(s): ${unknown.join(" ")}`)
const valueOf = (flag) => {
  const index = argv.indexOf(flag)
  return index === -1 ? null : argv[index + 1]
}
const valuesOf = (flag) => argv.flatMap((value, index) => (value === flag && argv[index + 1] !== undefined ? [argv[index + 1]] : []))

const repo = valueOf("--repo")
const responsesFile = valueOf("--responses-file")
const saveResponses = valueOf("--save-responses")
const asOf = valueOf("--as-of")
const asJson = argv.includes("--json")

/** Numbers are enumerated by the caller, never inferred, so a gap like the absent #657 stays visible. */
const parsePullRequests = (specifications) => {
  const numbers = new Set()
  for (const specification of specifications) {
    const range = /^(\d+)-(\d+)$/.exec(specification)
    const single = /^\d+$/.test(specification)
    if (!range && !single) usageError(`--pr must be a number or a first-last range, got ${specification}`)
    const first = Number(range ? range[1] : specification)
    const last = Number(range ? range[2] : specification)
    if (last < first) usageError(`--pr range ${specification} ends before it starts`)
    for (let number = first; number <= last; number++) numbers.add(number)
  }
  return [...numbers].sort((left, right) => left - right)
}

if (responsesFile && (repo || valuesOf("--pr").length || saveResponses)) usageError("--responses-file measures a recorded capture, so it takes no --repo, --pr or --save-responses")
if (!responsesFile) {
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) usageError("--repo must be an owner/name slug")
  if (!valuesOf("--pr").length) usageError("--pr is required for a live read")
}
if (asOf !== null && !Number.isFinite(Date.parse(asOf ?? ""))) usageError("--as-of must be an ISO-8601 instant")
const cutoff = asOf === null ? null : Date.parse(asOf)

const liveEnvelope = (owner, name, number) => {
  const gh = process.env.GH_BIN || "gh"
  const args = ["api", "graphql", "-f", `query=${QUERY}`, "-F", `owner=${owner}`, "-F", `name=${name}`, "-F", `number=${number}`]
  try {
    return { raw: execFileSync(gh, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }) }
  } catch (error) {
    // gh exits non-zero on a GraphQL error but still prints the envelope, which names the cause.
    const raw = error.stdout?.toString() ?? ""
    return { raw, failure: (error.stderr?.toString() || error.message).trim() }
  }
}

const readLive = () => {
  const [owner, name] = repo.split("/")
  return parsePullRequests(valuesOf("--pr")).map((number) => {
    const { raw, failure } = liveEnvelope(owner, name, number)
    let envelope = null
    try {
      envelope = JSON.parse(raw)
    } catch {
      envelope = { unparseable: raw.slice(0, 240) }
    }
    return { number, envelope, failure: failure ?? null }
  })
}

const readRecorded = () => {
  let capture
  try {
    capture = JSON.parse(readFileSync(responsesFile, "utf8"))
  } catch (error) {
    usageError(`--responses-file could not be read as JSON: ${error.message}`)
  }
  if (capture.query !== QUERY) refuse([`${responsesFile} was recorded against a different GraphQL query; re-record it rather than editing it`])
  if (!Array.isArray(capture.responses) || capture.responses.length === 0) refuse([`${responsesFile} carries no responses array`])
  const malformed = capture.responses.filter((entry) => !Number.isInteger(entry?.number) || typeof entry?.envelope !== "object" || entry.envelope === null)
  if (malformed.length) refuse([`${responsesFile} carries ${malformed.length} response(s) with no pull request number or no envelope`])
  return { capture, responses: capture.responses }
}

/** Every field the count needs, checked on the payload rather than assumed. */
const reviewProblem = (review) => {
  if (!review.author || typeof review.author.login !== "string" || typeof review.author.__typename !== "string") return "a review has no author"
  if (typeof review.submittedAt !== "string") return `a ${review.author.login} review has no submittedAt`
  if (!review.commit || typeof review.commit.oid !== "string") return `a ${review.author.login} review has no commit`
  if (isBot(review) && !CLAUDE_LOGINS.has(review.author.login) && !CODEX_LOGINS.has(review.author.login)) return `unknown Bot login ${review.author.login}; a review-bot login changed, so the frozen definition must be re-confirmed before it is trusted`
  return null
}

/** The one refusal a truncated page needs, plus every payload shape the count depends on. */
const pageProblem = (envelope, failure) => {
  if (envelope.unparseable !== undefined) return `lookup returned unparseable output: ${envelope.unparseable || "empty output"}`
  if (Array.isArray(envelope.errors) && envelope.errors.length) return envelope.errors.map((entry) => entry.message).join("; ")
  if (failure) return `lookup failed: ${failure}`
  const pullRequest = envelope.data?.repository?.pullRequest
  if (!pullRequest) return "lookup returned no pull request"
  if (pullRequest.reviews?.pageInfo?.hasNextPage !== false) return "the review page is truncated (hasNextPage is not false); every figure over it would be understated"
  if (!Array.isArray(pullRequest.reviews.nodes)) return "the review page carries no nodes array"
  return null
}

const pullRequestReviews = (number, envelope, failure, refusals) => {
  const where = `pull request ${number}`
  const problem = pageProblem(envelope, failure)
  if (problem) {
    refusals.push(`${where}: ${problem}`)
    return null
  }
  const pullRequest = envelope.data.repository.pullRequest
  for (const review of pullRequest.reviews.nodes) {
    const reviewFault = reviewProblem(review)
    if (reviewFault) refusals.push(`${where}: ${reviewFault}`)
  }
  return { number: pullRequest.number ?? number, nodes: pullRequest.reviews.nodes }
}

const refusals = []
const recorded = responsesFile ? readRecorded() : null
const envelopes = responsesFile
  ? recorded.responses.map((entry) => ({ number: entry.number, envelope: entry.envelope, failure: null }))
  : readLive()
const snapshotAt = new Date().toISOString()
// Recorded BEFORE the refusal check, so a read that refuses is still capturable as a fixture.
if (saveResponses) {
  writeFileSync(
    saveResponses,
    `${JSON.stringify({ capturedAt: snapshotAt, repo, query: QUERY, responses: envelopes.map((entry) => ({ number: entry.number, envelope: entry.envelope })) }, null, 1)}\n`,
  )
}
const measured = envelopes
  .map((entry) => pullRequestReviews(entry.number, entry.envelope, entry.failure, refusals))
  .filter(Boolean)
if (refusals.length) refuse(refusals)

const inWindow = (review) => cutoff === null || Date.parse(review.submittedAt) <= cutoff
const counts = (keep) => measured.map((pullRequest) => new Set(pullRequest.nodes.filter((review) => keep(review) && inWindow(review)).map((review) => review.commit.oid)).size)
const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const statistics = (keep) => {
  const perPullRequest = counts(keep)
  const total = perPullRequest.reduce((sum, value) => sum + value, 0)
  return {
    mean: total / perPullRequest.length,
    median: median(perPullRequest),
    worst: Math.max(...perPullRequest),
    aboveTwoPercent: (perPullRequest.filter((value) => value > 2).length / perPullRequest.length) * 100,
    counts: Object.fromEntries(measured.map((pullRequest, index) => [pullRequest.number, perPullRequest[index]])),
  }
}

const definitions = DEFINITIONS.map((definition) => ({ key: definition.key, label: definition.label, frozen: definition.frozen, ...statistics(definition.keep) }))
const frozenDefinition = DEFINITIONS[0]
const frozen = measured.map((pullRequest) => {
  const submissions = pullRequest.nodes.filter((review) => frozenDefinition.keep(review) && inWindow(review))
  return { number: pullRequest.number, rounds: new Set(submissions.map((review) => review.commit.oid)).size, submissions: submissions.length }
})
const authorTally = new Map()
for (const pullRequest of measured) {
  for (const review of pullRequest.nodes.filter(inWindow)) {
    const key = `${review.author.__typename}:${review.author.login}`
    authorTally.set(key, (authorTally.get(key) ?? 0) + 1)
  }
}
const authorsSeen = [...authorTally.entries()].sort((left, right) => right[1] - left[1]).map(([key, submissions]) => ({ typename: key.split(":")[0], login: key.slice(key.indexOf(":") + 1), submissions }))

const source = responsesFile ? recorded.capture.repo : repo
const numbers = measured.map((pullRequest) => pullRequest.number)
const compactRange = (values) => {
  const spans = []
  for (const value of values) {
    const last = spans.at(-1)
    if (last && value === last[1] + 1) last[1] = value
    else spans.push([value, value])
  }
  return spans.map(([first, final]) => (first === final ? `#${first}` : `#${first}-#${final}`)).join(",")
}
const number2 = (value) => value.toFixed(2)
const plain = (value) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

if (asJson) {
  console.log(JSON.stringify({
    repo: source,
    pullRequests: numbers,
    snapshotAt,
    asOf: asOf ?? null,
    recordedFrom: responsesFile ? recorded.capture.capturedAt : null,
    authorsSeen,
    definitions: definitions.map((definition) => ({ ...definition, mean: Number(definition.mean.toFixed(4)), aboveTwoPercent: Number(definition.aboveTwoPercent.toFixed(4)) })),
    frozen,
  }, null, 2))
} else {
  console.log(`review rounds  ${source}  ${compactRange(numbers)}  (${numbers.length} pull request${numbers.length === 1 ? "" : "s"})`)
  console.log(`snapshot ${snapshotAt}   cutoff ${asOf ?? "none"}${responsesFile ? `   recorded ${recorded.capture.capturedAt}` : ""}`)
  console.log(`authors ${authorsSeen.map((author) => `${author.typename}:${author.login} ${author.submissions}`).join(", ")}`)
  console.log("")
  console.log("definition                      mean  median  worst  above two")
  for (const definition of definitions) {
    console.log(`${definition.label.padEnd(30)}  ${number2(definition.mean).padStart(4)}  ${plain(definition.median).padStart(6)}  ${String(definition.worst).padStart(5)}  ${`${plain(definition.aboveTwoPercent)}%`.padStart(9)}`)
  }
  console.log("")
  console.log("per pull request, frozen definition")
  for (const entry of frozen) console.log(`#${entry.number}  ${entry.rounds} round${entry.rounds === 1 ? "" : "s"} from ${entry.submissions} submission${entry.submissions === 1 ? "" : "s"}`)
}
process.exit(0)
