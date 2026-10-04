import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { contrastOnSurface } from "../../packages/shared/src/__tests__/contrast.ts"
import { neutralColors } from "../../packages/shared/src/theme/neutral-ramp.ts"
import { widgetColorPalette } from "../../apps/mobile/lib/widget-colors.generated.ts"

import { T, check, root, toolPath } from "./_harness.mjs"

const undeclaredRows = `| dark \`--ambiguous\` | undeclared | undeclared | - | - | - | - | - | - | - | - | - |
| light \`--ambiguous\` | undeclared | undeclared | - | - | - | - | - | - | - | - | - |`

/** Gives a motion paragraph opening tag one style attribute whose last member, and so its effective colour, is `color`. */
function withParagraphColor(openingTag, color) {
  const attribute = openingTag.indexOf("style={")
  if (attribute < 0) return openingTag.replace("<motion.p", `<motion.p style={{ ${color} }}`)
  const valueStart = attribute + "style={".length
  let depth = 1
  let end = valueStart
  while (depth > 0 && end < openingTag.length) {
    if (openingTag[end] === "{") depth++
    else if (openingTag[end] === "}") depth--
    end++
  }
  const value = openingTag.slice(valueStart, end - 1).trim()
  const members = value.startsWith("{") ? value.slice(1, -1).trim().replace(/,$/, "") : `...(${value})`
  const merged = members === "" ? `{ ${color} }` : `{ ${members}, ${color} }`
  return `${openingTag.slice(0, attribute)}style={${merged}}${openingTag.slice(end)}`
}

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
  const design = readFileSync(join(actualRoot, "DESIGN.md"), "utf8")
  writeFileSync(join(repository, "DESIGN.md"), design.replace("<!-- surface-scope:end -->", `${undeclaredRows}\n<!-- surface-scope:end -->`))
  mkdirSync(join(repository, "apps/web/app"), { recursive: true })
  cpSync(join(actualRoot, "apps/web/app/globals.css"), join(repository, "apps/web/app/globals.css"))
  writeFileSync(join(repository, "apps/web/example.tsx"), web)
  writeFileSync(join(repository, "apps/mobile/example.tsx"), mobile)
  return repository
}

function stageProducerRepository(label, paths, violation) {
  const repository = stageRepository(label, {})
  const actualRoot = join(dirname(toolPath("check-surface-scope.mjs")), "..")
  for (const path of [...paths, ...(paths.some((path) => path.startsWith("apps/mobile/")) ? ["apps/mobile/lib/theme.ts"] : [])]) {
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

function stageUnsafeEmptyTrack(repository) {
  const themePath = join(repository, "packages/shared/src/theme/neutral-ramp.ts")
  writeFileSync(themePath, readFileSync(themePath, "utf8").replace("trackEmpty: '#7E7E82'", "trackEmpty: '#7F7F83'"))
  const neutral = neutralColors.light
  const layers = new Map([
    ["canvas", [neutral.bg]], ["card", [neutral.bg, neutral.bgCard]], ["well", [neutral.bg, neutral.bgWell]],
    ["hover", [neutral.bg, neutral.bgHover]], ["widget card", [widgetColorPalette.light.card]], ["widget well", [widgetColorPalette.light.well]],
  ])
  const ratios = new Map([...layers].map(([surface, stack]) => [surface, contrastOnSurface("#7F7F83", stack)]))
  const scope = [...ratios].filter(([, ratio]) => ratio >= 3).map(([surface]) => surface).join(", ")
  const columns = ["canvas", "card", null, "well", null, "hover", null, "widget card", "widget well"].map((surface) => surface ? ratios.get(surface).toFixed(3) : "-").join(" | ")
  const row = `| light \`--track-empty\` | graphic | graphic: ${scope} | ${columns} |`
  const designPath = join(repository, "DESIGN.md")
  writeFileSync(designPath, readFileSync(designPath, "utf8").replace(/^\| light `--track-empty`.*$/m, row))
}

export const cases = () => {
  const scopedCases = [
    ["promoted-text", `<button className="orbit-hover-text bg-[var(--bg)] hover:bg-[var(--bg-hover)]"><span className="text-[var(--fg-3)]">Item</span></button>`, 0],
    ["unpromoted-text", `<button className="bg-[var(--bg)] hover:bg-[var(--bg-hover)]"><span className="text-[var(--fg-3)]">Item</span></button>`, 1],
    ["sibling-chart", `export function Chart(){return <span className="text-[var(--fg-3)]">Axis</span>} export function Screen(){const content = <><button className="hover:bg-[var(--bg-hover)]">Control</button><Chart /></>; return <div className="bg-[var(--bg)]">{content}</div>}`, 0],
    ["optional-track", `export function Ring({ trackColor }){return <svg><circle stroke={trackColor ?? 'var(--fg-4)'} /></svg>} export function Screen(){return <button className="bg-[var(--bg)] hover:bg-[var(--bg-hover)]"><Ring trackColor="var(--fg-3)" /></button>}`, 0],
    ["unpromoted-track", `export function Ring({ trackColor }){return <svg><circle stroke={trackColor ?? 'var(--fg-4)'} /></svg>} export function Screen(){return <button className="bg-[var(--bg)] hover:bg-[var(--bg-hover)]"><Ring /></button>}`, 1],
  ]
  for (const [label, web, status] of scopedCases) {
    const repository = stageRepository(label, { web })
    check("check-surface-scope.mjs", `resolves paint ancestry and scoped foreground: ${label}`, ["--root", repository], { status })
  }
  for (const [label, paths] of [
    ["partial-day", ["apps/web/components/dates/day-cell.tsx"]],
    ["habit-logging", ["apps/web/components/habits/habit-log-button.tsx", "apps/web/components/ui/progress-ring.tsx", "apps/web/components/ui/status-ring.tsx"]],
  ]) {
    for (const promoted of [true, false]) {
      const repository = stageProducerRepository(`unsafe-${label}-${promoted}`, paths)
      stageUnsafeEmptyTrack(repository)
      const cssPath = join(repository, "apps/web/app/globals.css")
      if (promoted) writeFileSync(cssPath, readFileSync(cssPath, "utf8") + "\n.light button:hover { --track-empty: var(--fg-3); --status-empty: var(--track-empty); }")
      check("check-surface-scope.mjs", `measures the real ${label} canvas hover with promotion ${promoted}`, ["--root", repository], {
        status: promoted ? 0 : 1,
        ...(promoted ? {} : { stderr: /--track-empty on hover, light ratio 2\.995, GRAPHIC floor 3\.00/ }),
      })
    }
  }
  const producerCases = [
    { label: "partial-day", paths: ["apps/web/components/dates/day-cell.tsx"], path: "apps/web/components/dates/day-cell.tsx", before: 'stroke="var(--status-empty)"', after: 'stroke="var(--fg-4)"' },
    { label: "habit-track", paths: ["apps/web/components/habits/habit-log-button.tsx", "apps/web/components/ui/progress-ring.tsx", "apps/web/components/ui/status-ring.tsx"], path: "apps/web/components/ui/progress-ring.tsx", before: 'stroke="var(--track-empty)"', after: 'stroke="var(--fg-4)"' },
    { label: "native-promotion", paths: ["apps/mobile/components/navigation/bottom-tab-bar.tsx"], path: "apps/mobile/components/navigation/bottom-tab-bar.tsx", before: 'hoverForeground(currentTheme, tokens.fg3, hoveredId === item.id)', after: 'tokens.fg3' },
  ]
  for (const producer of producerCases) {
    const good = stageProducerRepository(`actual-${producer.label}`, producer.paths)
    check("check-surface-scope.mjs", `accepts the shipped composition: ${producer.label}`, ["--root", good], { status: 0 })
    const bad = stageProducerRepository(`broken-${producer.label}`, producer.paths, producer)
    check("check-surface-scope.mjs", `rejects a removed foreground correction: ${producer.label}`, ["--root", bad], {
      status: 1, stderr: producer.label === "native-promotion" ? /--fg-3 on hover, light ratio/ : /--fg-4 on hover, .*GRAPHIC floor 3\.00/,
    })
  }
  const producerText = stageProducerRepository("actual-text-promotion", ["apps/web/components/navigation/bottom-tab-bar.tsx"])
  const producerCss = join(producerText, "apps/web/app/globals.css")
  writeFileSync(producerCss, readFileSync(producerCss, "utf8").replaceAll("--fg-3: var(--fg-2);", ""))
  check("check-surface-scope.mjs", "rejects the shipped inactive tab when its CSS promotion is removed", ["--root", producerText], {
    status: 1, stderr: /--fg-3 on hover, light ratio 4\.161, TEXT floor 4\.50/,
  })
  const aliasSource = `<div className="alias-owner bg-[var(--bg)] hover:bg-[var(--bg-hover)]"><svg className="track-owner"><circle stroke="var(--status-empty)" /></svg></div>`
  for (const [label, css, status] of [
    ["inherited-alias", ".alias-owner { --status-empty: var(--fg-4); } .track-owner { --fg-4: var(--fg-3); }", 1],
    ["rebound-alias", ".alias-owner { --status-empty: var(--fg-4); } .track-owner { --fg-4: var(--fg-3); --status-empty: var(--fg-4); }", 0],
  ]) {
    const repository = stageRepository(label, { web: aliasSource })
    const cssPath = join(repository, "apps/web/app/globals.css")
    writeFileSync(cssPath, readFileSync(cssPath, "utf8") + css)
    check("check-surface-scope.mjs", `resolves aliases at their defining scope: ${label}`, ["--root", repository], { status })
  }
  for (const [label, promotion, status] of [["imported-style", "", 1], ["promoted-imported-style", "orbit-hover-text", 0]]) {
    const repository = stageRepository(label, { web: `import { captionStyle } from './caption'
export function Screen(){return <button className="${promotion} bg-[var(--bg)] hover:bg-[var(--bg-hover)]"><span style={captionStyle}>Caption</span></button>}` })
    writeFileSync(join(repository, "apps/web/caption.ts"), `export const captionStyle = { color: 'var(--fg-3)' }`)
    check("check-surface-scope.mjs", `follows an imported foreground to its painted caller: ${label}`, ["--root", repository], { status })
  }
  const promoted = stageRepository("removed-promotion", { web: scopedCases[0][1] })
  const cssPath = join(promoted, "apps/web/app/globals.css")
  writeFileSync(cssPath, readFileSync(cssPath, "utf8").replaceAll("--fg-3: var(--fg-2);", ""))
  check("check-surface-scope.mjs", "rejects text when its shipped CSS promotion is removed", ["--root", promoted], {
    status: 1, stderr: /--fg-3 on hover, light ratio 4\.161, TEXT floor 4\.50/,
  })
  const interactionOwners = [
    { path: "apps/web/components/navigation/bottom-tab-bar.tsx", before: " group-hover:text-[var(--primary-text)]", after: "" },
    { path: "apps/web/components/shell/shell-wide.tsx", before: " hover:text-[var(--primary-text)]", after: "" },
    { path: "apps/mobile/components/navigation/bottom-tab-bar.tsx", before: "active ? (hoveredId === item.id ? tokens.primaryText : tokens.primarySoft) : hoverForeground(currentTheme, tokens.fg3, hoveredId === item.id)", after: "active ? tokens.primarySoft : tokens.fg3" },
  ]
  for (const [index, owner] of interactionOwners.entries()) {
    const paired = stageProducerRepository(`paired-owner-${index}`, [owner.path])
    check("check-surface-scope.mjs", `accepts paired resting and interaction colors in ${owner.path}`, ["--root", paired], {
      status: 0,
      stdout: /Surface scope guard passed/,
    })
    const unpaired = stageProducerRepository(`unpaired-owner-${index}`, [owner.path], owner)
    check("check-surface-scope.mjs", `rejects retained resting text on the interaction surface in ${owner.path}`, ["--root", unpaired], {
      status: 1,
      stderr: /--primary-soft on hover, dark ratio 3\.385, TEXT floor 4\.50/,
    })
  }
  const stateCases = [
    ["direct-hover", { web: `<button className="bg-[var(--bg)] hover:bg-[var(--bg-hover)] text-[var(--primary-soft)] hover:text-[var(--primary-text)]">Item</button>` }, 0],
    ["wrong-state", { web: `<button className="bg-[var(--bg)] hover:bg-[var(--bg-hover)] text-[var(--primary-soft)] focus:text-[var(--primary-text)]">Item</button>` }, 1],
    ["child-hover", { web: `<button className="bg-[var(--bg)] hover:bg-[var(--bg-hover)]"><span className="text-[var(--primary-soft)] hover:text-[var(--primary-text)]">Item</span></button>` }, 1],
    ["conditional-hover-ancestor", { web: `export function Example({ active }) { return <button className={active ? "bg-[var(--bg)] hover:bg-[var(--bg-hover)]" : "bg-[var(--bg)]"}><span className="text-[var(--primary-soft)] hover:text-[var(--primary-text)]">Item</span></button> }` }, 1],
    ["font-size-hover", { web: `<button className="bg-[var(--bg)] hover:bg-[var(--bg-hover)] text-[var(--primary-soft)] hover:text-[14px]">Item</button>` }, 1],
    ["self-group", { web: `<button className="bg-[var(--bg)] hover:bg-[var(--bg-hover)]"><span className="group text-[var(--primary-soft)] group-hover:text-[var(--primary-text)]">Item</span></button>` }, 1],
    ["hover-canvas", { web: `<button className="bg-[var(--bg-card)] hover:bg-[var(--bg)] text-[var(--primary-text)] hover:text-[var(--primary-soft)]">Item</button>` }, 0],
    ["sibling-override", { web: `<button className="bg-[var(--bg)] hover:bg-[var(--bg-hover)]"><span className="text-[var(--primary-soft)]">Item</span><span className="hover:text-[var(--primary-text)]">Other</span></button>` }, 1],
    ["missing-group", { web: `<button className="bg-[var(--bg)] hover:bg-[var(--bg-hover)]"><span className="text-[var(--primary-soft)] group-hover:text-[var(--primary-text)]">Item</span></button>` }, 1],
    ["independent-group-hover", { web: `<div className="bg-[var(--bg)] hover:bg-[var(--bg-hover)] p-4"><div className="group"><span className="text-[var(--primary-soft)] group-hover:text-[var(--primary-text)]">Item</span></div></div>` }, 1],
    ["background-owner-group", { web: `<div className="group bg-[var(--bg)] hover:bg-[var(--bg-hover)] p-4"><div><span className="text-[var(--primary-soft)] group-hover:text-[var(--primary-text)]">Item</span></div></div>` }, 0],
    ["background-inside-group", { web: `<div className="group"><div className="bg-[var(--bg)] hover:bg-[var(--bg-hover)] p-4"><span className="text-[var(--primary-soft)] group-hover:text-[var(--primary-text)]">Item</span></div></div>` }, 0],
    ["nested-correlated-groups", { web: `<div className="group bg-[var(--bg)] hover:bg-[var(--bg-hover)] p-4"><div className="group"><span className="text-[var(--primary-soft)] group-hover:text-[var(--primary-text)]">Item</span></div></div>` }, 0],
    ["bad-resting-surface", { web: `<button className="bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-[var(--primary-soft)] hover:text-[var(--primary-text)]">Item</button>` }, 1],
    ["bad-hover-override", { web: `<button className="bg-[var(--bg)] hover:bg-[var(--bg-hover)] text-[var(--primary-text)] hover:text-[var(--primary-soft)]">Item</button>` }, 1],
    ["reversed-press", { mobile: `<View style={{ backgroundColor: tokens.bg }}><Pressable style={({ pressed }) => ({ backgroundColor: pressed ? tokens.bgHover : 'transparent' })}>{({ pressed }) => <Text style={{ color: pressed ? tokens.primarySoft : tokens.primaryText }}>Item</Text>}</Pressable></View>` }, 1],
    ["direct-press", { mobile: `<View style={{ backgroundColor: tokens.bg }}><Pressable style={({ pressed }) => ({ backgroundColor: pressed ? tokens.bgHover : 'transparent' })}>{({ pressed }) => <Text style={{ color: pressed ? tokens.primaryText : tokens.primarySoft }}>Item</Text>}</Pressable></View>` }, 0],
    ["native-hover", { mobile: `<View style={{ backgroundColor: tokens.bg }}><Pressable style={[hoveredId === item.id && { backgroundColor: tokens.bgHover }]}><Text style={{ color: active ? (hoveredId === item.id ? tokens.primaryText : tokens.primarySoft) : hoverForeground(currentTheme, tokens.fg3, hoveredId === item.id) }}>Item</Text></Pressable></View>` }, 0],
    ["native-unpaired-hover", { mobile: `<View style={{ backgroundColor: tokens.bg }}><Pressable style={[hoveredId === item.id && { backgroundColor: tokens.bgHover }]}><Text style={{ color: active ? tokens.primarySoft : tokens.fg3 }}>Item</Text></Pressable></View>` }, 1],
    ["native-wrong-hover-owner", { mobile: `<View style={{ backgroundColor: tokens.bg }}><Pressable style={[hoveredId === other.id && { backgroundColor: tokens.bgHover }]}><Text style={{ color: hoveredId === item.id ? tokens.primaryText : tokens.primarySoft }}>Item</Text></Pressable></View>` }, 1],
    ["native-reversed-hover", { mobile: `<View style={{ backgroundColor: tokens.bg }}><Pressable style={[hovered && { backgroundColor: tokens.bgHover }]}><Text style={{ color: hovered ? tokens.primarySoft : tokens.primaryText }}>Item</Text></Pressable></View>` }, 1],
    ["native-negated-hover", { mobile: `<View style={{ backgroundColor: tokens.bg }}><Pressable style={[hovered && { backgroundColor: tokens.bgHover }]}><Text style={{ color: !hovered ? tokens.primarySoft : tokens.primaryText }}>Item</Text></Pressable></View>` }, 0],
    ["native-ternary-hover", { mobile: `<View style={{ backgroundColor: tokens.bg }}><Pressable style={{ backgroundColor: hovered ? tokens.bgHover : 'transparent' }}><Text style={{ color: hovered ? tokens.primaryText : tokens.primarySoft }}>Item</Text></Pressable></View>` }, 0],
    ["native-disjunction-hover", { mobile: `<View style={{ backgroundColor: tokens.bg }}><Pressable style={[!hovered || { backgroundColor: tokens.bgHover }]}><Text style={{ color: hovered ? tokens.primaryText : tokens.primarySoft }}>Item</Text></Pressable></View>` }, 0],
    ["native-icon-well-press", { mobile: `<View style={{ backgroundColor: tokens.bg }}><Pressable>{({ pressed }) => <><View style={[pressed && { backgroundColor: tokens.bgHover }]}><Icon color={tokens.fg3} /></View><Text style={{ color: tokens.primarySoft }}>Item</Text></>}</Pressable></View>` }, 0],
    ["native-label-well-press", { mobile: `<View style={{ backgroundColor: tokens.bg }}><Pressable>{({ pressed }) => <View style={[pressed && { backgroundColor: tokens.bgHover }]}><Text style={{ color: tokens.primarySoft }}>Item</Text></View>}</Pressable></View>` }, 1],
  ]
  for (const [label, source, status] of stateCases) {
    const repository = stageRepository(label, source.mobile ? {
      mobile: `export function Example({ tokens, hovered, hoveredId, item, other, active }) { return ${source.mobile} }`,
    } : source)
    check("check-surface-scope.mjs", `pairs foreground and background states: ${label}`, ["--root", repository], {
      status,
      ...(status === 0 ? { stdout: /Surface scope guard passed/ } : { stderr: /--primary-soft on (?:hover|card), dark ratio/ }),
    })
  }
  for (const [label, parameter, condition, status] of [
    ["shadowed-hover-binding", "{ hovered }", "hovered", 1],
    ["renamed-hover-binding", "{ hovered: itemHovered }", "itemHovered", 1],
    ["shared-hover-binding", "item", "hovered", 0],
  ]) {
    const repository = stageRepository(label, { mobile: `
      export function Example({ hovered, items, tokens }) {
        return <View style={[
          { backgroundColor: tokens.bg },
          hovered && { backgroundColor: tokens.bgHover },
        ]}>
          {items.map((${parameter}) => (
            <Text style={{ color: ${condition} ? tokens.primaryText : tokens.primarySoft }}>Item</Text>
          ))}
        </View>
      }
    ` })
    const result = check("check-surface-scope.mjs", `correlates lexical bindings: ${label}`, ["--root", repository], {
      status,
      ...(status === 0 ? { stdout: /Surface scope guard passed/ } : { stderr: /--primary-soft on hover, dark ratio 3\.385, TEXT floor 4\.50/ }),
    })
    if (status === 1) {
      T(`independent hover bindings report both contrast violations: ${label}`,
        /--primary-soft on hover, light ratio 3\.545, TEXT floor 4\.50/.test(result.stderr), result.stderr)
    }
  }
  for (const [label, parameter, status] of [
    ["shadowed-comparison-binding", "item", 1],
    ["shared-comparison-bindings", "entry", 0],
  ]) {
    const repository = stageRepository(label, { mobile: `
      export function Example({ hoveredId, item, items, tokens }) {
        return <View style={[
          { backgroundColor: tokens.bg },
          hoveredId === item.id && { backgroundColor: tokens.bgHover },
        ]}>
          {items.map((${parameter}) => (
            <Text style={{ color: hoveredId === item.id ? tokens.primaryText : tokens.primarySoft }}>Item</Text>
          ))}
        </View>
      }
    ` })
    check("check-surface-scope.mjs", `correlates every comparison binding: ${label}`, ["--root", repository], {
      status,
      ...(status === 0 ? { stdout: /Surface scope guard passed/ } : { stderr: /--primary-soft on hover, dark ratio 3\.385, TEXT floor 4\.50/ }),
    })
  }
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
  const alertColor = "color: 'var(--status-bad-text)'"
  const coloredSpan = `<span style={{ ${alertColor} }}>`
  const spanPosition = alertParagraph.indexOf(coloredSpan)
  if (spanPosition < 0) throw new Error("wrapped share alert paragraph no longer colors its inner span")
  const openingTag = alertParagraph.slice(0, spanPosition)
  const coloredOpeningTag = withParagraphColor(openingTag, alertColor)
  for (const [form, tag, expected] of [
    ["a literal style", "<motion.p style={{ fontSize: 13 }} role=\"alert\">", "style={{ fontSize: 13, color: 'var(--status-bad-text)' }}"],
    ["a literal style with its own colour", "<motion.p style={{ color: 'var(--fg-2)', fontSize: 13, }} role=\"alert\">", "style={{ color: 'var(--fg-2)', fontSize: 13, color: 'var(--status-bad-text)' }}"],
    ["a named style", "<motion.p style={captionStyle} role=\"alert\">", "style={{ ...(captionStyle), color: 'var(--status-bad-text)' }}"],
    ["no style", "<motion.p role=\"alert\">", "<motion.p style={{ color: 'var(--status-bad-text)' }} role=\"alert\">"],
  ]) {
    const derived = withParagraphColor(tag, alertColor)
    T(`wrapped alert fixture keeps one paragraph style whose last colour is the alert colour for ${form}`,
      derived.split("style=").length === 2 && derived.includes(expected), derived)
  }
  const coloredParagraph = coloredOpeningTag + alertParagraph.slice(spanPosition).replace(coloredSpan, "<span>")
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
  for (const lineShift of [0, 2]) {
    const badCalendar = stageProducerRepository(`producer-calendar-fg4-shift-${lineShift}`, calendarPaths, calendarViolation)
    const calendarPath = join(badCalendar, dateField)
    const source = readFileSync(calendarPath, "utf8").replace(calendarViolation.after, "\n".repeat(lineShift) + calendarViolation.after)
    writeFileSync(calendarPath, source)
    const calendarParts = source.split(calendarViolation.after)
    if (calendarParts.length !== 2) throw new Error("date field fixture must contain exactly one changed Calendar icon")
    const calendarLine = calendarParts[0].split("\n").length
    const diagnostic = new RegExp(`^Surface scope guard failed\\.\\r?\\n${dateField.replaceAll(".", "\\.")}:${calendarLine}: --fg-4 on field, dark ratio 2\\.728, GRAPHIC floor 3\\.00\\r?\\n?$`)
    const result = check("check-surface-scope.mjs", `rejects the date field calendar on its StyleSheet field after ${lineShift} added lines`, ["--root", badCalendar], {
      status: 1,
      stderr: diagnostic,
    })
    for (const [field, before, after] of [
      ["file", dateField, "apps/mobile/components/ui/other-field.tsx"],
      ["line", `:${calendarLine}:`, `:${calendarLine + 1}:`],
      ["token", "--fg-4", "--fg-3"],
      ["surface", "on field", "on canvas"],
      ["ratio", "2.728", "3.032"],
      ["floor", "GRAPHIC floor 3.00", "TEXT floor 4.50"],
    ]) {
      T(`calendar diagnostic rejects a wrong ${field} after ${lineShift} added lines`, !diagnostic.test(result.stderr.replace(before, after)))
    }
    T(`calendar diagnostic rejects a missing violation after ${lineShift} added lines`, !diagnostic.test(""))
    const goodCalendar = stageProducerRepository(`producer-calendar-fg3-shift-${lineShift}`, calendarPaths)
    const goodPath = join(goodCalendar, dateField)
    writeFileSync(goodPath, readFileSync(goodPath, "utf8").replace(calendarViolation.before, "\n".repeat(lineShift) + calendarViolation.before))
    check("check-surface-scope.mjs", `accepts the date field calendar in both modes after ${lineShift} added lines`, ["--root", goodCalendar], {
      status: 0,
      stdout: /Surface scope guard passed/,
    })
  }

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
