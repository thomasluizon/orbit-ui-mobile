import { buildNameIndex, createResolver, unresolvedIn } from "../lib/doc-references.mjs"
import { T, same } from "./_harness.mjs"

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

export const cases = () => {
  T(`${UNIT}: the name index holds every tail of a file and of each folder`,
    ["docs/a.md", "a.md", "docs", "Orbit Note.md", "2 Areas"].every((name) => buildNameIndex(TRACKED).has(name)))
  same(`${UNIT}: a tracked path, a tail, a relative path, an allowed root name and a sibling path resolve`,
    unresolved("`docs/a.md` `a.md` [x](../README.md) `allowed.md` `../sibling-repository/shared/sibling.md`", "docs"), [])
  same(`${UNIT}: a missing path in a span and in a link is reported once each`,
    unresolved("`docs/gone.md` and [x](docs/gone-link.md#part) and `docs/gone.md`"), ["docs/gone-link.md", "docs/gone.md"])
  same(`${UNIT}: a fenced block, a URL, an absolute path and a product name are not references`,
    unresolved("```\n`docs/fenced-gone.md`\n```\n`https://x.org/a.md` `/etc/gone.md` `next.js`"), [])
  same(`${UNIT}: a missing path with a space is reported whole`,
    unresolved("`docs/Orbit Gone.md` `\"docs/Orbit Gone Quoted.md\"`"), ["docs/Orbit Gone Quoted.md", "docs/Orbit Gone.md"])
  same(`${UNIT}: a tracked path with a space resolves whole`, unresolved("`2 Areas/Orbit Note.md`"), [])
  same(`${UNIT}: a command with flags reports only its missing path`,
    unresolved("`tools/check.mjs --fix` `tools/gone.mjs --files README.md`"), ["tools/gone.mjs"])
  same(`${UNIT}: two missing paths in one span are two entries`, unresolved("`docs/gone-a.md docs/gone-b.md`"), ["docs/gone-a.md", "docs/gone-b.md"])
  same(`${UNIT}: a missing command and a missing output path in one span are two entries`,
    unresolved("`tools/gone.mjs --out docs/gone-out.md`"), ["docs/gone-out.md", "tools/gone.mjs"])
}
