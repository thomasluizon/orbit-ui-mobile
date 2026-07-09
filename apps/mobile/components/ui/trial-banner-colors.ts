import type { ViewStyle } from 'react-native'
import { tintFromPrimary, type AppTokensV2 } from '@/lib/theme'

function rgbaFromHex(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export interface TrialBannerColors {
  container: Pick<ViewStyle, 'backgroundColor' | 'borderColor'>
  accentColor: string
  chevronColor: string
  dismissColor: string
}

/**
 * Resolves the trial banner's themed colors: the calm primary tint by default,
 * or the amber overdue tint once the trial is urgent. Pure — mirrors the web
 * trial-banner-colors helper.
 */
export function resolveTrialBannerColors(
  trialUrgent: boolean,
  tokens: AppTokensV2,
): TrialBannerColors {
  return {
    container: trialUrgent
      ? {
          backgroundColor: rgbaFromHex(tokens.statusOverdue, 0.1),
          borderColor: rgbaFromHex(tokens.statusOverdue, 0.28),
        }
      : {
          backgroundColor: tintFromPrimary(tokens, 0.08),
          borderColor: tintFromPrimary(tokens, 0.18),
        },
    accentColor: trialUrgent ? tokens.statusOverdueText : tokens.primarySoft,
    chevronColor: trialUrgent ? tokens.statusOverdue : tokens.primarySoft,
    dismissColor: trialUrgent ? tokens.statusOverdue : tokens.fg3,
  }
}
