import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { T, check, root } from "./_harness.mjs"

const TOOL = "arch-map.mjs"

const stageTree = (base, files) => {
  for (const [relative, content] of Object.entries(files)) {
    const absolute = join(base, ...relative.split("/"))
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, content, "utf8")
  }
}

/**
 * The two ownership regressions from the #722 review: an unrelated barrel
 * re-export and an unrelated same-file sibling export must contribute NO
 * ownership, or dead keys hide from the sweep behind live neighbours.
 */
export const cases = () => {
  const fixture = join(root, "arch-map-fixture")
  stageTree(fixture, {
    "packages/shared/src/i18n/en.json": JSON.stringify({
      a: { live: "live", deadSibling: "dead sibling", barrelStranger: "barrel stranger" },
    }),
    "packages/shared/src/api/endpoints.ts": 'export const API = {\n  ping: "/api/ping",\n} as const\n',
    "apps/web/app/home/page.tsx": [
      "import { Live } from '@/components/kit'",
      "export default function Page() {",
      "  return <Live />",
      "}",
      "",
    ].join("\n"),
    "apps/web/components/kit/index.tsx": [
      "export { Live } from './live'",
      "export { Stranger } from './stranger'",
      "",
    ].join("\n"),
    "apps/web/components/kit/live.tsx": [
      "import { useTranslations } from 'next-intl'",
      "export function Live() {",
      "  const t = useTranslations()",
      "  return <p>{t('a.live')}</p>",
      "}",
      "export function DeadSibling() {",
      "  const t = useTranslations()",
      "  return <p>{t('a.deadSibling')}</p>",
      "}",
      "",
    ].join("\n"),
    "apps/web/components/kit/stranger.tsx": [
      "import { useTranslations } from 'next-intl'",
      "export function Stranger() {",
      "  const t = useTranslations()",
      "  return <p>{t('a.barrelStranger')}</p>",
      "}",
      "",
    ].join("\n"),
  })

  const derived = check(TOOL, "derives the map from a staged tree", [], { status: 0, stdout: /wrote architecture\.json/ }, { env: { ARCH_MAP_ROOT: fixture } })
  if (derived.status !== 0) return
  const map = JSON.parse(readFileSync(join(fixture, "architecture.json"), "utf8"))
  const home = map.i18nOwnership.byRoute.find((route) => route.routePath === "/home")

  T(`${TOOL}: the requested export's key is owned by the importing route`, home !== undefined && home.keys.includes("a.live"), JSON.stringify(home))
  T(
    `${TOOL}: an unrequested same-file sibling export contributes no ownership`,
    map.i18nOwnership.unowned.includes("a.deadSibling"),
    JSON.stringify({ unowned: map.i18nOwnership.unowned, home }),
  )
  T(
    `${TOOL}: an unrequested barrel re-export contributes no ownership`,
    map.i18nOwnership.unowned.includes("a.barrelStranger"),
    JSON.stringify({ unowned: map.i18nOwnership.unowned, home }),
  )

  // Provenance (#232). The block is the FIRST key, so a reader sees which tree produced the map
  // before reading a word of it, and it carries no clock: a wall-clock stamp changes on every run
  // and a HEAD SHA can never be the SHA of the commit that will contain the file.
  T(`${TOOL}: the provenance block is the first key`, Object.keys(map)[0] === "provenance", JSON.stringify(Object.keys(map)))
  T(
    `${TOOL}: generatedFrom is a 12 hex character input hash and inputFiles counts the reads`,
    /^[0-9a-f]{12}$/.test(map.provenance?.generatedFrom ?? "") && Number.isInteger(map.provenance?.inputFiles) && map.provenance.inputFiles > 0,
    JSON.stringify(map.provenance),
  )
  T(
    `${TOOL}: generatorVersion is a number the extraction logic bumps by hand`,
    Number.isInteger(map.provenance?.generatorVersion),
    JSON.stringify(map.provenance),
  )
  const serialized = readFileSync(join(fixture, "architecture.json"), "utf8")
  T(
    `${TOOL}: the serialized map carries no ISO-8601 timestamp anywhere`,
    !/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(serialized),
    "a clock in the map is the single mistake most likely to be made here, and it makes every regeneration differ",
  )

  // The five content keys are untouched by the stamp. Strip provenance and the remainder must be
  // exactly the five, in their original order.
  const { provenance: _stamp, ...content } = map
  T(
    `${TOOL}: the five content keys are unchanged and unreordered`,
    JSON.stringify(Object.keys(content)) === JSON.stringify(["routes", "endpoints", "dependencies", "i18nOwnership", "testCoverage"]),
    JSON.stringify(Object.keys(content)),
  )

  // The Mermaid emitter (#321). Every edge must reference a declared node id, or the diagram renders
  // phantom boxes; the cap is asserted so a future restructure cannot quietly exceed the renderer.
  const mermaid = readFileSync(join(fixture, "architecture.mmd"), "utf8")
  T(`${TOOL}: the diagram opens with a flowchart header`, mermaid.startsWith("flowchart LR\n"), mermaid.slice(0, 60))
  T(`${TOOL}: the diagram uses LF line endings`, !mermaid.includes("\r"), "a CRLF diagram makes the determinism comparison flake across operating systems")
  const declaredIds = new Set([...mermaid.matchAll(/^\s{4}(\S+)\["/gm)].map((match) => match[1]))
  const edgePairs = [...mermaid.matchAll(/^\s{2}(\S+) --> (\S+)$/gm)]
  T(`${TOOL}: the fixture emits at least one edge`, edgePairs.length > 0, mermaid)
  T(
    `${TOOL}: every edge references a declared node id`,
    edgePairs.every(([, from, to]) => declaredIds.has(from) && declaredIds.has(to)),
    JSON.stringify({ declared: [...declaredIds], edges: edgePairs.map(([, from, to]) => `${from} --> ${to}`) }),
  )
  T(
    `${TOOL}: one subgraph per workspace present in the fixture`,
    [...mermaid.matchAll(/^\s{2}subgraph /gm)].length === 3,
    mermaid,
  )
  T(`${TOOL}: the node count stays at or under the cap`, declaredIds.size <= 64, `${declaredIds.size} nodes`)

  // The id sanitizer. `apps/web/app/(auth)` is a real Next route group, so the parentheses have to
  // collapse deterministically and the quoted label has to keep the real path.
  const parenthesized = join(root, "arch-map-parens")
  stageTree(parenthesized, {
    "packages/shared/src/i18n/en.json": JSON.stringify({ a: { live: "live" } }),
    "packages/shared/src/api/endpoints.ts": ['export const API = {', '  ping: "/api/ping",', "} as const", ""].join("\n"),
    "apps/web/app/(auth)/login/page.tsx": "import { helper } from '@/lib/helper'\nexport default function Page() {\n  return <p>{helper()}</p>\n}\n",
    "apps/web/lib/helper.ts": "export const helper = () => 'x'\n",
  })
  const parensRun = check(TOOL, "derives a tree carrying a parenthesized route group", [], { status: 0 }, { env: { ARCH_MAP_ROOT: parenthesized } })
  if (parensRun.status === 0) {
    const parensMermaid = readFileSync(join(parenthesized, "architecture.mmd"), "utf8")
    T(
      `${TOOL}: a parenthesized directory keeps its real path as the label and takes a safe id`,
      /^\s+n_apps_web_app\["apps\/web\/app"\]$/m.test(parensMermaid) || /\["apps\/web\/app[^"]*"\]/.test(parensMermaid),
      parensMermaid,
    )
    T(
      `${TOOL}: no emitted node id carries a character Mermaid cannot parse`,
      [...parensMermaid.matchAll(/^\s+(\S+)\["/gm)].every(([, id]) => /^[A-Za-z0-9_]+$/.test(id)),
      parensMermaid,
    )
  }

  // A tree with no import edges at all still has to emit a valid header-only diagram, or the emitter
  // throws on the first workspace that has not been written yet.
  const empty = join(root, "arch-map-empty")
  stageTree(empty, {
    "packages/shared/src/i18n/en.json": JSON.stringify({ a: { live: "live" } }),
    "packages/shared/src/api/endpoints.ts": ['export const API = {', '  ping: "/api/ping",', "} as const", ""].join("\n"),
    "apps/web/app/home/page.tsx": "export default function Page() {\n  return <p>x</p>\n}\n",
  })
  const emptyRun = check(TOOL, "derives a tree with no dependency edges", [], { status: 0 }, { env: { ARCH_MAP_ROOT: empty } })
  if (emptyRun.status === 0) {
    const emptyMermaid = readFileSync(join(empty, "architecture.mmd"), "utf8")
    T(`${TOOL}: an edgeless tree still emits a valid header`, emptyMermaid.startsWith("flowchart LR\n"), emptyMermaid)
    T(`${TOOL}: an edgeless tree emits no edge lines`, !/ --> /.test(emptyMermaid), emptyMermaid)
  }

  // Hash sensitivity and hash stability, in that order. The stability case is the regression test
  // against anyone reintroducing a timestamp: it is the one that goes red the moment a clock returns.
  const firstRun = readFileSync(join(fixture, "architecture.json"), "utf8")
  const firstMermaid = readFileSync(join(fixture, "architecture.mmd"), "utf8")
  check(TOOL, "re-derives the staged tree byte-identically", [], { status: 0 }, { env: { ARCH_MAP_ROOT: fixture } })
  T(`${TOOL}: the fixture derivation is deterministic`, readFileSync(join(fixture, "architecture.json"), "utf8") === firstRun)
  T(`${TOOL}: the diagram derivation is deterministic`, readFileSync(join(fixture, "architecture.mmd"), "utf8") === firstMermaid)
  T(
    `${TOOL}: generatedFrom is unchanged when no input changed`,
    JSON.parse(readFileSync(join(fixture, "architecture.json"), "utf8")).provenance.generatedFrom === map.provenance.generatedFrom,
  )

  stageTree(fixture, {
    "apps/web/app/added/page.tsx": "export default function Page() {\n  return <p>added</p>\n}\n",
  })
  check(TOOL, "re-derives after a route file is added", [], { status: 0 }, { env: { ARCH_MAP_ROOT: fixture } })
  T(
    `${TOOL}: generatedFrom changes when an input the map covers changes`,
    JSON.parse(readFileSync(join(fixture, "architecture.json"), "utf8")).provenance.generatedFrom !== map.provenance.generatedFrom,
  )
}
