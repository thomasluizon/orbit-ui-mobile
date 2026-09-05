import { StyleSheet } from 'react-native'

export const styles = StyleSheet.create({
  pricingSections: {
    gap: 32,
  },
  purchaseGroup: {
    gap: 16,
  },
  purchaseActions: {
    gap: 24,
  },
  allowanceSection: {
    gap: 12,
    paddingHorizontal: 16,
  },
  allowanceCard: {
    alignItems: 'stretch',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 16,
    padding: 16,
  },
  allowanceColumn: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  allowanceDivider: {
    width: 1,
  },
  allowanceLabel: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 12,
    letterSpacing: 0.48,
  },
  allowanceAmount: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 34,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.68,
    lineHeight: 36,
  },
  allowancePerDay: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  allowanceNote: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 22,
  },
  outcomes: {
    gap: 12,
    paddingHorizontal: 16,
  },
  outcomeRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  outcomeIcon: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    marginTop: 4,
    width: 24,
  },
  outcomeCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  outcomeTitle: {
    fontFamily: 'Geist_500Medium',
    fontSize: 17,
    lineHeight: 24,
  },
  outcomeBody: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  planState: {
    gap: 16,
    paddingHorizontal: 16,
  },
  planChoices: {
    gap: 12,
  },
  convertHeader: {
    gap: 8,
    paddingHorizontal: 16,
  },
  convertEyebrow: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 12,
    letterSpacing: 0.48,
    lineHeight: 17,
  },
  convertHeading: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 28,
    lineHeight: 33,
    letterSpacing: -0.56,
  },
  convertPromise: {
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
    lineHeight: 25,
  },
  convertTrust: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 22,
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
  },
  cardLabel: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
  },
  cardValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  cardValue: {
    fontFamily: 'Geist_400Regular',
    fontSize: 17,
  },
  cardMeta: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    marginTop: 8,
  },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
    marginBottom: 12,
  },
  usageLabel: {
    fontFamily: 'Geist_400Regular',
    fontSize: 15,
  },
  usageValue: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  freeLink: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
  },
  freeLinkText: {
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
    lineHeight: 24,
    textDecorationLine: 'underline',
  },
  planGroup: {
    paddingHorizontal: 16,
    gap: 16,
  },
  tierCard: {
    borderRadius: 20,
    gap: 8,
    padding: 24,
  },
  tierHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  tierName: {
    flex: 1,
    fontFamily: 'Geist_500Medium',
    fontSize: 17,
    lineHeight: 22,
    minWidth: 0,
  },
  tierPrice: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 28,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.56,
    lineHeight: 32,
  },
  tierPeriod: {
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
  },
  tierHero: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  tierSecond: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    lineHeight: 18,
  },
  tierCoupon: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  tierAction: {
    paddingTop: 8,
  },
  actionPad: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 4,
    gap: 12,
    alignItems: 'center',
  },
  renewalNote: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 22,
  },
  handoffNote: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 22,
  },
  reassurance: {
    alignItems: 'flex-start',
    gap: 16,
    paddingHorizontal: 16,
  },
  reassuranceCopy: {
    alignItems: 'flex-start',
    gap: 8,
  },
  reassurancePrimary: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 22,
  },
  restoreLink: {
    fontFamily: 'Geist_500Medium',
    fontSize: 14,
  },
  restoreAction: {
    alignSelf: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  disabledAction: {
    opacity: 0.4,
  },
  pressedScale: {
    transform: [{ scale: 0.96 }],
  },
  noticeTitle: {
    fontFamily: 'Geist_500Medium',
    fontSize: 16,
    lineHeight: 22,
  },
  noticeBody: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  centerMuted: {
    fontFamily: 'Geist_400Regular',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'left',
  },
})
