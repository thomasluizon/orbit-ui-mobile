import { readFileSync, readdirSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../../..')
const scale = new Set([12, 14, 16, 17, 20, 22, 28, 34, 44, 60])
const exceptions = [
  { path: 'apps/mobile/components/share/share-card.tsx', size: 88, drawing: 'design/canvas/Orbit Wrapped.dc.html', element: 'primaryValue' },
  { path: 'apps/web/components/share/share-card.tsx', size: 88, drawing: 'design/canvas/Orbit Wrapped.dc.html', element: 'primary figure' },
]

function authoredFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', '__tests__', 'test-mocks', 'test-support', 'e2e', '.next', 'android', '.expo'].includes(entry.name)) return []
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? authoredFiles(path) : /\.(?:tsx?|jsx?|css)$/.test(entry.name) && !/\.(?:test|type-test)\./.test(entry.name) ? [path] : []
  })
}

function literalSizes(expression: ts.Expression): number[] {
  if (ts.isNumericLiteral(expression)) return [Number(expression.text)]
  if (ts.isStringLiteral(expression)) {
    const match = expression.text.match(/^([\d.]+)(px|rem)$/)
    return match ? [Number(match[1]) * (match[2] === 'rem' ? 16 : 1)] : []
  }
  if (ts.isConditionalExpression(expression)) return [...literalSizes(expression.whenTrue), ...literalSizes(expression.whenFalse)]
  return []
}

function authoredSizes(source: string, path: string): number[] {
  const values = [...source.matchAll(/(?:text-\[|font-size:\s*)([\d.]+)(px|rem)/g)].map((match) => Number(match[1]) * (match[2] === 'rem' ? 16 : 1))
  if (path.endsWith('.css')) return values
  const syntax = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  function visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(syntax).replaceAll(/['"]/g, '') === 'fontSize') values.push(...literalSizes(node.initializer))
    ts.forEachChild(node, visit)
  }
  visit(syntax)
  return values
}

describe('authored app typography', () => {
  it.each(['mobile', 'web'])('keeps every authored %s size on the closed scale or its named drawing', (platform) => {
    const violations = authoredFiles(resolve(root, 'apps', platform)).flatMap((file) => {
      const path = relative(root, file).replaceAll('\\', '/')
      return authoredSizes(readFileSync(file, 'utf8'), path).filter((size) => !scale.has(size) && !exceptions.some((entry) => entry.path === path && entry.size === size)).map((size) => ({ path, size }))
    })
    expect(violations).toEqual([])
  })

  it('recognizes fractional pixels, rems, conditional branches and arbitrary text classes', () => {
    expect(authoredSizes(`const style = { fontSize: 10.5 }; const other = { fontSize: mono ? 13 : 14 }; const rem = { fontSize: '0.8125rem' }; const label = 'text-[15px]'`, 'sample.tsx')).toEqual([15, 10.5, 13, 14, 13])
    expect(authoredSizes('a { font-size: 0.8125rem } b { font-size: 18px }', 'sample.css')).toEqual([13, 18])
  })

  it.each(exceptions)('keeps $path exception tied to its exported figure drawing', ({ path, size, drawing }) => {
    expect(authoredSizes(readFileSync(resolve(root, path), 'utf8'), path)).toContain(size)
    expect(readFileSync(resolve(root, drawing), 'utf8')).toContain(`fontSize: ${size}`)
  })
})
