import type { ViewStyle } from 'react-native'
import type { AppTokensV2 } from '@/lib/theme'

export interface TrialBannerColors {
  container: Pick<ViewStyle, 'backgroundColor' | 'borderColor'>
  actionColor: string
  dismissColor: string
}

/** Keeps plan state in the copy and uses a foreground that clears the card contrast floor. */
export function resolveTrialBannerColors(tokens: AppTokensV2): TrialBannerColors {
  return {
    container: {
      backgroundColor: tokens.bgCard,
      borderColor: tokens.hairline,
    },
    actionColor: tokens.fg1,
    dismissColor: tokens.fg3,
  }
}
