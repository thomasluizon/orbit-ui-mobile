#!/usr/bin/env node
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { updateRunState } from "./lib/run-state.mjs"

const USAGE = `usage: record-merge.mjs --repo <key> --pr <number> --sha <merge commit sha>
Write the merge commit sha as the \`merged\` string of one pull request of the current run.
run-status.mjs prints the exact command as RECORD_MERGE when GitHub shows a pull request of the run as
MERGED and its ledger row has no sha, for example after another session merged it.
Prints the repository key, the pull request number and the sha after it reads the write back.
--help, -h print usage
exit codes: 0 confirmed; 1 no run, no such pull request in the run or write failure; 2 invalid arguments`

const MERGE_COMMIT = /^[0-9a-f]{40}$/

/** The run record with one more ledger identity that carries the merge sha, or null when the run does not hold the pull request. */
export const withRecordedMerge = (state, repositoryKey, prNumber, sha) => {
  const row = [...(state?.readinessLedger ?? []), ...(state?.pullRequests ?? [])]
    .find((entry) => entry?.repositoryKey === repositoryKey && entry.prNumber === prNumber && typeof entry.receiptPath === "string")
  return row ? { ...state, readinessLedger: [...(state.readinessLedger ?? []), { repositoryKey, prNumber, receiptPath: row.receiptPath, merged: sha }] } : null
}

const main = () => {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) { console.log(USAGE); return }
  const value = (flag) => (args.length === 6 && args.filter((arg) => arg === flag).length === 1 ? args[args.indexOf(flag) + 1] : undefined)
  const repositoryKey = value("--repo")
  const prNumber = Number(value("--pr"))
  const sha = value("--sha")
  if (!repositoryKey || repositoryKey.startsWith("-") || !Number.isInteger(prNumber) || prNumber <= 0 || !MERGE_COMMIT.test(sha ?? "")) { console.error(USAGE); process.exit(2) }
  try {
    const confirmed = updateRunState((state) => {
      const next = withRecordedMerge(state, repositoryKey, prNumber, sha)
      if (!next) throw new Error(`${repositoryKey}#${prNumber} is not in the current run`)
      return next
    })
    if (!confirmed?.readinessLedger?.some((row) => row.repositoryKey === repositoryKey && row.prNumber === prNumber && row.merged === sha)) throw new Error("The merge sha was not confirmed")
    console.log(JSON.stringify({ repositoryKey, prNumber, merged: sha }))
  } catch (error) { console.error(error.message); process.exit(1) }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
