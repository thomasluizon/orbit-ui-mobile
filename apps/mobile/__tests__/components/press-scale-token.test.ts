import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const MOBILE_ROOT = join(__dirname, '..', '..')
const SOURCE_ROOTS = ['app', 'components', 'lib', 'hooks']

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

describe('Android press scale', () => {
  it('reads every press scale from orbitalMotion.press, never a literal', () => {
    const literals = SOURCE_ROOTS.flatMap((root) => sourceFiles(join(MOBILE_ROOT, root))).flatMap((file) =>
      readFileSync(file, 'utf8').split('\n').flatMap((line, index) => /scale\b[^\n]{0,48}\b0\.96\b/.test(line) ? [`${relative(MOBILE_ROOT, file)}:${index + 1}`] : []))
    expect(literals).toEqual([])
  })
})
