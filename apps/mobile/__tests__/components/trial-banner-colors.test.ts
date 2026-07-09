import { describe, expect, it } from 'vitest'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { resolveTrialBannerColors } from '@/components/ui/trial-banner-colors'

const tokens = createTokensV2('purple', 'dark')

describe('resolveTrialBannerColors', () => {
  it('uses the calm primary tint when the trial is not urgent', () => {
    const colors = resolveTrialBannerColors(false, tokens)
    expect(colors.container.backgroundColor).toBe(tintFromPrimary(tokens, 0.08))
    expect(colors.container.borderColor).toBe(tintFromPrimary(tokens, 0.18))
    expect(colors.accentColor).toBe(tokens.primarySoft)
    expect(colors.chevronColor).toBe(tokens.primarySoft)
    expect(colors.dismissColor).toBe(tokens.fg3)
  })

  it('switches to the overdue tint when the trial is urgent', () => {
    const colors = resolveTrialBannerColors(true, tokens)
    expect(colors.container.backgroundColor).toContain('rgba')
    expect(colors.accentColor).toBe(tokens.statusOverdueText)
    expect(colors.chevronColor).toBe(tokens.statusOverdue)
    expect(colors.dismissColor).toBe(tokens.statusOverdue)
  })
})
