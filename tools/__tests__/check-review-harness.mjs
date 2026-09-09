import { check, stage } from "./_harness.mjs"

const UI_CHANGE = ["apps/web/components/today/habit-row.tsx", "apps/mobile/components/today/habit-row.tsx"].join("\n")
const TOOLING_CHANGE = ["tools/arch-map.mjs", ".claude/rules/core.md"].join("\n")

const FULL_BLOCK = `## What changed

Rebuilt the Today row.

## Review harness

- interface-review: one Introduced finding on the row's press target, fixed in this diff
- better-interface (full mode): better-typography flagged the label leading; the rest clean
`

const args = (label, body, changed, base = "redesign/main") => [
  "--base",
  base,
  "--body-file",
  stage(`review-harness/${label}/body.md`, body),
  "--changed-files-file",
  stage(`review-harness/${label}/changed.txt`, `${changed}\n`),
]

export const cases = () => {
  check(
    "check-review-harness.mjs",
    "accepts a UI redesign pull request whose body states what each skill found",
    args("complete", FULL_BLOCK, UI_CHANGE),
    { status: 0, stdout: /evidence present/ },
  )

  // The red direction, and the one this gate exists for: #766, #765 and #763 all looked exactly
  // like this and merged.
  check(
    "check-review-harness.mjs",
    "rejects a UI redesign pull request with no Review harness block at all",
    args("absent", "## What changed\n\nRebuilt the Today row.\n", UI_CHANGE),
    { status: 1, stderr: /no "## Review harness" block/ },
  )

  check(
    "check-review-harness.mjs",
    "rejects a block that names only one of the two required skills",
    args("half", "## Review harness\n\n- interface-review: one Introduced finding, fixed here\n", UI_CHANGE),
    { status: 1, stderr: /no line for: better-interface/ },
  )

  check(
    "check-review-harness.mjs",
    "rejects the unfilled template, so a pasted empty block is not evidence",
    args("empty", "## Review harness\n\n- interface-review:\n- better-interface (full mode):\n", UI_CHANGE),
    { status: 1, stderr: /empty or placeholder evidence for: interface-review, better-interface/ },
  )

  check(
    "check-review-harness.mjs",
    "rejects a placeholder standing in for evidence",
    args("placeholder", "## Review harness\n\n- interface-review: TODO\n- better-interface (full mode): n/a\n", UI_CHANGE),
    { status: 1, stderr: /empty or placeholder evidence/ },
  )

  // "no findings" is a real answer. A lane that found nothing has still run, and refusing it would
  // teach authors to invent a finding.
  check(
    "check-review-harness.mjs",
    "accepts no findings as an answer",
    args("no-findings", "## Review harness\n\n- interface-review: no findings\n- better-interface (full mode): no findings\n", UI_CHANGE),
    { status: 0 },
  )

  // The two not-applicable directions. Both must pass with no block, or the gate blocks work it has
  // no opinion about.
  check(
    "check-review-harness.mjs",
    "stands aside for a pull request based on main",
    args("main-base", "## What changed\n\nHarness fix.\n", UI_CHANGE, "main"),
    { status: 0, stdout: /not applicable/ },
  )

  check(
    "check-review-harness.mjs",
    "stands aside for a redesign pull request that changes no UI file",
    args("tooling", "## What changed\n\nHarness fix.\n", TOOLING_CHANGE),
    { status: 0, stdout: /none in UI scope/ },
  )

  check(
    "check-review-harness.mjs",
    "accepts a deeper heading level for the block",
    args("deep-heading", "## Body\n\n### Review harness\n\n- interface-review: one Regression on focus order\n- better-interface: clean across all six domains\n", UI_CHANGE),
    { status: 0 },
  )

  // A same-or-higher heading closes the section, so evidence that lives under a LATER heading does
  // not count as evidence under this one.
  check(
    "check-review-harness.mjs",
    "does not read evidence from a section after the block ends",
    args(
      "section-bounded",
      "## Review harness\n\n- interface-review: one Introduced finding, fixed here\n\n## Notes\n\n- better-interface (full mode): ran it somewhere else entirely\n",
      UI_CHANGE,
    ),
    { status: 1, stderr: /no line for: better-interface/ },
  )

  check(
    "check-review-harness.mjs",
    "refuses a missing required flag",
    ["--base", "redesign/main"],
    { status: 2, stderr: /--body-file is required/ },
  )

  check(
    "check-review-harness.mjs",
    "refuses an unreadable body file",
    ["--base", "redesign/main", "--body-file", "no-such-body.md", "--changed-files-file", stage("review-harness/unreadable/changed.txt", `${UI_CHANGE}\n`)],
    { status: 2, stderr: /cannot read the pull request body/ },
  )
}
