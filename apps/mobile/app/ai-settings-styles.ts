import { StyleSheet } from 'react-native'
import type { createTokensV2 } from '@/lib/theme'

export type Tokens = ReturnType<typeof createTokensV2>

export function createStyles() {
  return StyleSheet.create({
    safeArea: { flex: 1 },
    container: { flex: 1 },
    scrollContent: { paddingBottom: 40 },
  })
}
