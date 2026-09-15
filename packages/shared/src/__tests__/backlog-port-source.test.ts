import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

function productionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (
      entry.name === '__tests__' ||
      entry.name === 'node_modules' ||
      entry.name === 'test-mocks' ||
      entry.name.endsWith('.config.ts')
    ) {
      return []
    }
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) return productionSources(path)
    return /\.(?:css|ts|tsx)$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name)
      ? [path]
      : []
  })
}

describe('main backlog ports', () => {
  it('uses the readable text role for the mobile remove-deadline affordance', () => {
    const source = readFileSync(
      `${ROOT}apps/mobile/components/goals/edit-goal-modal/edit-goal-deadline-field.tsx`,
      'utf8',
    )
    expect(source).toContain('<X size={16} color={tokens.fg3} strokeWidth={1.8} />')
  })

  it.each([
    'apps/web/components/habits/habit-list.tsx',
    'apps/web/components/habits/habit-checklist.tsx',
    'apps/web/components/calendar/calendar-agenda-view.tsx',
  ])('gives every server-rendered DndContext a stable React id in %s', (path) => {
    const source = readFileSync(`${ROOT}${path}`, 'utf8')
    expect(source).toMatch(/const dndContextId = useId\(\)/)
    expect(source).toMatch(/<DndContext\s+id=\{dndContextId\}/)
  })

  it('contains no decorative gradient implementation', () => {
    const sources = [
      ...productionSources(`${ROOT}apps/web`),
      ...productionSources(`${ROOT}apps/mobile`),
      ...productionSources(`${ROOT}packages/shared/src`),
    ]
    const offenders = sources.filter((path) => {
      const normalizedPath = path.replaceAll('\\', '/')
      if (normalizedPath.endsWith('/apps/mobile/app/(tabs)/calendar/_components/calendar-loading-bar.tsx')) {
        return false
      }
      return /GradientTop|gradient-header|gradientHeader(?:From|To)|(?:linear|radial|conic)-gradient|(?:Linear|Radial)Gradient/.test(
        readFileSync(path, 'utf8'),
      )
    })
    expect(offenders).toEqual([])
  })
})
