import { StyleSheet } from 'react-native'
import type { createTokensV2 } from '@/lib/theme'

type Tokens = ReturnType<typeof createTokensV2>

export type ProfileStyles = ReturnType<typeof createProfileStyles>

export function createProfileStyles(_tokens: Tokens) {
  return StyleSheet.create({
    safeArea: { flex: 1 },
    container: { flex: 1 },
    scrollContent: {
      paddingBottom: 80,
    },

    errorText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      textAlign: 'center',
      marginVertical: 12,
    },

    identityBlock: {
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 20,
      gap: 8,
    },
    planBadge: {
      alignSelf: 'center',
    },
    identityNameButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      maxWidth: '100%',
      minHeight: 44,
    },
    identityNamePressed: {
      opacity: 0.7,
    },
    identityName: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 32,
      letterSpacing: -0.32,
      lineHeight: 38,
      flexShrink: 1,
    },
    identityLine: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 16,
      maxWidth: '100%',
    },
    skeletonBadge: {
      borderRadius: 999,
    },
    skeletonName: {
      marginTop: 4,
    },

    statRow: {
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 20,
      marginTop: 24,
      marginBottom: 16,
    },
    statTileWrap: {
      flex: 1,
    },
    statSkeleton: {
      borderRadius: 18,
    },
    statPressable: {
      flexDirection: 'row',
    },
    statPressed: {
      transform: [{ scale: 0.99 }],
      opacity: 0.92,
    },
    lockBadge: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 22,
      height: 22,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },

    groupWrap: {},
  })
}
