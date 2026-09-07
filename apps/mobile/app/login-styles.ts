import { StyleSheet } from 'react-native'
import { type AppTokensV2, radius } from '@/lib/theme'

export function createLoginStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: tokens.bg },
    container: { flex: 1 },
    scrollContent: { flexGrow: 1, alignItems: 'center' },
    scrollWide: { justifyContent: 'center', padding: 32 },
    formColumn: { width: '100%', paddingTop: 32, paddingHorizontal: 16, paddingBottom: 16, gap: 32 },
    panel: { width: 420, padding: 32, backgroundColor: tokens.bgCard, borderRadius: radius.xl,
      borderWidth: 1, borderColor: tokens.hairlineGhost },
    step: { gap: 24 },
    titleBlock: { gap: 8 },
    stepTitle: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 22, lineHeight: 26.4, letterSpacing: -0.44, color: tokens.fg1 },
    stepSubtitle: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24, color: tokens.fg2 },
    mono: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 18, color: tokens.fg3, fontVariant: ['tabular-nums'] },
    successText: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 18, color: tokens.fg3 },
    referralBanner: { gap: 8 },
    referralBannerText: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 19.2,
      color: tokens.fg3, letterSpacing: 0.72, textTransform: 'uppercase' },
    hairline: { height: 1, backgroundColor: tokens.hairline },
    actionGroup: { gap: 12 },
    divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    dividerLine: { flex: 1, height: 1, backgroundColor: tokens.hairline },
    dividerText: { fontFamily: 'GeistMono_400Regular', fontSize: 12, color: tokens.fg3 },
    legal: { fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 19.2, color: tokens.fg3 },
    legalLink: { textDecorationLine: 'underline', color: tokens.fg2 },
    quietAction: { alignSelf: 'flex-start' },
    error: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21, color: tokens.statusBadText },
    offlineNotice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
      backgroundColor: tokens.bgWell, borderRadius: radius.md },
    offlineText: { flex: 1, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21, color: tokens.fg2 },
    reason: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21, color: tokens.fg3 },
  })
}
export type LoginStyles = ReturnType<typeof createLoginStyles>
