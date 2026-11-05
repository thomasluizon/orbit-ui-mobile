import { check, stage, stageRepo } from "./_harness.mjs"

const TOOL = "check-attribution.mjs"

/** Built from parts, so this source file never holds an attribution line of its own. */
const TRAILER = ["Co", "Authored", "By: Claude Opus 5.5 <noreply@anthropic.com>"].join("-")
const GENERATED = `\u{1F916} ${["Generated", "with"].join(" ")} [Claude Code](https://claude.com/claude-code)`

/**
 * Commits through `git commit-tree`, which runs no hook, so a local commit-msg hook that strips
 * trailers cannot clean the fixture before the guard reads it.
 */
const commitRange = (label, messages) => {
  const repo = stageRepo(`check-attribution-${label}`)
  const base = repo.git(["rev-parse", "HEAD"]).stdout.trim()
  let head = base
  for (const message of messages) {
    head = repo.git(["commit-tree", `${head}^{tree}`, "-p", head, "-m", message]).stdout.trim()
  }
  return { root: repo.path, range: `${base}..${head}` }
}

let bodyFiles = 0
const guard = (fixture, body) => [
  "--root", fixture.root, "--range", fixture.range,
  ...(body === undefined ? [] : ["--body-file", stage(`check-attribution/body-${++bodyFiles}.md`, body)]),
]

export const cases = () => {
  const clean = commitRange("clean", [
    "feat(tools): add the attribution guard\n\nThe guard refuses a co-author trailer and a generated-with line.",
    "docs: state the rule\n\nNever add a `Co-Authored-By:` trailer or a \"Generated with\" line to a commit.",
  ])
  check(TOOL, "clean commits and a body that names the rule pass", guard(clean, "## Summary\n\nThe guard refuses a `Co-Authored-By:` trailer and a \"Generated with\" line.\n"), { status: 0, stdout: /Attribution guard passed/ })
  check(TOOL, "clean commits pass without a body", guard(clean), { status: 0 })

  const trailer = commitRange("trailer", ["feat: one", `fix: two\n\nBody text.\n\n${TRAILER}`])
  check(TOOL, "a co-author trailer in any commit fails and names the commit line", guard(trailer, "clean body\n"),
    { status: 1, stderr: /commit [0-9a-f]{12} line 5: a co-author trailer: Co-Authored-By: Claude/ })
  const lowercase = commitRange("lowercase", [`fix: three\n\n${TRAILER.toLowerCase()}`])
  check(TOOL, "a trailer in lower case fails", guard(lowercase), { status: 1, stderr: /a co-author trailer/ })
  const generated = commitRange("generated", [`feat: four\n\n${GENERATED}`])
  check(TOOL, "a generated-with line after an emoji fails", guard(generated), { status: 1, stderr: /a generated-with line/ })

  check(TOOL, "a co-author trailer in the pull request body fails", guard(clean, `## Summary\n\nWork.\n\n${TRAILER}\n`),
    { status: 1, stderr: /pull request body line 5: a co-author trailer/ })
  check(TOOL, "a generated-with line in the pull request body fails", guard(clean, `Work.\n\n${GENERATED}\n`),
    { status: 1, stderr: /pull request body line 3: a generated-with line/ })

  check(TOOL, "a missing range is a usage error", ["--root", clean.root], { status: 2, stderr: /--range is required/ })
  check(TOOL, "a symmetric range is a usage error", ["--root", clean.root, "--range", "main...HEAD"], { status: 2, stderr: /--range must be/ })
  check(TOOL, "a range git cannot read is a usage error", ["--root", clean.root, "--range", "missing..HEAD"], { status: 2, stderr: /git log missing\.\.HEAD failed/ })
  check(TOOL, "an unreadable body file is a usage error", [...guard(clean), "--body-file", `${clean.root}/absent.md`], { status: 2, stderr: /could not read --body-file/ })
}
