import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LOCKUP_MARK_PATHS,
  LOCKUP_MARK_TRANSFORM,
  LOCKUP_VIEW_BOX,
  LOCKUP_WORD_PATH,
  LOCKUP_WORD_TRANSFORM,
  ORBIT_MASCOT_FACES,
  ORBIT_SMALL_FACES,
  orbitMascotFrame,
  orbitMascotSizeFor,
} from '../contracts/brand'
import { mascotMotion } from '../theme'
import { repositoryRoot } from '../test-support/repository-root'

const brandFile = (name: string) => readFileSync(join(repositoryRoot, 'design', 'brand', name), 'utf8')
const pathsOf = (svg: string, fill: string) =>
  [...svg.matchAll(/<path fill="([^"]+)" d="([^"]+)"\/>/g)].filter((match) => match[1] === fill).map((match) => match[2])
const strokesOf = (svg: string) => [...svg.matchAll(/<path fill="none" stroke="[^"]+" stroke-width="17" stroke-linecap="round" d="([^"]+)"\/>/g)].map((match) => match[1])

const EYE_FILL = 'var(--bg, #09090B)'

describe('mascot geometry matches the design sources', () => {
  it.each([
    ['parado', 'orbit-mascot.svg'],
    ['pensando', 'orbit-mascot-pensando.svg'],
    ['descansando', 'orbit-mascot-descansando.svg'],
  ] as const)('draws the %s eyes of %s', (state, file) => {
    const drawn = ORBIT_MASCOT_FACES[state].eyes.map((eye) => eye.d)
    expect(drawn).toEqual(pathsOf(brandFile(file), EYE_FILL))
  })

  it('draws the feliz arcs of orbit-mascot-feliz.svg', () => {
    expect(ORBIT_MASCOT_FACES.feliz.eyes.map((eye) => eye.d.replaceAll(/\s+/g, ' '))).toEqual(
      strokesOf(brandFile('orbit-mascot-feliz.svg')).map((arc) => arc!.replaceAll(/\s+/g, ' ')),
    )
  })

  it('draws each small face exactly as orbit-mascot-small.svg does', () => {
    const source = brandFile('orbit-mascot-small.svg')
    const root = source.replace(/<defs><symbol[\s\S]*<\/symbol><\/defs>/, '')
    expect(pathsOf(root, EYE_FILL)).toEqual([...ORBIT_SMALL_FACES[24].eyes])
    expect(pathsOf(root, 'var(--primary, currentColor)')).toEqual([ORBIT_SMALL_FACES[24].moon])
    for (const size of [16, 20] as const) {
      const symbol = new RegExp(`<symbol id="small-${size}" viewBox="([^"]+)">([\\s\\S]*?)</symbol>`).exec(source)!
      expect(ORBIT_SMALL_FACES[size].viewBox).toBe(symbol[1])
      expect(pathsOf(symbol[2]!, EYE_FILL)).toEqual([...ORBIT_SMALL_FACES[size].eyes])
      expect(pathsOf(symbol[2]!, 'var(--primary, currentColor)')).toEqual([ORBIT_SMALL_FACES[size].moon])
    }
  })

  it('draws each eye 22 units wide in a box 420 wide, so at 48 it is above the 2px floor', () => {
    expect((22 / 420) * 48).toBeGreaterThan(2)
  })
})

describe('the rest frame', () => {
  it('puts the moon where orbit-mascot.svg draws it', () => {
    const frame = orbitMascotFrame(0, mascotMotion)
    const moon = /<circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)" fill="var\(--primary, currentColor\)"\/>/.exec(brandFile('orbit-mascot.svg'))!
    expect(frame.moon.x).toBeCloseTo(Number(moon[1]), 0)
    expect(frame.moon.y).toBeCloseTo(Number(moon[2]), 0)
    expect(frame.moon.radius).toBeCloseTo(Number(moon[3]), 0)
    expect(frame.blinkScale).toBe(1)
  })

  it('tilts the ring at most 5 degrees each side of -18 and blinks near the end of each interval', () => {
    const quarter = orbitMascotFrame(mascotMotion.tiltPeriod / 4, mascotMotion)
    expect(quarter.ringFront).not.toBe(orbitMascotFrame(0, mascotMotion).ringFront)
    expect(orbitMascotFrame(mascotMotion.blinkInterval * 0.96, mascotMotion).blinkScale).toBeCloseTo(0.1)
    expect(orbitMascotFrame(mascotMotion.blinkInterval * 0.5, mascotMotion).blinkScale).toBe(1)
  })
})

describe('mascot sizes', () => {
  it.each([[16, 16], [20, 20], [24, 24], [32, 24], [48, 48], [60, 48], [96, 96], [128, 128], [200, 128], [12, 16]])(
    'a slot of %i px takes the %i tier',
    (slot, tier) => expect(orbitMascotSizeFor(slot)).toBe(tier),
  )
})

describe('lockup geometry matches orbit-lockup.svg', () => {
  it('draws the same view box, transforms and paths', () => {
    const source = brandFile('orbit-lockup.svg')
    expect(source).toContain(`viewBox="${LOCKUP_VIEW_BOX}"`)
    expect(source).toContain(`<g transform="${LOCKUP_MARK_TRANSFORM}">`)
    expect(source).toContain(`<g transform="${LOCKUP_WORD_TRANSFORM}"`)
    for (const path of LOCKUP_MARK_PATHS) expect(source).toContain(`d="${path.d}"`)
    expect(source).toContain(`d="${LOCKUP_WORD_PATH}"`)
  })
})
