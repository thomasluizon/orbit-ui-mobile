import { describe, expect, it } from 'vitest'
import { schemes } from '../theme/color-schemes'
import { neutralColors } from '../theme/neutral-ramp'
import { controlContrast } from './contrast'

type Rgb = readonly [number, number, number]

function wcagRatio(first: Rgb, second: Rgb): number {
  const luminance = (channels: Rgb) => channels.reduce((sum, channel, index) => {
    const value = channel / 255
    const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    return sum + linear * [0.2126, 0.7152, 0.0722][index]!
  }, 0)
  const firstLuminance = luminance(first)
  const secondLuminance = luminance(second)
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05)
}

const white: Rgb = [255, 255, 255]
const primary: Rgb = [196, 83, 15]
const halfWhiteOnPrimary: Rgb = [226, 169, 135]

const surfaces = [
  { mode: 'light', surface: white, dimmedFill: [226, 169, 135], dimmedInk: white, foreground: [26, 26, 29] },
  { mode: 'dark', surface: [19, 19, 21], dimmedFill: [108, 51, 18], dimmedInk: [137, 137, 138], foreground: [244, 244, 246] },
] as const

describe.each(surfaces)('control contrast on a $mode card', ({ mode, surface, dimmedFill, dimmedInk, foreground }) => {
  const layers = [neutralColors[mode].bg, neutralColors[mode].bgCard]
  const fill = schemes.orange.accent[mode].primary
  const ink = schemes.orange.fgOnPrimary[mode]

  it('measures opaque ink against the fill and the fill against the composited card', () => {
    const result = controlContrast(ink, fill, layers)
    expect(result.graphic).toBeCloseTo(wcagRatio(white, primary), 10)
    expect(result.step).toBeCloseTo(wcagRatio(primary, surface), 10)
  })

  it('dims both graphic and fill contrast toward the card under group opacity', () => {
    const result = controlContrast(ink, fill, layers, 0.5)
    expect(result.graphic).toBeCloseTo(wcagRatio(dimmedInk, dimmedFill), 10)
    expect(result.step).toBeCloseTo(wcagRatio(dimmedFill, surface), 10)
    expect(result.graphic).toBeLessThan(wcagRatio(white, primary))
    expect(result.step).toBeLessThan(wcagRatio(primary, surface))
  })

  it('dims only graphic contrast under foreground opacity', () => {
    const result = controlContrast(ink, fill, layers, 1, 0.5)
    expect(result.graphic).toBeCloseTo(wcagRatio(halfWhiteOnPrimary, primary), 10)
    expect(result.graphic).toBeLessThan(wcagRatio(white, primary))
    expect(result.step).toBeCloseTo(wcagRatio(primary, surface), 10)
  })

  it('measures ink directly against the card when the fill is transparent', () => {
    const result = controlContrast(neutralColors[mode].fg1, 'rgba(0,0,0,0)', layers)
    expect(result.graphic).toBeCloseTo(wcagRatio(foreground, surface), 10)
    expect(result.step).toBe(1)
  })

  it('composites the foreground color alpha over an opaque fill', () => {
    const result = controlContrast('rgba(255,255,255,0.5)', fill, layers)
    expect(result.graphic).toBeCloseTo(wcagRatio(halfWhiteOnPrimary, primary), 10)
    expect(result.step).toBeCloseTo(wcagRatio(primary, surface), 10)
  })
})

it('combines foreground alpha, foreground opacity and group opacity over a translucent fill', () => {
  const result = controlContrast('rgba(255,255,255,0.5)', 'rgba(0,0,0,0.25)', [neutralColors.light.bgCard], 0.5, 0.5)
  expect(result.graphic).toBeCloseTo(wcagRatio([231, 231, 231], [223, 223, 223]), 10)
  expect(result.step).toBeCloseTo(wcagRatio([223, 223, 223], white), 10)
})
