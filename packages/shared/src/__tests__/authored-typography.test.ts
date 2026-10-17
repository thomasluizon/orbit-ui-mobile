import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve, relative, dirname } from 'node:path'
import libCoverage from 'istanbul-lib-coverage'
import libReport from 'istanbul-lib-report'
import reports from 'istanbul-reports'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../../..')
const gitExecutable = resolve(createRequire(import.meta.url)('which').sync('git'))
const scale = new Set([12, 14, 16, 17, 20, 22, 28, 34, 44, 60])
const widgetDrawing = 'design/canvas/Orbit Widget Android.dc.html'
const widgetDirectory = 'apps/mobile/modules/orbit-widget/android/src/main'
const widgetCanonicalLayout = `${widgetDirectory}/res/layout/widget_layout.xml`
const widgetLayouts = readdirSync(resolve(root, widgetDirectory, 'res/layout'))
  .filter((file) => /^widget_layout(?:_\w+)?\.xml$/.test(file))
  .map((file) => `${widgetDirectory}/res/layout/${file}`)
  .sort((left, right) => left.localeCompare(right))
const exceptions = [
  { path: 'apps/web/components/command/command-habit-items.tsx', size: 18, element: 'habitLeading.span[1].className', drawing: 'design/canvas/Orbit Busca.dc.html', drawingElement: "typeof icon === 'string' && icon.length <= 2 ? icon : H(D.Icon, { name: icon, size: 20 })" },
  { path: 'apps/mobile/components/share/share-card.tsx', size: 88, element: 'createStyles.primaryValue.fontSize', drawing: 'design/canvas/Orbit Wrapped.dc.html', drawingElement: 'String(data.completions)' },
  { path: 'apps/web/components/share/share-card.tsx', size: 88, element: 'share-card-figure[1].style.fontSize', drawing: 'design/canvas/Orbit Wrapped.dc.html', drawingElement: 'String(data.completions)' },
  { path: 'apps/mobile/modules/orbit-widget/android/src/main/res/layout/widget_item.xml', size: 15, element: '@+id/item_title', drawing: widgetDrawing, drawingElement: 'r.name' },
  { path: 'apps/mobile/modules/orbit-widget/android/src/main/res/layout/widget_layout.xml', size: 13, element: '@+id/widget_header', drawing: widgetDrawing, drawingElement: 'o.title || t.today' },
  { path: 'apps/mobile/modules/orbit-widget/android/src/main/res/layout/widget_layout.xml', size: 15, element: '@+id/widget_streak', drawing: widgetDrawing, drawingElement: 'o.streak' },
  { path: 'apps/mobile/modules/orbit-widget/android/src/main/res/layout/widget_layout.xml', size: 15, element: '@+id/widget_empty_text', drawing: widgetDrawing, drawingElement: 't.allClear' },
  { path: 'apps/mobile/scripts/generate-widget-preview.ts', size: 13, element: 'widget_preview_header', drawing: widgetDrawing, drawingElement: 'o.title || t.today' },
  { path: 'apps/mobile/scripts/generate-widget-preview.ts', size: 15, element: 'widget_preview_habit', drawing: widgetDrawing, drawingElement: 'r.name' },
  { path: 'apps/mobile/scripts/generate-widget-preview.ts', size: 15, element: 'widget_preview_streak', drawing: widgetDrawing, drawingElement: 'o.streak' },
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

function androidFontSize(path: string, name: string): number {
  const directory = resolve(dirname(resolve(root, path)), '../values')
  const dimensions = readdirSync(directory).filter((file) => file.endsWith('.xml')).flatMap((file) => {
    const source = readFileSync(resolve(directory, file), 'utf8')
    return [...source.matchAll(/<dimen name="([^"]+)">([\d.]+)sp<\/dimen>/g)]
  })
  const value = dimensions.find((dimension) => dimension[1] === name)?.[2]
  if (value === undefined) throw new Error(`Unresolved font dimension ${name} in ${path}`)
  return Number(value)
}

function markupSizes(source: string, path: string): AuthoredSize[] {
  const counts = new Map<string, number>()
  return [...source.matchAll(/<([\w:-]+)\b([^>]*?)>/g)].flatMap((tag) => {
    const ordinal = (counts.get(tag[1]!) ?? 0) + 1
    counts.set(tag[1]!, ordinal)
    const element = tag[2]!.match(/(?:android:id|id)=["']([^"']+)["']/)?.[1] ?? `${tag[1]!}[${ordinal}]`
    return [...tag[2]!.matchAll(/(?:font-size|android:textSize)=["']([^"']+)["']/g)].flatMap((match) => {
      const literal = match[1]!.match(/^([\d.]+)(?:sp|px)?$/)?.[1]
      if (literal !== undefined) return [{ size: Number(literal), element }]
      const dimension = match[1]!.match(/^@dimen\/(\w+)$/)?.[1]
      return dimension ? [{ size: androidFontSize(path, dimension), element }] : []
    })
  })
}

function authoredSizes(source: string, path: string): AuthoredSize[] {
  if (/\.(?:xml|svg)$/.test(path)) return markupSizes(source, path)
  if (/\.css$/.test(path)) {
    return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((rule) => [...rule[2]!.matchAll(/font-size:\s*([\d.]+)(px|rem)/g)].map((match) => ({ size: Number(match[1]) * (match[2] === 'rem' ? 16 : 1), element: rule[1]!.trim() })))
  }
  const values = markupSizes(source, path)
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

function widgetExceptionPath(path: string, element: string): string {
  const hasDrawnRole = exceptions.some((entry) => entry.path === widgetCanonicalLayout && entry.element === element)
  return widgetLayouts.includes(path) && hasDrawnRole ? widgetCanonicalLayout : path
}

function violations(source: string, path: string): AuthoredSize[] {
  return authoredSizes(source, path).filter(({ size, element }) => !scale.has(size) && !exceptions.some((entry) => entry.path === widgetExceptionPath(path, element) && entry.size === size && entry.element === element))
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

  it('reads named Android font dimensions from the shipped widget resources', () => {
    const path = 'apps/mobile/modules/orbit-widget/android/src/main/res/layout/widget_item.xml'
    const source = readFileSync(resolve(root, path), 'utf8')
    expect(authoredSizes(source, path)).toContainEqual({ size: 15, element: '@+id/item_title' })
    expect(authoredSizes(source, path)).toContainEqual({ size: 12, element: '@+id/item_children_badge' })
  })

  it('rejects a widget children badge at the habit title exception size', () => {
    const path = 'apps/mobile/modules/orbit-widget/android/src/main/res/layout/widget_item.xml'
    const source = readFileSync(resolve(root, path), 'utf8')
    const mutated = source.replace(/(android:id="@\+id\/item_children_badge"[\s\S]*?android:textSize=")@dimen\/widget_label_text_size"/, (_match, prefix: string) => `${prefix}15sp"`)
    expect(mutated).not.toBe(source)
    expect(violations(mutated, path)).toEqual([{ size: 15, element: '@+id/item_children_badge' }])
    expect(authoredSizes(mutated, path)).toContainEqual({ size: 15, element: '@+id/item_title' })
  })

  it('covers exactly the widget layouts selected by the provider', () => {
    const provider = readFileSync(resolve(root, widgetDirectory, 'java/org/useorbit/app/widget/OrbitWidgetProvider.kt'), 'utf8')
    const selectedLayouts = [...new Set([...provider.matchAll(/\bR\.layout\.(widget_layout(?:_\w+)?)\b/g)]
      .map((match) => `${widgetDirectory}/res/layout/${match[1]}.xml`))].sort((left, right) => left.localeCompare(right))
    expect(selectedLayouts).toContain(widgetCanonicalLayout)
    expect(widgetLayouts).toEqual(selectedLayouts)
  })

  it('retains element boundaries for resource fonts in each widget layout variant', () => {
    for (const path of widgetLayouts) {
      const source = readFileSync(resolve(root, path), 'utf8')
      expect(violations(source, path)).toEqual([])
      const mutated = source.replace(/(android:id="@\+id\/widget_subtitle"[\s\S]*?android:textSize=")@dimen\/widget_label_text_size"/,
        (_match, prefix: string) => `${prefix}@dimen/widget_title_text_size"`)
      expect(mutated).not.toBe(source)
      expect(violations(mutated, path)).toEqual([{ size: 15, element: '@+id/widget_subtitle' }])
    }
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
