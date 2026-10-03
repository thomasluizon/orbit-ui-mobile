import { readFileSync, readdirSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../../..')
const scale = new Set([12, 14, 16, 17, 20, 22, 28, 34, 44, 60])
const widgetDrawing = 'design/canvas/Orbit Widget Android.dc.html'
const exceptions = [
  { path: 'apps/web/components/command/command-habit-items.tsx', size: 18, element: 'habitLeading.span[1].className', drawing: 'design/canvas/Orbit Busca.dc.html', drawingElement: "typeof icon === 'string' && icon.length <= 2 ? icon : H(D.Icon, { name: icon, size: 20 })" },
  { path: 'apps/mobile/components/share/share-card.tsx', size: 88, element: 'createStyles.primaryValue.fontSize', drawing: 'design/canvas/Orbit Wrapped.dc.html', drawingElement: 'String(data.completions)' },
  { path: 'apps/web/components/share/share-card.tsx', size: 88, element: 'share-card-figure[1].style.fontSize', drawing: 'design/canvas/Orbit Wrapped.dc.html', drawingElement: 'String(data.completions)' },
  { path: 'apps/mobile/modules/orbit-widget/android/src/main/res/layout/widget_item.xml', size: 15, element: '@+id/item_title', drawing: widgetDrawing, drawingElement: 'r.name' },
  { path: 'apps/mobile/modules/orbit-widget/android/src/main/res/layout/widget_layout.xml', size: 13, element: '@+id/widget_header', drawing: widgetDrawing, drawingElement: 'o.title || t.today' },
  { path: 'apps/mobile/modules/orbit-widget/android/src/main/res/layout/widget_layout.xml', size: 15, element: '@+id/widget_streak', drawing: widgetDrawing, drawingElement: 'o.streak' },
  { path: 'apps/mobile/modules/orbit-widget/android/src/main/res/layout/widget_layout.xml', size: 15, element: '@+id/widget_empty_text', drawing: widgetDrawing, drawingElement: 't.allClear' },
  { path: 'apps/mobile/scripts/generate-widget-preview.ts', size: 13, element: 'text[5]', drawing: widgetDrawing, drawingElement: 'o.title || t.today' },
  { path: 'apps/mobile/scripts/generate-widget-preview.ts', size: 15, element: 'text[3]', drawing: widgetDrawing, drawingElement: 'r.name' },
  { path: 'apps/mobile/scripts/generate-widget-preview.ts', size: 15, element: 'text[7]', drawing: widgetDrawing, drawingElement: 'o.streak' },
]

type AuthoredSize = { size: number; element: string }

function authoredFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', '__tests__', 'test-mocks', 'test-support', 'e2e', '.next', '.expo', 'build', '.gradle'].includes(entry.name)) return []
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? authoredFiles(path) : /\.(?:tsx?|jsx?|css|xml|svg)$/.test(entry.name) && !/\.(?:test|type-test)\./.test(entry.name) ? [path] : []
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

function* ancestors(node: ts.Node): Generator<ts.Node> {
  let current = node
  while (!ts.isSourceFile(current)) {
    yield current
    current = current.parent
  }
}

function jsxIdentity(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, syntax: ts.SourceFile): string {
  const testId = node.attributes.properties.find((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(syntax) === 'data-testid')
  const preceding = syntax.text.slice(0, node.getStart(syntax))
  if (testId && ts.isJsxAttribute(testId) && testId.initializer && ts.isStringLiteral(testId.initializer)) {
    const identifier = testId.initializer.text
    const count = [...preceding.matchAll(/data-testid\s*=\s*["']([^"']+)["']/g)].filter((match) => match[1] === identifier).length
    return `${identifier}[${count + 1}]`
  }
  const tag = node.tagName.getText(syntax)
  const count = preceding.match(new RegExp(`<${tag}(?=[\\s>])`, 'g'))?.length ?? 0
  const owner = [...ancestors(node)].find((ancestor) => ts.isFunctionDeclaration(ancestor) || ts.isFunctionExpression(ancestor))
  const name = owner && (ts.isFunctionDeclaration(owner) || ts.isFunctionExpression(owner)) ? owner.name?.getText(syntax) : undefined
  return [name, `${tag}[${count + 1}]`].filter(Boolean).join('.')
}

function declarationIdentity(node: ts.Node, syntax: ts.SourceFile): string {
  const parts: string[] = []
  for (const ancestor of ancestors(node)) {
    if (ts.isPropertyAssignment(ancestor) || ts.isJsxAttribute(ancestor)) parts.unshift(ancestor.name.getText(syntax).replaceAll(/['"]/g, ''))
    if (ts.isJsxOpeningElement(ancestor) || ts.isJsxSelfClosingElement(ancestor)) return [jsxIdentity(ancestor, syntax), ...parts].join('.')
    if ((ts.isFunctionDeclaration(ancestor) || ts.isFunctionExpression(ancestor) || ts.isMethodDeclaration(ancestor)) && ancestor.name) {
      parts.unshift(ancestor.name.getText(syntax))
      break
    }
    if (ts.isVariableDeclaration(ancestor)) parts.unshift(ancestor.name.getText(syntax))
  }
  return parts.join('.')
}

function markupSizes(source: string): AuthoredSize[] {
  const counts = new Map<string, number>()
  return [...source.matchAll(/<([\w:-]+)\b([^>]*?)>/g)].flatMap((tag) => {
    const ordinal = (counts.get(tag[1]!) ?? 0) + 1
    counts.set(tag[1]!, ordinal)
    const element = tag[2]!.match(/(?:android:id|id)=["']([^"']+)["']/)?.[1] ?? `${tag[1]!}[${ordinal}]`
    return [...tag[2]!.matchAll(/(?:font-size|android:textSize)=["']([\d.]+)(?:sp|px)?["']/g)].map((match) => ({ size: Number(match[1]), element }))
  })
}

function authoredSizes(source: string, path: string): AuthoredSize[] {
  if (/\.(?:xml|svg)$/.test(path)) return markupSizes(source)
  if (/\.css$/.test(path)) {
    return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((rule) => [...rule[2]!.matchAll(/font-size:\s*([\d.]+)(px|rem)/g)].map((match) => ({ size: Number(match[1]) * (match[2] === 'rem' ? 16 : 1), element: rule[1]!.trim() })))
  }
  const values = markupSizes(source)
  const syntax = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  function visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(syntax).replaceAll(/['"]/g, '') === 'fontSize') {
      values.push(...literalSizes(node.initializer).map((size) => ({ size, element: declarationIdentity(node, syntax) })))
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      values.push(...[...node.getText(syntax).matchAll(/(?:text-\[|font-size:\s*)([\d.]+)(px|rem)/g)].map((match) => ({ size: Number(match[1]) * (match[2] === 'rem' ? 16 : 1), element: declarationIdentity(node, syntax) })))
    }
    ts.forEachChild(node, visit)
  }
  visit(syntax)
  return values
}

function violations(source: string, path: string): AuthoredSize[] {
  return authoredSizes(source, path).filter(({ size, element }) => !scale.has(size) && !exceptions.some((entry) => entry.path === path && entry.size === size && entry.element === element))
}

function drawingSizes(source: string): AuthoredSize[] {
  const syntax = ts.createSourceFile('drawing.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const values: AuthoredSize[] = []
  function visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(syntax) === 'fontSize') {
      const ancestor = [...ancestors(node)].find(ts.isCallExpression)
      if (ancestor && ancestor.expression.getText(syntax) === 'H') {
        const child = ancestor.arguments[2]
        if (child) values.push(...literalSizes(node.initializer).map((size) => ({ size, element: child.getText(syntax) })))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(syntax)
  return values
}

describe('authored app typography', () => {
  it('rejects a widget children badge at the habit title exception size', () => {
    const path = 'apps/mobile/modules/orbit-widget/android/src/main/res/layout/widget_item.xml'
    const source = readFileSync(resolve(root, path), 'utf8')
    const mutated = source.replace(/(android:id="@\+id\/item_children_badge"[\s\S]*?android:textSize=")12sp"/, (_match, prefix: string) => `${prefix}15sp"`)
    expect(mutated).not.toBe(source)
    expect(violations(mutated, path)).toEqual([{ size: 15, element: '@+id/item_children_badge' }])
    expect(authoredSizes(mutated, path)).toContainEqual({ size: 15, element: '@+id/item_title' })
  })

  it('rejects a secondary share figure at the primary figure exception size', () => {
    const path = 'apps/web/components/share/share-card.tsx'
    const source = readFileSync(resolve(root, path), 'utf8')
    const mutated = source.replace('fontSize: 34', 'fontSize: 88')
    expect(mutated).not.toBe(source)
    expect(violations(mutated, path)).toEqual([{ size: 88, element: 'share-card-figure[2].style.fontSize' }])
  })

  it.each(['mobile', 'web'])('keeps every authored %s size on the closed scale or its named drawing', (platform) => {
    const found = authoredFiles(resolve(root, 'apps', platform)).flatMap((file) => {
      const path = relative(root, file).replaceAll('\\', '/')
      return violations(readFileSync(file, 'utf8'), path).map((declaration) => ({ path, ...declaration }))
    })
    expect(found).toEqual([])
  })

  it('recognizes fractional pixels, rems, conditional branches and arbitrary text classes', () => {
    expect(authoredSizes(`const style = { fontSize: 10.5 }; const other = { fontSize: mono ? 13 : 14 }; const rem = { fontSize: '0.8125rem' }; const label = 'text-[15px]'`, 'sample.tsx').map(({ size }) => size)).toEqual([10.5, 13, 14, 13, 15])
    expect(authoredSizes('a { font-size: 0.8125rem } b { font-size: 18px }', 'sample.css')).toEqual([{ size: 13, element: 'a' }, { size: 18, element: 'b' }])
    expect(authoredSizes('<TextView android:textSize="11sp" /><text font-size="13" />', 'sample.xml')).toEqual([{ size: 11, element: 'TextView[1]' }, { size: 13, element: 'text[1]' }])
  })

  it.each(exceptions)('keeps $path exception tied to its named element drawing', ({ path, size, element, drawing, drawingElement }) => {
    expect(authoredSizes(readFileSync(resolve(root, path), 'utf8'), path).filter((declaration) => declaration.element === element)).toEqual([{ size, element }])
    const source = readFileSync(resolve(root, drawing), 'utf8')
    const scripts = [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join('\n')
    expect(drawingSizes(scripts).filter((declaration) => declaration.element === drawingElement)).toEqual([{ size, element: drawingElement }])
  })
})
