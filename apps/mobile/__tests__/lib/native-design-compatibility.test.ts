import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import unionSources from '../fixtures/native-designs/union-source-inventory.json'
import unionPackages from '../fixtures/native-designs/union-package-inventory.json'
import unionPlugins from '../fixtures/native-designs/union-plugin-inventory.json'

const mobileRoot = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(resolve(mobileRoot, path), 'utf8')
const widgetNative = read('modules/orbit-widget/android/src/main/java/org/useorbit/app/widget/OrbitWidgetModule.kt')
const widgetTypes = read('modules/orbit-widget/src/OrbitWidget.types.ts')
const callers = [
  ['legacy', '__tests__/fixtures/native-designs/legacy-widget-caller.fixture'],
  ['redesign', '__tests__/fixtures/native-designs/redesign-widget-caller.fixture'],
  ['running redesign', 'lib/orbit-widget.ts'],
] as const
const lock = JSON.parse(read('../../package-lock.json')) as {
  packages: Record<string, { version?: string }>
}

function requireNativePackages(packages: typeof lock.packages) {
  for (const [path, version] of Object.entries(unionPackages)) {
    if (packages[path]?.version !== version) throw new Error(`Native version mismatch: ${path}`)
  }
}

function nativeParameters(method: string, source = widgetNative) {
  const declaration = new RegExp(`AsyncFunction\\("${method}"\\) \\{([^\\n]*?)(?:->|\\n)`).exec(source)
  if (!declaration) throw new Error(`Missing native method: ${method}`)
  return [...(declaration[1] ?? '').matchAll(/\w+:\s*(String\??|Map<String, String>)/g)].map(match => match[1]!)
}

function requireCallerArguments(path: string, source = widgetNative) {
  const caller = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true)
  const calls: string[] = []
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text
      const receiver = node.expression.expression.getText(caller)
      if (receiver === 'widgetModule' || receiver === 'getOrbitWidgetModule()') {
        const parameters = nativeParameters(method, source)
        const required = parameters.reduce((count, parameter, index) => parameter.endsWith('?') ? count : index + 1, 0)
        if (node.arguments.length < required || node.arguments.length > parameters.length) {
          throw new Error(`Unsupported ${method} argument count: ${node.arguments.length}`)
        }
        calls.push(method)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(caller)
  return calls.sort((left, right) => left.localeCompare(right))
}

function themeKeySets(source: string) {
  const path = resolve(mobileRoot, 'widget-contract.ts')
  const host = ts.createCompilerHost({})
  const originalRead = host.getSourceFile.bind(host)
  host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) => name === path
    ? ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true)
    : originalRead(name, languageVersion, onError, shouldCreateNewSourceFile)
  const program = ts.createProgram([path], { types: [], skipLibCheck: true }, host)
  const contract = program.getSourceFile(path)!
  const checker = program.getTypeChecker()
  const declaration = contract.statements.find(statement =>
    ts.isInterfaceDeclaration(statement) && statement.name.text === 'OrbitWidgetModuleType',
  )
  if (!declaration || !ts.isInterfaceDeclaration(declaration)) throw new Error('Missing widget interface')
  const method = declaration.members.find(member => ts.isMethodSignature(member) && member.name.getText(contract) === 'syncTheme')
  if (!method || !ts.isMethodSignature(method) || !method.parameters[0]) throw new Error('Missing syncTheme colors')
  const colors = checker.getTypeAtLocation(method.parameters[0])
  return (colors.isUnion() ? colors.types : [colors]).map(type => checker.getPropertiesOfType(type).map(property => property.name).sort((left, right) => left.localeCompare(right)))
}

function callerThemeKeys(path: string) {
  const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true)
  const declaration = source.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'toWidgetColors')
  if (!declaration || !ts.isFunctionDeclaration(declaration)) throw new Error('Missing widget color producer')
  const result = declaration.body?.statements.find(ts.isReturnStatement)?.expression
  if (!result || !ts.isObjectLiteralExpression(result)) throw new Error('Missing widget color object')
  return result.properties.map(property => property.name!.getText(source)).sort((left, right) => left.localeCompare(right))
}

const expectedThemeKeys = [
  callerThemeKeys(callers[0][1]),
  themeKeySets(read('__tests__/fixtures/native-designs/redesign-widget-contract.fixture'))[0]!,
]
function requireThemeKeys(source: string) {
  const accepted = themeKeySets(source)
  for (const keys of expectedThemeKeys) {
    if (!accepted.some(candidate => JSON.stringify(candidate) === JSON.stringify(keys))) {
      throw new Error('Missing widget theme key form')
    }
  }
}

describe('native union accepts both widget callers', () => {
  it('resolves every audited native package to the shared version', () => {
    requireNativePackages(lock.packages)
  })
  it('rejects a dropped native package', () => {
    const packages = { ...lock.packages }
    delete packages['node_modules/expo-linear-gradient']
    expect(() => requireNativePackages(packages)).toThrow('expo-linear-gradient')
  })
  it('rejects a changed native package version', () => {
    const packages = { ...lock.packages, 'node_modules/react-native': { version: 'incompatible' } }
    expect(() => requireNativePackages(packages)).toThrow('react-native')
  })
  it('matches only shared native bridges, registrations and config plugin sources', () => {
    for (const [path, hash] of Object.entries(unionSources)) {
      const contents = readFileSync(resolve(mobileRoot, '../..', path))
      expect(createHash('sha256').update(contents).digest('hex'), path).toBe(hash)
    }
  })
  it('registers the audited config plugins', () => {
    const require = createRequire(import.meta.url)
    const config = require('../../app.config.js')() as { plugins: (string | [string, unknown])[] }
    expect(config.plugins.map(plugin => Array.isArray(plugin) ? plugin[0] : plugin)).toEqual(unionPlugins)
  })
  for (const [design, path] of callers) {
    it(`accepts every ${design} widget call with its real argument count`, () => {
      expect(requireCallerArguments(path)).toEqual(['clearToken', 'saveToken', 'syncTheme', 'syncWidgetData'])
    })
  }
  it('rejects losing the legacy one-argument payload call', () => {
    const requiredToken = widgetNative.replace('json: String, token: String?', 'json: String, token: String')
    expect(() => requireCallerArguments(callers[0][1], requiredToken)).toThrow('syncWidgetData argument count: 1')
  })
  it('rejects losing the redesign two-argument payload call', () => {
    const noToken = widgetNative.replace('json: String, token: String?', 'json: String')
    expect(() => requireCallerArguments(callers[1][1], noToken)).toThrow('syncWidgetData argument count: 2')
  })
  it('rejects a removed widget method', () => {
    expect(() => requireCallerArguments(callers[0][1], widgetNative.replace('AsyncFunction("syncTheme")', 'AsyncFunction("removed")'))).toThrow('Missing native method: syncTheme')
  })
  for (const path of [
    'modules/orbit-widget/src/OrbitWidget.types.ts',
    '__tests__/fixtures/native-designs/redesign-widget-contract.fixture',
  ]) {
    it(`accepts the parameter types declared by ${path}`, () => {
      const contract = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true)
      const declaration = contract.statements.find(statement =>
        ts.isInterfaceDeclaration(statement) && statement.name.text === 'OrbitWidgetModuleType',
      )
      if (!declaration || !ts.isInterfaceDeclaration(declaration)) throw new Error('Missing widget interface')
      for (const method of declaration.members) {
        if (!ts.isMethodSignature(method)) continue
        const name = method.name.getText(contract)
        const parameters = nativeParameters(name)
        for (const [index, parameter] of method.parameters.entries()) {
          const expected = parameter.type?.kind === ts.SyntaxKind.StringKeyword ? 'String' : 'Map<String, String>'
          expect(parameters[index]?.replace('?', ''), `${name} argument ${index}`).toBe(expected)
        }
      }
    })
  }
  it('accepts the complete legacy and mode-qualified theme key sets', () => {
    requireThemeKeys(widgetTypes)
    expect(nativeParameters('syncTheme')).toEqual(['Map<String, String>'])
    expect(widgetNative).toContain('for ((token, value) in colors)')
    expect(widgetNative).toContain('editor.putString("$COLOR_KEY_PREFIX$token", value)')
  })
  it.each(['WidgetThemeColors | ', ' | WidgetThemePreferences'])('rejects losing the %s theme form', removed => {
    expect(() => requireThemeKeys(widgetTypes.replace(removed, ''))).toThrow('Missing widget theme key form')
  })
})
