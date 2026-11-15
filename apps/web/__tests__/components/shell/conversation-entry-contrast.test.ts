import { describe, expect, it } from 'vitest'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { resolveWebThemeVariables } from '@/lib/theme-dom'

/** The conversation entry is the bare Orbit over the habit list: its planet and ring are `--fg-1` with no fill behind them, so each surface that scrolls under it must hold 3:1. */
describe.each(['dark', 'light'] as const)('the web conversation entry over the habit list in the %s theme', (theme) => {
  const tokens = resolveWebThemeVariables('orange', theme)
  it.each([
    ['the canvas', ['--bg']],
    ['a habit row', ['--bg', '--bg-card']],
    ['a hovered habit row', ['--bg', '--bg-card', '--bg-hover']],
  ] as const)('keeps the planet at 3:1 or more over %s', (_surface, layers) => {
    expect(contrastOnSurface(tokens['--fg-1']!, layers.map((layer) => tokens[layer]!))).toBeGreaterThanOrEqual(3)
  })
})
