import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@testing-library/react'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { Icon } from '@/components/ui/icon'

const repositoryRoot = join(process.cwd(), '..', '..')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(file)
    return entry.name.endsWith('.tsx') ? [file] : []
  })
}

function parse(file: string) {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

function stringValues(node: ts.Node): string[] {
  if (ts.isStringLiteral(node)) return [node.text]
  if (ts.isJsxExpression(node)) return node.expression ? stringValues(node.expression) : []
  if (ts.isConditionalExpression(node)) return [...stringValues(node.whenTrue), ...stringValues(node.whenFalse)]
  if (ts.isParenthesizedExpression(node)) return stringValues(node.expression)
  return []
}

function actionIconNames(node: ts.Node, source: ts.SourceFile): string[] {
  const names: string[] = []
  function visit(child: ts.Node) {
    if (ts.isPropertyAssignment(child) && child.name.getText(source) === 'icon') {
      names.push(...stringValues(child.initializer))
    }
    ts.forEachChild(child, visit)
  }
  visit(node)
  return names
}

function namesFromRow(node: ts.JsxOpeningLikeElement, source: ts.SourceFile): string[] {
  return node.attributes.properties.flatMap((attribute) => {
    if (!ts.isJsxAttribute(attribute) || !attribute.initializer) return []
    const name = attribute.name.getText(source)
    if (name === 'icon') return stringValues(attribute.initializer)
    if (name === 'action') return actionIconNames(attribute.initializer, source)
    return []
  })
}

function rowIconNames(platform: 'web' | 'mobile'): Set<string> {
  const app = join(repositoryRoot, 'apps', platform)
  const names = new Set<string>()
  for (const file of [...sourceFiles(join(app, 'app')), ...sourceFiles(join(app, 'components'))]) {
    const source = parse(file)
    function visit(node: ts.Node) {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === 'ListRow') {
        for (const name of namesFromRow(node, source)) names.add(name)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return names
}

function mappedIcons(platform: 'web' | 'mobile'): Set<string> {
  const file = join(repositoryRoot, 'apps', platform, 'components', 'ui', 'icon.tsx')
  const source = parse(file)
  const names = new Set<string>()
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'ICON_COMPONENTS' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const property of node.initializer.properties) {
        if (ts.isPropertyAssignment(property)) names.add(property.name.getText(source).replaceAll("'", ''))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return names
}

describe('ListRow icon names', () => {
  it.each(['web', 'mobile'] as const)('maps every %s caller icon to a glyph', (platform) => {
    const map = mappedIcons(platform)
    const missing = [...rowIconNames(platform)].filter((name) => !map.has(name))
    expect(missing).toEqual([])
  })

  it('renders every web caller icon as an SVG', () => {
    for (const name of rowIconNames('web')) {
      const { container, unmount } = render(<Icon name={name} />)
      expect(container.querySelector(`[data-icon="${name}"] svg`), name).not.toBeNull()
      unmount()
    }
  })
})
