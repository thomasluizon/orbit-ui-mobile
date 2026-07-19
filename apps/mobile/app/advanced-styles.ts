import { StyleSheet } from 'react-native'
import type { createTokensV2 } from '@/lib/theme'

export type Tokens = ReturnType<typeof createTokensV2>

export const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  skelStack: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  skelBar: {
    height: 64,
    borderRadius: 16,
  },
  messageBlock: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  messageText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
  keyCard: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  keyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  keyName: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 15,
    flexShrink: 1,
  },
  keyPrefix: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  keyScopes: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.22,
  },
  keyMeta: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 11,
    lineHeight: 17,
    letterSpacing: 0.22,
    fontVariant: ['tabular-nums'],
  },
  revokeLink: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
  },
  actionPad: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  createKeyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  createKeyChipDisabled: {
    opacity: 0.4,
  },
  actionChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionChipPressed: {
    transform: [{ scale: 0.96 }],
  },
  actionLink: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
  },
  apiKeysHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 12,
  },
  subsectionTitle: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
    letterSpacing: -0.16,
  },
  apiKeysDescription: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  disclosureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 10,
  },
  lockedTitle: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
  },
  lockedDesc: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    lineHeight: 19,
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  codeWell: {
    marginHorizontal: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  codeText: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 12,
    lineHeight: 19,
    fontVariant: ['tabular-nums'],
  },
  copyRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  copyBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintPad: {
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  hintText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  widgetSheetScroll: {
    flexGrow: 0,
  },
  widgetSheetContent: {
    paddingHorizontal: 22,
    paddingBottom: 24,
    gap: 16,
  },
  widgetHeading: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 15,
  },
  widgetList: {
    gap: 10,
  },
  widgetStepRow: {
    flexDirection: 'row',
    gap: 8,
  },
  widgetStepNumber: {
    fontFamily: 'Roboto_500Medium',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  widgetFeatureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  widgetItemText: {
    flex: 1,
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
})
