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
          if (['saveToken', 'clearToken', 'syncWidgetData', 'syncTheme'].includes(method)) {
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
