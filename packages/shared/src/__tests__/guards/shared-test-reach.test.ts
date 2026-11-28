import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { expect, it } from 'vitest'

const sourceRoot = path.resolve(new URL('../../', import.meta.url).pathname)
const sources = new Set(readdirSync(sourceRoot, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
  .map((file) => path.join(sourceRoot, file)))

function emittedCode(file: string): string {
  return ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
  }).outputText
}

function resolveImport(from: string, specifier: string): string | undefined {
  let base: string
  if (specifier.startsWith('.')) base = path.resolve(path.dirname(from), specifier)
  else if (/^@orbit\/shared(\/|$)/.test(specifier)) base = path.join(sourceRoot, specifier.slice('@orbit/shared'.length))
  else return undefined
  return [base, `${base}.ts`, path.join(base, 'index.ts')].find((candidate) => sources.has(candidate))
}

function filesThatTestsLoad(): Set<string> {
  const loaded = new Set([...sources].filter((file) => file.endsWith('.test.ts')))
  for (const file of loaded) {
    for (const { fileName } of ts.preProcessFile(emittedCode(file), true, true).importedFiles) {
      const target = resolveImport(file, fileName)
      if (target) loaded.add(target)
    }
  }
  return loaded
}

function hasRuntimeCode(file: string): boolean {
  return ts.createSourceFile('emitted.js', emittedCode(file), ts.ScriptTarget.ESNext).statements
    .some((statement) => !ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement))
}

it('loads each runtime source module from a shared test, so the coverage report counts its lines', () => {
  const loaded = filesThatTestsLoad()
  const unreached = [...sources]
    .filter((file) => !loaded.has(file) && !/(?:__tests__|test-support|__generated__)\//.test(file))
    .filter((file) => !file.endsWith('.type-test.ts') && hasRuntimeCode(file))
    .map((file) => path.relative(sourceRoot, file))
    .sort((first, second) => first.localeCompare(second))

  expect(unreached).toEqual([])
}, 60_000)
