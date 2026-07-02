import { StyleSheet } from 'react-native'
import type { createTokensV2 } from '@/lib/theme'

export type Tokens = ReturnType<typeof createTokensV2>

export const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  lockedBlock: {
    paddingHorizontal: 24,
    paddingVertical: 40,
    alignItems: 'center',
    gap: 14,
  },
  lockedIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedTitle: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 20,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  lockedDescription: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 320,
  },
  lockedCta: {
    marginTop: 8,
  },
  tabsRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chipsScroll: {
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
  },
  offlinePad: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  skeletonStack: {
    paddingHorizontal: 20,
    paddingVertical: 32,
    gap: 14,
    alignItems: 'center',
  },
  skeletonLabel: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
  },
  contentWrap: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  dashStack: {
    gap: 12,
  },
  statTilesRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dashCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  dashCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dashCardTitle: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
    letterSpacing: 0.1,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 14,
    height: 88,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    height: '100%',
  },
  barTrack: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  barFill: {
    width: 22,
    borderRadius: 6,
  },
  barLabel: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  habitList: {
    gap: 10,
    marginTop: 14,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  habitEmoji: {
    fontSize: 18,
    lineHeight: 22,
  },
  habitName: {
    flex: 1,
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
  },
  habitRate: {
    fontFamily: 'Roboto_500Medium',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  narrativeBody: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10,
  },
  narrativeStrong: {
    fontFamily: 'Rubik_500Medium',
  },
  astraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  astraEyebrowGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  astraActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  astraEyebrow: {
    fontFamily: 'Roboto_500Medium',
    fontSize: 10.5,
    letterSpacing: 0.63,
  },
  aiDisclaimer: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
  },
  actionChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionChipPressed: {
    transform: [{ scale: 0.96 }],
  },
  actionChipText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
  },
  cachedText: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 11,
    letterSpacing: 0.22,
    fontVariant: ['tabular-nums'],
  },
  errorWrap: {
    paddingHorizontal: 20,
    paddingVertical: 32,
    alignItems: 'center',
    gap: 10,
  },
  errorText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    textAlign: 'center',
  },
  generateBlock: {
    paddingTop: 20,
  },
  generateCardWrap: {
    paddingHorizontal: 20,
  },
  generateBtnWrap: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  statusError: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    textAlign: 'center',
  },
})
