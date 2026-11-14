import { buildNameIndex, createResolver, unresolvedIn } from "../lib/doc-references.mjs"
import { T } from "./_harness.mjs"

const UNIT = "lib/doc-references.mjs"
const TRACKED = ["README.md", "docs/a.md", "tools/check.mjs", "2 Areas/Orbit Note.md"]

const resolver = createResolver({
  root: "/orbit-doc-references-no-such-root",
  names: buildNameIndex(TRACKED),
  alsoNames: [buildNameIndex(["shared/sibling.md"])],
  alsoRepositoryNames: ["sibling-repository"],
  allowedRootNames: ["allowed.md"],
})
const unresolved = (text, fromDirectory = "") => unresolvedIn(text, fromDirectory, resolver)
const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected)

export const cases = () => {
  T(`${UNIT}: the name index holds every tail of a file and of each folder`,
    ["docs/a.md", "a.md", "docs", "Orbit Note.md", "2 Areas"].every((name) => buildNameIndex(TRACKED).has(name)))
  T(`${UNIT}: a tracked path, a tail, a relative path, an allowed root name and a sibling path resolve`,
    same(unresolved("`docs/a.md` `a.md` [x](../README.md) `allowed.md` `../sibling-repository/shared/sibling.md`", "docs"), []))
  T(`${UNIT}: a missing path in a span and in a link is reported once each`,
    same(unresolved("`docs/gone.md` and [x](docs/gone-link.md#part) and `docs/gone.md`"), ["docs/gone-link.md", "docs/gone.md"]))
  T(`${UNIT}: a fenced block, a URL, an absolute path and a product name are not references`,
    same(unresolved("```\n`docs/fenced-gone.md`\n```\n`https://x.org/a.md` `/etc/gone.md` `next.js`"), []))
  T(`${UNIT}: a missing path with a space is reported whole`,
    same(unresolved("`docs/Orbit Gone.md` `\"docs/Orbit Gone Quoted.md\"`"), ["docs/Orbit Gone Quoted.md", "docs/Orbit Gone.md"]))
  T(`${UNIT}: a tracked path with a space resolves whole`, same(unresolved("`2 Areas/Orbit Note.md`"), []))
  T(`${UNIT}: a command with flags reports only its missing path`,
    same(unresolved("`tools/check.mjs --fix` `tools/gone.mjs --files README.md`"), ["tools/gone.mjs"]))
}
