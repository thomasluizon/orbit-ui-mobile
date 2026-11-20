import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { T, check, hermeticPace, realOrchestratorConfig, root, run, same, stageWithConfig } from "./_harness.mjs"

const TOOL = "pace-calibrate.mjs"
const record = (id, at, output) => JSON.stringify({
  type: "assistant", isSidechain: false, timestamp: at,
  message: { id, model: "claude-sonnet-5-5", usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: output } },
})

const stagedCalibrator = (label, lines) => {
  const transcripts = join(root, "pace-calibrate", label, "projects")
  mkdirSync(transcripts, { recursive: true })
  writeFileSync(join(transcripts, "session.jsonl"), `${lines.join("\n")}\n`)
  const staged = stageWithConfig(`pace-calibrate-${label}`, TOOL, { ...realOrchestratorConfig(), pace: { ...hermeticPace(), transcriptRoot: transcripts } })
  return { path: staged.path, stored: join(staged.base, ".git", "orbit-pace-calibration.json") }
}

export const cases = async () => {
  const fixture = stagedCalibrator("reading", [record("m1", "2026-11-19T08:00:00.000Z", 20_000), record("old", "2026-11-19T06:59:59.999Z", 900_000), record("late", "2026-11-19T12:00:00.000Z", 20_000)])
  const options = { path: fixture.path }

  check(TOOL, "--show with no stored reading exits 1", ["--show"], { status: 1, stderr: /no reading is stored/ }, options)
  const stored = check(TOOL, "a reading stores the budget and prints it", ["--percent", "20", "--at", "2026-11-19T10:00:00Z"], { status: 0 }, options)
  const printed = JSON.parse(stored.stdout || "{}")
  same(`${TOOL}: the weekly budget is the spend of the week up to the reading divided by its share`, [printed.spentWeighted, printed.weeklyBudget, printed.readAt, printed.percent], [100_000, 500_000, "2026-11-19T10:00:00.000Z", 20])
  same(`${TOOL}: the reading is stored with its date`, JSON.parse(existsSync(fixture.stored) ? readFileSync(fixture.stored, "utf8") : "{}").readAt, "2026-11-19T10:00:00.000Z")
  const shown = check(TOOL, "--show prints the stored reading", ["--show"], { status: 0 }, options)
  T(`${TOOL}: --show prints the stored budget`, JSON.parse(shown.stdout || "{}").weeklyBudget === 500_000, shown.stdout)
  const replaced = run(TOOL, ["--percent", "40", "--at", "2026-11-19T13:00:00-03:00"], options)
  same(`${TOOL}: a new reading replaces the stored one`, [replaced.status, JSON.parse(readFileSync(fixture.stored, "utf8")).percent], [0, 40])

  check(TOOL, "a percentage of 0 is refused", ["--percent", "0"], { status: 2, stderr: /above 0 and up to 100/ }, options)
  check(TOOL, "a percentage above 100 is refused", ["--percent", "101"], { status: 2, stderr: /above 0 and up to 100/ }, options)
  check(TOOL, "a percentage that is not a number is refused", ["--percent", "many"], { status: 2, stderr: /above 0 and up to 100/ }, options)
  check(TOOL, "a missing percentage is refused", [], { status: 2, stderr: /--percent is required/ }, options)
  check(TOOL, "a time with no offset is refused", ["--percent", "20", "--at", "2026-11-19T10:00:00"], { status: 2, stderr: /ISO time with an offset/ }, options)
  check(TOOL, "a week with no spend gives no budget and exits 1", ["--percent", "20", "--at", "2026-11-26T09:00:00Z"], { status: 1, stderr: /no spend found/ }, options)
  // A directory where the reading belongs makes the final rename fail, after the week's spend was read.
  const blocked = stagedCalibrator("blocked", [record("m1", "2026-11-19T08:00:00.000Z", 20_000)])
  mkdirSync(join(blocked.stored, "occupied"), { recursive: true })
  check(TOOL, "a reading that cannot be stored exits 3 with the path, and leaves no unpublished file", ["--percent", "20", "--at", "2026-11-19T10:00:00Z"], { status: 3, stderr: /could not store the reading at .*orbit-pace-calibration\.json/ }, { path: blocked.path })
  T(`${TOOL}: a failed store leaves no unpublished file`, !readdirSync(dirname(blocked.stored)).some((name) => name.endsWith(".unpublished")), readdirSync(dirname(blocked.stored)).join(","))
  check(TOOL, "--show takes no other argument", ["--show", "--percent", "20"], { status: 2, stderr: /--show takes no other argument/ }, options)
}
