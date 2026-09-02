import { describe, expect, it } from 'vitest'
import { createTokensV2 } from '@/lib/theme'
import { resolveTrialBannerColors } from '@/components/ui/trial-banner-colors'

const tokens = createTokensV2('purple', 'dark')

describe('resolveTrialBannerColors', () => {
  it('uses a neutral surface and a compliant action foreground', () => {
    const colors = resolveTrialBannerColors(tokens)
    expect(colors.container.backgroundColor).toBe(tokens.bgCard)
    expect(colors.container.borderColor).toBe(tokens.hairline)
    expect(colors.actionColor).toBe(tokens.fg1)
    expect(colors.dismissColor).toBe(tokens.fg3)
  })
})
