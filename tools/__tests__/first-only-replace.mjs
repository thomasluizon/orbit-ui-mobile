import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { REPO_ROOT, T, same } from "./_harness.mjs"

const SOURCE_FILE = /\.(?:cjs|js|jsx|mjs|mts|ts|tsx)$/
const SELF = "tools/__tests__/first-only-replace.mjs"

/**
 * The class: a string method call "replace" whose pattern is one character in a quoted string.
 * That call changes only the first match, so a later match passes through (CodeQL js/incomplete-sanitization).
 * The fix is replaceAll with the same arguments.
 */
const FIRST_ONLY_REPLACE = /\.replace\(\s*(?:"(?:\\.|[^"\\])"|'(?:\\.|[^'\\])'|`(?:\\.|[^`\\])`)\s*,/g

const hits = (source) => [...source.matchAll(FIRST_ONLY_REPLACE)].length

export const cases = () => {
  const call = (pattern) => `value.${["replace"].join("")}(${pattern}, "x")`
  same("first-only-replace: a double-quoted one-character pattern is a hit", hits(call('"#"')), 1)
  same("first-only-replace: a single-quoted escape pattern is a hit", hits(call("'\\n'")), 1)
  same("first-only-replace: a template one-character pattern is a hit", hits(call("`.`")), 1)
  same("first-only-replace: a pattern of two characters is not a hit", hits(call('"ab"')), 0)
  same("first-only-replace: a global regular expression is not a hit", hits(call("/#/g")), 0)
  same("first-only-replace: replaceAll is not a hit", hits('value.replaceAll("#", "x")'), 0)

  const listed = spawnSync("git", ["ls-files", "-z"], { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  T("first-only-replace: git lists the tracked files", listed.status === 0, listed.stderr)
  const found = []
  for (const path of listed.stdout.split("\0")) {
    if (!SOURCE_FILE.test(path) || path === SELF) continue
    let source
    try {
      source = readFileSync(join(REPO_ROOT, path), "utf8")
    } catch {
      continue // a path that git lists and the worktree lacks, as in a sparse checkout
    }
    if (hits(source) > 0) found.push(path)
  }
  same("first-only-replace: no tracked source file replaces only the first match of a one-character pattern", found, [])
}
