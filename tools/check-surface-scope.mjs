#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, extname, relative, resolve } from "node:path"
import { pathToFileURL, fileURLToPath } from "node:url"
import ts from "typescript"
import postcss from "postcss"

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
    const accent = schemes.orange.accent[mode]
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
    matches.push({ index: match.index, rawToken: match[1] ?? mobileTokenName(match[2]), token: canonicalToken(match[1] ?? mobileTokenName(match[2])) })
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
  return tag === "Text" || tag.endsWith(".Text") || /^(?:motion\.)?(?:a|button|div|h[1-6]|label|li|p|span|strong)$/.test(tag)
}

function classifiedRole(node, source, matchIndex, graphicTags) {
  const tag = jsxTag(openingElement(node))
  if (graphicTags.has(tag)) return "graphic"
  const literal = ancestor(node, (current) => ts.isStringLiteralLike(current) || ts.isTemplateExpression(current))
  const before = source.slice(literal ? literal.getStart() + 1 : Math.max(0, matchIndex - 48), matchIndex)
  if (/(?:^|\s)(?:[\w-]+:)*text-\[[^\]]*$/.test(before)) return "text"
  if (/(?:^|\s)(?:[\w-]+:)*(?:bg|border|fill|outline|ring|shadow|stroke)-\[[^\]]*$/.test(before)) return "graphic"
  const attribute = ancestor(node, ts.isJsxAttribute)
  if (attribute) {
    const name = propertyName(attribute.name).toLowerCase()
    if (/^(?:background|backgroundcolor|bordercolor|fill|stroke|trackcolor)$/.test(name)) return "graphic"
    if (name === "color") return /(?:Icon|Ring)$/.test(tag) ? "graphic" : "text"
  }
  const property = ancestor(node, ts.isPropertyAssignment)
  if (property) {
    const name = propertyName(property.name).toLowerCase()
    if (/(?:graphic|icon|ring|border|background|fill|stroke|boxshadow)/.test(name)) return "graphic"
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

function matchedSurface(text, match, state) {
  const utility = text.slice(0, match.index).match(/(?:^|[\s"'`])([^\s"'`]*)$/)?.[1] ?? ""
  if (state?.interaction === "rest" && /(?:^|:)hover:|group-hover:/.test(utility)) return undefined
  return SURFACE_TOKENS.get(match.token)
}

function createConditionKey(checker) {
  const symbols = new Map()
  const keys = new WeakMap()
  return (expression) => {
    if (keys.has(expression)) return keys.get(expression)
    const bindings = []
    let unresolved = false
    const visit = (node) => {
      if (ts.isIdentifier(node)
        && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) {
        const symbol = checker.getSymbolAtLocation(node)
        if (symbol) {
          if (!symbols.has(symbol)) symbols.set(symbol, symbols.size)
          bindings.push(symbols.get(symbol))
        } else unresolved = true
      }
      if (node.kind === ts.SyntaxKind.ThisKeyword) unresolved = true
      ts.forEachChild(node, visit)
    }
    visit(expression)
    const key = unresolved ? expression : JSON.stringify([expression.getText(), bindings])
    keys.set(expression, key)
    return key
  }
}

function booleanAssignments(expression, expected, state, assignments) {
  expression = unwrapExpression(expression)
  if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.ExclamationToken) {
    return booleanAssignments(expression.operand, !expected, state, assignments)
  }
  if (ts.isBinaryExpression(expression)) {
    const operator = expression.operatorToken.kind
    const conjunction = operator === ts.SyntaxKind.AmpersandAmpersandToken
    if (conjunction || operator === ts.SyntaxKind.BarBarToken) {
      if (expected === conjunction) {
        return booleanAssignments(expression.left, expected, state, assignments)
          .flatMap((values) => booleanAssignments(expression.right, expected, state, values))
      }
      return [
        ...booleanAssignments(expression.left, expected, state, assignments),
        ...booleanAssignments(expression.right, expected, state, assignments),
      ]
    }
  }
  const key = state.conditionKey(expression)
  const known = ts.isIdentifier(expression) && expression.text === "pressed" && state.interaction !== "hover" ? state.interaction === "pressed"
    : expression.kind === ts.SyntaxKind.TrueKeyword ? true
    : expression.kind === ts.SyntaxKind.FalseKeyword ? false
    : assignments.get(key)
  if (known !== undefined && known !== expected) return []
  return [new Map([...assignments, [key, expected]])]
}

function branchAssignments(node, state) {
  let assignments = state.assignments ?? [new Map()]
  for (let current = node; current.parent; current = current.parent) {
    const parent = current.parent
    let condition
    let expected
    if (ts.isConditionalExpression(parent) && current !== parent.condition) {
      condition = parent.condition
      expected = current === parent.whenTrue
    } else if (ts.isBinaryExpression(parent) && current === parent.right
      && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(parent.operatorToken.kind)) {
      condition = parent.left
      expected = parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    } else continue
    assignments = assignments.flatMap((values) => booleanAssignments(condition, expected, state, values))
    if (assignments.length === 0) break
  }
  return assignments
}

function reachableInState(node, state) {
  return !state || branchAssignments(node, state).length > 0
}

function expressionSurfaces(expression, sourceFile, state) {
  const text = expression.getText(sourceFile)
  const surfaces = new Set()
  for (const match of tokenMatches(text)) {
    const node = nodeAt(sourceFile, expression.getStart(sourceFile) + match.index)
    if (!reachableInState(node, state)) continue
    const literal = ancestor(node, ts.isStringLiteralLike)
    const utility = text.slice(0, match.index).match(/(?:^|[\s"'`])([^\s"'`]*)$/)?.[1] ?? ""
    if (state?.interaction === "hover" && utility.startsWith("bg-[")
      && literal && /(?:^|\s)hover:bg-\[var\(--/.test(literal.text)) continue
    const surface = matchedSurface(text, match, state)
    if (surface) surfaces.add(surface)
  }
  return [...surfaces]
}

function outermostGroup(node) {
  let group
  for (let current = openingElement(node)?.parent?.parent; current; current = current.parent) {
    if (!ts.isJsxElement(current)) continue
    const className = current.openingElement.attributes.properties.find((attribute) =>
      ts.isJsxAttribute(attribute) && propertyName(attribute.name) === "className")
    if (className && /(?:["'`\s])group(?:["'`\s])/.test(className.getText())) group = current.openingElement
  }
  return group
}

function webForegroundStates(node, matchIndex, sourceFile, conditionKey) {
  const literal = ancestor(node, ts.isStringLiteralLike)
  if (!literal) return ["rest", "hover"]
  const before = sourceFile.text.slice(literal.getStart() + 1, matchIndex)
  const utility = before.match(/(?:^|\s)([^\s]*)$/)?.[1] ?? ""
  const group = outermostGroup(node)
  if (utility.startsWith("hover:") || (utility.startsWith("group-hover:") && group)) return ["hover"]
  const role = utility.match(/^(text|bg|border|fill|stroke)-/)?.[1]
  if (role && new RegExp(`(?:^|\\s)hover:${role}-\\[var\\(--`).test(literal.text)
    && !ancestorHoverSurface(node, sourceFile, conditionKey)) return ["rest"]
  if (role && group && new RegExp(`(?:^|\\s)group-hover:${role}-\\[var\\(--`).test(literal.text)
    && !ancestorHoverSurface(group, sourceFile, conditionKey)) return ["rest"]
  return ["rest", "hover"]
}

function ancestorHoverSurface(node, sourceFile, conditionKey) {
  for (let current = openingElement(node)?.parent?.parent; current; current = current.parent) {
    if (!ts.isJsxElement(current)) continue
    const opening = current.openingElement
    const resting = openingSurfaces(opening, sourceFile, { interaction: "rest", conditionKey })
    if (openingSurfaces(opening, sourceFile, { interaction: "hover", conditionKey }).some((surface) => !resting.includes(surface))) return true
  }
  return false
}

function owningFunctionName(node) {
  for (let current = node; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text
    if ((ts.isArrowFunction(current) || ts.isFunctionExpression(current)) && ts.isVariableDeclaration(current.parent)) {
      return propertyName(current.parent.name)
    }
  }
  return undefined
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

function enclosingFunction(node) {
  return ancestor(node, (current) => ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current) || ts.isArrowFunction(current))
}

function localDeclaration(scope, name, before) {
  let result
  const visit = (node) => {
    if (node.pos >= before) return
    if (ts.isVariableDeclaration(node) && propertyName(node.name) === name && node.initializer) result = node
    ts.forEachChild(node, visit)
  }
  visit(scope)
  return result
}

function visibleDeclaration(node, sourceFile, name) {
  for (let scope = node; scope; scope = scope.parent) {
    if (!ts.isFunctionDeclaration(scope) && !ts.isFunctionExpression(scope) && !ts.isArrowFunction(scope)) continue
    const declaration = localDeclaration(scope, name, node.pos)
    if (declaration) return declaration
  }
  return localDeclaration(sourceFile, name, node.pos)
}

function localObjectMemberPath(node, sourceFile) {
  const property = ancestor(node, (current) =>
    ts.isPropertyAssignment(current)
    && current.initializer.pos <= node.pos
    && current.initializer.end >= node.end)
  const object = property?.parent
  if (!property || !object || !ts.isObjectLiteralExpression(object)) return undefined
  const declaration = ancestor(object, ts.isVariableDeclaration)
  if (!declaration?.initializer || unwrapExpression(declaration.initializer) !== object) return undefined
  const binding = propertyName(declaration.name)
  const member = propertyName(property.name)
  const scope = enclosingFunction(declaration) ?? sourceFile
  return binding && member ? { binding, member, object, scope } : undefined
}

function selectedObjectAlias(reference) {
  const property = ancestor(reference, (current) =>
    ts.isPropertyAssignment(current)
    && current.initializer.pos <= reference.pos
    && current.initializer.end >= reference.end)
  const object = property?.parent
  if (!property || unwrapExpression(property.initializer) !== reference
    || !object || !ts.isObjectLiteralExpression(object)) return undefined
  let selectionSource = object
  while (selectionSource.parent
    && (ts.isParenthesizedExpression(selectionSource.parent)
      || ts.isAsExpression(selectionSource.parent)
      || ts.isSatisfiesExpression(selectionSource.parent))) {
    selectionSource = selectionSource.parent
  }
  const selection = selectionSource.parent
  if (!selection || !ts.isElementAccessExpression(selection) || unwrapExpression(selection.expression) !== object) return undefined
  const declaration = ancestor(selection, ts.isVariableDeclaration)
  if (!declaration?.initializer || unwrapExpression(declaration.initializer) !== selection) return undefined
  return propertyName(declaration.name)
}

function selectedObjectMemberReferences(node, sourceFile) {
  const path = localObjectMemberPath(node, sourceFile)
  if (!path) return undefined
  const bindings = [path.binding]
  const seen = new Set()
  const references = []
  while (bindings.length > 0) {
    const binding = bindings.shift()
    if (seen.has(binding)) continue
    seen.add(binding)
    const visit = (current) => {
      if (ts.isPropertyAccessExpression(current)
        && ts.isIdentifier(current.expression)
        && current.expression.text === binding
        && propertyName(current.name) === path.member) {
        references.push(current)
      }
      if (ts.isIdentifier(current) && current.text === binding) {
        const alias = selectedObjectAlias(current)
        if (alias && !seen.has(alias)) bindings.push(alias)
      }
      ts.forEachChild(current, visit)
    }
    visit(path.scope)
  }
  return { path, references }
}

function localExpressionSurfaces(node, sourceFile, state) {
  const surfaces = new Set()
  const seen = new Set()
  const inspect = (expression) => {
    for (const surface of expressionSurfaces(expression, sourceFile, state)) surfaces.add(surface)
    const visit = (current) => {
      if (!reachableInState(current, state)) return
      if (ts.isPropertyAccessExpression(current) && ts.isIdentifier(current.expression)) {
        for (const surface of styleMemberSurfaces(current, sourceFile, state) ?? []) surfaces.add(surface)
      }
      const selectedStyle = ts.isIdentifier(current) && ts.isPropertyAccessExpression(current.parent)
        && current.parent.expression === current
        && styleMemberSurfaces(current.parent, sourceFile, state) !== undefined
      if (ts.isIdentifier(current) && !selectedStyle && !seen.has(current.text)) {
        const declaration = visibleDeclaration(current, sourceFile, current.text)
        if (declaration) {
          seen.add(current.text)
          inspect(declaration.initializer)
        }
      }
      ts.forEachChild(current, visit)
    }
    visit(expression)
  }
  inspect(node)
  return [...surfaces]
}

function styleMemberSurfaces(reference, sourceFile, state) {
  const binding = visibleDeclaration(reference, sourceFile, reference.expression.text)
  if (!binding?.initializer) return undefined
  let styleObject
  const inspect = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sourceFile)
      if (callee === "StyleSheet.create") {
        styleObject = unwrapExpression(node.arguments[0])
      } else if (ts.isIdentifier(node.expression)) {
        const functionName = node.expression.text
        const declaration = sourceFile.statements.find((statement) =>
          ts.isFunctionDeclaration(statement) && statement.name?.text === functionName)
        if (declaration?.body) ts.forEachChild(declaration.body, inspect)
      }
    }
    if (!styleObject) ts.forEachChild(node, inspect)
  }
  inspect(binding.initializer)
  if (!styleObject || !ts.isObjectLiteralExpression(styleObject)) return undefined
  const member = objectProperty(styleObject, reference.name.text)
  return member ? expressionSurfaces(member, sourceFile, state) : []
}

function openingSurfaces(opening, sourceFile, state) {
  const surfaces = new Set()
  for (const attribute of opening.attributes.properties) {
    if (!ts.isJsxAttribute(attribute) || !["className", "style", "backgroundColor", "background"].includes(propertyName(attribute.name))) continue
    for (const surface of expressionSurfaces(attribute, sourceFile, state)) surfaces.add(surface)
    if (attribute.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
      for (const surface of localExpressionSurfaces(attribute.initializer.expression, sourceFile, state)) surfaces.add(surface)
    }
  }
  for (const rule of state?.cssRules ?? []) {
    if (rule.mode && rule.mode !== state.mode) continue
    if (selectorMatches(rule.selector, opening, sourceFile, state)) {
      for (const [name, value] of rule.properties) {
        if (/^background(?:-color)?$/.test(name)) {
          for (const match of tokenMatches(value)) {
            const surface = SURFACE_TOKENS.get(match.token)
            if (surface) surfaces.add(surface)
          }
        }
      }
    }
  }
  return [...surfaces]
}

function containsJsx(node) {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return true
  let found = false
  ts.forEachChild(node, (child) => { if (containsJsx(child)) found = true })
  return found
}

function contextSurfaces(node, sourceFile, contentSurfaces = new Map(), state) {
  const surfaces = new Set()
  const variable = ancestor(node, ts.isVariableDeclaration)
  const selectedMember = localObjectMemberPath(node, sourceFile)
  if (selectedMember) {
    for (const property of selectedMember.object.properties) {
      if (!ts.isPropertyAssignment(property) || !/^background(?:Color)?$/i.test(propertyName(property.name))) continue
      for (const surface of expressionSurfaces(property.initializer, sourceFile, state)) surfaces.add(surface)
    }
  } else if (variable?.initializer && !containsJsx(variable.initializer)) {
    for (const surface of expressionSurfaces(variable.initializer, sourceFile, state)) surfaces.add(surface)
  }
  const openings = new Set()
  for (let current = node; current; current = current.parent) {
    if (ts.isJsxOpeningElement(current) || ts.isJsxSelfClosingElement(current)) openings.add(current)
    if (ts.isJsxElement(current)) openings.add(current.openingElement)
  }
  for (const opening of openings) {
    for (const surface of openingSurfaces(opening, sourceFile, state)) surfaces.add(surface)
    for (const surface of contentSurfaces.get(jsxTag(opening)) ?? []) surfaces.add(surface)
  }
  const scope = variable && (enclosingFunction(variable) ?? sourceFile)
  const name = variable && propertyName(variable.name)
  if (scope && name) {
    const visit = (current) => {
      if (ts.isIdentifier(current) && current.text === name && current !== variable.name) {
        for (let parent = current; parent; parent = parent.parent) {
          if (ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent)) {
            for (const surface of openingSurfaces(parent, sourceFile, state)) surfaces.add(surface)
          }
          if (ts.isJsxElement(parent)) {
            for (const surface of openingSurfaces(parent.openingElement, sourceFile, state)) surfaces.add(surface)
          }
          if (parent === scope) break
        }
      }
      ts.forEachChild(current, visit)
    }
    visit(scope)
  }
  return [...surfaces]
}

function inferredRoles(node, sourceFile, source, matchIndex, graphicTags) {
  const direct = classifiedRole(node, source, matchIndex, graphicTags)
  if (direct) return [direct]
  const selectedMember = selectedObjectMemberReferences(node, sourceFile)
  if (selectedMember) {
    const roles = new Set()
    for (const reference of selectedMember.references) {
      const role = classifiedRole(reference, source, reference.getStart(sourceFile), graphicTags)
      if (role) roles.add(role)
    }
    return [...roles]
  }
  const variable = ancestor(node, ts.isVariableDeclaration)
  const name = variable && propertyName(variable.name)
  const scope = variable && (enclosingFunction(variable) ?? sourceFile)
  if (!name || !scope) return []
  const roles = new Set()
  const visit = (current) => {
    if (ts.isIdentifier(current) && current.text === name && current !== variable.name) {
      const role = classifiedRole(current, source, current.getStart(sourceFile), graphicTags)
      if (role) roles.add(role)
    }
    ts.forEachChild(current, visit)
  }
  visit(scope)
  return [...roles]
}

function componentContentSurfaces(syntaxes, state) {
  const result = new Map()
  for (const syntax of syntaxes) {
    const visit = (node) => {
      if (ts.isIdentifier(node) && node.text === "children" && ts.isJsxExpression(node.parent)
        && node.parent.expression === node) {
        const owner = owningFunctionName(node)
        if (owner) {
          const surfaces = result.get(owner) ?? new Set()
          for (const surface of contextSurfaces(node, syntax, new Map(), state)) surfaces.add(surface)
          result.set(owner, surfaces)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(syntax)
  }
  return result
}

function readCssRules(repositoryRoot) {
  const path = resolve(repositoryRoot, "apps/web/app/globals.css")
  if (!existsSync(path)) return []
  const rules = []
  postcss.parse(readFileSync(path, "utf8")).walkRules((rule) => {
    const properties = new Map()
    rule.walkDecls((declaration) => { properties.set(declaration.prop, declaration.value) })
    if (![...properties.keys()].some((name) => name.startsWith("--") || /^background(?:-color)?$/.test(name))) return
    const expanded = rule.selector.replace(/:is\(([^()]*)\)/g, (_, choices) => `{${choices}}`)
    const alternatives = expanded.match(/\{([^}]+)\}/)
    const selectors = alternatives
      ? alternatives[1].split(",").map((choice) => expanded.replace(alternatives[0], choice.trim()))
      : expanded.split(",")
    for (let selector of selectors) {
      selector = selector.trim()
      const mode = selector.startsWith(".light ") ? "light" : selector.startsWith(".dark ") ? "dark" : undefined
      if (mode) selector = selector.slice(mode.length + 2)
      rules.push({ selector, properties, mode })
    }
  })
  return rules
}

const attributeTextCache = new WeakMap()

function attributeText(opening, name, syntax) {
  const cached = attributeTextCache.get(opening) ?? new Map()
  if (cached.has(name)) return cached.get(name)
  const value = readAttributeText(opening, name, syntax)
  cached.set(name, value)
  attributeTextCache.set(opening, cached)
  return value
}

function readAttributeText(opening, name, syntax) {
  const attribute = opening.attributes.properties.find((property) => ts.isJsxAttribute(property) && propertyName(property.name) === name)
  if (!attribute) return undefined
  if (!attribute.initializer) return ""
  if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
    const expression = attribute.initializer.expression
    if (ts.isIdentifier(expression)) {
      const declaration = visibleDeclaration(expression, syntax, expression.text)
      if (declaration) return declaration.initializer.getText(syntax)
    }
  }
  return attribute.initializer.getText(syntax).replace(/^["']|["']$/g, "")
}

function matchesCompound(selector, opening, syntax, state) {
  if (/::|:root|:has\(/.test(selector)) return false
  if (selector.includes(":hover") && state.interaction !== "hover") return false
  if (selector.includes(":active") && state.interaction !== "pressed") return false
  if (/:focus|:checked|:disabled(?!\))/.test(selector)) return false
  if (/:not\(:disabled\)|:enabled/.test(selector) && attributeText(opening, "disabled", syntax) === "") return false
  selector = selector.replace(/:not\(\[[^\]]+\]\)/g, (condition) => {
    const match = condition.match(/\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]/)
    return attributeText(opening, match[1], syntax) === match[2] ? "#never-matches" : ""
  }).replace(/:not\([^()]*\)/g, "").replace(/:[\w-]+(?:\([^()]*\))?/g, "")
  const tag = selector.match(/^[\w-]+/)?.[0]
  if (tag && tag !== jsxTag(opening)) return false
  if (selector.includes("#")) return false
  const classes = attributeText(opening, "className", syntax) ?? ""
  for (const match of selector.matchAll(/\.([\w-]+)/g)) {
    if (!new RegExp(`(?:^|[\\s"'\x60])${match[1]}(?:$|[\\s"'\x60])`).test(classes)) return false
  }
  for (const match of selector.matchAll(/\[([^=\]~]+)(?:=["']?([^"'\]]+)["']?)?\]/g)) {
    const value = attributeText(opening, match[1], syntax)
    if (value === undefined || (match[2] !== undefined && value !== match[2])) return false
  }
  return selector !== ""
}

const selectorMatchCache = new WeakMap()

function selectorMatches(selector, opening, syntax, state) {
  const key = `${state.interaction}:${selector}`
  const cached = selectorMatchCache.get(opening) ?? new Map()
  if (cached.has(key)) return cached.get(key)
  const matched = matchesSelectorAncestry(selector, opening, syntax, state)
  cached.set(key, matched)
  selectorMatchCache.set(opening, cached)
  return matched
}

function matchesSelectorAncestry(selector, opening, syntax, state) {
  const compounds = selector.split(/\s+(?![^[]*\])/)
  if (!matchesCompound(compounds.pop(), opening, syntax, state)) return false
  let parent = opening.parent
  while (compounds.length > 0) {
    const compound = compounds.pop()
    if (compound === ">" || compound === "+" || compound === "~") return false
    let matched = false
    for (; parent; parent = parent.parent) {
      if (ts.isJsxElement(parent) && parent.openingElement !== opening
        && matchesCompound(compound, parent.openingElement, syntax, state)) {
        matched = true
        parent = parent.parent
        break
      }
    }
    if (!matched) return false
  }
  return true
}

function paintOpenings(node) {
  const result = []
  for (let current = node; current; current = current.parent) {
    const opening = ts.isJsxElement(current) ? current.openingElement
      : ts.isJsxOpeningElement(current) || ts.isJsxSelfClosingElement(current) ? current : undefined
    if (opening && !result.includes(opening)) result.push(opening)
  }
  return result.reverse()
}

function scopedForeground(token, openings, state) {
  const properties = new Map()
  for (const opening of openings) {
    const local = new Map()
    for (const rule of state.cssRules) {
      if (rule.mode && rule.mode !== state.mode) continue
      if (!selectorMatches(rule.selector, opening, opening.getSourceFile(), state)) continue
      for (const [name, value] of rule.properties) if (name.startsWith("--")) local.set(name, value)
    }
    const resolveValue = (value, seen = new Set()) => {
      const alias = value.match(/^var\((--[\w-]+)\)$/)?.[1]
      if (!alias || seen.has(alias)) return value
      const next = local.get(alias) ?? properties.get(alias)
      return next ? resolveValue(next, new Set([...seen, alias])) : value
    }
    for (const [name, value] of local) properties.set(name, resolveValue(value, new Set([name])))
  }
  const value = properties.get(token)
  return canonicalToken(value?.match(/^var\((--[\w-]+)\)$/)?.[1] ?? token)
}

function componentIdentity(syntax, name) {
  return `${syntax.fileName}:${name}`
}

function calledComponent(opening, syntax, syntaxes) {
  const tag = jsxTag(opening)
  for (const statement of syntax.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const bindings = statement.importClause?.namedBindings
    const named = bindings && ts.isNamedImports(bindings) ? bindings.elements.find((element) => element.name.text === tag) : undefined
    const defaultImport = statement.importClause?.name?.text === tag
    if (!named && !defaultImport) continue
    const specifier = statement.moduleSpecifier.text
    const appRoot = syntax.fileName.slice(0, syntax.fileName.indexOf("/apps/") + 6) + (syntax.fileName.includes("/apps/mobile/") ? "mobile" : "web")
    const path = specifier.startsWith("@/") ? resolve(appRoot, specifier.slice(2))
      : specifier.startsWith(".") ? resolve(dirname(syntax.fileName), specifier) : undefined
    if (!path) return undefined
    const target = syntaxes.find((candidate) => [path + ".tsx", path + ".ts", resolve(path, "index.tsx"), resolve(path, "index.ts")].includes(candidate.fileName))
    if (target) {
      const name = named ? propertyName(named.propertyName ?? named.name) : exportedFunctions(target)[0]
      return componentIdentity(target, name)
    }
    return undefined
  }
  return componentIdentity(syntax, tag)
}

function renderCalls(syntaxes) {
  const result = new Map()
  for (const syntax of syntaxes) {
    const visit = (node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const target = calledComponent(node, syntax, syntaxes)
        if (target) {
          const calls = result.get(target) ?? []
          calls.push(node)
          result.set(target, calls)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(syntax)
  }
  return result
}

const paintContextCache = new WeakMap()

function inheritedPaintContexts(node, state, calls, seen = new Set()) {
  const syntax = node.getSourceFile()
  const owner = owningFunctionName(node)
  const identity = owner && componentIdentity(syntax, owner)
  if (!identity || seen.has(identity)) return [{ openings: [], call: undefined }]
  const cached = paintContextCache.get(calls) ?? new Map()
  if (cached.has(identity)) return cached.get(identity)
  paintContextCache.set(calls, cached)
  const callers = calls.get(identity) ?? []
  if (callers.length === 0) return [{ openings: [], call: undefined }]
  const contexts = callers.flatMap((call) => inheritedPaintContexts(call, state, calls, new Set([...seen, identity]))
    .map((context) => ({ openings: [...context.openings, ...paintOpenings(call)], call })))
  cached.set(identity, contexts)
  return contexts
}

function localPaintSites(node, syntax, seen = new Set()) {
  if (openingElement(node)) return [node]
  const variable = ancestor(node, ts.isVariableDeclaration)
  if (!variable || seen.has(variable)) return [node]
  const name = propertyName(variable.name)
  const sites = []
  const visit = (current) => {
    if (ts.isIdentifier(current) && current.text === name && current !== variable.name
      && !(ts.isJsxAttribute(current.parent) && current.parent.name === current)
      && !(ts.isPropertyAccessExpression(current.parent) && current.parent.name === current)
      && visibleDeclaration(current, syntax, name) === variable) {
      sites.push(...localPaintSites(current, syntax, new Set([...seen, variable])))
    }
    ts.forEachChild(current, visit)
  }
  visit(enclosingFunction(variable) ?? syntax)
  return sites.length > 0 ? sites : [node]
}

function optionalForeground(node, context) {
  const binary = ancestor(node, (current) => ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  if (!binary || !ts.isIdentifier(binary.left) || !context.call) return undefined
  return attributeText(context.call, binary.left.text, context.call.getSourceFile())
}

function promotedNativeForeground(node, token, state) {
  if (state.mode !== "light" || token !== "--fg-3") return token
  const call = ancestor(node, ts.isCallExpression)
  if (!call || call.expression.getText() !== "hoverForeground") return token
  const active = call.arguments[2]
  if (!active) return token
  const syntax = node.getSourceFile()
  const hoverAssignments = []
  for (const opening of paintOpenings(node)) {
    for (const match of tokenMatches(opening.getText(syntax))) {
      if (match.token !== "--bg-hover") continue
      const backgroundNode = nodeAt(syntax, opening.getStart(syntax) + match.index)
      hoverAssignments.push(...branchAssignments(backgroundNode, state))
    }
  }
  if (hoverAssignments.length === 0) return token
  const enabled = hoverAssignments.flatMap((values) => booleanAssignments(active, true, state, values))
  const disabled = hoverAssignments.flatMap((values) => booleanAssignments(active, false, state, values))
  return enabled.length > 0 && disabled.length === 0 ? "--fg-2" : token
}

function inspectSources(repositoryRoot, declarations) {
  const files = ["apps/web", "apps/mobile"].flatMap((path) => collectSourceFiles(resolve(repositoryRoot, path)))
  const program = ts.createProgram(files, { noLib: true, noResolve: true, target: ts.ScriptTarget.Latest, jsx: ts.JsxEmit.Preserve })
  const conditionKey = createConditionKey(program.getTypeChecker())
  const syntaxes = files.map((file) => program.getSourceFile(file))
  const cssRules = readCssRules(repositoryRoot)
  const calls = renderCalls(syntaxes)
  const canvasPainted = cssRules.some((rule) => rule.selector === ":root" && rule.properties.get("background-color") === "var(--bg)")
  const nativeThemePath = resolve(repositoryRoot, "apps/mobile/lib/theme.ts")
  const nativeCanvasPainted = existsSync(nativeThemePath) && /screen:\s*\{\s*backgroundColor:\s*appTokens.bg/.test(readFileSync(nativeThemePath, "utf8"))
  const stateSurfaces = new Map(["rest", "hover", "pressed"].map((interaction) => {
    const state = { interaction, conditionKey }
    return [interaction, componentContentSurfaces(syntaxes, state)]
  }))
  const usages = []
  const undeclared = []
  for (const file of files) {
    const syntax = program.getSourceFile(file)
    const source = syntax.text
    const exported = exportedFunctions(syntax)
    const graphicTags = importedGraphicTags(syntax)
    for (const match of tokenMatches(source)) {
      const declaration = declarations.get(match.token)
      if (!declaration) continue
      const node = nodeAt(syntax, match.index)
      const roles = inferredRoles(node, syntax, source, match.index, graphicTags)
      const line = syntax.getLineAndCharacterOfPosition(match.index).line + 1
      const path = relative(repositoryRoot, file).replaceAll("\\", "/")
      if (declaration.roles.length === 0) {
        undeclared.push(`${path}:${line}: ${match.token} has an undeclared token role`)
        continue
      }
      if (roles.length === 0) continue
      const states = path.startsWith("apps/mobile/") ? ["rest", "pressed"] : webForegroundStates(node, match.index, syntax, conditionKey)
      for (const interaction of states) {
        const assignments = branchAssignments(node, { interaction, conditionKey })
        if (assignments.length === 0) continue
        for (const mode of ["dark", "light"]) {
          const state = { interaction, assignments, conditionKey, mode, cssRules: path.startsWith("apps/web/") ? cssRules : [] }
          const contentSurfaces = stateSurfaces.get(interaction)
          const contexts = localPaintSites(node, syntax).flatMap((site) => inheritedPaintContexts(site, state, calls).map((context) => ({ ...context, site })))
          for (const context of contexts) {
            const openings = [...context.openings, ...paintOpenings(context.site)]
            const selectedMember = localObjectMemberPath(node, syntax)
            const ownsBackground = selectedMember && selectedMember.object.properties.some((property) => ts.isPropertyAssignment(property) && /^background(?:Color)?$/.test(propertyName(property.name)))
            const surfaces = new Set(contextSurfaces(ownsBackground ? node : context.site, syntax, contentSurfaces, state))
            for (const opening of ownsBackground ? [] : openings) {
              for (const surface of openingSurfaces(opening, opening.getSourceFile(), state)) surfaces.add(surface)
              for (const surface of contentSurfaces.get(jsxTag(opening)) ?? []) surfaces.add(surface)
            }
            if (surfaces.size === 0 && (path.startsWith("apps/web/") ? canvasPainted : nativeCanvasPainted)) surfaces.add("canvas")
            const supplied = optionalForeground(node, context)
            const suppliedToken = supplied && tokenMatches(supplied)[0]?.rawToken
            const rawToken = suppliedToken ?? match.rawToken
            const effective = path.startsWith("apps/web/") ? scopedForeground(rawToken, openings, state)
              : promotedNativeForeground(node, match.token, state)
            for (const role of roles) {
              usages.push({ path, line, token: match.token, effective, role, mode, surfaces: [...surfaces] })
              if (role === "text" && inheritsIntoGraphic(node, graphicTags)) {
                usages.push({ path, line, token: match.token, effective, role: "graphic", mode, surfaces: [...surfaces] })
              }
            }
          }
        }
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
    if (usage.surfaces.length === 0) {
      const canFailOnKnownSurface = ["dark", "light"].some((mode) =>
        [...(themes[mode].get(usage.token)?.values() ?? [])].some((ratio) => ratio < FLOORS[usage.role]))
      if (canFailOnKnownSurface) {
        violations.push(`${usage.path}:${usage.line}: ${usage.token} ${usage.role.toUpperCase()} surface is unresolved`)
      }
      continue
    }
    for (const surface of usage.surfaces) {
      for (const mode of [usage.mode]) {
        const ratio = themes[mode].get(usage.effective)?.get(surface)
        if (ratio !== undefined && ratio < FLOORS[usage.role]) {
          violations.push(`${usage.path}:${usage.line}: ${usage.token} on ${surface}, ${mode} ratio ${ratio.toFixed(3)}, ${usage.role.toUpperCase()} floor ${FLOORS[usage.role].toFixed(2)}`)
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
