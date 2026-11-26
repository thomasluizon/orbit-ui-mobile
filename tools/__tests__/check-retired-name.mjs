import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { check, root } from "./_harness.mjs"

const retired = ["As", "tra"].join("")
const lower = retired.toLowerCase()

const stageRepository = (label, files) => {
  const repository = join(root, "retired-name-guard", label)
  mkdirSync(repository, { recursive: true })
  execFileSync("git", ["-C", repository, "init", "-q"])
  for (const [path, content] of Object.entries(files)) {
    const target = join(repository, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  execFileSync("git", ["-C", repository, "add", "-A"])
  return repository
}

export const cases = () => {
  const clean = stageRepository("clean", {
    "apps/web/components/orbit-button.tsx": "export const OrbitButton = () => null\n",
    "apps/web/lib/words.ts": "export const hasTrailing = true\nexport const runsLastRank = 2\nexport const astral = 1\n",
  })
  check("check-retired-name.mjs", "accepts a tree that says Orbit", ["--root", clean], { status: 0, stdout: /Retired name guard passed/ })

  const wire = stageRepository("wire", {
    "apps/web/profile.ts": `export const field = 'proactive${retired}Enabled'\nexport const url = '/api/profile/proactive-${lower}'\n`,
    "apps/web/flags.ts": `export const flag = '${lower}_ask_blocks_disabled'\n`,
    "apps/web/link.ts": `export const link = '/?${lower}=open'\n`,
    "packages/shared/tool-result.ts": `export const keys = ["proactive${retired}.enabled", "proactive${retired}.disabled"]\n`,
    "packages/shared/en.json": `{ "toolResult": { "proactive${retired}": { "enabled": "on" } } }\n`,
  })
  check("check-retired-name.mjs", "accepts the wire names of the allowlist", ["--root", wire], { status: 0, stdout: /Retired name guard passed/ })

  const body = stageRepository("body", { "apps/web/components/button.tsx": `export const ${retired}Button = () => null\n` })
  check("check-retired-name.mjs", "rejects a component named after the retired name", ["--root", body], { status: 1, stderr: new RegExp(`button\\.tsx:1: export const ${retired}Button`) })

  const lowerBody = stageRepository("lower-body", { "apps/web/lib/key.ts": `export const key = 'nav.${lower}'\n` })
  check("check-retired-name.mjs", "rejects an i18n key built on the retired name", ["--root", lowerBody], { status: 1, stderr: /key\.ts:1/ })

  const path = stageRepository("path", { [`apps/web/components/${lower}-button.tsx`]: "export const Button = () => null\n" })
  check("check-retired-name.mjs", "rejects a file path with the retired name", ["--root", path], { status: 1, stderr: /the path carries the retired name/ })

  const harness = stageRepository("harness-package", { "evals/ai-eval/package.json": `{ "name": "@orbit/${lower}-evals", "private": true }\n` })
  check("check-retired-name.mjs", "rejects a private package name built on the retired name", ["--root", harness], { status: 1, stderr: /package\.json:1/ })

  const kept = stageRepository("kept", { [`design/canvas/Orbit ${retired} Conversation.dc.html`]: `<title>${retired}</title>\n` })
  check("check-retired-name.mjs", "accepts the one kept design drawing", ["--root", kept], { status: 0, stdout: /Retired name guard passed/ })

  const mixed = stageRepository("mixed", {
    "apps/web/a.ts": `export const ok = 'proactive${retired}Enabled'\n`,
    "apps/web/b.ts": `export const bad = '${retired}'\n`,
  })
  check("check-retired-name.mjs", "scans only the named files with --files", ["--root", mixed, "--files", "apps/web/a.ts"], { status: 0, stdout: /1 tracked files/ })
  check("check-retired-name.mjs", "fails on a named file that carries the name", ["--root", mixed, "--files", "apps/web/b.ts"], { status: 1, stderr: /b\.ts:1/ })
  const probes = [
    ["path of a profile component", `apps/web/components/profile/${lower}-allowance-panel.tsx`, "export const Panel = () => null\n", /the path carries the retired name/],
    ["path of a mobile profile component", `apps/mobile/components/profile/${lower}-connections.tsx`, "export const Connections = () => null\n", /the path carries the retired name/],
    ["path of a mobile profile route file", `apps/mobile/app/profile/${lower}-settings.tsx`, "export default () => null\n", /the path carries the retired name/],
    ["path of a profile component folder", `apps/web/components/profile/${lower}/panel.tsx`, "export const Panel = () => null\n", /the path carries the retired name/],
    ["import of a renamed profile component", "apps/web/lib/a.ts", `import { X } from '@/components/profile/${lower}-connections'\n`, /a\.ts:1/],
    ["import of a profile route file with a longer name", "apps/mobile/lib/a.ts", `import S from '@/app/profile/${lower}-settings'\n`, /a\.ts:1/],
    ["snake case name outside the flag list", "apps/web/lib/a.ts", `const ${lower}_helper = 1\n`, /a\.ts:1/],
    ["data attribute that ends in the query parameter name", "apps/web/lib/a.tsx", `export const x = <i data-${lower}="" />\n`, /a\.tsx:1/],
    ["kebab name that continues the endpoint name", "apps/web/lib/a.ts", `export const id = 'proactive-${lower}-card'\n`, /a\.ts:1/],
    ["name that continues the profile field", "apps/web/lib/a.ts", `export const label = 'proactive${retired}EnabledLabel'\n`, /a\.ts:1/],
    ["name that continues the tried field", "apps/web/lib/a.ts", `export const card = 'hasTried${retired}Card'\n`, /a\.ts:1/],
    ["name that continues the offline mutation", "apps/web/lib/a.ts", `export const banner = 'setProactive${retired}Banner'\n`, /a\.ts:1/],
    ["name that continues the table name", "apps/web/lib/a.ts", `export const view = 'Issued${retired}BlocksView'\n`, /a\.ts:1/],
    ["name that continues a flag name", "apps/web/lib/a.ts", `export const flag = '${lower}_eval_trace_extra'\n`, /a\.ts:1/],
  ]
  probes.forEach(([label, probePath, content, stderr], index) => {
    const repository = stageRepository(`probe-${index}`, { [probePath]: content })
    check("check-retired-name.mjs", `rejects a ${label}`, ["--root", repository], { status: 1, stderr })
  })

  check("check-retired-name.mjs", "exits 2 on an unknown argument", ["--nope"], { status: 2 })
}
