import { stripHeredocBodies } from "./rules-git.mjs"

// A plain trailing \b backtracks before a terminal `-`, because `-` and the next space are both non-word characters.
const NODE_ID = /\b(?:PRRT|PRR|PR|IC)_[A-Za-z0-9_-]{10,}(?![A-Za-z0-9_-])/g
const HAS_LOWERCASE = /[a-z]/

/** Only a command that can actually reach GitHub is worth judging. An id inside an editor command
 * or a grep is text, not a target. */
const REACHES_GITHUB = /(?<![\w-])(?:gh|curl|wget|http|https|httpie)(?![\w-])|tools[/\\][A-Za-z0-9._-]+\.mjs/

export const extractNodeIds = (command) => {
  const found = String(command ?? "").match(NODE_ID) ?? []
  return [...new Set(found.filter((id) => HAS_LOWERCASE.test(id.slice(id.indexOf("_") + 1))))]
}

const commandOnly = (command) => stripHeredocBodies(String(command ?? ""))

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
      "it names a live object in somebody else's repository.\n\n" +
      "Run `node tools/list-bot-threads.mjs --pr <n> --repo <key>` and use an id from THAT output. The\n" +
      "tool records every id it returns, so a copied id clears this gate by construction.\n\n" +
      `Searched: ${searchedRoots.length > 0 ? searchedRoots.join(", ") : "no artifact root was resolvable"}`,
  }
}
