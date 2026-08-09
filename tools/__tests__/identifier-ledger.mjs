import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { currentRunIdentifier, identifierLedgerPath, readObservedIdentifiers, recordObservedIdentifiers } from "../lib/identifier-ledger.mjs"

import { T, root } from "./_harness.mjs"

const UNIT = "lib/identifier-ledger.mjs"
const A = "PRRT_kwDOR5Siws6XdcAt"
const B = "PRRT_kwDOR5Siws6Wfy_V"
const RUN = "current-run"

const stageCheckout = (label) => {
  const repoRoot = join(root, "identifier-ledger", label)
  mkdirSync(join(repoRoot, ".git"), { recursive: true })
  return repoRoot
}

export const cases = () => {
  const repoRoot = stageCheckout("basic")
  T(`${UNIT}: an unwritten ledger reads as empty, never as an error`, readObservedIdentifiers(repoRoot, { runIdentifier: RUN }).length === 0, JSON.stringify(readObservedIdentifiers(repoRoot, { runIdentifier: RUN })))

  const path = recordObservedIdentifiers([A, B], { repoRoot, tool: "list-bot-threads.mjs", repository: "thomasluizon/orbit-ui-mobile", runIdentifier: RUN })
  T(`${UNIT}: the ledger lands in .git/, which is per checkout and never committed`, path === identifierLedgerPath(repoRoot) && /[/\\]\.git[/\\]/.test(path), String(path))
  const recorded = readObservedIdentifiers(repoRoot, { runIdentifier: RUN })
  T(`${UNIT}: both observed identifiers are readable back`, recorded.length === 2 && recorded.map((entry) => entry.id).sort().join(",") === [A, B].sort().join(","), JSON.stringify(recorded))
  T(`${UNIT}: each entry carries the run and tool that observed it`, recorded.every((entry) => entry.runIdentifier === RUN && entry.tool === "list-bot-threads.mjs" && typeof entry.observedAt === "string"), JSON.stringify(recorded))

  T(`${UNIT}: admission fails closed without a run identifier`, readObservedIdentifiers(repoRoot).length === 0, JSON.stringify(readObservedIdentifiers(repoRoot)))
  T(`${UNIT}: an earlier run cannot admit its identifiers`, readObservedIdentifiers(repoRoot, { runIdentifier: "earlier-run" }).length === 0, JSON.stringify(recorded))
  T(`${UNIT}: the Claude session id is the preferred live run identifier`, currentRunIdentifier({ CLAUDE_CODE_SESSION_ID: RUN, CODEX_THREAD_ID: "codex-run" }) === RUN, String(currentRunIdentifier({ CLAUDE_CODE_SESSION_ID: RUN, CODEX_THREAD_ID: "codex-run" })))
  T(`${UNIT}: the Codex thread id is accepted when no Claude session exists`, currentRunIdentifier({ CODEX_THREAD_ID: "codex-run" }) === "codex-run", String(currentRunIdentifier({ CODEX_THREAD_ID: "codex-run" })))
  T(`${UNIT}: an environment with no run identifier fails closed`, currentRunIdentifier({}) === null, String(currentRunIdentifier({})))

  /** Append, never replace. A second pull request's listing must not erase the first one's ids, or
   * a resolve for the earlier pull request would be refused as invented. */
  recordObservedIdentifiers([B, "PRRT_kwDOnewthirdid1"], { repoRoot, tool: "list-bot-threads.mjs", runIdentifier: RUN })
  const after = readObservedIdentifiers(repoRoot, { runIdentifier: RUN })
  T(`${UNIT}: a later record APPENDS and does not drop earlier ids`, after.length === 3 && after.some((entry) => entry.id === A), JSON.stringify(after.map((entry) => entry.id)))
  T(`${UNIT}: a repeated id is not duplicated`, after.filter((entry) => entry.id === B).length === 1, JSON.stringify(after.map((entry) => entry.id)))

  recordObservedIdentifiers([A], { repoRoot, tool: "list-bot-threads.mjs", runIdentifier: "later-run" })
  T(`${UNIT}: a later run can observe the same id without borrowing the old entry`, readObservedIdentifiers(repoRoot, { runIdentifier: "later-run" }).length === 1, JSON.stringify(readObservedIdentifiers(repoRoot, { runIdentifier: "later-run" })))
  T(`${UNIT}: retaining an audit entry for another run does not change current admission`, readObservedIdentifiers(repoRoot, { runIdentifier: RUN }).length === 3, JSON.stringify(readObservedIdentifiers(repoRoot, { runIdentifier: RUN })))

  T(`${UNIT}: recording nothing writes nothing`, recordObservedIdentifiers([], { repoRoot, tool: "x", runIdentifier: RUN }) === null, "an empty record must not touch the file")
  T(`${UNIT}: blank and non-string entries are ignored`, recordObservedIdentifiers(["", null, 7], { repoRoot, tool: "x", runIdentifier: RUN }) === null, "a junk record must not touch the file")
  T(`${UNIT}: recording without a run identifier writes nothing`, recordObservedIdentifiers([A], { repoRoot, tool: "x" }) === null, "an unscoped record must not touch the file")

  /** Every write fails soft: recording what a read saw must never fail the read itself. */
  const unwritable = join(root, "identifier-ledger", "missing-parent", "nested")
  T(`${UNIT}: an unreadable checkout returns [] rather than throwing`, readObservedIdentifiers(unwritable, { runIdentifier: RUN }).length === 0, "read must fail soft")

  const corrupt = stageCheckout("corrupt")
  recordObservedIdentifiers([A], { repoRoot: corrupt, tool: "list-bot-threads.mjs", runIdentifier: RUN })
  writeFileSync(identifierLedgerPath(corrupt), "{ not json")
  T(`${UNIT}: a corrupt ledger reads as empty rather than throwing`, readObservedIdentifiers(corrupt, { runIdentifier: RUN }).length === 0, "a damaged ledger must fail soft")
  T(`${UNIT}: a corrupt ledger can still be rewritten`, typeof recordObservedIdentifiers([B], { repoRoot: corrupt, tool: "list-bot-threads.mjs", runIdentifier: RUN }) === "string", "a damaged ledger must not become permanent")
}
