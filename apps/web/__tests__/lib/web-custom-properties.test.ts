import { readFileSync, readdirSync } from 'node:fs'
import { extname, relative, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyThemeTokensToDOM, resolveWebThemeVariables } from '@/lib/theme-dom'

const WEB_SOURCE_DIRECTORIES = ['app', 'components', 'hooks', 'lib', 'stores']
const SOURCE_EXTENSIONS = new Set(['.css', '.ts', '.tsx'])
const CUSTOM_PROPERTY_REFERENCE = /var\(\s*(--[a-z0-9-]+)/g
const CSS_DECLARATION = /(--[a-z0-9-]+)\s*:/g
const LOCAL_RUNTIME_DECLARATION = /['"](--[a-z0-9-]+)['"]\s*:/g
const NEXT_FONT_DECLARATION = /\bvariable\s*:\s*['"](--[a-z0-9-]+)['"]/g

type SourceFile = {
  path: string
  contents: string
}

function matchingValues(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].flatMap((match) => match[1] ? [match[1]] : [])
}

function sourceFiles(directory: string): SourceFile[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(entryPath)
    if (!SOURCE_EXTENSIONS.has(extname(entry.name))) return []
    return [{
      path: relative(process.cwd(), entryPath).replaceAll('\\', '/'),
      contents: readFileSync(entryPath, 'utf8'),
    }]
  })
}

function productionSources(): SourceFile[] {
  return WEB_SOURCE_DIRECTORIES.flatMap((directory) =>
    sourceFiles(resolve(process.cwd(), directory)),
  )
}

function globalsStylesheet(files: SourceFile[]): string {
  const globals = files.find(({ path }) => path === 'app/globals.css')
  if (!globals) throw new Error('app/globals.css was not scanned')
  return globals.contents
}

function declaredCustomProperties(files: SourceFile[]): Set<string> {
  const declarations = new Set(matchingValues(globalsStylesheet(files), CSS_DECLARATION))
  for (const mode of ['dark', 'light'] as const) {
    for (const property of Object.keys(resolveWebThemeVariables('purple', mode))) {
      declarations.add(property)
    }
  }
  for (const { contents } of files) {
    for (const property of matchingValues(contents, LOCAL_RUNTIME_DECLARATION)) {
      declarations.add(property)
    }
    for (const property of matchingValues(contents, NEXT_FONT_DECLARATION)) {
      declarations.add(property)
    }
  }
  return declarations
}

function unresolvedReferences(files: SourceFile[]): string[] {
  const declarations = declaredCustomProperties(files)
  const references = new Map<string, string[]>()
  for (const { path, contents } of files) {
    for (const property of matchingValues(contents, CUSTOM_PROPERTY_REFERENCE)) {
      const paths = references.get(property) ?? []
      if (!paths.includes(path)) paths.push(path)
      references.set(property, paths)
    }
  }

  return [...references]
    .filter(([property]) => !declarations.has(property))
    .map(([property, paths]) => `${property}: ${paths.join(', ')}`)
    .sort()
}

describe('web custom properties', () => {
  afterEach(() => {
    document.documentElement.className = ''
    document.documentElement.removeAttribute('style')
    document.head.innerHTML = ''
  })

  for (const mode of ['dark', 'light'] as const) {
    it(`resolves shape and shadow tokens in ${mode} mode`, () => {
      const files = productionSources()
      const rootBlock = globalsStylesheet(files).match(/:root\s*{([^}]+)}/)?.[1]
      if (!rootBlock) throw new Error('The :root token block was not found')
      document.head.innerHTML = `<style>:root {${rootBlock}}</style>`
      applyThemeTokensToDOM('purple', mode)

      const computed = getComputedStyle(document.documentElement)
      expect(computed.getPropertyValue('--r-card').trim()).toBe('20px')
      expect(computed.getPropertyValue('--r-well').trim()).toBe('12px')
      expect(computed.getPropertyValue('--sh-2').trim()).toBe(
        '0 4px 16px rgba(0,0,0,0.28)',
      )
      expect(computed.getPropertyValue('--sh-3').trim()).toBe(
        '0 12px 40px rgba(0,0,0,0.45)',
      )
    })
  }

  it('declares every custom property referenced by production source', () => {
    expect(unresolvedReferences(productionSources())).toEqual([])
  })
})
