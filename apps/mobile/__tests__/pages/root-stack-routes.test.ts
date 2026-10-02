import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { getRoutes } from 'expo-router/build/getRoutes'
import type { RequireContext } from 'expo-router/build/types'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const appDirectory = resolve(__dirname, '../../app')
const layoutPath = resolve(appDirectory, '_layout.tsx')
const program = ts.createProgram([layoutPath], {
  noResolve: true,
  jsx: ts.JsxEmit.Preserve,
})
const checker = program.getTypeChecker()
const layout = program.getSourceFile(layoutPath)
if (!layout) throw new Error('Root layout source was not loaded')

const context = Object.assign(() => ({}), {
  keys: () => readdirSync(appDirectory, { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.[jt]sx?$/.test(path))
    .map((path) => `./${path.replaceAll('\\', '/')}`),
  resolve: (key: string) => key,
  id: 'root-stack-routes',
}) as RequireContext
const routes = getRoutes(context, {
  platform: 'android',
  ignoreEntryPoints: true,
  skipGenerated: true,
  internal_stripLoadRoute: true,
})
if (!routes) throw new Error('Root route tree was not generated')
const rootRouteNames = routes.children.map((route) => route.route)

function declaredScreenNames(node: ts.Node): string[] {
  if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node))
    && node.tagName.getText(layout) === 'Stack.Screen') {
    const name = node.attributes.properties.find((attribute) =>
      ts.isJsxAttribute(attribute) && attribute.name.getText(layout) === 'name')
    if (!name || !ts.isJsxAttribute(name) || !name.initializer) {
      throw new Error('Every root Stack.Screen must declare a name')
    }
    if (ts.isStringLiteral(name.initializer)) return [name.initializer.text]
    if (!ts.isJsxExpression(name.initializer) || !name.initializer.expression) {
      throw new Error('Root screen name must be a string or a finite string union')
    }
    const screenType = checker.getTypeAtLocation(name.initializer.expression)
    const variants = screenType.isUnion() ? screenType.types : [screenType]
    return variants.map((variant) => {
      if (!variant.isStringLiteral()) {
        throw new Error(`Unresolved root screen name: ${name.getText(layout)}`)
      }
      return variant.value
    })
  }
  const names: string[] = []
  ts.forEachChild(node, (child) => { names.push(...declaredScreenNames(child)) })
  return names
}

describe('root stack route declarations', () => {
  it('resolves every declared screen, including protected and mapped screens', () => {
    const names = declaredScreenNames(layout)
    expect(names.length).toBeGreaterThan(0)
    expect(names).toEqual(expect.arrayContaining(['support', 'upgrade', 'wrapped', 'step-up']))
    expect(names.filter((name) => !rootRouteNames.includes(name))).toEqual([])
  })

  it('hoists flat directories and keeps layout children in their own stacks', () => {
    expect(rootRouteNames).toEqual(expect.arrayContaining(['r/[code]', 'habits/new', '(tabs)', '(onboarding)']))
    expect(rootRouteNames).not.toContain('r')
    expect(rootRouteNames).not.toContain('(tabs)/index')
  })
})
