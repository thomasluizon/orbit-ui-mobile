import { describe, expect, it } from 'vitest'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { createTokensV2 } from '@/lib/theme'

/** The conversation entry is the bare Orbit over the habit list: its planet and ring are `fg1` with no fill behind them, so each surface that scrolls under it must hold 3:1. */
describe.each(['dark', 'light'] as const)('the Android conversation entry over the habit list in the %s theme', (theme) => {
  const tokens = createTokensV2('orange', theme)
  it.each([
    ['the canvas', [tokens.bg]],
    ['a habit row', [tokens.bg, tokens.bgCard]],
    ['a pressed habit row', [tokens.bg, tokens.bgCard, tokens.bgHover]],
  ] as const)('keeps the planet at 3:1 or more over %s', (_surface, layers) => {
    expect(contrastOnSurface(tokens.fg1, layers)).toBeGreaterThanOrEqual(3)
  })
})
