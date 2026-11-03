import { fileURLToPath } from 'node:url'
import { expect,it } from 'vitest'
import ts from 'typescript'

it('resolves both platform parent prompt transitions to the same shared implementation', () => {
  const paths = ['web', 'mobile'].map(platform => fileURLToPath(new URL(`../../../../apps/${platform}/components/habits/use-parent-prompt-queue.ts`, import.meta.url)))
  const program = ts.createProgram(paths, { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ESNext })
  const checker = program.getTypeChecker()
  for (const name of ['createParentPromptQueue', 'transitionParentPromptQueue']) {
    const owners = paths.map(path => {
      const source = program.getSourceFile(path)!
      const module = checker.getSymbolAtLocation(source)!
      let symbol = checker.getExportsOfModule(module).find(symbol => symbol.name === name)!
      if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)
      return symbol.declarations?.[0]?.getSourceFile().fileName
    })
    expect(owners[0]).toBeDefined()
    expect(owners[0]).toBe(owners[1])
    expect(owners[0]).toContain('/packages/shared/src/')
  }
})

it('resolves both calendar range hooks to the same query-state owner', () => {
  const paths = [
    fileURLToPath(new URL('../../../../apps/web/app/(app)/calendar/_components/use-calendar-screen-state.tsx', import.meta.url)),
    fileURLToPath(new URL('../../../../apps/mobile/app/(tabs)/calendar/_components/use-calendar-screen-state.tsx', import.meta.url)),
  ]
  const program = ts.createProgram(paths, { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ESNext, jsx: ts.JsxEmit.ReactJSX })
  const checker = program.getTypeChecker()
  const owners = paths.map(path => {
    const source = program.getSourceFile(path)!
    const direct = source.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'useCalendarRangeState')
    if (direct) return direct.getSourceFile().fileName
    const declaration = source.statements.filter(ts.isVariableStatement)
      .flatMap(statement => statement.declarationList.declarations)
      .find(declaration => declaration.name.getText(source) === 'useCalendarRangeState')!
    expect(ts.isCallExpression(declaration.initializer!)).toBe(true)
    const initializer = declaration.initializer as ts.CallExpression
    let symbol = checker.getSymbolAtLocation(initializer.expression)!
    if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)
    return symbol.declarations?.[0]?.getSourceFile().fileName
  })
  expect(owners[0]).toBeDefined()
  expect(owners[0]).toBe(owners[1])
  expect(owners[0]).toContain('/packages/shared/src/')
})
