/**
 * The one parser of a ticket's `Affected modules / files` section.
 *
 * Two tools have to agree about it exactly: check-ticket.mjs REFUSES a ticket whose section names
 * no parseable path, and wave-plan.mjs reports the collisions between the paths it reads. If the
 * two ever disagreed, a ticket could pass the gate and still contribute nothing to the collision
 * report, which is silence buying parallelism. That agreement was previously held by a copy of
 * this code in each tool plus a harness case slicing both regions out and comparing them byte for
 * byte, which is a workaround for a structural problem: wave-plan.mjs runs its whole body at
 * import time, so nothing could consume it as a module. One module removes the copy and the case
 * that policed it.
 *
 * The rules, all of them measured against real ticket bodies:
 *   the section is one heading matching affected/files/modules, ending at the next heading
 *   fenced blocks are skipped, both as heading shadows and as example paths inside the section
 *   a bare word only counts inside backticks, as a list item, or with a `:` or ` - ` annotation
 *   a URL and a bare domain are not paths, however file-shaped their tail looks, and no context
 *     admits one: a backticked, listed or annotated host is refused exactly like a naked one
 *   a wildcard or directory scope is unsafe to intersect precisely and is reported as unknown
 */

/** Anything path-shaped. The gate on what actually counts is isDeclaredPath below. */
export const AFFECTED_PATH = /\.?[\w@][\w./\\@()[\]{}+-]*\.[a-z0-9][a-z0-9-]*/gi
const BARE_AFFECTED_PATH = /^\.?[\w@][\w./\\@()[\]{}+-]*\.[a-z0-9][a-z0-9-]*$/i
const BROAD_AFFECTED_SCOPE = /(?:\.?[\w@][\w./\\@()[\]{}+-]*\/(?:\*{1,2})?|\.?[\w@][\w./\\@()[\]{}+*-]*\*[\w./\\@()[\]{}+*-]*)(?![\w@.\-()[\]{}+/])/gi

/** A host carrying a path: the slash after a dotted label is decisive, no file name looks like it. */
const HOST_WITH_PATH = /^[\w-]+(?:\.[\w-]+)*\.[a-z]{2,63}\//i

/**
 * A host carrying nothing. With no slash to read, a hostname and a repository-root file are the same
 * shape, dotted lowercase labels, so only the last label separates them and the two namespaces
 * overlap: `.sh`, `.md`, `.py` and `.rs` are file extensions AND country-code TLDs. This rule is
 * therefore inexact BY CONSTRUCTION and says so rather than pretending. It lists the generic TLDs
 * that no tracked root file in any of the three repositories ends with, so rejecting them costs no
 * real path; a host under an overlapping country-code TLD, `orbit.sh` say, is not separable from a
 * root script of that name and is still read as a path. Write such a host as a URL or fence it.
 */
const BARE_HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|net|org|io|ai|dev|app|co|cloud|info|tech|xyz)$/i

const affectedSectionOf = (description) => {
  const lines = (description ?? "").split(/\r?\n/)
  let fence = null
  let section = null
  for (const line of lines) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1][0] ?? null
    if (marker) {
      if (!fence) fence = marker
      else if (fence === marker) fence = null
      continue
    }
    if (!fence && /^#+[ \t]+/.test(line)) {
      if (section) break
      if (/^#+\s*(affected|files|modules)\b/i.test(line)) section = [line]
      continue
    }
    if (section && !fence) section.push(line)
  }
  return section?.join("\n") ?? null
}

const isDeclaredPath = (section, path, index) => {
  if (/[a-z][a-z0-9+.-]*:\/\/$/i.test(section.slice(Math.max(0, index - 24), index))) return false
  if (HOST_WITH_PATH.test(path) || BARE_HOSTNAME.test(path)) return false
  if (/[\\/]/.test(path)) return true
  if (section[index - 1] === "`" && section[index + path.length] === "`") return true
  const lineStart = section.lastIndexOf("\n", index) + 1
  const nextBreak = section.indexOf("\n", index + path.length)
  const lineEnd = nextBreak === -1 ? section.length : nextBreak
  const item = section
    .slice(lineStart, lineEnd)
    .trim()
    .replace(/^(?:[-*]|\d+\.)\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "")
  const annotation = item.startsWith(path) ? item.slice(path.length) : ""
  if (/^(?::|\s+-\s+)/.test(annotation)) return true
  const itemPaths = item
    .split(/\s*,\s*|\s+and\s+/i)
    .map((candidate) => candidate.replace(/^`|`$/g, ""))
  return itemPaths.includes(path) && itemPaths.every((candidate) => BARE_AFFECTED_PATH.test(candidate))
}

const pathsOf = (section) => [...section.matchAll(AFFECTED_PATH)]
  .filter((match) => isDeclaredPath(section, match[0], match.index))
  .map(([path]) => path.replace(/\\/g, "/"))

/** Paths and unsafe broad scopes declared by a ticket body. */
export const affectedScopeOf = (description) => {
  const section = affectedSectionOf(description)
  if (!section) return { files: [], unknown: false }
  const files = [...new Set(pathsOf(section))]
  const broadScopes = [...section.matchAll(BROAD_AFFECTED_SCOPE)]
    .filter((match) => isDeclaredPath(section, match[0], match.index))
  return { files, unknown: broadScopes.length > 0 }
}

/** Every precise path a ticket body declares, de-duplicated, with separators normalised. */
export const affectedFilesOf = (description) => affectedScopeOf(description).files
