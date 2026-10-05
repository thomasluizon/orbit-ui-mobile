import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { check, root, stage, T } from "./_harness.mjs"
import { renderReviewEvidenceBlock } from "../lib/review-harness.mjs"

const TOOL = "merge-review-batch-body.mjs"
const path = (name) => join(root, "merge-review-batch-body", name)
const args = (body, report, output, ui = false) => ["--body-file", body, "--report-file", report, "--out", output, ...(ui ? ["--ui-scope"] : [])]
const read = (name) => readFileSync(path(name), "utf8")
const completeBlock = renderReviewEvidenceBlock().replaceAll(/: <[^\n]+>/g, ": no findings")
const reportWithBlock = (block) => `## Test evidence\n\n## Assumptions\n\n## Manual steps\n\n${block}\n`

export const cases = () => {
  const original = stage("merge-review-batch-body/original.md", "Closes #542.\n\n## Test evidence\n\n- original test\n\n## Assumptions\n\n- original choice\n\n## Manual steps\n\n- original setup\n\n## Review harness\n\n- gates lane: no findings\n")
  const firstBlock = completeBlock.replace("- gates lane: no findings", "- gates lane: first finding")
  const first = stage("merge-review-batch-body/first.md", `Commit abc\n\n## Test evidence\n\n- first test\n\n## Assumptions\n\n- first choice\n\n## Manual steps\n\n- first setup\n\n${firstBlock}\n`)
  check(TOOL, "merges the first batch", args(original, first, path("after-first.md"), true), { status: 0 })
  const second = stage("merge-review-batch-body/second.md", "Commit def\n\n## Test evidence\n\n- first test\n- second test\n\n## Assumptions\n\n## Manual steps\n\n")
  check(TOOL, "merges the second batch", args(path("after-first.md"), second, path("after-second.md")), { status: 0 })
  const result = read("after-second.md")
  T(`${TOOL}: two batches preserve prior assumptions and manual steps`, result.includes("- original choice") && result.includes("- first choice") && result.includes("- original setup") && result.includes("- first setup"), result)
  T(`${TOOL}: a delta-only second batch appends test evidence once`, result.includes("- original test") && result.includes("- first test\n- second test") && result.match(/- first test/g)?.length === 1, result)
  T(`${TOOL}: a non-UI second batch preserves the prior review harness`, result.endsWith(`${firstBlock}\n`), result)
  const uiBlock = completeBlock.replace("- gates lane: no findings", "- gates lane: second finding").replace("- motion lane: no findings", "- motion lane: not applicable: no changed animation")
  const uiReport = stage("merge-review-batch-body/ui.md", reportWithBlock(uiBlock))
  check(TOOL, "replaces UI evidence only for a UI batch", args(path("after-second.md"), uiReport, path("after-ui.md"), true), { status: 0 })
  T(`${TOOL}: UI batch replaces stale review evidence`, read("after-ui.md").endsWith(`${uiBlock}\n`) && !read("after-ui.md").includes("- gates lane: first finding"))
  check(TOOL, "rejects missing UI evidence", args(original, second, path("invalid.md"), true), { status: 1, stderr: /Review harness/ })
  const oneLine = stage("merge-review-batch-body/one-line.md", reportWithBlock("## Review harness\n\n- execution lane: PASS, no findings."))
  check(TOOL, "rejects execution-only evidence and names all six missing entries", args(original, oneLine, path("one-line-out.md"), true), {
    status: 1,
    stderr: /no line for: motion lane, gates lane, interface-review, better-interface, design-reviewer, completeness-critic/,
  })
  T(`${TOOL}: incomplete evidence writes no output file`, !existsSync(path("one-line-out.md")))
  const invalidBlocks = [
    ["placeholder", completeBlock.replace("- execution lane: no findings", "- execution lane: TBD"), /empty or placeholder evidence for: execution lane/],
    ["template", renderReviewEvidenceBlock(), /empty or placeholder evidence for: execution lane, motion lane, gates lane, interface-review, better-interface, design-reviewer, completeness-critic/],
    ["invalid-motion", completeBlock.replace("- motion lane: no findings", "- motion lane: not applicable: skipped animation"), /invalid not-applicable statement for: motion lane/],
    ["invalid-execution", completeBlock.replace("- execution lane: no findings", "- execution lane: not applicable: no changed animation"), /invalid not-applicable statement for: execution lane/],
    ["section-boundary", completeBlock.replace("- gates lane: no findings", "# Other evidence\n\n- gates lane: no findings"), /no line for: gates lane, interface-review, better-interface, design-reviewer, completeness-critic/],
  ]
  for (const [label, block, stderr] of invalidBlocks) {
    const report = stage(`merge-review-batch-body/${label}.md`, reportWithBlock(block))
    check(TOOL, `rejects ${label} evidence`, args(original, report, path(`${label}-out.md`), true), { status: 1, stderr })
    T(`${TOOL}: ${label} evidence writes no output file`, !existsSync(path(`${label}-out.md`)))
  }
  const retainedOutput = stage("merge-review-batch-body/retained.md", "existing output\n")
  check(TOOL, "rejects incomplete evidence without overwriting existing output", args(original, oneLine, retainedOutput, true), { status: 1 })
  T(`${TOOL}: rejection preserves an existing output file`, read("retained.md") === "existing output\n")
  check(TOOL, "ignores an incomplete incoming harness without UI scope", args(path("after-ui.md"), oneLine, path("non-ui.md")), { status: 0 })
  T(`${TOOL}: non-UI merge preserves the complete prior block untouched`, read("non-ui.md").endsWith(`${uiBlock}\n`))
  const crlf = stage("merge-review-batch-body/crlf.md", "Commit ghi\r\n\r\n## Test evidence\r\n\r\n- crlf test\r\n\r\n## Assumptions\r\n\r\n## Manual steps")
  check(TOOL, "accepts a CRLF report whose last section is empty at end of file", args(path("after-second.md"), crlf, path("after-crlf.md")), { status: 0 })
  T(`${TOOL}: a CRLF report merges without carriage returns`, read("after-crlf.md").includes("- crlf test") && !read("after-crlf.md").includes("\r"), read("after-crlf.md"))
}
