// An identifier a run WRITES with must have been READ by that run.
//
// Measured 2026-08-08. The orchestrator ran:
//
//   printf 'fixed in %s' "$sha" | node tools/resolve-bot-thread.mjs \
//     --thread PRRT_kwDOR5Siws6XdcAt --repo ui --pr 699 || <list the threads fresh and retry>
//
// The id was typed. It was never read from any output. GraphQL node ids are GLOBALLY unique, so it
// did not fail: it resolved to a live CodeRabbit thread on benhook1013/FireMUD pull request #2594
// and posted a reply there under Thomas's account. The `||` fallback is the tell. It says the
// author knew the id might be wrong and planned to find out by trying it, which makes a write the
// probe.
//
// The tool-side target assertion in tools/lib/github-target.mjs closes the cross-repository case.
// This rule closes the case that assertion cannot see: an invented id that happens to belong to the
// RIGHT repository still lands on the wrong thread.
//
// Pure: it takes the command string and the set of identifiers the run can prove it observed, and
// returns { block, message } or null. The adapter owns every file read, because a pure core is the
// only part a test can drive without staging a session.
//
// KNOWN BYPASSES, stated rather than implied, because an undisclosed-bypass list reads as
// exhaustive: a shell wrapper whose inner text this never inspects; script-file indirection; a tool
// that reaches GitHub without `gh`, `curl`, `httpie` or a tools/ script in the command; an id
// carried inside a HEREDOC BODY rather than on the command line (see below); and the adapter's scan
// budget, which allows rather than blocks when it cannot finish, so a hook fault can never wedge a
// shell. This gate raises the cost of the mistake. The deterministic control is the target
// assertion inside the tools, which no command string can route around.

/**
 * GitHub node ids are `<TYPE>_<base64url>`. The prefixes this guards are the ones the harness
 * passes to writing tools: review threads (PRRT_), pull requests (PR_), issue comments (IC_) and
 * pull request reviews (PRR_).
 *
 * The body must be at least 10 characters AND carry a lowercase letter. That second condition is
 * what keeps ordinary shell text out: `PR_NUMBER`, `IC_CONFIG` and `PRRT_TEST` are all upper case
 * and none of them is a node id.
 */
import { stripHeredocBodies } from "./rules-git.mjs"

const NODE_ID = /\b(?:PRRT|PRR|PR|IC)_[A-Za-z0-9_-]{10,}\b/g
const HAS_LOWERCASE = /[a-z]/

/** Only a command that can actually reach GitHub is worth judging. An id inside an editor command
 * or a grep is text, not a target. */
const REACHES_GITHUB = /(?<![\w-])(?:gh|curl|wget|http|https|httpie)(?![\w-])|tools[/\\][A-Za-z0-9._-]+\.mjs/

export const extractNodeIds = (command) => {
  const found = String(command ?? "").match(NODE_ID) ?? []
  return [...new Set(found.filter((id) => HAS_LOWERCASE.test(id.slice(id.indexOf("_") + 1))))]
}

/**
 * A heredoc BODY is data the command is carrying, not the command. Measured while building this
 * gate: it refused a `/second-opinion` call whose heredoc body QUOTED the incident, because the
 * quoted text contained both a tools/ path and the offending id. A guard that fires on writing
 * ABOUT the incident is one everybody learns to work around, and the same reasoning already governs
 * _lib/rules-orchestrator.mjs, which strips heredoc bodies through this same helper.
 *
 * This does NOT weaken the guard against the incident, whose id sat on the command line:
 *   printf 'fixed in %s' "$sha" | node tools/resolve-bot-thread.mjs --thread PRRT_... --repo ui --pr 699
 * It does leave an id passed inside a heredoc unjudged, which is why that is named in the bypass
 * list above rather than left for a reader to discover.
 */
const commandOnly = (command) => stripHeredocBodies(String(command ?? ""))

/**
 * @param command the Bash or PowerShell command string
 * @param options `{ observedIdentifiers, searchedRoots }`. `observedIdentifiers` is every id the
 *   run can prove it read: the tools/lib/identifier-ledger.mjs records plus anything written into
 *   the session scratchpad.
 * @returns `{ block, message }` when the command carries an identifier the run never observed
 */
export function checkInventedIdentifier(command, { observedIdentifiers = new Set(), searchedRoots = [] } = {}) {
  if (typeof command !== "string" || command === "") return null
  const scannable = commandOnly(command)
  if (!REACHES_GITHUB.test(scannable)) return null
  const unknown = extractNodeIds(scannable).filter((id) => !observedIdentifiers.has(id))
  if (unknown.length === 0) return null

  return {
    block: true,
    message:
      `This command passes ${unknown.length === 1 ? "an identifier" : "identifiers"} this run never read: ${unknown.join(", ")}\n\n` +
      "A GitHub node id must be COPIED from output produced in the same run. It may not be typed, it\n" +
      "may not be reconstructed from memory, and it may not be passed speculatively with a `||`\n" +
      "fallback that retries on failure. Node ids are globally unique, so a wrong one does not fail:\n" +
      "it names a live object in somebody else's repository. On 2026-08-08 exactly this command shape\n" +
      "posted a reply on a stranger's public pull request.\n\n" +
      "Run `node tools/list-bot-threads.mjs --pr <n> --repo <key>` and use an id from THAT output. The\n" +
      "tool records every id it returns, so a copied id clears this gate by construction.\n\n" +
      `Searched: ${searchedRoots.length > 0 ? searchedRoots.join(", ") : "no artifact root was resolvable"}`,
  }
}
