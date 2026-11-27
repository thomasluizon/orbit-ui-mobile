/** The text output of the guard: the summary for the job page and the comment that asks the AI review. */

const REASONS = {
  chromium: "A test of the chromium project asserts layout. Coverage and mutants cannot see it.",
  "unsupported-workspace": "The guard cannot run the tests of this workspace.",
  "no-project": "No Vitest project runs this file at the base commit.",
  "changed-source-lines": "The pull request changed source lines that the lost tests covered.",
  "changed-line": "The pull request changed the lines of a mutant that a lost test killed.",
  "no-head-mutant": "The head run has no mutant that matches a mutant that a lost test killed.",
  "timeout-on-head": "A mutant that a lost test killed times out on the head in two runs.",
  "base-run-failed": "The base run of the test file failed.",
  "base-mutants-failed": "The base mutant run failed.",
  "head-mutants-failed": "The head mutant run failed.",
  budget: "The run passed its time budget.",
}

const reasonText = (reason) => REASONS[reason] ?? `A mutant ended as ${reason.replace(/^head-/, "")} on the head.`

/** The review items grouped by test file and reason, with the count and the first details. */
export const groupReview = (review) => {
  const groups = new Map()
  for (const { file, reason, detail } of review) {
    const key = `${file}\n${reason}`
    const group = groups.get(key) ?? { file, reason, count: 0, details: [] }
    group.count++
    if (detail && group.details.length < 3 && !group.details.includes(detail)) group.details.push(detail)
    groups.set(key, group)
  }
  return [...groups.values()]
}

const clip = (text) => String(text).replace(/\s+/g, " ").trim().slice(0, 240)

export const renderSummary = (result) => {
  const lines = ["## Deleted test guard", ""]
  if (result.verdict === "none") return `${lines.join("\n")}No test file loses lines. The guard ran no check.\n`
  lines.push(`Verdict: **${result.verdict}**${result.budgetExceeded ? " (the run passed its time budget)" : ""}.`, "")
  lines.push("| Test file | Project | Lost lines | Result |", "| --- | --- | --- | --- |")
  for (const test of result.lost) lines.push(`| \`${test.file}\` | ${test.project ?? "none"} | ${test.lostLines.length}${test.deleted ? " (file deleted)" : ""} | ${test.status} |`)
  lines.push("")
  if (result.failures.length > 0) {
    lines.push("### Lost tests of code that stays", "", "Port each lost assertion to a test that runs the same code.", "")
    for (const failure of result.failures) lines.push(`- \`${failure.file}:${failure.line}\`: ${clip(failure.detail)}. Lost test: ${failure.tests.map((file) => `\`${file}\``).join(", ")}.`)
    lines.push("")
  }
  const review = groupReview(result.review)
  if (review.length > 0) {
    lines.push("### For the AI review", "")
    for (const item of review) lines.push(`- \`${item.file}\`: ${reasonText(item.reason)}${item.count > 1 ? ` (${item.count} items)` : ""}${item.details.length > 0 ? ` ${item.details.map((detail) => `\`${clip(detail)}\``).join(", ")}` : ""}`)
    lines.push("")
  }
  return `${lines.join("\n")}\n`
}

/** The marker line of the comment that holds the merge until a review approves the head. */
export const guardMarker = (sha) => `<!-- deleted-test-guard:${sha} -->`

/** The comment for the review. It is empty when no item needs the review. */
export const renderComment = (result, sha) => {
  if (groupReview(result.review).length === 0) return ""
  return `${guardMarker(sha)}\n${renderSummary(result)}\nReview each item of the list "For the AI review". Confirm that each lost test is dead with its code, or that a test of the same behavior replaces it. Approve the head only when every item holds.\n`
}
