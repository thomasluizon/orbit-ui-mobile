import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const SOURCE_ROOTS = ['apps/web/app', 'apps/web/components', 'apps/web/lib', 'apps/mobile/app', 'apps/mobile/components']
const PILL_EXPORTS = new Set(['Button', 'PillButton', 'ThemedButton', 'PillLink'])
const MASCOT_EXPORTS = new Set(['OrbitMascot', 'OrbitMascotIcon', 'OrbitMascotDrawing'])
const PRIMARY_FILL = /bg-\[var\(--primary\)\]|(?:^|\s)bg-primary(?:\s|$)/
const PRIMARY_STYLE_VALUE = /var\(--primary\)|\b(?:tokens|colors)\.primary\b/

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(entryPath)
    return extname(entry.name) === '.tsx' ? [entryPath] : []
  })
}

function walk(node: ts.Node, visit: (node: ts.Node) => void) {
  visit(node)
  ts.forEachChild(node, (child) => walk(child, visit))
}

function importedNames(syntax: ts.SourceFile, modulePattern: RegExp, exported: Set<string>) {
  const names = new Set<string>()
  for (const statement of syntax.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    if (!modulePattern.test(statement.moduleSpecifier.text)) continue
    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    for (const element of bindings.elements) {
      if (exported.has((element.propertyName ?? element.name).text)) names.add(element.name.text)
    }
  }
  return names
}

function tagName(node: ts.Node, syntax: ts.SourceFile) {
  if (ts.isJsxElement(node)) return node.openingElement.tagName.getText(syntax)
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText(syntax)
  return null
}

function attributesOf(node: ts.JsxElement | ts.JsxSelfClosingElement) {
  return (ts.isJsxElement(node) ? node.openingElement : node).attributes.properties
}

function attribute(node: ts.JsxElement | ts.JsxSelfClosingElement, name: string) {
  return attributesOf(node).find((property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === name)
}

function carriesMascot(node: ts.Node, syntax: ts.SourceFile, mascots: Set<string>) {
  let found = false
  walk(node, (child) => {
    const name = tagName(child, syntax)
    if (name && mascots.has(name)) found = true
  })
  return found
}

function isGhost(node: ts.JsxElement | ts.JsxSelfClosingElement) {
  const initializer = attribute(node, 'variant')?.initializer
  if (!initializer) return false
  if (ts.isStringLiteral(initializer)) return initializer.text === 'ghost'
  const expression = ts.isJsxExpression(initializer) ? initializer.expression : undefined
  return Boolean(expression && ts.isStringLiteralLike(expression) && expression.text === 'ghost')
}

function paintsPrimary(node: ts.JsxElement | ts.JsxSelfClosingElement, syntax: ts.SourceFile) {
  const className = attribute(node, 'className')?.initializer?.getText(syntax) ?? ''
  if (PRIMARY_FILL.test(className)) return true
  const style = attribute(node, 'style')?.initializer
  if (!style) return false
  let primary = false
  walk(style, (child) => {
    if (!ts.isPropertyAssignment(child)) return
    const key = child.name.getText(syntax).replace(/['"]/g, '')
    if ((key === 'background' || key === 'backgroundColor') && PRIMARY_STYLE_VALUE.test(child.initializer.getText(syntax))) primary = true
  })
  return primary
}

/** Each place where Orbit sits on a filled pill or on a `--primary` fill, as `path:line`. */
function findMascotOnFill(path: string, contents: string): string[] {
  const syntax = ts.createSourceFile(path, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const pills = importedNames(syntax, /(?:^|\/)pill-button$/, PILL_EXPORTS)
  const mascots = importedNames(syntax, /(?:^|\/)orbit-mascot(?:-drawing)?$/, MASCOT_EXPORTS)
  if (mascots.size === 0) return []
  const findings: string[] = []
  walk(syntax, (node) => {
    if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) return
    const name = tagName(node, syntax)!
    const filledPill = pills.has(name) && !isGhost(node)
    if ((filledPill || paintsPrimary(node, syntax)) && carriesMascot(node, syntax, mascots)) {
      findings.push(`${path}:${syntax.getLineAndCharacterOfPosition(node.getStart(syntax)).line + 1}`)
    }
  })
  return findings
}

describe('Orbit on a filled surface', () => {
  it('reports a mascot pill without the ghost variant and a mascot on a primary fill', () => {
    const fixture = [
      "import { PillButton } from '@/components/ui/pill-button'",
      "import { OrbitMascot } from '@/components/ui/orbit-mascot'",
      'export const a = <PillButton leadingIcon={<OrbitMascot size={16} />}>Ask</PillButton>',
      'export const b = <PillButton variant={variant} leadingIcon={<OrbitMascot size={16} />}>Ask</PillButton>',
      'export const c = <button className="bg-[var(--primary)]"><OrbitMascot size={20} /></button>',
      'export const d = <View style={{ backgroundColor: tokens.primary }}><OrbitMascot size={20} /></View>',
      'export const e = <PillButton variant="ghost" leadingIcon={<OrbitMascot size={16} />}>Ask</PillButton>',
      'export const f = <PillButton variant="primary">Save</PillButton>',
    ].join('\n')
    expect(findMascotOnFill('fixture.tsx', fixture)).toEqual(['fixture.tsx:3', 'fixture.tsx:4', 'fixture.tsx:5', 'fixture.tsx:6'])
  })

  it('reports the hook-free drawing on a primary fill as it reports the live mascot', () => {
    const fixture = [
      "import { OrbitMascotDrawing } from '@/components/ui/orbit-mascot-drawing'",
      'export const a = <button className="bg-[var(--primary)]"><OrbitMascotDrawing size={48} clipId="planet" /></button>',
    ].join('\n')
    expect(findMascotOnFill('fixture.tsx', fixture)).toEqual(['fixture.tsx:2'])
  })

  it('keeps every mascot in both apps off a filled pill and off a primary fill, so the moon never meets its own colour', () => {
    const files = SOURCE_ROOTS.flatMap((root) => sourceFiles(resolve(repositoryRoot, root)))
    expect(files.length).toBeGreaterThan(400)
    const findings = files.flatMap((file) => findMascotOnFill(relative(repositoryRoot, file).replaceAll('\\', '/'), readFileSync(file, 'utf8')))
    expect(findings).toEqual([])
  })
})
