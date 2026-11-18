import { describe, expect, it } from 'vitest'
import { contrastOnSurface } from '@orbit/shared/__tests__/contrast'
import { createTokensV2 } from '@/lib/theme'

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
