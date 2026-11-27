#!/usr/bin/env node

import { writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { parseArgs } from "node:util"
import { fileURLToPath } from "node:url"
import { DEFAULT_BUDGET_MS, planLostTests, runGuard } from "./lib/deleted-test-guard/guard.mjs"
import { renderComment, renderSummary } from "./lib/deleted-test-guard/report.mjs"

const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const USAGE = `usage: deleted-test-guard.mjs --base <commit> [--head <commit>] [--plan] [--budget-minutes <n>]
                              [--repo <dir>] [--summary-file <file>] [--comment-file <file> --comment-sha <sha>] [--json-file <file>]

  Proves that a pull request loses no test of code that stays. For each test file that loses lines it checks, on the head,
  that the covered source lines keep coverage and that each mutant that the lost tests killed on the base is still killed.
  Run it in a throwaway checkout of the head: StrykerJS changes the files in place and restores them.

  --base <commit>        the base commit (for a pull request run: HEAD^1)
  --head <commit>        the head commit, default HEAD. The working tree must hold this commit.
  --repo <dir>           the checkout to check, default the repository of this tool
  --plan                 print "deleted-test-guard=true|false" for GITHUB_OUTPUT and stop. It reads git only.
  --budget-minutes <n>   stop after n minutes and send every lost test to the AI review, default 10
  --summary-file <file>  write the Markdown summary
  --comment-file <file>  write the review comment when an item needs the AI review (needs --comment-sha)
  --comment-sha <sha>    the head sha of the pull request, for the marker line of the comment
  --json-file <file>     write the result as JSON
  --help, -h             print this usage and exit 0

exit codes: 0 no lost test, or every lost test is proven or goes to the AI review; 1 a lost test of code that stays; 2 invalid input`

let options
try {
  ({ values: options } = parseArgs({
    options: {
      base: { type: "string" }, repo: { type: "string" }, head: { type: "string", default: "HEAD" }, plan: { type: "boolean" },
      "budget-minutes": { type: "string" }, "summary-file": { type: "string" }, "comment-file": { type: "string" },
      "comment-sha": { type: "string" }, "json-file": { type: "string" }, help: { type: "boolean", short: "h" },
    },
  }))
} catch (error) {
  console.error(`deleted-test-guard: ${error.message}\n\n${USAGE}`)
  process.exit(2)
}
if (options.help) {
  console.log(USAGE)
  process.exit(0)
}
const budgetMinutes = options["budget-minutes"] === undefined ? DEFAULT_BUDGET_MS / 60000 : Number(options["budget-minutes"])
if (!options.base || !(budgetMinutes > 0) || (options["comment-file"] && !/^[0-9a-f]{40}$/.test(options["comment-sha"] ?? ""))) {
  console.error(`deleted-test-guard: --base is required, the budget must be positive, and --comment-file needs a 40 character --comment-sha\n\n${USAGE}`)
  process.exit(2)
}

const REPO_ROOT = options.repo === undefined ? TOOL_ROOT : resolve(options.repo)
if (options.plan) {
  const lost = planLostTests(REPO_ROOT, options.base, options.head)
  for (const test of lost) console.error(`lost: ${test.file} (${test.lostLines.length} line(s))`)
  console.log(`deleted-test-guard=${lost.length > 0}`)
  process.exit(0)
}

const result = await runGuard({ repo: REPO_ROOT, base: options.base, head: options.head, budgetMs: budgetMinutes * 60000, log: (line) => console.error(`deleted-test-guard: ${line}`) })
const summary = renderSummary(result)
console.log(summary)
if (options["summary-file"]) writeFileSync(options["summary-file"], summary)
if (options["comment-file"]) writeFileSync(options["comment-file"], renderComment(result, options["comment-sha"]))
if (options["json-file"]) writeFileSync(options["json-file"], `${JSON.stringify(result, (key, value) => (value instanceof Map ? Object.fromEntries(value) : value), 2)}\n`)
process.exit(result.verdict === "fail" ? 1 : 0)
