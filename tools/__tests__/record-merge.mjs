import { T, check, same, stageRepo } from "./_harness.mjs"
import { updateRunState, writeRunState } from "../lib/run-state.mjs"
import { withRecordedMerge } from "../record-merge.mjs"

const TOOL = "record-merge.mjs"
const SHA = "b320dacf840c8717aa400dcba260e9588fb695d4"

export const cases = () => {
  check(TOOL, "refuses a call with no sha", ["--repo", "ui", "--pr", "2487"], { status: 2, stderr: /usage: record-merge/ })
  check(TOOL, "refuses a short sha", ["--repo", "ui", "--pr", "2487", "--sha", "b320dac"], { status: 2, stderr: /usage: record-merge/ })
  check(TOOL, "refuses a pull request number that is not positive", ["--repo", "ui", "--pr", "0", "--sha", SHA], { status: 2, stderr: /usage: record-merge/ })
  check(TOOL, "refuses a repeated flag", ["--repo", "ui", "--repo", "ui", "--pr", "2487"], { status: 2, stderr: /usage: record-merge/ })

  const state = { sessionId: "s", pullRequests: [{ repositoryKey: "ui", prNumber: 2487, receiptPath: "/receipts/2487.json" }], readinessLedger: [] }
  same("record-merge: a run pull request gets one ledger identity that carries the sha", withRecordedMerge(state, "ui", 2487, SHA)?.readinessLedger,
    [{ repositoryKey: "ui", prNumber: 2487, receiptPath: "/receipts/2487.json", merged: SHA }])
  T("record-merge: a pull request outside the run gets no write", withRecordedMerge(state, "ui", 2490, SHA) === null && withRecordedMerge(state, "api", 2487, SHA) === null)
  T("record-merge: a run without a record gets no write", withRecordedMerge(null, "ui", 2487, SHA) === null)

  const repo = stageRepo("record-merge")
  writeRunState(state, repo.path)
  const confirmed = updateRunState((current) => withRecordedMerge(current, "ui", 2487, SHA), repo.path, { sessionId: null })
  T("record-merge: the published run record keeps the sha on the row that the stop hook reads", confirmed.readinessLedger.length === 1 && confirmed.readinessLedger[0].merged === SHA && confirmed.readinessLedger[0].prNumber === 2487, JSON.stringify(confirmed))
}
