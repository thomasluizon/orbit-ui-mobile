import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

export interface SegmentCallSite {
  path: string
  optionKeys: string[]
}

export const SEGMENT_GEOMETRY_OWNERS = [
  'components/onboarding/onboarding-create-habit.tsx',
  'components/upgrade/plan-selection.tsx',
  'components/habits/create-goal-from-habit/goal-type-selector.tsx',
  'components/share/share-card-sheet.tsx',
] as const

export const SEGMENT_ROW_ALLOWLIST = [
  { path: 'components/onboarding/feature-guide-drawer.tsx', reason: 'Feature guide chips scroll horizontally and do not use SegmentedControl.' },
  { path: 'components/ui/radio-row.tsx', reason: 'Pill radio rows have their own layout contract and do not use SegmentedControl.' },
] as const

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : /\.[jt]sx?$/.test(path) ? [path] : []
  })
}

type SourceValue = string | number | SourceValue[] | { [key: string]: SourceValue }

function optionKeys(source: ts.SourceFile, options: ts.Expression): string[] {
  const declarations = new Map<string, ts.Expression>()
  let namespace = ''
  function collect(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      declarations.set(node.name.text, node.initializer)
      if (node.name.text === 't' && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(source) === 'useTranslations') {
        namespace = node.initializer.arguments[0] && ts.isStringLiteral(node.initializer.arguments[0]) ? node.initializer.arguments[0].text : ''
      }
    }
    ts.forEachChild(node, collect)
  }
  collect(source)
  function resolveCall(expression: ts.CallExpression): SourceValue {
    if (expression.expression.getText(source) === 't') {
      const key = resolve(expression.arguments[0]!)
      if (typeof key !== 'string') throw new Error('Segment translation key must resolve to a string.')
      return namespace ? `${namespace}.${key}` : key
    }
    const factory = expression.arguments[0]
    if (expression.expression.getText(source) === 'useMemo' && factory && ts.isArrowFunction(factory) && ts.isExpression(factory.body)) return resolve(factory.body)
    throw new Error(`Unresolved segment call in ${source.fileName}: ${expression.getText(source)}`)
  }
  function resolveElement(expression: ts.ElementAccessExpression): SourceValue {
    const key = resolve(expression.argumentExpression)
    if (typeof key !== 'string' && typeof key !== 'number') throw new Error('Segment lookup key must be a string or number.')
    return (resolve(expression.expression) as Record<string, SourceValue>)[key]!
  }
  function resolve(expression: ts.Expression): SourceValue {
    if (ts.isStringLiteral(expression)) return expression.text
    if (ts.isNumericLiteral(expression)) return Number(expression.text)
    if (ts.isAsExpression(expression) || ts.isParenthesizedExpression(expression) || ts.isSatisfiesExpression(expression)) return resolve(expression.expression)
    if (ts.isIdentifier(expression) && declarations.has(expression.text)) return resolve(declarations.get(expression.text)!)
    if (ts.isArrayLiteralExpression(expression)) return expression.elements.map(resolve)
    if (ts.isObjectLiteralExpression(expression)) return Object.fromEntries(expression.properties.map((property) => {
      if (!ts.isPropertyAssignment(property)) throw new Error(`Unresolved segment option: ${property.getText(source)}`)
      return [property.name.getText(source).replaceAll(/['"]/g, ''), resolve(property.initializer)]
    }))
    if (ts.isPropertyAccessExpression(expression)) return (resolve(expression.expression) as Record<string, SourceValue>)[expression.name.text]!
    if (ts.isElementAccessExpression(expression)) return resolveElement(expression)
    if (ts.isCallExpression(expression)) return resolveCall(expression)
    throw new Error(`Unresolved segment expression in ${source.fileName}: ${expression.getText(source)}`)
  }
  const choices = resolve(options)
  if (!Array.isArray(choices)) throw new Error(`Segment options must resolve to an array in ${source.fileName}`)
  return choices.map((choice) => {
    if (typeof choice !== 'object' || Array.isArray(choice) || typeof choice.label !== 'string') throw new Error(`Segment label must resolve to a translation key in ${source.fileName}`)
    return choice.label
  })
}

export function collectSegmentCallSites(repositoryRoot: string, platform: 'web' | 'mobile'): SegmentCallSite[] {
  const app = join(repositoryRoot, 'apps', platform)
  return ['app', 'components', 'hooks', 'lib'].flatMap((directory) => sourceFiles(join(app, directory))).flatMap((path) => {
    const contents = readFileSync(path, 'utf8')
    if (!contents.includes('segmented-control') && !contents.includes('SegmentedControl')) return []
    const source = ts.createSourceFile(path, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const names = new Set<string>(['SegmentedControl'])
    source.statements.forEach((statement) => {
      if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text.endsWith('/segmented-control')) {
        const bindings = statement.importClause?.namedBindings
        if (bindings && ts.isNamedImports(bindings)) bindings.elements.forEach((binding) => {
          if ((binding.propertyName ?? binding.name).text === 'SegmentedControl') names.add(binding.name.text)
        })
      }
    })
    const sites: SegmentCallSite[] = []
    function visit(node: ts.Node) {
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && names.has(node.tagName.getText(source))) {
        const options = node.attributes.properties.find((property) => ts.isJsxAttribute(property) && property.name.getText(source) === 'options')
        if (!options || !ts.isJsxAttribute(options) || !options.initializer || !ts.isJsxExpression(options.initializer) || !options.initializer.expression) throw new Error(`Unresolved segment options in ${path}`)
        sites.push({ path: relative(app, path), optionKeys: optionKeys(source, options.initializer.expression) })
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    return sites
  })
}

export function segmentTranslation(messages: unknown, key: string): string {
  const label = key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? Reflect.get(value, part) : undefined, messages)
  if (typeof label !== 'string') throw new Error(`Missing segment translation: ${key}`)
  return label
}
