#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, extname, relative, resolve } from "node:path"
import { pathToFileURL, fileURLToPath } from "node:url"
import ts from "typescript"

const USAGE = `usage: check-surface-scope.mjs [--root <repository>]

  Derives each declared color token's permitted surfaces from the shipped
  theme values, then checks web and mobile token call sites with the
  repository TypeScript parser.

  --root <repository>  scan this repository instead of the script's repository
  --help, -h           print this usage and exit 0

exit codes: 0 no out-of-scope use, 1 violation found, 2 usage or declaration error`

const SKIPPED_DIRECTORIES = new Set([".expo", ".next", "__tests__", "coverage", "dist", "node_modules", "scripts"])
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"])
const DECLARATION_START = "<!-- surface-scope:start -->"
const DECLARATION_END = "<!-- surface-scope:end -->"
const FLOORS = { text: 4.5, graphic: 3 }
const TOKEN_ALIASES = new Map([
  ["--status-empty", "--track-empty"],
  ["--status-done", "--fg-1"],
  ["--status-frozen", "--fg-2"],
])
const SURFACE_TOKENS = new Map([
  ["--bg", "canvas"],
  ["--bg-card", "card"],
  ["--bg-field", "field"],
  ["--bg-well", "well"],
  ["--bg-elev-2", "elev-2"],
  ["--bg-hover", "hover"],
  ["--bg-elev", "overlay"],
  ["--bg-sheet", "overlay"],
])

function parseArguments(argv) {
  let repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === "--help" || argument === "-h") {
      console.log(USAGE)
      process.exit(0)
    }
    if (argument === "--root") {
      const value = argv[index + 1]
      if (!value) throw new Error("--root requires a repository path")
      repositoryRoot = resolve(value)
      index += 1
      continue
    }
    throw new Error(`unknown argument: ${argument}`)
  }
  return repositoryRoot
}

function collectSourceFiles(directory) {
  if (!existsSync(directory)) throw new Error(`missing app directory: ${directory}`)
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) files.push(...collectSourceFiles(resolve(directory, entry.name)))
      continue
    }
    if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(resolve(directory, entry.name))
  }
  return files
}

function markdownCells(line) {
  return line.split("|").slice(1, -1).map((cell) => cell.trim())
}

function normalizeRoles(value) {
  if (value === "undeclared") return []
  const roles = value.toLowerCase().split("+").map((role) => role.trim())
  if (roles.length === 0 || roles.some((role) => !(role in FLOORS))) {
    throw new Error(`invalid declared role: ${value}`)
  }
  return roles
}

function parseDeclarations(designSource) {
  const start = designSource.indexOf(DECLARATION_START)
  const end = designSource.indexOf(DECLARATION_END)
  if (start < 0 || end < start) throw new Error("DESIGN.md is missing the surface-scope declaration table")
  const lines = designSource.slice(start, end).split(/\r?\n/).filter((line) => /^\|\s*(?:dark|light)\s+`--/.test(line))
  const declarations = new Map()
  for (const line of lines) {
    const cells = markdownCells(line)
    const identity = cells[0]?.match(/^(dark|light)\s+`(--[\w-]+)`$/)
    if (!identity || !cells[1] || !cells[2]) throw new Error(`invalid surface-scope row: ${line}`)
    const [, mode, token] = identity
    const roles = normalizeRoles(cells[1])
    const declaration = declarations.get(token) ?? { roles, rows: new Map() }
    if (declaration.roles.join() !== roles.join()) throw new Error(`${token} declares different roles by mode`)
    if (declaration.rows.has(mode)) throw new Error(`${token} repeats its ${mode} declaration`)
    declaration.rows.set(mode, { scope: cells[2], ratios: cells.slice(3) })
    declarations.set(token, declaration)
  }
  if (declarations.size === 0) throw new Error("DESIGN.md surface-scope table has no declarations")
  return declarations
}

function propertyName(node) {
  if (!node) return ""
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text
  return node.getText()
}

function unwrapExpression(node) {
  let current = node
  while (current && (ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isParenthesizedExpression(current))) {
    current = current.expression
  }
  return current
}

function objectProperty(object, name) {
  object = unwrapExpression(object)
  if (!object || !ts.isObjectLiteralExpression(object)) return undefined
  return unwrapExpression(object.properties.find((property) => ts.isPropertyAssignment(property) && propertyName(property.name) === name)?.initializer)
}

function firstArrayString(node, label) {
  node = unwrapExpression(node)
  if (!node || !ts.isArrayLiteralExpression(node) || !ts.isStringLiteral(node.elements[0])) {
    throw new Error(`widget palette ${label} is not a string tuple`)
  }
  return node.elements[0].text
}

function readWidgetSurfaces(repositoryRoot) {
  const path = resolve(repositoryRoot, "apps/mobile/scripts/generate-widget-colors.ts")
  const source = readFileSync(path, "utf8")
  const syntax = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  let palettes
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && propertyName(node.name) === "PALETTES") palettes = node.initializer
    ts.forEachChild(node, visit)
  }
  visit(syntax)
  const result = {}
  for (const mode of ["dark", "light"]) {
    const palette = objectProperty(palettes, mode)
    result[mode] = {
      "widget card": [firstArrayString(objectProperty(palette, "card"), `${mode}.card`)],
      "widget well": [firstArrayString(objectProperty(palette, "well"), `${mode}.well`)],
    }
  }
  return result
}

async function measuredThemes(repositoryRoot) {
  const importFromRoot = (path) => import(pathToFileURL(resolve(repositoryRoot, path)).href)
  const [{ contrastOnSurface }, { neutralColors, statusConstants }, { schemes }] = await Promise.all([
    importFromRoot("packages/shared/src/__tests__/contrast.ts"),
    importFromRoot("packages/shared/src/theme/neutral-ramp.ts"),
    importFromRoot("packages/shared/src/theme/color-schemes.ts"),
  ])
  const widgetSurfaces = readWidgetSurfaces(repositoryRoot)
  const themes = {}
  for (const mode of ["dark", "light"]) {
    const neutral = neutralColors[mode]
    const accent = schemes.purple.accent[mode]
    const status = statusConstants[mode]
    const tokenValues = {
      "--fg-1": neutral.fg1,
      "--fg-2": neutral.fg2,
      "--fg-3": neutral.fg3,
      "--fg-4": neutral.fg4,
      "--track-empty": neutral.trackEmpty,
      "--primary-soft": accent.primarySoft,
      "--primary-text": accent.primaryText,
      "--status-bad-text": status.badText,
    }
    const surfaces = mode === "dark"
      ? {
          canvas: [neutral.bg], card: [neutral.bg, neutral.bgCard], field: [neutral.bg, neutral.bgField],
          well: [neutral.bg, neutral.bgWell], "elev-2": [neutral.bg, neutral.bgElev2],
          hover: [neutral.bg, neutral.bgHover], overlay: [neutral.bg, neutral.bgElev], ...widgetSurfaces[mode],
        }
      : {
          canvas: [neutral.bg], card: [neutral.bg, neutral.bgCard], well: [neutral.bg, neutral.bgWell],
          hover: [neutral.bg, neutral.bgHover], ...widgetSurfaces[mode],
        }
    const ratios = new Map()
    for (const [token, foreground] of Object.entries(tokenValues)) {
      ratios.set(token, new Map(Object.entries(surfaces).map(([surface, layers]) => [surface, contrastOnSurface(foreground, layers)])))
    }
    themes[mode] = ratios
  }
  return themes
}

function expectedScope(roles, ratios) {
  return roles.map((role) => {
    const permitted = [...ratios].filter(([, ratio]) => ratio >= FLOORS[role]).map(([surface]) => surface)
    return `${role}: ${permitted.length > 0 ? permitted.join(", ") : "none"}`
  }).join("; ")
}

function validateDeclarations(declarations, themes) {
  for (const [token, declaration] of declarations) {
    if (declaration.roles.length === 0) continue
    for (const mode of ["dark", "light"]) {
      const ratios = themes[mode].get(token)
      const row = declaration.rows.get(mode)
      if (!ratios || !row) throw new Error(`${token} has no ${mode} measurement row`)
      const scope = expectedScope(declaration.roles, ratios)
      if (row.scope !== scope) throw new Error(`${token} ${mode} scope is "${row.scope}", expected "${scope}"`)
      const documented = row.ratios.filter((value) => value !== "-")
      if (documented.length !== ratios.size) throw new Error(`${token} ${mode} documents ${documented.length} ratios, expected ${ratios.size}`)
      ;[...ratios.values()].forEach((ratio, index) => {
        const value = Number(documented[index])
        if (!Number.isFinite(value) || Math.abs(value - ratio) > 0.005) {
          throw new Error(`${token} ${mode} measurement ${documented[index]} does not match ${ratio.toFixed(3)}`)
        }
      })
    }
  }
}

function mobileTokenName(name) {
  const kebab = name.replace(/([a-z\d])([A-Z])/g, "$1-$2").replace(/(fg|bg)(\d)/g, "$1-$2").toLowerCase()
  return `--${kebab}`
}

function canonicalToken(name) {
  return TOKEN_ALIASES.get(name) ?? name
}

function tokenMatches(source) {
  const matches = []
  for (const match of source.matchAll(/var\((--[\w-]+)\)|\btokens\.([A-Za-z]\w*)/g)) {
    matches.push({ index: match.index, token: canonicalToken(match[1] ?? mobileTokenName(match[2])) })
  }
  return matches
}

function nodeAt(sourceFile, index) {
  let result = sourceFile
  const visit = (node) => {
    if (node.pos <= index && node.end >= index) {
      result = node
      ts.forEachChild(node, visit)
    }
  }
  visit(sourceFile)
  return result
}

function ancestor(node, predicate) {
  for (let current = node; current; current = current.parent) if (predicate(current)) return current
  return undefined
}

function openingElement(node) {
  for (let current = node; current; current = current.parent) {
    if (ts.isJsxOpeningElement(current) || ts.isJsxSelfClosingElement(current)) return current
    if (ts.isJsxElement(current)) return current.openingElement
  }
  return undefined
}

function jsxTag(opening) {
  return opening ? opening.tagName.getText() : ""
}

function textTag(tag) {
  return tag === "Text" || tag.endsWith(".Text") || /^(?:a|button|div|h[1-6]|label|li|p|span|strong)$/.test(tag)
}

function classifiedRole(node, source, matchIndex, graphicTags) {
  const tag = jsxTag(openingElement(node))
  if (graphicTags.has(tag)) return "graphic"
  const before = source.slice(Math.max(0, matchIndex - 48), matchIndex)
  if (/(?:^|\s)text-\[[^\]]*$/.test(before)) return "text"
  if (/(?:bg|border|fill|outline|ring|shadow|stroke)-\[[^\]]*$/.test(before)) return "graphic"
  const attribute = ancestor(node, ts.isJsxAttribute)
  if (attribute) {
    const name = propertyName(attribute.name).toLowerCase()
    if (/^(?:background|backgroundcolor|bordercolor|fill|stroke)$/.test(name)) return "graphic"
    if (name === "color") return "text"
  }
  const property = ancestor(node, ts.isPropertyAssignment)
  if (property) {
    const name = propertyName(property.name).toLowerCase()
    if (/(?:graphic|icon|ring|border|background|fill|stroke)/.test(name)) return "graphic"
    if (/(?:text|title|label|copy|caption|error)/.test(name)) return "text"
    if (name === "color") {
      const opening = openingElement(property)
      return !opening || textTag(jsxTag(opening)) ? "text" : "graphic"
    }
  }
  const variable = ancestor(node, ts.isVariableDeclaration)
  if (variable && /^(?=.*(?:STATUS|RING|GRAPHIC))(?=.*COLOR)[A-Z\d_]+$/.test(propertyName(variable.name))) return "graphic"
  return undefined
}

function surfaceInText(text) {
  let result
  for (const match of tokenMatches(text)) {
    const surface = SURFACE_TOKENS.get(match.token)
    if (surface) result = surface
  }
  return result
}

function explicitSurface(node) {
  const current = openingElement(node)
  return current ? surfaceInText(current.getText()) : undefined
}

function owningFunctionName(node) {
  const fn = ancestor(node, ts.isFunctionDeclaration)
  return fn?.name?.text
}

function exportedFunctions(sourceFile) {
  return sourceFile.statements
    .filter((statement) => ts.isFunctionDeclaration(statement) && statement.name && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
    .map((statement) => statement.name.text)
}

function importedGraphicTags(sourceFile) {
  const tags = new Set(["circle", "ellipse", "line", "path", "polygon", "polyline", "rect", "svg"])
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    if (!/(?:components\/ui\/icons|react-native-svg|@tabler)/.test(statement.moduleSpecifier.text)) continue
    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    for (const element of bindings.elements) tags.add(element.name.text)
  }
  return tags
}

function inheritsIntoGraphic(node, graphicTags) {
  const opening = openingElement(node)
  const element = opening && ts.isJsxOpeningElement(opening) && ts.isJsxElement(opening.parent) ? opening.parent : undefined
  if (!element) return false
  if (/\bdisabled\s*=/.test(opening.getText())) return false
  let inherited = false
  const visit = (current) => {
    if (current !== opening && (ts.isJsxOpeningElement(current) || ts.isJsxSelfClosingElement(current))) {
      const tag = jsxTag(current)
      if (graphicTags.has(tag)) {
        let colorOwner = current
        let overridden = false
        while (colorOwner && colorOwner !== element) {
          const ownerText = ts.isJsxElement(colorOwner)
            ? colorOwner.openingElement.getText()
            : ts.isJsxOpeningElement(colorOwner) || ts.isJsxSelfClosingElement(colorOwner)
              ? colorOwner.getText()
              : ""
          if (/(?:text-\[var\(--|\bcolor\s*[:=]|\bfill\s*=|\bstroke\s*=)/.test(ownerText)) {
            overridden = true
          }
          colorOwner = colorOwner.parent
        }
        if (!overridden) inherited = true
      }
    }
    if (!inherited) ts.forEachChild(current, visit)
  }
  for (const child of element.children) visit(child)
  return inherited
}

function componentSurfaces(files) {
  const result = new Map()
  for (const file of files) {
    const source = readFileSync(file, "utf8")
    const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const visit = (node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = jsxTag(node)
        if (/^[A-Z]/.test(tag)) {
          const surface = explicitSurface(node.parent) ?? "canvas"
          const values = result.get(tag) ?? new Set()
          values.add(surface)
          result.set(tag, values)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(syntax)
  }
  return result
}

function inspectSources(repositoryRoot, declarations) {
  const files = ["apps/web", "apps/mobile"].flatMap((path) => collectSourceFiles(resolve(repositoryRoot, path)))
  const callSurfaces = componentSurfaces(files)
  const usages = []
  const undeclared = []
  for (const file of files) {
    const source = readFileSync(file, "utf8")
    const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const exported = exportedFunctions(syntax)
    const graphicTags = importedGraphicTags(syntax)
    for (const match of tokenMatches(source)) {
      const declaration = declarations.get(match.token)
      if (!declaration) continue
      const node = nodeAt(syntax, match.index)
      const role = classifiedRole(node, source, match.index, graphicTags)
      const line = syntax.getLineAndCharacterOfPosition(match.index).line + 1
      const path = relative(repositoryRoot, file).replaceAll("\\", "/")
      if (declaration.roles.length === 0) {
        undeclared.push(`${path}:${line}: ${match.token} has an undeclared token role`)
        continue
      }
      if (!role) continue
      const ownSurface = explicitSurface(node)
      const owner = owningFunctionName(node)
      const variable = ancestor(node, ts.isVariableDeclaration)
      const componentLevelRole = !owner && variable && /^[A-Z\d_]+$/.test(propertyName(variable.name))
      const inherited = ownSurface
        ? [ownSurface]
        : componentLevelRole
          ? [...new Set(exported.flatMap((name) => [...(callSurfaces.get(name) ?? [])]))]
          : []
      const surfaces = inherited.length > 0 ? inherited : ["canvas"]
      usages.push({ path, line, token: match.token, role, surfaces })
      if (role === "text" && inheritsIntoGraphic(node, graphicTags)) {
        usages.push({ path, line, token: match.token, role: "graphic", surfaces })
      }
    }
  }
  return { files, usages, undeclared: [...new Set(undeclared)] }
}

let repositoryRoot
try {
  repositoryRoot = parseArguments(process.argv.slice(2))
  const declarations = parseDeclarations(readFileSync(resolve(repositoryRoot, "DESIGN.md"), "utf8"))
  const themes = await measuredThemes(repositoryRoot)
  validateDeclarations(declarations, themes)
  const { files, usages, undeclared } = inspectSources(repositoryRoot, declarations)
  const violations = []
  const roleAmbiguities = [...undeclared]
  for (const usage of usages) {
    const declaration = declarations.get(usage.token)
    if (!declaration.roles.includes(usage.role)) {
      const finding = `${usage.path}:${usage.line}: ${usage.token} used as ${usage.role.toUpperCase()} but declares ${declaration.roles.map((role) => role.toUpperCase()).join("+")}`
      if (usage.role === "text" && declaration.roles.includes("graphic")) roleAmbiguities.push(finding)
      else violations.push(finding)
      continue
    }
    for (const surface of usage.surfaces) {
      for (const mode of ["dark", "light"]) {
        const ratio = themes[mode].get(usage.token)?.get(surface)
        if (ratio !== undefined && ratio < FLOORS[usage.role]) {
          violations.push(`${usage.path}:${usage.line}: ${usage.token} on ${surface}, ${mode} ratio ${ratio.toFixed(2)}, ${usage.role.toUpperCase()} floor ${FLOORS[usage.role].toFixed(2)}`)
        }
      }
    }
  }
  for (const finding of [...new Set(roleAmbiguities)]) console.log(`UNDECLARED ${finding}`)
  if (violations.length > 0) {
    console.error("Surface scope guard failed.")
    for (const violation of [...new Set(violations)]) console.error(violation)
    process.exit(1)
  }
  console.log(`Surface scope guard passed. ${files.length} source files checked.`)
} catch (error) {
  console.error(`check-surface-scope: ${error.message}\n`)
  console.error(USAGE)
  process.exit(2)
}
