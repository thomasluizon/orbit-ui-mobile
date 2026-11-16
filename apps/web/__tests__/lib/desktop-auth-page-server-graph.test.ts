import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ROUTE = resolve(webRoot, 'app/api/auth/desktop/callback/route.ts')
const SOURCE_FILE = /(?<!\.d)\.tsx?$/

function webCompilerOptions(): ts.CompilerOptions {
  const parsed = ts.getParsedCommandLineOfConfigFile(resolve(webRoot, 'tsconfig.json'), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
    },
  })
  if (!parsed) throw new Error('Cannot read apps/web/tsconfig.json')
  return parsed.options
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
}

/** The repository source files that `file` imports at run time. A type-only import loads nothing. */
function runtimeImports(file: string, options: ts.CompilerOptions): string[] {
  return parse(file).statements.flatMap((statement) => {
    if (ts.isImportDeclaration(statement) && !statement.importClause?.isTypeOnly) return [statement.moduleSpecifier]
    if (ts.isExportDeclaration(statement) && !statement.isTypeOnly && statement.moduleSpecifier) return [statement.moduleSpecifier]
    return []
  }).flatMap((specifier) => {
    if (!ts.isStringLiteral(specifier)) return []
    const resolved = ts.resolveModuleName(specifier.text, file, options, ts.sys).resolvedModule
    if (!resolved || resolved.isExternalLibraryImport || !SOURCE_FILE.test(resolved.resolvedFileName)) return []
    return [resolved.resolvedFileName]
  })
}

/** The repository modules that `entry` loads at run time, `entry` included. */
function runtimeModules(entry: string, options: ts.CompilerOptions): string[] {
  const seen = new Set<string>()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    queue.push(...runtimeImports(file, options))
  }
  return [...seen]
}

function hasUseClientDirective(file: string): boolean {
  for (const statement of parse(file).statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) return false
    if (statement.expression.text === 'use client') return true
  }
  return false
}

/** The route renders its page with react-dom/server inside the server bundle. There, Next turns each export of a
 *  'use client' module into a client reference, and a call to one throws, so the desktop sign-in fails. */
describe('desktop sign-in callback route', () => {
  it('loads no client module, so the server can render its completion page', () => {
    const modules = runtimeModules(ROUTE, webCompilerOptions()).map((file) => relative(webRoot, file))
    expect(modules).toContain('lib/desktop-auth-page.tsx')
    expect(modules).toContain('components/auth/auth-page-panel.tsx')
    expect(modules.filter((file) => hasUseClientDirective(resolve(webRoot, file)))).toEqual([])
  })

  it('sees a client module where one is loaded', () => {
    const modules = runtimeModules(resolve(webRoot, 'components/ui/orbit-mascot.tsx'), webCompilerOptions())
    expect(modules.filter(hasUseClientDirective).map((file) => relative(webRoot, file))).toContain('components/ui/orbit-mascot.tsx')
  })
})
