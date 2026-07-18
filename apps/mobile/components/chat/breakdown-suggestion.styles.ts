import { StyleSheet } from 'react-native'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'

export type AppTokens = ReturnType<typeof createTokensV2>
export type BreakdownStyles = ReturnType<typeof createStyles>

export function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
  card: {
    backgroundColor: tokens.bgCard,
    borderWidth: 1,
    borderColor: tokens.hairline,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  headerText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
    color: tokens.fg1,
  },
  habitsList: {
    gap: 12,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.bgElev,
    borderWidth: 1,
    borderColor: tokens.hairline,
    borderRadius: 12,
    padding: 12,
  },
  habitContent: {
    flex: 1,
    gap: 6,
  },
  habitInput: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
    color: tokens.fg1,
    minHeight: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
  },
  freqRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  freqChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: tokens.hairline,
  },
  freqChipActive: {
    backgroundColor: tintFromPrimary(tokens, 0.1),
    borderColor: tintFromPrimary(tokens, 0.3),
  },
  freqChipText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 11,
    color: tokens.fg2,
  },
  freqChipTextActive: {
    fontFamily: 'Rubik_500Medium',
    color: tokens.primary,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quantityLabel: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 11,
    color: tokens.fg3,
  },
  quantityInput: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 11,
    color: tokens.fg2,
    textAlign: 'center',
    minWidth: 32,
    minHeight: 0,
    paddingVertical: 2,
    paddingHorizontal: 6,
    backgroundColor: tokens.bgField,
    borderRadius: 8,
  },
  removeBtn: {
    padding: 6,
    borderRadius: 999,
  },
  controlPressed: {
    transform: [{ scale: 0.96 }],
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: 44,
    gap: 6,
  },
  addBtnText: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 12,
    color: tokens.primary,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: 44,
    gap: 8,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: tokens.fg3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: tokens.primary,
    borderColor: tokens.primary,
  },
  checkboxLabel: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    color: tokens.fg2,
  },
  errorText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
    color: tokens.statusBad,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  confirmPill: {
    flex: 1,
  },
  confirmPillLabel: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
    color: tokens.fgOnPrimary,
  },
  cancelPillLabel: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
    color: tokens.fg1,
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  successIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: `${tokens.statusDone}33`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
    color: tokens.statusDone,
  },
  })
}
