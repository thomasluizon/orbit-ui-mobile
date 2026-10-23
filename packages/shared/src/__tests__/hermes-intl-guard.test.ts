import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const nativeConstructors = new Set(['Collator', 'DateTimeFormat', 'NumberFormat'])
const adapter = 'packages/shared/src/utils/conjunction-list.ts'

function unsupportedIntlReferences(source: string, filename = 'example.ts'): string[] {
  const syntax = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const violations: string[] = []
  const isIntl = (expression: ts.Node) => ['Intl', 'globalThis.Intl'].includes(expression.getText(syntax))
  const check = (name: string) => {
    if (/^[A-Z]/.test(name) && !nativeConstructors.has(name)) violations.push(name)
  }
  const checkBinding = (name: ts.BindingName) => {
    if (!ts.isObjectBindingPattern(name)) {
      violations.push('Intl namespace alias')
      return
    }
    for (const element of name.elements) check((element.propertyName ?? element.name).getText(syntax).replace(/['"]/g, ''))
  }
  function visit(node: ts.Node) {
    if (ts.isPropertyAccessExpression(node) && isIntl(node.expression)) {
      const guardedAdapterRead = filename === adapter && node.name.text === 'ListFormat'
        && ts.isVariableDeclaration(node.parent) && node.parent.name.getText(syntax) === 'ListFormat'
      if (!guardedAdapterRead) check(node.name.text)
    }
    if (ts.isElementAccessExpression(node) && isIntl(node.expression)) {
      if (ts.isStringLiteral(node.argumentExpression)) check(node.argumentExpression.text)
      else violations.push('computed Intl access')
    }
    if (ts.isVariableDeclaration(node) && node.initializer && isIntl(node.initializer)) {
      checkBinding(node.name)
    }
    ts.forEachChild(node, visit)
  }
  visit(syntax)
  return violations
}

function productionSources(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', '__tests__', 'test-support', 'test-mocks', 'android', 'ios', '.expo'].includes(entry.name)) return []
    const filename = `${root}/${entry.name}`
    if (entry.isDirectory()) return productionSources(filename)
    return /\.[jt]sx?$/.test(entry.name) && !/\.(test|type-test|d)\.ts$/.test(entry.name) ? [filename] : []
  })
}

describe('Android Hermes Intl constructor contract', () => {
  it.each(['DisplayNames', 'RelativeTimeFormat', 'Segmenter', 'PluralRules', 'ListFormat', 'Locale', 'DurationFormat'])('rejects unsupported %s access and aliases', (name) => {
    for (const source of [
      `new Intl.${name}('en')`, `Intl.${name}('en')`, `new Intl['${name}']('en')`,
      `const Formatter = Intl.${name}; new Formatter('en')`,
      `const { ${name}: Formatter } = Intl; new Formatter('en')`,
      `new globalThis.Intl.${name}('en')`,
    ]) expect(unsupportedIntlReferences(source)).toEqual([name])
  })

  it('permits native constructors and type annotations', () => {
    expect(unsupportedIntlReferences(`
      new Intl.Collator('en'); Intl.DateTimeFormat('en'); new Intl.NumberFormat('pt-BR');
      const options: Intl.DateTimeFormatOptions = { month: 'long' };
    `)).toEqual([])
  })

  it('permits only the shared adapter constructor read', () => {
    expect(unsupportedIntlReferences('const ListFormat = Intl.ListFormat', adapter)).toEqual([])
    expect(unsupportedIntlReferences('new Intl.ListFormat()', adapter)).toEqual(['ListFormat'])
    expect(unsupportedIntlReferences('new Intl[constructorName]()')).toEqual(['computed Intl access'])
    expect(unsupportedIntlReferences('const runtime = Intl')).toEqual(['Intl namespace alias'])
  })

  it('keeps shared and mobile production code within the native constructor surface', () => {
    const repository = resolve(__dirname, '../../../..')
    const sources = ['packages/shared/src', 'apps/mobile/app', 'apps/mobile/components', 'apps/mobile/hooks',
      'apps/mobile/lib', 'apps/mobile/store', 'apps/mobile/stores', 'apps/mobile/modules'].flatMap((directory) =>
      productionSources(resolve(repository, directory)))
    sources.push(resolve(repository, 'apps/mobile/index.js'))
    const violations = sources.flatMap((filename) => {
      const relative = filename.slice(repository.length + 1)
      return unsupportedIntlReferences(readFileSync(filename, 'utf8'), relative).map((name) => `${relative}: ${name}`)
    })
    expect(violations).toEqual([])
  })
})
