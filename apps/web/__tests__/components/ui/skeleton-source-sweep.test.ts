import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const SOURCE_ROOTS = ['apps/web/app', 'apps/web/components', 'apps/web/lib', 'apps/mobile/app', 'apps/mobile/components']
const SKELETON_FILES = new Set(['apps/web/components/ui/skeleton.tsx', 'apps/mobile/components/ui/skeleton.tsx'])
const SKELETON_EXPORTS = new Set(['Skeleton', 'SkeletonFace'])
const SKELETON_MARKER = /skeleton/i

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

function skeletonNames(syntax: ts.SourceFile) {
  const names = new Set<string>()
  for (const statement of syntax.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    if (!/(?:^|\/)skeleton$/.test(statement.moduleSpecifier.text)) continue
    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    for (const element of bindings.elements) {
      if (SKELETON_EXPORTS.has((element.propertyName ?? element.name).text)) names.add(element.name.text)
    }
  }
  return names
}

function openingOf(node: ts.Node) {
  if (ts.isJsxElement(node)) return node.openingElement
  if (ts.isJsxSelfClosingElement(node)) return node
  return null
}

function marksSkeleton(opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement, syntax: ts.SourceFile) {
  return opening.attributes.properties.some((property) => {
    if (!ts.isJsxAttribute(property)) return false
    const name = property.name.getText(syntax)
    if (name.startsWith('data-') && SKELETON_MARKER.test(name)) return true
    if (name !== 'testID' && name !== 'data-testid') return false
    return SKELETON_MARKER.test(property.initializer?.getText(syntax) ?? '')
  })
}

function drawsAny(node: ts.Node, names: Set<string>, syntax: ts.SourceFile) {
  let found = false
  walk(node, (child) => {
    const opening = openingOf(child)
    if (opening && names.has(opening.tagName.getText(syntax))) found = true
  })
  return found
}

/** The imported shared names plus each component of the same file that renders one of them. */
function sharedSkeletonNames(syntax: ts.SourceFile) {
  const names = skeletonNames(syntax)
  const components = new Map<string, ts.Node>()
  walk(syntax, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) components.set(node.name.text, node.body)
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) components.set(node.name.text, node.initializer)
  })
  let grew = true
  while (grew) {
    grew = false
    for (const [name, body] of components) {
      if (!names.has(name) && drawsAny(body, names, syntax)) { names.add(name); grew = true }
    }
  }
  return names
}

/** Each element named as a skeleton whose subtree draws no shared `Skeleton` or `SkeletonFace`, as `path:line`. */
function findHandDrawnSkeletons(path: string, contents: string): string[] {
  const syntax = ts.createSourceFile(path, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const shared = sharedSkeletonNames(syntax)
  const findings: string[] = []
  walk(syntax, (node) => {
    const opening = openingOf(node)
    if (!opening || !marksSkeleton(opening, syntax)) return
    if (!drawsAny(node, shared, syntax)) findings.push(`${path}:${syntax.getLineAndCharacterOfPosition(node.getStart(syntax)).line + 1}`)
  })
  return findings
}

describe('skeletons draw from the shared Skeleton', () => {
  it('reports a placeholder named as a skeleton that paints its own static bars', () => {
    const fixture = [
      "import { Skeleton } from '@/components/ui/skeleton'",
      'export const a = <span data-summary-skeleton><span className="h-[14px] rounded-[8px] bg-[var(--hairline-strong)]" /></span>',
      'export const b = <View testID="summary-skeleton"><View style={styles.bar} /></View>',
      'export const c = <span data-summary-skeleton><span className="h-[14px]"><Skeleton variant="fill" grouped /></span></span>',
      'function Block() { return <div className="h-4"><Skeleton variant="fill" grouped /></div> }',
      'export const d = <div data-pro-skeleton><Block /></div>',
    ].join('\n')
    expect(findHandDrawnSkeletons('fixture.tsx', fixture)).toEqual(['fixture.tsx:2', 'fixture.tsx:3'])
  })

  it('finds no hand-drawn placeholder in either app, so every wait shares one pulse and one set of tokens', () => {
    const files = SOURCE_ROOTS.flatMap((root) => sourceFiles(resolve(repositoryRoot, root)))
      .map((file) => relative(repositoryRoot, file).replaceAll('\\', '/'))
      .filter((file) => !SKELETON_FILES.has(file))
    expect(files.length).toBeGreaterThan(400)
    expect(files.flatMap((file) => findHandDrawnSkeletons(file, readFileSync(resolve(repositoryRoot, file), 'utf8')))).toEqual([])
  })
})
