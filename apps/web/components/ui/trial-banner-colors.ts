export interface TrialBannerColors {
  background: string
  boxShadow: string
  accentColor: string
  dismissColor: string
}

/**
 * Resolves the trial banner's themed colors: the calm primary tint by default,
 * or the amber overdue tint once the trial is urgent. Pure.
 */
export function resolveTrialBannerColors(trialUrgent: boolean): TrialBannerColors {
  return {
    background: trialUrgent
      ? 'color-mix(in srgb, var(--status-overdue) 10%, transparent)'
      : 'rgba(var(--primary-rgb), 0.08)',
    boxShadow: trialUrgent
      ? 'inset 0 0 0 1px color-mix(in srgb, var(--status-overdue) 28%, transparent)'
      : 'inset 0 0 0 1px rgba(var(--primary-rgb), 0.18)',
    accentColor: trialUrgent
      ? 'var(--status-overdue-text)'
      : 'var(--primary-soft)',
    dismissColor: trialUrgent ? 'var(--status-overdue)' : 'var(--fg-3)',
  }
}
