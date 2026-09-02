export interface TrialBannerColors {
  background: string
  boxShadow: string
  actionColor: string
  dismissColor: string
}

/** Keeps plan state in the copy and reserves the one accent role for the action. */
export function resolveTrialBannerColors(): TrialBannerColors {
  return {
    background: 'var(--bg-card)',
    boxShadow: 'inset 0 0 0 1px var(--hairline)',
    actionColor: 'var(--primary-soft)',
    dismissColor: 'var(--fg-3)',
  }
}
