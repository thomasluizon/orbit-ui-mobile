import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const mobileRoot = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(resolve(mobileRoot, path), 'utf8')
const widgetNative = read('modules/orbit-widget/android/src/main/java/org/useorbit/app/widget/OrbitWidgetModule.kt')

function nativeArgumentRange(method: string) {
  const declaration = new RegExp(`AsyncFunction\\("${method}"\\) \\{([^\\n]*?)(?:->|\\n)`).exec(widgetNative)
  expect(declaration, method).not.toBeNull()
  const parameters = [...(declaration?.[1] ?? '').matchAll(/\w+:\s*(String\??|Map<String, String>)/g)]
  const required = parameters.reduce((count, parameter, index) => parameter[1]?.endsWith('?') ? count : index + 1, 0)
  return { required, maximum: parameters.length }
}

describe('native union accepts both widget callers', () => {
  for (const [design, path] of [
    ['legacy', 'lib/orbit-widget.ts'],
    ['redesign', '__tests__/fixtures/native-designs/redesign-widget-caller.fixture'],
  ] as const) {
    it(`accepts every ${design} widget call with its real argument count`, () => {
      const caller = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true)
      const calls: string[] = []
      function visit(node: ts.Node) {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const method = node.expression.name.text
          const receiver = node.expression.expression.getText(caller)
          if (receiver === 'widgetModule' || receiver === 'getOrbitWidgetModule()') {
            const range = nativeArgumentRange(method)
            expect(node.arguments.length, method).toBeGreaterThanOrEqual(range.required)
            expect(node.arguments.length, method).toBeLessThanOrEqual(range.maximum)
            calls.push(method)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(caller)
      expect(calls.sort()).toEqual(['clearToken', 'saveToken', 'syncTheme', 'syncWidgetData'])
    })
  }

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
        nativeArgumentRange(name)
        const native = new RegExp(`AsyncFunction\\("${name}"\\) \\{([^\\n]*?)(?:->|\\n)`).exec(widgetNative)?.[1] ?? ''
        const nativeTypes = [...native.matchAll(/\w+:\s*(String\??|Map<String, String>)/g)]
        for (const [index, parameter] of method.parameters.entries()) {
          const expected = parameter.type?.kind === ts.SyntaxKind.StringKeyword ? 'String' : 'Map<String, String>'
          expect(nativeTypes[index]?.[1]?.replace('?', ''), `${name} argument ${index}`).toBe(expected)
        }
      }
    })
  }

  it('declares both theme contracts and resolves Android mode preferences', () => {
    const declaration = read('modules/orbit-widget/src/OrbitWidget.types.ts')
    expect(declaration).toContain('WidgetThemeColors | WidgetThemePreferences')
    const redesign = read('__tests__/fixtures/native-designs/redesign-widget-contract.fixture')
    expect(redesign).toContain('`${WidgetThemeMode}_${keyof WidgetThemeColors}`')
    const service = read('modules/orbit-widget/android/src/main/java/org/useorbit/app/widget/OrbitWidgetService.kt')
    expect(service).toContain('Configuration.UI_MODE_NIGHT_MASK')
    expect(service).toContain('"${mode}_$resolvedToken"')
  })
})
