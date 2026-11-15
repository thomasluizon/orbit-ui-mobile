import { existsSync, readFileSync } from "node:fs"
import { join, posix } from "node:path"

// The pure reference resolver of tools/file-ledger.mjs: it finds the paths that a doc names and that resolve to no file.

const KNOWN_FILE_EXTENSIONS = new Set([
  "md", "mdx", "txt", "json", "jsonc", "yml", "yaml", "toml", "js", "jsx", "ts", "tsx", "mjs", "cjs", "mts",
  "cts", "css", "scss", "html", "htm", "svg", "png", "jpg", "jpeg", "webp", "gif", "ico", "icns", "sh", "ps1",
  "cs", "csproj", "sln", "tf", "sql", "kt", "kts", "java", "swift", "plist", "xml", "gradle", "properties",
  "lock", "example", "mp4", "pdf", "woff", "woff2", "ttf", "otf", "rs", "astro",
])
const PRODUCT_NAMES_WITH_DOT_JS = /^(?:next|node|vue|react|three|express|nuxt|chart|socket|alpine|ember|backbone)\.js$/i
const NON_PATH_CHARACTERS = /[*?{}<>$|()[\]=\\\s"'`;,!^]/

const stripFencedBlocks = (text) => {
  let inside = false
  return text
    .split("\n")
    .filter((line) => {
      if (/^\s*(?:```|~~~)/.test(line)) {
        inside = !inside
        return false
      }
      return !inside
    })
    .join("\n")
}

const decodePercent = (text) => {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

const cleanToken = (raw) =>
  decodePercent(raw)
    .replace(/^[("'[]+/, "")
    .replace(/[)"'\],.;:!]+$/, "")
    .replace(/#.*$/, "")
    .replace(/:\d+(?:[:-]\d+)*$/, "")

const looksLikePath = (token) => {
  if (!token || NON_PATH_CHARACTERS.test(token) || token.includes("://") || token.startsWith("mailto:")) return false
  // A POSIX root, a home folder or a Windows drive starts an absolute path, which names no file of a repository.
  if (/^[-/~@#%]/.test(token) || /^[A-Za-z]:[\\/]/.test(token)) return false
  // A dot folder such as .claude/ or .github/ is a real path; a bare dotted name such as .dc.html is an extension.
  if (token.startsWith(".") && !/^(?:\.{1,2}|\.[\w-]+)\//.test(token)) return false
  const segments = token.split("/").filter(Boolean)
  if (segments.some((segment) => /^\.{3,}$/.test(segment))) return false
  if (token.endsWith("/")) return segments.length >= 2
  const last = segments.at(-1) ?? ""
  const dot = last.lastIndexOf(".")
  if (dot <= 0 || dot === last.length - 1) return false
  if (!KNOWN_FILE_EXTENSIONS.has(last.slice(dot + 1).toLowerCase())) return false
  return segments.length > 1 || !PRODUCT_NAMES_WITH_DOT_JS.test(last)
}

const suffixesOf = (path) => {
  const segments = path.split("/")
  return segments.map((_, start) => segments.slice(start).join("/"))
}

/** The names that a reference can resolve to: every tail of every tracked file and of every folder. */
export const buildNameIndex = (paths) => {
  const names = new Set()
  for (const path of paths) {
    for (const suffix of suffixesOf(path)) names.add(suffix)
    const segments = path.split("/")
    for (let end = 1; end < segments.length; end += 1) {
      for (const suffix of suffixesOf(segments.slice(0, end).join("/"))) names.add(suffix)
    }
  }
  return names
}

export const readAllowedRootNames = (root) => {
  try {
    const allowlist = JSON.parse(readFileSync(join(root, "tools", "root-allowlist.json"), "utf8"))
    return [...(allowlist.files ?? []), ...(allowlist.directories ?? [])]
  } catch {
    return []
  }
}

export const createResolver = ({ root, names, alsoNames, alsoRepositoryNames, allowedRootNames }) => {
  const inAlsoSearch = (candidate) => {
    const stripped = candidate.replace(/^(?:\.\.\/)+/, "")
    const [first, ...rest] = stripped.split("/")
    const forms = [stripped, ...(alsoRepositoryNames.includes(first) ? [rest.join("/")] : [])]
    return forms.some((form) => alsoNames.some((index) => index.has(form)))
  }
  const resolvesOnDisk = (candidate) => !candidate.startsWith("..") && existsSync(join(root, candidate))
  const isAllowed = (candidate) => allowedRootNames.includes(candidate)
  return (token, fromDirectory) => {
    const direct = posix.normalize(token).replace(/\/$/, "")
    const relative = posix.normalize(posix.join(fromDirectory, token)).replace(/\/$/, "")
    return [direct, relative].some(
      (candidate) =>
        names.has(candidate) || resolvesOnDisk(candidate) || isAllowed(candidate) || inAlsoSearch(candidate),
    )
  }
}

const referenceSpans = (text) => {
  const body = stripFencedBlocks(text)
  const spans = [...body.matchAll(/`([^`\n]+)`/g)].map((match) => match[1].trim())
  const links = [...body.matchAll(/\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1])
  return { spans, links }
}

/** The sorted paths that `text` names and that `resolves` does not find, read from `fromDirectory`. */
export const unresolvedIn = (text, fromDirectory, resolves) => {
  const { spans, links } = referenceSpans(text)
  const unresolved = new Set()
  // A space inside a span or a decoded link can belong to the path, so the shape test reads it as one character.
  const judge = (token) => {
    const cleaned = cleanToken(token)
    if (looksLikePath(cleaned.replaceAll(/\s/g, "_")) && !resolves(cleaned, fromDirectory)) unresolved.add(cleaned)
  }
  const resolvesAsPath = (token) => {
    const cleaned = cleanToken(token)
    return looksLikePath(cleaned) && resolves(cleaned, fromDirectory)
  }
  for (const span of spans) {
    const tokens = span.split(/\s+/)
    const whole = cleanToken(span)
    // One path with a space: it resolves whole, or it starts with a folder, no single token of it resolves as a path
    // and no token before the last is a path alone, which would make the span a list of paths.
    const spacedPath = tokens.length > 1 && looksLikePath(whole.replaceAll(/\s/g, "_")) &&
      (resolves(whole, fromDirectory) || (tokens[0].includes("/") && !tokens.some(resolvesAsPath) &&
        tokens.slice(0, -1).every((token) => !looksLikePath(cleanToken(token)))))
    for (const token of spacedPath ? [span] : tokens) judge(token)
  }
  for (const link of links) judge(link.replace(/\?.*$/, ""))
  return [...unresolved].sort()
}
