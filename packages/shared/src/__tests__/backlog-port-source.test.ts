import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  alphaSurfaces,
  resolveDarkNeutrals,
  statusConstants,
} from '../theme/neutral-ramp'

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

function toRgb(color: string): [number, number, number] {
  if (color.startsWith('#')) {
    return [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16)) as [number, number, number]
  }
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number)
  if (!channels || channels.length !== 3) throw new Error(`Unsupported color: ${color}`)
  return channels as [number, number, number]
}

function composite(foreground: string, background: string): [number, number, number] {
  const foregroundRgb = toRgb(foreground)
  const backgroundRgb = toRgb(background)
  const alpha = Number(foreground.match(/[\d.]+/g)?.[3] ?? 1)
  return foregroundRgb.map((channel, index) =>
    Math.round(channel * alpha + backgroundRgb[index]! * (1 - alpha)),
  ) as [number, number, number]
}

function contrast(foreground: string, background: [number, number, number]): number {
  const luminance = (channels: [number, number, number]) => channels
    .map((channel) => channel / 255)
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index]!, 0)
  const first = luminance(toRgb(foreground))
  const second = luminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

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
  it('keeps web bad-status text aligned with shared AA roles', () => {
    const css = readFileSync(`${ROOT}apps/web/app/globals.css`, 'utf8')
    const webRoles = [...css.matchAll(/--status-bad-text:\s*(#[0-9a-f]{6})/g)]
      .map((match) => match[1])
    expect(webRoles).toEqual([statusConstants.dark.badText, statusConstants.light.badText])

    const darkElevated = composite(alphaSurfaces.dark.bgElev2, resolveDarkNeutrals('purple').bg)
    expect(contrast(statusConstants.dark.badText, darkElevated)).toBeGreaterThanOrEqual(4.5)
  })
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
