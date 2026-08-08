import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { identifierLedgerPath, readObservedIdentifiers, recordObservedIdentifiers } from "../lib/identifier-ledger.mjs"

import { T, root } from "./_harness.mjs"

const UNIT = "lib/identifier-ledger.mjs"
const A = "PRRT_kwDOR5Siws6XdcAt"
const B = "PRRT_kwDOR5Siws6Wfy_V"

const stageCheckout = (label) => {
  const repoRoot = join(root, "identifier-ledger", label)
  mkdirSync(join(repoRoot, ".git"), { recursive: true })
  return repoRoot
}

export const cases = () => {
  const repoRoot = stageCheckout("basic")
  T(`${UNIT}: an unwritten ledger reads as empty, never as an error`, readObservedIdentifiers(repoRoot).length === 0, JSON.stringify(readObservedIdentifiers(repoRoot)))

  const path = recordObservedIdentifiers([A, B], { repoRoot, tool: "list-bot-threads.mjs", repository: "thomasluizon/orbit-ui-mobile" })
  T(`${UNIT}: the ledger lands in .git/, which is per checkout and never committed`, path === identifierLedgerPath(repoRoot) && /[/\\]\.git[/\\]/.test(path), String(path))
  const recorded = readObservedIdentifiers(repoRoot)
  T(`${UNIT}: both observed identifiers are readable back`, recorded.length === 2 && recorded.map((entry) => entry.id).sort().join(",") === [A, B].sort().join(","), JSON.stringify(recorded))
  T(`${UNIT}: each entry carries the tool that observed it`, recorded.every((entry) => entry.tool === "list-bot-threads.mjs" && typeof entry.observedAt === "string"), JSON.stringify(recorded))

  /** Append, never replace. A second pull request's listing must not erase the first one's ids, or
   * a resolve for the earlier pull request would be refused as invented. */
  recordObservedIdentifiers([B, "PRRT_kwDOnewthirdid1"], { repoRoot, tool: "list-bot-threads.mjs" })
  const after = readObservedIdentifiers(repoRoot)
  T(`${UNIT}: a later record APPENDS and does not drop earlier ids`, after.length === 3 && after.some((entry) => entry.id === A), JSON.stringify(after.map((entry) => entry.id)))
  T(`${UNIT}: a repeated id is not duplicated`, after.filter((entry) => entry.id === B).length === 1, JSON.stringify(after.map((entry) => entry.id)))

  T(`${UNIT}: recording nothing writes nothing`, recordObservedIdentifiers([], { repoRoot, tool: "x" }) === null, "an empty record must not touch the file")
  T(`${UNIT}: blank and non-string entries are ignored`, recordObservedIdentifiers(["", null, 7], { repoRoot, tool: "x" }) === null, "a junk record must not touch the file")

  /** Every write fails soft: recording what a read saw must never fail the read itself. */
  const unwritable = join(root, "identifier-ledger", "missing-parent", "nested")
  T(`${UNIT}: an unreadable checkout returns [] rather than throwing`, readObservedIdentifiers(unwritable).length === 0, "read must fail soft")

  const corrupt = stageCheckout("corrupt")
  recordObservedIdentifiers([A], { repoRoot: corrupt, tool: "list-bot-threads.mjs" })
  writeFileSync(identifierLedgerPath(corrupt), "{ not json")
  T(`${UNIT}: a corrupt ledger reads as empty rather than throwing`, readObservedIdentifiers(corrupt).length === 0, "a damaged ledger must fail soft")
  T(`${UNIT}: a corrupt ledger can still be rewritten`, typeof recordObservedIdentifiers([B], { repoRoot: corrupt, tool: "list-bot-threads.mjs" }) === "string", "a damaged ledger must not become permanent")
}
