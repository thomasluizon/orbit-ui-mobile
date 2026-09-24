import { readFileSync } from "node:fs"
import { join } from "node:path"
import { check, root, stage, T } from "./_harness.mjs"

const TOOL = "merge-review-batch-body.mjs"
const path = (name) => join(root, "merge-review-batch-body", name)
const args = (body, report, output, ui = false) => ["--body-file", body, "--report-file", report, "--out", output, ...(ui ? ["--ui-scope"] : [])]
const read = (name) => readFileSync(path(name), "utf8")

export const cases = () => {
  const original = stage("merge-review-batch-body/original.md", "Closes #542.\n\n## Test evidence\n\n- original test\n\n## Assumptions\n\n- original choice\n\n## Manual steps\n\n- original setup\n\n## Review harness\n\n- gates lane: no findings\n")
  const first = stage("merge-review-batch-body/first.md", "Commit abc\n\n## Test evidence\n\n- first test\n\n## Assumptions\n\n- first choice\n\n## Manual steps\n\n- first setup\n\n## Review harness\n\n- gates lane: first finding\n")
  check(TOOL, "merges the first batch", args(original, first, path("after-first.md"), true), { status: 0 })
  const second = stage("merge-review-batch-body/second.md", "Commit def\n\n## Test evidence\n\n- first test\n- second test\n\n## Assumptions\n\n## Manual steps\n\n")
  check(TOOL, "merges the second batch", args(path("after-first.md"), second, path("after-second.md")), { status: 0 })
  const result = read("after-second.md")
  T(`${TOOL}: two batches preserve prior assumptions and manual steps`, result.includes("- original choice") && result.includes("- first choice") && result.includes("- original setup") && result.includes("- first setup"), result)
  T(`${TOOL}: a delta-only second batch appends test evidence once`, result.includes("- original test") && result.includes("- first test\n- second test") && result.match(/- first test/g)?.length === 1, result)
  T(`${TOOL}: a non-UI second batch preserves the prior review harness`, result.includes("- gates lane: first finding"), result)
  const uiReport = stage("merge-review-batch-body/ui.md", "## Test evidence\n\n## Assumptions\n\n## Manual steps\n\n## Review harness\n\n- gates lane: second finding\n")
  check(TOOL, "replaces UI evidence only for a UI batch", args(path("after-second.md"), uiReport, path("after-ui.md"), true), { status: 0 })
  T(`${TOOL}: UI batch replaces stale review evidence`, read("after-ui.md").includes("- gates lane: second finding") && !read("after-ui.md").includes("- gates lane: first finding"))
  check(TOOL, "rejects missing UI evidence", args(original, second, path("invalid.md"), true), { status: 1, stderr: /Review harness/ })
}
