import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A sheet is content-height, so a body that stretches puts a two-line sheet at the full detent.
 * The guard resolves each `<Sheet>` body's style in the caller or a relatively imported styles
 * module. It stops at a style handed in through props, which the primitive's unit tests cover.
 */
const MOBILE_ROOT = resolve(__dirname, '../../..')
const SCANNED_DIRECTORIES = ['app', 'components']
const STRETCH_PROPERTIES = /(?:^|[\s,{])(?:flex|flexGrow)\s*:|(?:^|[\s,{])(?:height|minHeight)\s*:\s*['"]\d+%/

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return collectSourceFiles(path)
    return path.endsWith('.tsx') ? [path] : []
  })
}

function readStyleBlock(source: string, name: string): string | null {
  const declaration = new RegExp(`(?:^|\\n)\\s*["']?${name}["']?\\s*:\\s*\\{`).exec(source)
  if (!declaration) return null
  const start = declaration.index + declaration[0].length - 1
  let depth = 0
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    else if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  return null
}

function resolveStyle(filePath: string, source: string, name: string): string | null {
  const own = readStyleBlock(source, name)
  if (own) return own
  for (const [, relativePath] of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    for (const suffix of ['.ts', '.tsx', '/index.ts']) {
      let imported: string
      try {
        imported = readFileSync(join(dirname(filePath), `${relativePath}${suffix}`), 'utf8')
      } catch {
        continue
      }
      const block = readStyleBlock(imported, name)
      if (block) return block
    }
  }
  return null
}

function endOfOpeningTag(source: string, from: number): number {
  let depth = 0
  for (let index = from; index < source.length; index += 1) {
    const character = source[index]
    if (character === '{') depth += 1
    else if (character === '}') depth -= 1
    else if (character === '>' && depth === 0) return index
  }
  return source.length
}

interface SheetBody {
  location: string
  style: string | null
}

function collectSheetBodies(): SheetBody[] {
  const files = SCANNED_DIRECTORIES.flatMap((directory) => collectSourceFiles(join(MOBILE_ROOT, directory)))
  return files.flatMap((filePath) => {
    const source = readFileSync(filePath, 'utf8')
    if (!source.includes('components/ui/sheet')) return []
    return [...source.matchAll(/<Sheet\b/g)].map((match) => {
      const bodyStart = endOfOpeningTag(source, match.index + match[0].length) + 1
      const firstChild = source.slice(bodyStart, bodyStart + 400).trimStart()
      const styleName = /^<\w+[^>]*?\sstyle=\{\[?styles\.(\w+)/.exec(firstChild)?.[1]
      const inlineStyle = /^<\w+[^>]*?\sstyle=\{\{([^}]*)\}/.exec(firstChild)?.[1]
      return {
        location: `${filePath.slice(MOBILE_ROOT.length + 1)}:${source.slice(0, match.index).split('\n').length}`,
        style: styleName ? resolveStyle(filePath, source, styleName) : inlineStyle ?? null,
      }
    })
  })
}

describe('Sheet callers (mobile)', () => {
  const bodies = collectSheetBodies()

  it('finds every sheet in the app', () => {
    expect(bodies.length).toBeGreaterThan(30)
  })

  it('counts the calendar year picker sheet', () => {
    expect(bodies.filter((body) => body.location.startsWith('app/(tabs)/calendar/_components/calendar-shell.tsx:'))).toHaveLength(1)
  })

  it('never stretches a sheet body', () => {
    const stretched = bodies
      .filter((body) => body.style !== null && STRETCH_PROPERTIES.test(body.style))
      .map((body) => body.location)
    expect(stretched).toEqual([])
  })
})
