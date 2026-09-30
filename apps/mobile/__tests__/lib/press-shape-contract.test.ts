import { readFileSync, readdirSync } from 'node:fs'
import { extname, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_DIRECTORIES = ['app', 'components']
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])
const STYLE_ENTRY = /(\w+)\s*:\s*\{([^{}]*)\}/g
const PRESS_FILL = /backgroundColor[^,;}]*\b(?:bgHover|primaryPressed)\b/
const RADIUS = /borderRadius\s*:/
const CLIP = /overflow\s*:\s*['"]hidden['"]/

/**
 * Surfaces whose own radius is 0: a grid cell in the calendar time grid, and a flat
 * hairline-divided row inside a card that already clips. A rounded fill on either cuts
 * the ruling that separates it from its neighbour.
 */
const FLAT_SURFACES = new Set(['colHeader', 'timeSlot', 'allDayCell', 'interactiveItemPressed'])

type ScannedSource = { path: string; contents: string }

function sourceFiles(directory: string): ScannedSource[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(entryPath)
    if (!SOURCE_EXTENSIONS.has(extname(entry.name))) return []
    return [{ path: relative(process.cwd(), entryPath).replaceAll('\\', '/'), contents: readFileSync(entryPath, 'utf8') }]
  })
}

function unclippedPressStyles(files: ScannedSource[]): string[] {
  return files.flatMap((file) => [...file.contents.matchAll(STYLE_ENTRY)].flatMap(([, name, body]) => {
    if (!name || !body || FLAT_SURFACES.has(name)) return []
    if (!PRESS_FILL.test(body)) return []
    if (RADIUS.test(body) && CLIP.test(body)) return []
    const line = file.contents.slice(0, file.contents.indexOf(`${name}: {`)).split('\n').length
    return [`${file.path}:${line} ${name}`]
  }))
}

describe('mobile press shapes', () => {
  it('clips every named press fill to its own radius', () => {
    const files = SOURCE_DIRECTORIES.flatMap((directory) => sourceFiles(resolve(process.cwd(), directory)))
    expect(files.length).toBeGreaterThan(100)
    expect(unclippedPressStyles(files)).toEqual([])
  })
})
