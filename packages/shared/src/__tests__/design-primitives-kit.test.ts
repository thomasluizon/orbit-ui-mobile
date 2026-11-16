import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = join(__dirname, '../../../..')
const design = readFileSync(join(repositoryRoot, 'DESIGN.md'), 'utf8')

/** Each row of the Primitives kit table with its web and Android owner cells. */
function primitiveRows(): { name: string; web: string; mobile: string }[] {
  const section = design.slice(design.indexOf('## Primitives kit'), design.indexOf('\n## ', design.indexOf('## Primitives kit') + 1))
  return section.split('\n')
    .filter((line) => line.startsWith('| ') && !/^\|\s*-/.test(line) && !line.startsWith('| Primitive'))
    .map((line) => line.split('|').map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 5)
    .map((cells) => ({ name: cells[1]!, web: cells.at(-3)!, mobile: cells.at(-2)! }))
}

/** A cell that names a file is exactly one code span; prose such as "same" or a note names none. */
function ownerPath(cell: string): string | null {
  return /^`([^`]+\.tsx)`$/.exec(cell)?.[1] ?? null
}

function exists(app: 'web' | 'mobile', path: string): boolean {
  return [join(repositoryRoot, 'apps', app, 'components', path), join(repositoryRoot, 'apps', app, path)].some((candidate) => existsSync(candidate))
}

describe('the DESIGN.md Primitives kit', () => {
  const rows = primitiveRows()

  it('reads every row of the table', () => {
    expect(rows.length).toBeGreaterThan(40)
  })

  it.each(rows.map((row) => [row.name, row] as const))('names only owner files that exist for %s', (_name, row) => {
    const web = ownerPath(row.web)
    const mobile = row.mobile === 'same' ? web : ownerPath(row.mobile)
    if (web) expect(exists('web', web), `web ${web}`).toBe(true)
    if (mobile) expect(exists('mobile', mobile), `mobile ${mobile}`).toBe(true)
  })
})
