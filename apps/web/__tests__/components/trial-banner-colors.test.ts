import { describe, expect, it } from 'vitest'
import { resolveTrialBannerColors } from '@/components/ui/trial-banner-colors'

describe('resolveTrialBannerColors', () => {
  it('uses a neutral surface and a compliant action foreground', () => {
    const colors = resolveTrialBannerColors()
    expect(colors.background).toBe('var(--bg-card)')
    expect(colors.boxShadow).toContain('hairline')
    expect(colors.actionColor).toBe('var(--fg-1)')
    expect(colors.dismissColor).toBe('var(--fg-3)')
  })
})
