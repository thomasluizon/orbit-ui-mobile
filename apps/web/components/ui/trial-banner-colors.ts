export interface TrialBannerColors {
  background: string
  boxShadow: string
  actionColor: string
  dismissColor: string
}

/** Keeps plan state in the copy and uses a foreground that clears the card contrast floor. */
export function resolveTrialBannerColors(): TrialBannerColors {
  return {
    background: 'var(--bg-card)',
    boxShadow: 'inset 0 0 0 1px var(--hairline)',
    actionColor: 'var(--fg-1)',
    dismissColor: 'var(--fg-3)',
  }
}
