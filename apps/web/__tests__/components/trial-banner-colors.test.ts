import { describe, expect, it } from 'vitest'
import { resolveTrialBannerColors } from '@/components/ui/trial-banner-colors'

describe('resolveTrialBannerColors', () => {
  it('uses the calm primary tint when the trial is not urgent', () => {
    const colors = resolveTrialBannerColors(false)
    expect(colors.background).toContain('primary-rgb')
    expect(colors.accentColor).toBe('var(--primary-soft)')
    expect(colors.dismissColor).toBe('var(--fg-3)')
  })

  it('switches to the overdue tint when the trial is urgent', () => {
    const colors = resolveTrialBannerColors(true)
    expect(colors.background).toContain('status-overdue')
    expect(colors.boxShadow).toContain('status-overdue')
    expect(colors.accentColor).toBe('var(--status-overdue-text)')
    expect(colors.dismissColor).toBe('var(--status-overdue)')
  })
})
