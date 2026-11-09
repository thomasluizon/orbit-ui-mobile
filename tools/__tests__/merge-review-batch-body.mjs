import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { check, root, stage, T } from "./_harness.mjs"

const TOOL = "merge-review-batch-body.mjs"
const path = (name) => join(root, "merge-review-batch-body", name)
const args = (body, report, output) => ["--body-file", body, "--report-file", report, "--out", output]
const read = (name) => readFileSync(path(name), "utf8")

const markdownBlockCases = () => {
  const table = "| Check | Result |\n| --- | --- |\n| Original | Pass |"
  const fence = ["```text", "Shared paragraph.", "", "- shared item", "", table, "```"].join("\n")
  const original = stage("merge-review-batch-body/blocks-original.md", [
    "Closes #1360.", "", "## Test evidence", "", "Shared paragraph.", "",
    "- shared item", "- original item", "", table, "", fence,
  ].join("\n"))
  const report = stage("merge-review-batch-body/blocks-report.md", [
    "## Test evidence", "", "Shared   paragraph.", "", "- shared item", "", table, "",
    "Report paragraph.", "", "- report item", "- another report item", "",
    "| Check | Result |", "| --- | --- |", "| Report | Pass |", "", fence, "",
    "## Assumptions", "", "## Manual steps",
  ].join("\n"))
  check(TOOL, "merges Markdown blocks from the body and report", args(original, report, path("blocks-output.md")), { status: 0 })
  const expected = [
    "Closes #1360.", "", "## Test evidence", "", "Shared paragraph.", "",
    "- shared item", "- original item", "", table, "", fence, "",
    "Report paragraph.", "", "- report item", "- another report item", "",
    "| Check | Result |", "| --- | --- |", "| Report | Pass |", "", fence, "",
  ].join("\n")
  T(`${TOOL}: preserves exact Markdown blocks and deduplicates only ordinary entries`, read("blocks-output.md") === expected, read("blocks-output.md"))

  for (const [label, fence] of [
    ["backticks", "````markdown\n## Example\n\n```\n- shared item\n\n  indented code  \n`````"],
    ["tildes", "~~~markdown\n## Example\n\n```\n- shared item\n\n  indented code  \n~~~~"],
  ]) {
    const report = stage(`merge-review-batch-body/${label}-report.md`, [
      "## Test evidence", "", "- shared item", fence, "Paragraph after the fence.", "",
      "## Assumptions", "", "## Manual steps",
    ].join("\n"))
    const body = stage(`merge-review-batch-body/${label}-body.md`, "## Test evidence\n")
    const output = path(`${label}-output.md`)
    check(TOOL, `keeps headings and shorter or mismatched markers inside ${label} fences`, args(body, report, output), { status: 0 })
    const expected = `## Test evidence\n\n- shared item\n\n${fence}\n\nParagraph after the fence.\n`
    T(`${TOOL}: ${label} fence content remains intact and separate from adjacent blocks`, readFileSync(output, "utf8") === expected, readFileSync(output, "utf8"))
  }
}

export const cases = () => {
  markdownBlockCases()
  const parity = "## Parity\n\n- parity:no, harness only"
  const original = stage("merge-review-batch-body/original.md", `Closes #542.\n\n## Test evidence\n\n- original test\n\n## Assumptions\n\n- original choice\n\n## Manual steps\n\n- original setup\n\n${parity}\n`)
  const first = stage("merge-review-batch-body/first.md", "Commit abc\n\n## Test evidence\n\n- first test\n\n## Assumptions\n\n- first choice\n\n## Manual steps\n\n- first setup\n\n## Parity\n\n- report parity line\n")
  check(TOOL, "merges the first batch", args(original, first, path("after-first.md")), { status: 0 })
  const second = stage("merge-review-batch-body/second.md", "Commit def\n\n## Test evidence\n\n- first test\n- second test\n\n## Assumptions\n\n## Manual steps\n\n")
  check(TOOL, "merges the second batch", args(path("after-first.md"), second, path("after-second.md")), { status: 0 })
  const result = read("after-second.md")
  T(`${TOOL}: two batches preserve prior assumptions and manual steps`, result.includes("- original choice") && result.includes("- first choice") && result.includes("- original setup") && result.includes("- first setup"), result)
  T(`${TOOL}: a delta-only second batch appends test evidence once`, result.includes("- original test") && result.includes("- first test\n- second test") && result.match(/- first test/g)?.length === 1, result)
  T(`${TOOL}: a body section the report does not own stays untouched`, result.includes(`${parity}\n`) && !result.includes("report parity line"), result)
  const incomplete = stage("merge-review-batch-body/incomplete.md", "## Test evidence\n\n- only test\n\n## Assumptions\n")
  const retainedOutput = stage("merge-review-batch-body/retained.md", "existing output\n")
  check(TOOL, "rejects a report without every handoff section", args(original, incomplete, retainedOutput), { status: 1, stderr: /missing ## Manual steps in review report/ })
  T(`${TOOL}: rejection preserves an existing output file`, read("retained.md") === "existing output\n")
  check(TOOL, "rejects an incomplete report without writing a new output file", args(original, incomplete, path("incomplete-out.md")), { status: 1 })
  T(`${TOOL}: an incomplete report writes no output file`, !existsSync(path("incomplete-out.md")))
  const crlf = stage("merge-review-batch-body/crlf.md", "Commit ghi\r\n\r\n## Test evidence\r\n\r\n- crlf test\r\n\r\n## Assumptions\r\n\r\n## Manual steps")
  check(TOOL, "accepts a CRLF report whose last section is empty at end of file", args(path("after-second.md"), crlf, path("after-crlf.md")), { status: 0 })
  T(`${TOOL}: a CRLF report merges without carriage returns`, read("after-crlf.md").includes("- crlf test") && !read("after-crlf.md").includes("\r"), read("after-crlf.md"))
}
