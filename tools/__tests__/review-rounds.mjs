import { readFileSync } from "node:fs"
import { join } from "node:path"

import { REPO_ROOT, T, root, stage, run } from "./_harness.mjs"

const RECORDED = join(REPO_ROOT, "tools", "__fixtures__", "review-rounds-ui-641-661.json")
const NOT_FOUND = join(REPO_ROOT, "tools", "__fixtures__", "review-rounds-not-found-657.json")

/**
 * The snapshot the section F table was measured at. ABSOLUTE, never derived from the fixture
 * or from now(): the whole point of a cutoff is that moving it moves the numbers, so a cutoff
 * that follows the data would let the table agree with whatever the fixture happens to hold.
 * Every #641-#661 pull request was still open and still accumulating reviews when the table was
 * first measured, and four of its five rows had already moved hours later.
 */
const CUTOFF = "2026-07-30T19:48:32Z"

/**
 * The frozen table, pinned. Not a tolerance and not a recomputation: these are the figures
 * section I records, and a change in the counting rule must turn this red rather than rewrite
 * the record. `aboveTwo` is the percentage of the 20 pull requests needing more than two rounds.
 */
const FROZEN_TABLE = {
  "both-bots": { mean: 5.5, median: 5, worst: 13, aboveTwoPercent: 70 },
  claude: { mean: 4.6, median: 4, worst: 12, aboveTwoPercent: 70 },
  codex: { mean: 3.1, median: 2, worst: 10, aboveTwoPercent: 45 },
  "all-authors": { mean: 6.2, median: 6, worst: 14, aboveTwoPercent: 70 },
  "bots-changes-requested": { mean: 2.15, median: 2, worst: 6, aboveTwoPercent: 45 },
}

/** No gh on PATH under any name the tool would reach for, so a stray live call cannot pass. */
const HERMETIC = { GH_BIN: join(root, "no-such-gh-binary") }

const rounds = (argv) => run("review-rounds.mjs", argv, { env: HERMETIC })

/**
 * Derived fixtures are MUTATIONS OF THE RECORDED CAPTURE, never hand-written payloads: a
 * hand-written one proves only that the tool agrees with the author's idea of the response
 * shape. The mutation is the single field under test and nothing else.
 */
const derive = (label, mutate) => {
  const capture = JSON.parse(readFileSync(RECORDED, "utf8"))
  mutate(capture)
  return stage(`review-rounds/${label}.json`, JSON.stringify(capture))
}

const cases = () => {
  const recordedText = readFileSync(RECORDED, "utf8")
  const capture = JSON.parse(recordedText)
  T(
    "review-rounds.mjs: the recorded capture is a real GraphQL envelope set, not a hand-written stub",
    capture.responses.length === 20 &&
      capture.responses.every((entry) => entry.envelope.data?.repository?.pullRequest?.reviews?.pageInfo?.hasNextPage === false) &&
      capture.responses.every((entry) => entry.envelope.data.repository.pullRequest.reviews.nodes.every((review) => typeof review.commit?.oid === "string" && typeof review.submittedAt === "string")),
    "tools/__fixtures__/review-rounds-ui-641-661.json lost the shape only the real API returns; re-record it with --save-responses rather than editing it",
  )
  /**
   * THE TRAP, asserted on the recorded payload itself. GraphQL types the CI reviewer's author as
   * a Bot whose login is `claude`; `claude[bot]` is the REST spelling and appears NOWHERE here.
   * A counter written against the REST spelling reports 0 rounds over a capture holding 136 of
   * its submissions, and a plausible zero would ship.
   */
  T(
    "review-rounds.mjs: the recorded capture proves the GraphQL login is claude, never claude[bot]",
    !recordedText.includes("claude[bot]") &&
      capture.responses.some((entry) => entry.envelope.data.repository.pullRequest.reviews.nodes.some((review) => review.author.login === "claude" && review.author.__typename === "Bot")),
    "the recorded capture no longer contains a Bot author with the login claude, so the trap case proves nothing",
  )

  const table = rounds(["--responses-file", RECORDED, "--as-of", CUTOFF, "--json"])
  const measured = table.status === 0 ? JSON.parse(table.stdout) : null
  T(
    "review-rounds.mjs: the recorded capture at the recorded cutoff reproduces the frozen table exactly",
    measured !== null &&
      measured.pullRequests.length === 20 &&
      measured.definitions.length === 5 &&
      measured.definitions.every((definition) => {
        const expected = FROZEN_TABLE[definition.key]
        return expected && definition.mean === expected.mean && definition.median === expected.median && definition.worst === expected.worst && definition.aboveTwoPercent === expected.aboveTwoPercent
      }),
    `exit ${table.status}\n     ${(table.stderr || table.stdout).trim().split("\n").slice(0, 8).join("\n     ")}`,
  )
  T(
    "review-rounds.mjs: the frozen definition is the first row and is the only one marked frozen",
    measured !== null && measured.definitions[0].key === "both-bots" && measured.definitions.filter((definition) => definition.frozen).length === 1,
    JSON.stringify(measured?.definitions.map((definition) => [definition.key, definition.frozen]) ?? null),
  )
  T(
    "review-rounds.mjs: every measurement carries the snapshot instant and the cutoff that produced it",
    measured !== null && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(measured.snapshotAt) && measured.asOf === CUTOFF && measured.recordedFrom === capture.capturedAt,
    JSON.stringify({ snapshotAt: measured?.snapshotAt, asOf: measured?.asOf, recordedFrom: measured?.recordedFrom }),
  )
  T(
    "review-rounds.mjs: the per-pull-request rounds and submissions are reported, not just the aggregate",
    measured !== null &&
      measured.frozen.find((entry) => entry.number === 653)?.rounds === 13 &&
      measured.frozen.find((entry) => entry.number === 653)?.submissions === 21 &&
      measured.frozen.find((entry) => entry.number === 642)?.rounds === 1,
    JSON.stringify(measured?.frozen.slice(0, 4) ?? null),
  )

  /**
   * The cutoff has to MOVE the numbers or it is decoration. Dropping it admits the four bot
   * submissions stamped after CUTOFF that the recorded capture still holds, and the frozen mean
   * goes 5.50 to 5.60. Both figures are pinned, so a cutoff that stopped filtering fails here.
   */
  const uncut = rounds(["--responses-file", RECORDED, "--json"])
  const uncutTable = uncut.status === 0 ? JSON.parse(uncut.stdout) : null
  T(
    "review-rounds.mjs: dropping the cutoff counts the later submissions the capture still holds",
    uncutTable !== null && uncutTable.asOf === null && uncutTable.definitions[0].mean === 5.6 && uncutTable.definitions[1].mean === 4.7,
    `exit ${uncut.status}\n     ${JSON.stringify(uncutTable?.definitions.map((definition) => [definition.key, definition.mean]) ?? null)}`,
  )

  /**
   * The case that stops a login change zeroing the metric: a capture whose ONLY bot submissions
   * carry the login `claude` must produce a non-zero frozen count. The frozen definition resolves
   * a bot by __typename, so this holds without any login string on the counting path.
   */
  const claudeOnly = derive("claude-only", (fixture) => {
    for (const entry of fixture.responses) {
      const reviews = entry.envelope.data.repository.pullRequest.reviews
      reviews.nodes = reviews.nodes.filter((review) => review.author.login === "claude")
    }
  })
  const claudeResult = rounds(["--responses-file", claudeOnly, "--as-of", CUTOFF, "--json"])
  const claudeTable = claudeResult.status === 0 ? JSON.parse(claudeResult.stdout) : null
  T(
    "review-rounds.mjs: a capture whose only bot login is claude yields a NON-ZERO frozen count",
    claudeTable !== null &&
      claudeTable.definitions[0].mean === 4.6 &&
      claudeTable.definitions[0].worst === 12 &&
      claudeTable.authorsSeen.every((author) => author.login === "claude") &&
      claudeTable.authorsSeen[0].submissions > 0,
    `exit ${claudeResult.status}\n     ${(claudeResult.stderr || claudeResult.stdout).trim().split("\n").slice(0, 6).join("\n     ")}`,
  )

  /** A page the API said it truncated is refused, never paginated and never counted. */
  const truncated = derive("truncated", (fixture) => {
    fixture.responses[0].envelope.data.repository.pullRequest.reviews.pageInfo.hasNextPage = true
  })
  const truncatedResult = rounds(["--responses-file", truncated, "--as-of", CUTOFF])
  T(
    "review-rounds.mjs: a truncated review page is refused rather than counted",
    truncatedResult.status === 3 && /REFUSED pull request 641: the review page is truncated/.test(truncatedResult.stderr) && truncatedResult.stdout === "",
    `exit ${truncatedResult.status}\n     ${(truncatedResult.stderr || truncatedResult.stdout).trim()}`,
  )

  /** The real 404 envelope, captured from the live API: #641-#661 has no #657. */
  const notFound = rounds(["--responses-file", NOT_FOUND])
  T(
    "review-rounds.mjs: a pull request lookup failure refuses rather than guessing",
    notFound.status === 3 && /REFUSED pull request 657: Could not resolve to a PullRequest/.test(notFound.stderr) && notFound.stdout === "",
    `exit ${notFound.status}\n     ${(notFound.stderr || notFound.stdout).trim()}`,
  )

  /** A field the count depends on is absent, which is what a hand-written fixture cannot prove. */
  const noCommit = derive("no-commit", (fixture) => {
    delete fixture.responses[2].envelope.data.repository.pullRequest.reviews.nodes[0].commit
  })
  const noCommitResult = rounds(["--responses-file", noCommit, "--as-of", CUTOFF])
  T(
    "review-rounds.mjs: a review with no commit is refused rather than dropped from the count",
    noCommitResult.status === 3 && /REFUSED pull request 643: a \S+ review has no commit/.test(noCommitResult.stderr),
    `exit ${noCommitResult.status}\n     ${(noCommitResult.stderr || noCommitResult.stdout).trim()}`,
  )

  /** The login-change alarm: a Bot nobody has confirmed must stop the run, not join the total. */
  const renamedBot = derive("renamed-bot", (fixture) => {
    fixture.responses[0].envelope.data.repository.pullRequest.reviews.nodes.find((review) => review.author.login === "claude").author.login = "claude-code[bot]"
  })
  const renamedResult = rounds(["--responses-file", renamedBot, "--as-of", CUTOFF])
  T(
    "review-rounds.mjs: an unknown Bot login is refused so a rename cannot pass unnoticed",
    renamedResult.status === 3 && /unknown Bot login claude-code\[bot\]/.test(renamedResult.stderr),
    `exit ${renamedResult.status}\n     ${(renamedResult.stderr || renamedResult.stdout).trim()}`,
  )

  /** A capture recorded against a different query no longer proves what its numbers claim. */
  const staleQuery = derive("stale-query", (fixture) => {
    fixture.query = fixture.query.replace("submittedAt ", "")
  })
  const staleResult = rounds(["--responses-file", staleQuery, "--as-of", CUTOFF])
  T(
    "review-rounds.mjs: a capture recorded against a different query is refused as stale",
    staleResult.status === 3 && /recorded against a different GraphQL query/.test(staleResult.stderr),
    `exit ${staleResult.status}\n     ${(staleResult.stderr || staleResult.stdout).trim()}`,
  )

  /** A capture truncated on disk must refuse, never measure the responses that survived. */
  const halfWritten = derive("half-written", (fixture) => {
    delete fixture.responses[7].envelope
  })
  const halfWrittenResult = rounds(["--responses-file", halfWritten, "--as-of", CUTOFF])
  T(
    "review-rounds.mjs: a capture with a response that lost its envelope is refused",
    halfWrittenResult.status === 3 && /carries 1 response\(s\) with no pull request number or no envelope/.test(halfWrittenResult.stderr),
    `exit ${halfWrittenResult.status}\n     ${(halfWrittenResult.stderr || halfWrittenResult.stdout).trim()}`,
  )

  const mixedSource = rounds(["--responses-file", RECORDED, "--repo", "thomasluizon/orbit-ui-mobile", "--pr", "641"])
  T(
    "review-rounds.mjs: a recorded capture combined with a live read is a usage error",
    mixedSource.status === 2 && /--responses-file measures a recorded capture/.test(mixedSource.stderr) && mixedSource.stdout === "",
    `exit ${mixedSource.status}\n     ${(mixedSource.stderr || mixedSource.stdout).trim().split("\n").at(-1)}`,
  )
  const badCutoff = rounds(["--responses-file", RECORDED, "--as-of", "yesterday"])
  T(
    "review-rounds.mjs: a cutoff that is not an instant is refused before any counting",
    badCutoff.status === 2 && /--as-of must be an ISO-8601 instant/.test(badCutoff.stderr),
    `exit ${badCutoff.status}\n     ${(badCutoff.stderr || badCutoff.stdout).trim().split("\n").at(-1)}`,
  )
  const backwardsRange = rounds(["--repo", "thomasluizon/orbit-ui-mobile", "--pr", "661-641"])
  T(
    "review-rounds.mjs: a range that ends before it starts is refused rather than measuring nothing",
    backwardsRange.status === 2 && /--pr range 661-641 ends before it starts/.test(backwardsRange.stderr),
    `exit ${backwardsRange.status}\n     ${(backwardsRange.stderr || backwardsRange.stdout).trim().split("\n").at(-1)}`,
  )

  const help = rounds(["--help"])
  T(
    "review-rounds.mjs: --help states the frozen definition, the login trap, the refusals and every exit code",
    help.status === 0 &&
      /DISTINCT HEAD COMMIT that received a review submission from/.test(help.stdout) &&
      /claude\[bot\]' is only the REST spelling/.test(help.stdout) &&
      /hasNextPage true\) is REFUSED, never/.test(help.stdout) &&
      /exit codes: 0 measured, 2 usage error, 3 refused/.test(help.stdout),
    help.stdout.trim().slice(0, 400),
  )
}

export { cases }
