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
