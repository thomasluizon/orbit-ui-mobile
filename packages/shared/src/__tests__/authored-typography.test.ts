import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve, relative } from 'node:path'
import libCoverage from 'istanbul-lib-coverage'
import libReport from 'istanbul-lib-report'
import reports from 'istanbul-reports'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../../..')
const gitExecutable = resolve(createRequire(import.meta.url)('which').sync('git'))
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
  return execFileSync(gitExecutable, ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '.'], { cwd: directory, encoding: 'utf8' })
    .split('\0')
    .filter((path) => /\.(?:tsx?|jsx?|css|xml|svg)$/.test(path) && !/\.(?:test|type-test)\./.test(path))
    .filter((path) => !path.split('/').slice(0, -1).some((segment) => ['node_modules', '__tests__', 'test-mocks', 'test-support', 'e2e', '.next', '.expo', 'build', '.gradle'].includes(segment)))
    .map((path) => resolve(directory, path))
    .filter(existsSync)
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
  it.each(['mobile', 'web'])('excludes ignored %s reports produced by the coverage reporter while retaining authored files', (platform) => {
    const repository = mkdtempSync(resolve(tmpdir(), 'authored-typography-'))
    try {
      execFileSync(gitExecutable, ['init', '--quiet', repository])
      const directory = resolve(repository, 'apps', platform)
      mkdirSync(resolve(directory, 'components'), { recursive: true })
      const tracked = resolve(directory, 'components', 'label.tsx')
      const untracked = resolve(directory, 'components', 'new label.tsx')
      const deleted = resolve(directory, 'components', 'deleted.tsx')
      writeFileSync(tracked, 'export const style = { fontSize: 10 }')
      writeFileSync(deleted, 'export const style = { fontSize: 10 }')
      execFileSync(gitExecutable, ['add', '--', tracked, deleted], { cwd: repository })
      rmSync(deleted)
      writeFileSync(untracked, 'export const style = { fontSize: 11 }')
      mkdirSync(resolve(directory, '__tests__'))
      writeFileSync(resolve(directory, '__tests__', 'label.tsx'), 'export const style = { fontSize: 10 }')
      writeFileSync(resolve(repository, '.gitignore'), `${readFileSync(resolve(root, '.gitignore'), 'utf8')}\nlabel.tsx\n`)
      reports.create('lcov').execute(libReport.createContext({
        dir: resolve(directory, 'coverage'),
        coverageMap: libCoverage.createCoverageMap(),
      }))
      const stylesheet = resolve(directory, 'coverage', 'lcov-report', 'base.css')
      expect(violations(readFileSync(stylesheet, 'utf8'), stylesheet)).toContainEqual({ size: 10, element: '.fraction' })
      const files = authoredFiles(directory).sort((left, right) => left.localeCompare(right))
      expect(files).toEqual([tracked, untracked].sort((left, right) => left.localeCompare(right)))
      expect(files).not.toContain(stylesheet)
      expect(files.flatMap((file) => violations(readFileSync(file, 'utf8'), file))).toEqual([
        { size: 10, element: 'style.fontSize' },
        { size: 11, element: 'style.fontSize' },
      ])
    } finally {
      rmSync(repository, { recursive: true, force: true })
    }
  })

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
    const scripts = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\b[^>]*>/gi)].map((match) => match[1]).join('\n')
    expect(drawingSizes(scripts).filter((declaration) => declaration.element === drawingElement)).toEqual([{ size, element: drawingElement }])
  })
})
