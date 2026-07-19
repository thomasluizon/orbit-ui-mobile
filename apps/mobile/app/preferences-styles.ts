import { StyleSheet } from 'react-native'
import type { createTokensV2 } from '@/lib/theme'

export type Tokens = ReturnType<typeof createTokensV2>

export const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  schemeDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    flexShrink: 0,
  },
  statusBlock: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  statusText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
  },
  linkChip: {
    alignSelf: 'flex-start',
    marginHorizontal: 20,
    marginTop: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkChipPressed: {
    transform: [{ scale: 0.96 }],
  },
  linkText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetContent: {
    paddingHorizontal: 22,
    paddingBottom: 24,
  },
  sheetDescription: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 19.6,
    marginBottom: 12,
  },
  sheetFooter: {
    paddingTop: 16,
    paddingBottom: 4,
  },
})
