import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { check, root, toolPath } from "./_harness.mjs"

const declarations = `# Design\n\n<!-- surface-scope:start -->\n| on | role | scope | canvas | card | field | well | elev-2 | hover | overlay | widget card | widget well |\n|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n| dark \`--fg-3\` | text + graphic | text: canvas, card, field, well, elev-2, hover, overlay, widget card, widget well; graphic: canvas, card, field, well, elev-2, hover, overlay, widget card, widget well | 6.175 | 5.760 | 5.557 | 5.281 | 4.688 | 4.567 | 5.281 | 5.760 | 5.224 |\n| light \`--fg-3\` | text + graphic | text: canvas, card, well, hover, widget card, widget well; graphic: canvas, card, well, hover, widget card, widget well | 5.309 | 5.542 | - | 4.863 | - | 4.691 | - | 5.542 | 4.909 |\n| dark \`--fg-4\` | graphic | graphic: canvas | 3.032 | 2.828 | 2.728 | 2.593 | 2.302 | 2.242 | 2.593 | 2.828 | 2.565 |\n| light \`--fg-4\` | graphic | graphic: canvas, card, well, widget card, widget well | 3.338 | 3.485 | - | 3.058 | - | 2.950 | - | 3.485 | 3.087 |\n| dark \`--primary-soft\` | text | text: canvas | 4.577 | 4.269 | 4.118 | 3.914 | 3.475 | 3.385 | 3.914 | 4.269 | 3.871 |\n| light \`--primary-soft\` | text | text: canvas, card, widget card | 4.523 | 4.721 | - | 4.142 | - | 3.996 | - | 4.721 | 4.182 |\n| dark \`--status-bad-text\` | text | text: canvas, card, field, well, elev-2, hover, overlay, widget card, widget well | 7.788 | 7.264 | 7.008 | 6.661 | 5.913 | 5.760 | 6.661 | 7.264 | 6.588 |\n| light \`--status-bad-text\` | text | text: canvas, card, well, hover, widget card, widget well | 5.168 | 5.394 | - | 4.733 | - | 4.566 | - | 5.394 | 4.779 |\n| dark \`--ambiguous\` | undeclared | undeclared | - | - | - | - | - | - | - | - | - |\n| light \`--ambiguous\` | undeclared | undeclared | - | - | - | - | - | - | - | - | - |\n<!-- surface-scope:end -->\n`

function stageRepository(label, { web = "", mobile = "" }) {
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
  writeFileSync(join(repository, "apps/web/example.tsx"), web)
  writeFileSync(join(repository, "apps/mobile/example.tsx"), mobile)
  return repository
}

function stageProducerRepository(label, paths, violation) {
  const repository = stageRepository(label, {})
  const actualRoot = join(dirname(toolPath("check-surface-scope.mjs")), "..")
  for (const path of paths) {
    const target = join(repository, path)
    mkdirSync(dirname(target), { recursive: true })
    const source = readFileSync(join(actualRoot, path), "utf8")
    if (path !== violation?.path) {
      writeFileSync(target, source)
      continue
    }
    if (!source.includes(violation.before)) throw new Error(`producer changed: ${path}`)
    writeFileSync(target, source.replace(violation.before, violation.after))
  }
  return repository
}

export const cases = () => {
  const fg4Card = stageRepository("fg4-card", { web: `export function StatusRing(){return <span className="bg-[var(--bg-card)] shadow-[inset_0_0_0_2px_var(--fg-4)]" />}` })
  check("check-surface-scope.mjs", "rejects fg-4 graphics on a card", ["--root", fg4Card], {
    status: 1,
    stderr: /--fg-4 on card, dark ratio 2\.828, GRAPHIC floor 3\.00/,
  })

  const badTextSheet = stageRepository("bad-text-sheet", { web: `export function Error(){return <div className="bg-[var(--bg-elev)] text-[var(--status-bad-text)]">error</div>}` })
  check("check-surface-scope.mjs", "accepts the fixed bad-status text on a sheet", ["--root", badTextSheet], {
    status: 0,
    stdout: /Surface scope guard passed/,
  })

  const wrappedSlideSource = readFileSync(join(dirname(toolPath("check-surface-scope.mjs")), "..", "apps/web/app/(app)/wrapped/_components/wrapped-slide.tsx"), "utf8")
  const alertPosition = wrappedSlideSource.indexOf('role="alert"')
  const paragraphStart = wrappedSlideSource.lastIndexOf("<motion.p", alertPosition)
  const paragraphEnd = wrappedSlideSource.indexOf("</motion.p>", alertPosition) + "</motion.p>".length
  if (alertPosition < 0 || paragraphStart < 0 || paragraphEnd < "</motion.p>".length) {
    throw new Error("wrapped share alert paragraph is missing")
  }
  const alertParagraph = wrappedSlideSource.slice(paragraphStart, paragraphEnd)
  if (!alertParagraph.includes("style={{ textAlign: 'center', fontSize: 13 }}")
    || !alertParagraph.includes("<span style={{ color: 'var(--status-bad-text)' }}>")) {
    throw new Error("wrapped share alert paragraph has changed")
  }
  const coloredParagraph = alertParagraph
    .replace("style={{ textAlign: 'center', fontSize: 13 }}", "style={{ textAlign: 'center', fontSize: 13, color: 'var(--status-bad-text)' }}")
    .replace("<span style={{ color: 'var(--status-bad-text)' }}>", "<span>")
  const motionText = stageRepository("motion-text", { web: `export function WrappedShareSlide(){return (${coloredParagraph})}` })
  check("check-surface-scope.mjs", "accepts the wrapped share alert color on its motion paragraph", ["--root", motionText], {
    status: 0,
    stdout: /Surface scope guard passed/,
  })

  const iconColor = stageRepository("icon-color", { web: `import { AlertTriangle } from '@/components/ui/icons'\nexport function Warning(){return <AlertTriangle style={{ color: 'var(--status-bad-text)' }} />}` })
  check("check-surface-scope.mjs", "rejects the same color on an icon", ["--root", iconColor], {
    status: 1,
    stderr: /--status-bad-text used as GRAPHIC but declares TEXT/,
  })

  const primarySoftCard = stageRepository("primary-soft-card", { web: `export function Accent(){return <div className="bg-[var(--bg-card)] text-[var(--primary-soft)]">accent</div>}` })
  check("check-surface-scope.mjs", "rejects primary-soft text on a card", ["--root", primarySoftCard], {
    status: 1,
    stderr: /--primary-soft on card, dark ratio 4\.269, TEXT floor 4\.50/,
  })

  const permitted = stageRepository("permitted", { web: `export function Secondary(){return <div className="bg-[var(--bg-card)] text-[var(--fg-3)]">secondary</div>}` })
  check("check-surface-scope.mjs", "accepts a token inside its derived scope", ["--root", permitted], {
    status: 0,
    stdout: /Surface scope guard passed/,
  })

  const undeclared = stageRepository("undeclared", { web: `export function Mystery(){return <span className="text-[var(--ambiguous)]">mystery</span>}` })
  check("check-surface-scope.mjs", "reports an undeclared role without failing", ["--root", undeclared], {
    status: 0,
    stdout: /UNDECLARED apps\/web\/example\.tsx:1: --ambiguous has an undeclared token role/,
  })

  const inheritedGraphic = stageRepository("inherited-graphic", { web: `import { AlertTriangle } from '@/components/ui/icons'\nexport function Warning(){return <div className="bg-[var(--bg-card)] text-[var(--status-bad-text)]"><AlertTriangle /><span>warning</span></div>}` })
  check("check-surface-scope.mjs", "rejects a text role inherited by a mixed component graphic", ["--root", inheritedGraphic], {
    status: 1,
    stderr: /--status-bad-text used as GRAPHIC but declares TEXT/,
  })

  const localClass = stageRepository("local-class", { web: `export function SidebarItem({ active }){\n  const className = [\n    'base',\n    active ? 'text-[var(--primary-soft)] hover:bg-[var(--bg-hover)]' : 'text-[var(--fg-3)] hover:bg-[var(--bg-hover)]',\n  ].join(' ')\n  return <button className={className}>item</button>\n}` })
  check("check-surface-scope.mjs", "rejects a web token on a surface in its local class expression", ["--root", localClass], {
    status: 1,
    stderr: /apps\/web\/example\.tsx:4: --primary-soft on hover, dark ratio 3\.385, TEXT floor 4\.50/,
  })

  const localContent = stageRepository("local-content", { web: `export function SidebarItem(){\n  const content = <Icon color="var(--fg-4)" />\n  const className = 'hover:bg-[var(--bg-hover)]'\n  return <button className={className}>{content}</button>\n}` })
  check("check-surface-scope.mjs", "rejects a graphic carried through local JSX onto a local class surface", ["--root", localContent], {
    status: 1,
    stderr: /apps\/web\/example\.tsx:2: --fg-4 on hover, dark ratio 2\.242, GRAPHIC floor 3\.00/,
  })

  const ancestorState = stageRepository("ancestor-state", { mobile: `export function BottomTabBar(){\n  return <Pressable style={({ pressed }) => ({ backgroundColor: pressed ? tokens.bgHover : 'transparent' })}>\n    <Text style={{ color: tokens.primarySoft }}>Active</Text>\n  </Pressable>\n}` })
  check("check-surface-scope.mjs", "rejects a mobile text token on its direct ancestor state surface", ["--root", ancestorState], {
    status: 1,
    stderr: /apps\/mobile\/example\.tsx:3: --primary-soft on hover, dark ratio 3\.385, TEXT floor 4\.50/,
  })

  const mappedGraphic = stageRepository("mapped-graphic", { mobile: `export function StatusRing({ status = 'empty' }){\n  const color = { empty: tokens.fg4, done: tokens.fg3 }[status]\n  return <View style={{ borderColor: color }} />\n}\nexport function Card(){return <View style={{ backgroundColor: tokens.bgCard }}><StatusRing /></View>}` })
  check("check-surface-scope.mjs", "rejects a mobile graphic token followed through a local status map", ["--root", mappedGraphic], {
    status: 1,
    stderr: /apps\/mobile\/example\.tsx:2: --fg-4 on card, dark ratio 2\.828, GRAPHIC floor 3\.00/,
  })

  const selectedObjectMember = stageRepository("selected-object-member", { mobile: `export function Toast({ kind = 'lost' }){\n  const lossColors = { background: tokens.bgCard, action: tokens.primarySoft }\n  const neutralColors = { background: tokens.bgSheet, action: tokens.fg1 }\n  const colors = { neutral: neutralColors, lost: lossColors }[kind]\n  return <View style={{ backgroundColor: colors.background }}><Text style={{ color: colors.action }}>Retry</Text></View>\n}` })
  check("check-surface-scope.mjs", "rejects text carried through a selected local object member", ["--root", selectedObjectMember], {
    status: 1,
    stderr: /^Surface scope guard failed\.\r?\napps\/mobile\/example\.tsx:2: --primary-soft on card, dark ratio 4\.269, TEXT floor 4\.50\r?\n?$/,
  })

  const unresolved = stageRepository("unresolved", { mobile: `export function Accent(){return <Text style={{ color: tokens.primarySoft }}>accent</Text>}` })
  check("check-surface-scope.mjs", "fails a surface-sensitive token whose surface is unresolved", ["--root", unresolved], {
    status: 1,
    stderr: /apps\/mobile\/example\.tsx:1: --primary-soft TEXT surface is unresolved/,
  })

  const dateField = "apps/mobile/components/ui/date-field.tsx"
  const calendarPaths = [dateField]
  const calendarViolation = { path: dateField, before: "<Calendar size={20} strokeWidth={1.8} color={tokens.fg3} />", after: "<Calendar size={20} strokeWidth={1.8} color={tokens.fg4} />" }
  const badCalendar = stageProducerRepository("producer-calendar-fg4", calendarPaths, calendarViolation)
  check("check-surface-scope.mjs", "rejects the date field calendar on its StyleSheet field", ["--root", badCalendar], {
    status: 1,
    stderr: /apps\/mobile\/components\/ui\/date-field\.tsx:331: --fg-4 on field, dark ratio 2\.728, GRAPHIC floor 3\.00/,
  })
  const goodCalendar = stageProducerRepository("producer-calendar-fg3", calendarPaths)
  check("check-surface-scope.mjs", "accepts the date field calendar in both modes", ["--root", goodCalendar], {
    status: 0,
    stdout: /Surface scope guard passed/,
  })

  const siblingStyles = stageRepository("sibling-styles", { mobile: `import { X } from '@/components/ui/icons'
const styles = StyleSheet.create({ canvas: { backgroundColor: tokens.bg }, field: { backgroundColor: tokens.bgField } })
export function CanvasIcon(){return <View style={styles.canvas}><X color={tokens.fg4} /></View>}` })
  check("check-surface-scope.mjs", "uses the selected StyleSheet member instead of a sibling surface", ["--root", siblingStyles], {
    status: 0,
    stdout: /Surface scope guard passed/,
  })

  const deadlineField = "apps/mobile/components/habits/create-goal-from-habit/goal-deadline-field.tsx"
  const deadlinePaths = [
    deadlineField,
    "apps/mobile/components/habits/create-goal-from-habit-sheet.tsx",
    "apps/mobile/components/ui/sheet.tsx",
  ]
  const deadlineViolation = { path: deadlineField, before: "<X size={16} color={tokens.fg3} strokeWidth={1.8} />", after: "<X size={16} color={tokens.fg4} strokeWidth={1.8} />" }
  const badDeadline = stageProducerRepository("producer-deadline-fg4", deadlinePaths, deadlineViolation)
  check("check-surface-scope.mjs", "rejects the deadline dismiss icon on its caller sheet", ["--root", badDeadline], {
    status: 1,
    stderr: /apps\/mobile\/components\/habits\/create-goal-from-habit\/goal-deadline-field\.tsx:46: --fg-4 on overlay, dark ratio 2\.593, GRAPHIC floor 3\.00/,
  })
  const goodDeadline = stageProducerRepository("producer-deadline-fg3", deadlinePaths)
  check("check-surface-scope.mjs", "accepts the deadline dismiss icon in both modes", ["--root", goodDeadline], {
    status: 0,
    stdout: /Surface scope guard passed/,
  })
}
