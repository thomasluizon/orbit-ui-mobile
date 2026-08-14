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

  const firstRun = readFileSync(join(fixture, "architecture.json"), "utf8")
  check(TOOL, "re-derives the staged tree byte-identically", [], { status: 0 }, { env: { ARCH_MAP_ROOT: fixture } })
  T(`${TOOL}: the fixture derivation is deterministic`, readFileSync(join(fixture, "architecture.json"), "utf8") === firstRun)
}
