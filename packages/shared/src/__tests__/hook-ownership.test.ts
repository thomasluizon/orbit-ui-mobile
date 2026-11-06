import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect,it } from 'vitest'
import ts from 'typescript'
import { repositoryRoot } from '../test-support/repository-root'

it('resolves both platform parent prompt transitions to the same shared implementation', () => {
  const paths = ['web', 'mobile'].map(platform => join(repositoryRoot, `apps/${platform}/components/habits/use-parent-prompt-queue.ts`))
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
    join(repositoryRoot, 'apps/web/app/(app)/calendar/_components/use-calendar-screen-state.tsx'),
    join(repositoryRoot, 'apps/mobile/app/(tabs)/calendar/_components/use-calendar-screen-state.tsx'),
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

it('keeps bulk deletion independent of update and checklist implementations', () => {
  const path = fileURLToPath(new URL('../hooks/index.ts', import.meta.url))
  const program = ts.createProgram([path], { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ESNext })
  const checker = program.getTypeChecker()
  const source = program.getSourceFile(path)!
  const exports = checker.getExportsOfModule(checker.getSymbolAtLocation(source)!)
  let symbol = exports.find(symbol => symbol.name === 'selectedDescendantsInSnapshots')!
  if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)
  const owner = symbol.declarations![0]!.getSourceFile()
  const ownerExports = checker.getExportsOfModule(checker.getSymbolAtLocation(owner)!).map(symbol => symbol.name)
  expect(ownerExports).not.toContain('applyHabitStructurePatch')
  expect(ownerExports).not.toContain('applyHabitChecklistDetails')
})
