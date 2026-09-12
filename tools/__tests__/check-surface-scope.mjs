import { cpSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { check, root, toolPath } from "./_harness.mjs"

const declarations = `# Design\n\n<!-- surface-scope:start -->\n| on | role | scope | canvas | card | field | well | elev-2 | hover | overlay | widget card | widget well |\n|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n| dark \`--fg-3\` | text + graphic | text: canvas, card, field, well, elev-2, hover, overlay, widget card, widget well; graphic: canvas, card, field, well, elev-2, hover, overlay, widget card, widget well | 6.175 | 5.760 | 5.557 | 5.281 | 4.688 | 4.567 | 5.281 | 5.760 | 5.224 |\n| light \`--fg-3\` | text + graphic | text: canvas, card, well, hover, widget card, widget well; graphic: canvas, card, well, hover, widget card, widget well | 5.309 | 5.542 | - | 4.863 | - | 4.691 | - | 5.542 | 4.909 |\n| dark \`--fg-4\` | graphic | graphic: canvas | 3.032 | 2.828 | 2.728 | 2.593 | 2.302 | 2.242 | 2.593 | 2.828 | 2.565 |\n| light \`--fg-4\` | graphic | graphic: canvas, card, well, widget card, widget well | 3.338 | 3.485 | - | 3.058 | - | 2.950 | - | 3.485 | 3.087 |\n| dark \`--primary-soft\` | text | text: canvas | 4.577 | 4.269 | 4.118 | 3.914 | 3.475 | 3.385 | 3.914 | 4.269 | 3.871 |\n| light \`--primary-soft\` | text | text: canvas, card, widget card | 4.523 | 4.721 | - | 4.142 | - | 3.996 | - | 4.721 | 4.182 |\n| dark \`--status-bad-text\` | text | text: canvas, card, field, well, elev-2, hover, overlay, widget card, widget well | 7.788 | 7.264 | 7.008 | 6.661 | 5.913 | 5.760 | 6.661 | 7.264 | 6.588 |\n| light \`--status-bad-text\` | text | text: canvas, card, well, hover, widget card, widget well | 5.168 | 5.394 | - | 4.733 | - | 4.566 | - | 5.394 | 4.779 |\n| dark \`--ambiguous\` | undeclared | undeclared | - | - | - | - | - | - | - | - | - |\n| light \`--ambiguous\` | undeclared | undeclared | - | - | - | - | - | - | - | - | - |\n<!-- surface-scope:end -->\n`

function stageRepository(label, source) {
  const repository = join(root, "surface-scope", label)
  const actualRoot = join(dirname(toolPath("check-surface-scope.mjs")), "..")
  for (const path of [
    "packages/shared/src/__tests__/contrast.ts",
    "packages/shared/src/theme/neutral-ramp.ts",
    "packages/shared/src/theme/color-schemes.ts",
    "packages/shared/src/theme/types.ts",
    "apps/mobile/scripts/generate-widget-colors.ts",
  ]) {
    const target = join(repository, path)
    mkdirSync(dirname(target), { recursive: true })
    cpSync(join(actualRoot, path), target)
  }
  mkdirSync(join(repository, "apps/web"), { recursive: true })
  mkdirSync(join(repository, "apps/mobile"), { recursive: true })
  writeFileSync(join(repository, "DESIGN.md"), declarations)
  writeFileSync(join(repository, "apps/web/example.tsx"), source)
  return repository
}

export const cases = () => {
  const fg4Card = stageRepository("fg4-card", `export function StatusRing(){return <span className="bg-[var(--bg-card)] shadow-[inset_0_0_0_2px_var(--fg-4)]" />}`)
  check("check-surface-scope.mjs", "rejects fg-4 graphics on a card", ["--root", fg4Card], {
    status: 1,
    stderr: /--fg-4 on card, dark ratio 2\.83, GRAPHIC floor 3\.00/,
  })

  const badTextSheet = stageRepository("bad-text-sheet", `export function Error(){return <div className="bg-[var(--bg-elev)] text-[var(--status-bad-text)]">error</div>}`)
  check("check-surface-scope.mjs", "accepts the fixed bad-status text on a sheet", ["--root", badTextSheet], {
    status: 0,
    stdout: /Surface scope guard passed/,
  })

  const primarySoftCard = stageRepository("primary-soft-card", `export function Accent(){return <div className="bg-[var(--bg-card)] text-[var(--primary-soft)]">accent</div>}`)
  check("check-surface-scope.mjs", "rejects primary-soft text on a card", ["--root", primarySoftCard], {
    status: 1,
    stderr: /--primary-soft on card, dark ratio 4\.27, TEXT floor 4\.50/,
  })

  const permitted = stageRepository("permitted", `export function Secondary(){return <div className="bg-[var(--bg-card)] text-[var(--fg-3)]">secondary</div>}`)
  check("check-surface-scope.mjs", "accepts a token inside its derived scope", ["--root", permitted], {
    status: 0,
    stdout: /Surface scope guard passed/,
  })

  const undeclared = stageRepository("undeclared", `export function Mystery(){return <span className="text-[var(--ambiguous)]">mystery</span>}`)
  check("check-surface-scope.mjs", "reports an undeclared role without failing", ["--root", undeclared], {
    status: 0,
    stdout: /UNDECLARED apps\/web\/example\.tsx:1: --ambiguous has an undeclared token role/,
  })

  const inheritedGraphic = stageRepository("inherited-graphic", `import { AlertTriangle } from '@/components/ui/icons'\nexport function Warning(){return <div className="bg-[var(--bg-card)] text-[var(--status-bad-text)]"><AlertTriangle /><span>warning</span></div>}`)
  check("check-surface-scope.mjs", "rejects a text role inherited by a mixed component graphic", ["--root", inheritedGraphic], {
    status: 1,
    stderr: /--status-bad-text used as GRAPHIC but declares TEXT/,
  })
}
