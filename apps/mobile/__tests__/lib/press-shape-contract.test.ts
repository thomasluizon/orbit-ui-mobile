import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, relative, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { createTokensV2 } from '@/lib/theme'

const SOURCE_DIRECTORIES = ['app', 'components']
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])
const FILL_TOKENS = new Set(Object.keys(createTokensV2()))
const CALENDAR_GRID = 'app/(tabs)/calendar/_components/calendar-time-grid.tsx'
const FLAT_SURFACES = new Map([
  [`${CALENDAR_GRID}:colHeader`, 'Square column headers preserve the calendar grid ruling.'],
  [`${CALENDAR_GRID}:allDayCell`, 'Square all-day cells preserve the calendar grid ruling.'],
])

type ScannedSource = { path: string; contents: string }
type ParsedSource = {
  path: string
  syntax: ts.SourceFile
  styles: Map<string, ts.ObjectLiteralExpression>
  bindings: Map<string, ts.Node>
  imports: string[]
  importBindings: Map<string, { specifier: string; name: string }>
}
type StylePart = { source: ParsedSource; name: string; object: ts.ObjectLiteralExpression; pressed: boolean }
type StyleVariant = StylePart[]

function sourceFiles(directory: string): ScannedSource[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(entryPath)
    if (!SOURCE_EXTENSIONS.has(extname(entry.name))) return []
    return [{ path: relative(process.cwd(), entryPath).replaceAll('\\', '/'), contents: readFileSync(entryPath, 'utf8') }]
  })
}

function walk(node: ts.Node, visit: (node: ts.Node) => void) {
  visit(node)
  ts.forEachChild(node, (child) => walk(child, visit))
}

function parseSource(file: ScannedSource): ParsedSource {
  const source: ParsedSource = {
    path: file.path,
    syntax: ts.createSourceFile(file.path, file.contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
    styles: new Map(), bindings: new Map(), imports: [], importBindings: new Map(),
  }
  walk(source.syntax, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      source.bindings.set(node.name.text, node.initializer)
    }
    if (ts.isFunctionDeclaration(node) && node.name && node.body) source.bindings.set(node.name.text, node.body)
    if (ts.isImportDeclaration(node)) indexImports(node, source)
    if (ts.isCallExpression(node) && node.expression.getText(source.syntax) === 'StyleSheet.create') indexStyles(node, source)
  })
  return source
}

function indexImports(node: ts.ImportDeclaration, source: ParsedSource) {
  if (!ts.isStringLiteral(node.moduleSpecifier)) return
  const specifier = node.moduleSpecifier.text
  source.imports.push(specifier)
  const bindings = node.importClause?.namedBindings
  if (bindings && ts.isNamedImports(bindings)) {
    for (const element of bindings.elements) {
      source.importBindings.set(element.name.text, { specifier, name: element.propertyName?.text ?? element.name.text })
    }
  }
}

function indexStyles(node: ts.CallExpression, source: ParsedSource) {
  const argument = node.arguments[0]
  if (!argument || !ts.isObjectLiteralExpression(argument)) return
  const sheet = ts.isVariableDeclaration(node.parent) ? node.parent.name.getText(source.syntax) : 'styles'
  let owner: ts.Node = node.parent
  while (!ts.isFunctionDeclaration(owner) && !ts.isSourceFile(owner)) owner = owner.parent
  const factory = ts.isFunctionDeclaration(owner) ? owner.name?.text : undefined
  for (const property of argument.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isObjectLiteralExpression(property.initializer)) continue
    const name = property.name.getText(source.syntax).replaceAll(/['"]/g, '')
    source.styles.set(`${sheet}.${name}`, property.initializer)
    if (factory) source.styles.set(`${factory}.${name}`, property.initializer)
  }
}

function importedSource(source: ParsedSource, specifier: string, available: ParsedSource[]): ParsedSource | undefined {
  const base = specifier.startsWith('@/') ? specifier.slice(2) : resolve(dirname(source.path), specifier)
  const paths = ['.ts', '.tsx', '/index.ts'].map((suffix) => relative(process.cwd(), resolve(`${base}${suffix}`)).replaceAll('\\', '/'))
  return available.find((candidate) => paths.includes(candidate.path))
}

function dependencies(source: ParsedSource, sources: Map<string, ParsedSource>, seen = new Set<string>()): ParsedSource[] {
  if (seen.has(source.path)) return []
  seen.add(source.path)
  return [source, ...source.imports.flatMap((specifier) => {
    const base = specifier.startsWith('@/') ? specifier.slice(2) : resolve(dirname(source.path), specifier)
    const imported = ['.ts', '.tsx', '/index.ts'].map((suffix) => sources.get(relative(process.cwd(), resolve(`${base}${suffix}`)).replaceAll('\\', '/'))).find(Boolean)
    return imported ? dependencies(imported, sources, seen) : []
  })]
}

function combine(left: StyleVariant[], right: StyleVariant[]): StyleVariant[] {
  return left.flatMap((before) => right.map((after) => [...before, ...after]))
}

function returnedStyles(node: ts.Node): ts.Expression[] {
  if (ts.isReturnStatement(node)) return node.expression ? [node.expression] : []
  if (ts.isArrowFunction(node) || ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) return []
  const returned: ts.Expression[] = []
  ts.forEachChild(node, (child) => { returned.push(...returnedStyles(child)) })
  return returned
}

function resolveStyles(node: ts.Node, source: ParsedSource, available: ParsedSource[], seen = new Set<ts.Node>(), pressed = false): StyleVariant[] {
  if (seen.has(node)) return [[]]
  const nextSeen = new Set(seen).add(node)
  const read = (expression: ts.Node, inPress = pressed) => resolveStyles(expression, source, available, nextSeen, inPress)
  if (ts.isObjectLiteralExpression(node)) return [[{ source, name: 'inline', object: node, pressed }]]
  if (ts.isArrayLiteralExpression(node)) return node.elements.reduce((variants, element) => combine(variants, read(element)), [[]] as StyleVariant[])
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSpreadElement(node)) return read(node.expression)
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return read(node.body)
  if (ts.isBlock(node)) return returnedStyles(node).flatMap((expression) => read(expression))
  return resolveBranchesAndReferences(node, source, available, read, pressed)
}

function resolveBranchesAndReferences(
  node: ts.Node,
  source: ParsedSource,
  available: ParsedSource[],
  read: (expression: ts.Node, inPress?: boolean) => StyleVariant[],
  pressed: boolean,
): StyleVariant[] {
  if (ts.isConditionalExpression(node)) {
    const condition = node.condition.getText(source.syntax)
    if (condition === 'pressed') return read(node.whenTrue, true)
    if (condition === '!pressed') return read(node.whenFalse, true)
    const inPress = pressed || /\bpressed\b/.test(condition)
    return [...read(node.whenTrue, inPress), ...read(node.whenFalse, inPress)]
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return node.left.getText(source.syntax) === 'pressed' ? read(node.right, true) : [[], ...read(node.right, pressed || /\bpressed\b/.test(node.left.getText(source.syntax)))]
  }
  return resolveReference(node, source, available, read, pressed)
}

function resolveReference(
  node: ts.Node,
  source: ParsedSource,
  available: ParsedSource[],
  read: (expression: ts.Node) => StyleVariant[],
  pressed: boolean,
): StyleVariant[] {
  if (ts.isPropertyAccessExpression(node)) return resolveNamedStyle(node, source, available, pressed)
  if (ts.isIdentifier(node)) {
    const binding = source.bindings.get(node.text)
    return binding ? read(binding) : [[]]
  }
  if (ts.isCallExpression(node)) {
    const binding = source.bindings.get(node.expression.getText(source.syntax))
    return binding ? read(binding) : [[]]
  }
  return [[]]
}

function resolveNamedStyle(node: ts.PropertyAccessExpression, source: ParsedSource, available: ParsedSource[], pressed: boolean): StyleVariant[] {
    const keys = stylesheetKeys(node, source)
    for (const key of keys) {
      const receiver = key.slice(0, key.lastIndexOf('.'))
      const imported = source.importBindings.get(receiver)
      const owners = imported ? [importedSource(source, imported.specifier, available)].filter((candidate) => candidate !== undefined) : available
      const resolvedKey = imported ? `${imported.name}.${node.name.text}` : key
      const owner = owners.find((candidate) => candidate.styles.has(resolvedKey))
      const object = owner?.styles.get(resolvedKey)
      if (owner && object) return [[{ source: owner, name: node.name.text, object, pressed }]]
    }
    return [[]]
}

function stylesheetKeys(node: ts.PropertyAccessExpression, source: ParsedSource): string[] {
  const keys = [node.getText(source.syntax)]
  const binding = source.bindings.get(node.expression.getText(source.syntax))
  if (binding) walk(binding, (child) => {
    if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)) keys.unshift(`${child.expression.text}.${node.name.text}`)
  })
  return keys
}

function styleProperties(parts: StyleVariant): Map<string, ts.Expression> {
  const properties = new Map<string, ts.Expression>()
  for (const part of parts) {
    for (const property of part.object.properties) {
      if (ts.isPropertyAssignment(property)) properties.set(property.name.getText(part.source.syntax).replaceAll(/['"]/g, ''), property.initializer)
    }
  }
  return properties
}

function hasFill(expression: ts.Expression | undefined): boolean {
  if (!expression) return false
  let found = false
  walk(expression, (node) => {
    if (ts.isPropertyAccessExpression(node) && FILL_TOKENS.has(node.name.text)) found = true
  })
  return found
}

function pressedPropertyMatches(expression: ts.Expression, matches: (value: ts.Expression) => boolean): boolean {
  if (!ts.isConditionalExpression(expression)) return matches(expression)
  const condition = expression.condition.getText()
  if (condition === 'pressed') return pressedPropertyMatches(expression.whenTrue, matches)
  if (condition === '!pressed') return pressedPropertyMatches(expression.whenFalse, matches)
  return pressedPropertyMatches(expression.whenTrue, matches) && pressedPropertyMatches(expression.whenFalse, matches)
}

function clipped(parts: StyleVariant): boolean {
  if (parts.some((part) => FLAT_SURFACES.has(`${part.source.path}:${part.name}`))) return true
  const properties = styleProperties(parts)
  const radius = properties.get('borderRadius')
  const overflow = properties.get('overflow')
  return !!radius && pressedPropertyMatches(radius, (value) => {
    const text = value.getText()
    return text !== 'undefined' && text !== 'null' && (Number.isNaN(Number(text)) || Number(text) > 0)
  }) && !!overflow && pressedPropertyMatches(overflow, (value) => ts.isStringLiteral(value) && value.text === 'hidden')
}

function location(source: ParsedSource, node: ts.Node, name: string): string {
  return `${source.path}:${source.syntax.getLineAndCharacterOfPosition(node.getStart(source.syntax)).line + 1} ${name}`
}

function pressCallbacks(source: ParsedSource): ts.ArrowFunction[] {
  const callbacks: ts.ArrowFunction[] = []
  walk(source.syntax, (node) => {
    if (!ts.isJsxAttribute(node) || node.name.getText(source.syntax) !== 'style' || !node.initializer || !ts.isJsxExpression(node.initializer)) return
    const expression = node.initializer.expression
    if (expression && ts.isArrowFunction(expression) && /\bpressed\b/.test(expression.parameters.map((parameter) => parameter.getText(source.syntax)).join(' '))) callbacks.push(expression)
  })
  return callbacks
}

function isPressFill(part: StylePart): boolean {
  const fill = styleProperties([part]).get('backgroundColor')
  return hasFill(fill) && (part.pressed || /press|hover/i.test(part.name) || !!fill && /\bpressed\b/.test(fill.getText()))
}

function unclippedPressStyles(files: ScannedSource[]): string[] {
  const sources = new Map(files.map((file) => [file.path, parseSource(file)]))
  const used = new Set<ts.ObjectLiteralExpression>()
  const failures = new Set<string>()
  for (const source of sources.values()) {
    const available = dependencies(source, sources)
    for (const callback of pressCallbacks(source)) {
      const variants = resolveStyles(callback, source, available)
      for (const parts of variants) {
        parts.forEach((part) => used.add(part.object))
        if (parts.some(isPressFill) && !clipped(parts)) {
          failures.add(location(source, callback, 'inline'))
        }
      }
    }
  }
  return [...failures, ...unconsumedPressStyles(sources, used)]
}

function unconsumedPressStyles(sources: Map<string, ParsedSource>, used: Set<ts.ObjectLiteralExpression>): string[] {
  const failures = new Set<string>()
  for (const source of sources.values()) {
    for (const [key, object] of source.styles) {
      const name = key.slice(key.lastIndexOf('.') + 1)
      if (used.has(object) || !/press|hover/i.test(name)) continue
      const parts = [{ source, name, object, pressed: true }]
      if (hasFill(styleProperties(parts).get('backgroundColor')) && !clipped(parts)) failures.add(location(source, object, name))
    }
  }
  return [...failures]
}

describe('mobile press shapes', () => {
  it('rejects a named press fill with a nested transform and no radius', () => {
    const contents = 'const styles = StyleSheet.create({ pressed: { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }], overflow: "hidden" } })'
    expect(unclippedPressStyles([{ path: 'fixtures/press-shapes.tsx', contents }])).toEqual(['fixtures/press-shapes.tsx:1 pressed'])
  })

  it('rejects an inline press fill without a radius', () => {
    const contents = '<Pressable style={({ pressed }) => [pressed ? { backgroundColor: tokens.bgHover, overflow: "hidden" } : null]} />'
    expect(unclippedPressStyles([{ path: 'fixtures/press-shapes.tsx', contents }])).toEqual(['fixtures/press-shapes.tsx:1 inline'])
  })

  it.each(Object.keys(createTokensV2()))('reads the theme fill token %s', (token) => {
    const contents = `const styles = StyleSheet.create({ pressed: { backgroundColor: tokens.${token} } })`
    expect(unclippedPressStyles([{ path: 'fixtures/press-shapes.tsx', contents }])).toEqual(['fixtures/press-shapes.tsx:1 pressed'])
  })

  it.each(Object.keys(createTokensV2()))('reads the inline theme fill token %s', (token) => {
    const contents = `<Pressable style={({ pressed }) => [{ backgroundColor: pressed ? tokens.${token} : 'transparent' }]} />`
    expect(unclippedPressStyles([{ path: 'fixtures/press-shapes.tsx', contents }])).toEqual(['fixtures/press-shapes.tsx:1 inline'])
  })

  it('accepts a nested named fill clipped by its base style', () => {
    const contents = `const styles = StyleSheet.create({ row: { borderRadius: 12, overflow: 'hidden' }, pressed: { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] } })
;<Pressable style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]} />`
    expect(unclippedPressStyles([{ path: 'fixtures/press-shapes.tsx', contents }])).toEqual([])
  })

  it('checks every consumer of a shared pressed style', () => {
    const contents = `const styles = StyleSheet.create({ row: { borderRadius: 12, overflow: 'hidden' }, pressed: { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] } })
;<Pressable style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]} />
;<Pressable style={({ pressed }) => [pressed ? styles.pressed : null]} />`
    expect(unclippedPressStyles([{ path: 'fixtures/press-shapes.tsx', contents }])).toEqual(['fixtures/press-shapes.tsx:3 inline'])
  })

  it('resolves base arrays, spreads and local style functions', () => {
    const contents = `const styles = StyleSheet.create({ row: { borderRadius: 12, overflow: 'hidden' } })
function getRowStyle() { return [styles.row] }
const rowStyle = getRowStyle()
const variantStyle = (pressed) => ({ backgroundColor: pressed ? tokens.bgCard : 'transparent' })
;<Pressable style={({ pressed }) => [...rowStyle, variantStyle(pressed)]} />`
    expect(unclippedPressStyles([{ path: 'fixtures/press-shapes.tsx', contents }])).toEqual([])
    expect(unclippedPressStyles([{ path: 'fixtures/press-shapes.tsx', contents: contents.replace("borderRadius: 12, ", '') }])).toEqual(['fixtures/press-shapes.tsx:5 inline'])
  })

  it('resolves relatively imported named styles', () => {
    const files = [
      { path: 'fixtures/styles.ts', contents: `export const styles = StyleSheet.create({ row: { borderRadius: 12, overflow: 'hidden' }, pressed: { backgroundColor: tokens.bgElev2, transform: [{ scale: 0.96 }] } })` },
      { path: 'fixtures/control.tsx', contents: `import { styles } from './styles'; <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} />` },
    ]
    expect(unclippedPressStyles(files)).toEqual([])
    expect(unclippedPressStyles(files.map((file) => ({ ...file, contents: file.contents.replace("overflow: 'hidden'", "overflow: 'visible'") })))).toEqual(['fixtures/control.tsx:1 inline'])
  })

  it('keeps aliased imports attached to their own stylesheet module', () => {
    const files = [
      { path: 'fixtures/rounded.ts', contents: `export const styles = StyleSheet.create({ row: { borderRadius: 12, overflow: 'hidden' } })` },
      { path: 'fixtures/square.ts', contents: `export const styles = StyleSheet.create({ row: {} })` },
      { path: 'fixtures/control.tsx', contents: `import { styles as roundedStyles } from './rounded'; import { styles } from './square'; <Pressable style={({ pressed }) => [styles.row, pressed && { backgroundColor: tokens.bgHover }]} />` },
    ]
    expect(unclippedPressStyles(files)).toEqual(['fixtures/control.tsx:1 inline'])
    expect(unclippedPressStyles(files.map((file) => ({ ...file, contents: file.contents.replace('[styles.row,', '[roundedStyles.row,') })))).toEqual([])
  })

  it('resolves the factory of a memoized stylesheet', () => {
    const files = [
      { path: 'fixtures/styles.ts', contents: `export function createSectionStyles() { return StyleSheet.create({ row: { borderRadius: 12, overflow: 'hidden' } }) }; export function createStyles() { return StyleSheet.create({ row: {} }) }` },
      { path: 'fixtures/control.tsx', contents: `import { createSectionStyles, createStyles } from './styles'; const sectionStyles = useMemo(() => createSectionStyles(), []); <Pressable style={({ pressed }) => [sectionStyles.row, pressed && { backgroundColor: tokens.bgHover }]} />` },
    ]
    expect(unclippedPressStyles(files)).toEqual([])
    expect(unclippedPressStyles(files.map((file) => ({ ...file, contents: file.contents.replace('=> createSectionStyles()', '=> createStyles()') })))).toEqual(['fixtures/control.tsx:1 inline'])
  })

  it.each([
    `{ borderRadius: 12 }`,
    `{ overflow: 'hidden' }`,
    `{ borderRadius: 0, overflow: 'hidden' }`,
    `{ nested: { borderRadius: 12, overflow: 'hidden' } }`,
    `selected ? { borderRadius: 12, overflow: 'hidden' } : null`,
    `{ borderRadius: 12, overflow: 'hidden' }, { overflow: 'visible' }`,
  ])('rejects incomplete clipping in %s', (baseStyle) => {
    const contents = `<Pressable style={({ pressed }) => [${baseStyle}, pressed && { backgroundColor: tokens.bgSunk, transform: [{ scale: 0.96 }] }]} />`
    expect(unclippedPressStyles([{ path: 'fixtures/press-shapes.tsx', contents }])).toEqual(['fixtures/press-shapes.tsx:1 inline'])
  })

  it('ignores an unchanged fill with opacity-only press feedback', () => {
    const contents = `<Pressable style={({ pressed }) => [{ backgroundColor: tokens.primary }, pressed ? { opacity: 0.7 } : null]} />`
    expect(unclippedPressStyles([{ path: 'fixtures/press-shapes.tsx', contents }])).toEqual([])
  })

  it('rejects a press fill in the false branch of a pressed comparison', () => {
    const contents = `<Pressable style={({ pressed }) => [pressed === false ? null : { backgroundColor: tokens.bgHover }]} />`
    expect(unclippedPressStyles([{ path: 'fixtures/press-shapes.tsx', contents }])).toEqual(['fixtures/press-shapes.tsx:1 inline'])
  })

  it('rejects a radius removed while pressed', () => {
    const contents = `<Pressable style={({ pressed }) => [{ borderRadius: pressed ? 0 : 12, overflow: 'hidden' }, pressed && { backgroundColor: tokens.bgHover }]} />`
    expect(unclippedPressStyles([{ path: 'fixtures/press-shapes.tsx', contents }])).toEqual(['fixtures/press-shapes.tsx:1 inline'])
  })

  it('resolves a style name within its own stylesheet', () => {
    const contents = `const roundedStyles = StyleSheet.create({ row: { borderRadius: 12, overflow: 'hidden' } });
const squareStyles = StyleSheet.create({ row: {} });
;<Pressable style={({ pressed }) => [squareStyles.row, pressed && { backgroundColor: tokens.bgHover }]} />`
    expect(unclippedPressStyles([{ path: 'fixtures/press-shapes.tsx', contents }])).toEqual(['fixtures/press-shapes.tsx:3 inline'])
    expect(unclippedPressStyles([{ path: 'fixtures/press-shapes.tsx', contents: contents.replace('squareStyles.row', 'roundedStyles.row') }])).toEqual([])
  })

  it('does not exempt a calendar style name in another file', () => {
    const contents = `const styles = StyleSheet.create({ colHeader: {} }); <Pressable style={({ pressed }) => [styles.colHeader, pressed && { backgroundColor: tokens.bgHover }]} />`
    expect(unclippedPressStyles([{ path: 'fixtures/press-shapes.tsx', contents }])).toEqual(['fixtures/press-shapes.tsx:1 inline'])
    expect(unclippedPressStyles([{ path: CALENDAR_GRID, contents }])).toEqual([])
  })

  it('keeps every flat-surface exception attached to a used style and a reason', () => {
    const files = SOURCE_DIRECTORIES.flatMap((directory) => sourceFiles(resolve(process.cwd(), directory)))
    for (const [key, reason] of FLAT_SURFACES) {
      const separator = key.lastIndexOf(':')
      const file = files.find((candidate) => candidate.path === key.slice(0, separator))
      const name = key.slice(separator + 1)
      expect(file, key).toBeDefined()
      expect(parseSource(file!).styles.has(`styles.${name}`), key).toBe(true)
      expect(file!.contents).toContain(`styles.${name}`)
      expect(reason.trim().length).toBeGreaterThan(0)
    }
  })

  it('clips every composed press fill to its own radius', () => {
    const files = SOURCE_DIRECTORIES.flatMap((directory) => sourceFiles(resolve(process.cwd(), directory)))
    expect(files.length).toBeGreaterThan(100)
    expect(unclippedPressStyles(files)).toEqual([])
  })
})
