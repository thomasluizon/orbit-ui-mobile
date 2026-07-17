import { StyleSheet } from 'react-native'
import { createTokensV2 } from '@/lib/theme'

type AppTokens = ReturnType<typeof createTokensV2>

function alpha(color: string, opacity: number): string {
  const normalized = color.trim()

  if (normalized.startsWith('rgba(')) {
    const channels = normalized
      .slice(5, -1)
      .split(',')
      .slice(0, 3)
      .join(',')
      .trim()
    return `rgba(${channels}, ${opacity})`
  }

  if (normalized.startsWith('rgb(')) {
    const channels = normalized.slice(4, -1).trim()
    return `rgba(${channels}, ${opacity})`
  }

  const hex = normalized.replace('#', '')
  if (hex.length !== 6) {
    return normalized
  }

  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

/** Builds the habit-list StyleSheet from the resolved navy+violet token bag. */
export function createStyles(tokens: AppTokens) {
  const skeletonBone = alpha(tokens.fg1, 0.08)

  return StyleSheet.create({
    skeletonContainer: {
      paddingTop: 8,
      paddingBottom: 100,
      gap: 10,
    },
    skeletonCard: {
      marginHorizontal: 20,
      backgroundColor: tokens.bgCard,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: tokens.hairline,
      paddingVertical: 14,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    skeletonCircle: {
      width: 46,
      height: 46,
      borderRadius: 14,
      backgroundColor: skeletonBone,
    },
    skeletonContent: {
      flex: 1,
      gap: 8,
    },
    skeletonTitle: {
      height: 12,
      width: '55%',
      backgroundColor: skeletonBone,
      borderRadius: 6,
    },
    skeletonSubtitle: {
      height: 12,
      width: '32%',
      backgroundColor: skeletonBone,
      borderRadius: 6,
    },
    skeletonCheck: {
      width: 30,
      height: 30,
      borderRadius: 999,
      backgroundColor: skeletonBone,
    },

    sectionInset: {},
    listContent: {
      paddingBottom: 100,
    },
    listContentWithBulkBar: {
      paddingBottom: 220,
    },
    groupedList: {
      paddingBottom: 100,
    },

    drillHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 10,
      marginBottom: 8,
    },
    drillBackBtn: {
      width: 40,
      height: 40,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: tokens.hairlineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    drillBackBtnPressed: {
      backgroundColor: tokens.bgElevPressed,
      transform: [{ scale: 0.96 }],
    },
    drillResetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 20,
    },
    drillResetText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.primary,
    },
    drillSkeletons: {
      gap: 10,
    },
    drillErrorWrap: {
      alignItems: 'center',
    },
    drillRetryButton: {
      marginTop: 16,
    },
    drillTitle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 16,
      color: tokens.fg1,
    },
    drillProgress: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 12,
      letterSpacing: 0.24,
      fontVariant: ['tabular-nums'],
      color: tokens.fg3,
      marginTop: 2,
    },
    drillAddBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      marginHorizontal: 20,
    },
    drillAddBtnText: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      color: tokens.fg3,
    },
    emptyText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      color: tokens.fg3,
      textAlign: 'center',
      marginTop: 32,
      paddingHorizontal: 24,
    },
  })
}
