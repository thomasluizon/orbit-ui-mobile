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

/** Builds the habit-list StyleSheet from the active semantic token bag. */
export function createStyles(tokens: AppTokens) {
  const skeletonBone = alpha(tokens.fg1, 0.08)

  return StyleSheet.create({
    skeletonContainer: {
      paddingTop: 8,
      paddingBottom: 96,
      gap: 12,
    },
    skeletonCard: {
      marginHorizontal: 16,
      backgroundColor: tokens.bgCard,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: tokens.hairline,
      paddingVertical: 12,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    skeletonCircle: {
      width: 46,
      height: 46,
      borderRadius: 12,
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
      paddingBottom: 96,
    },
    listContentWithBulkBar: {
      paddingBottom: 96 + 96 + 24,
    },
    groupedList: {
      paddingBottom: 96,
    },
    drillHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 8,
      paddingBottom: 16,
    },
    drillBackBtn: {
      width: 44,
      height: 44,
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
    drillHeading: { flex: 1, minWidth: 0 },
    drillSkeletons: {
      gap: 12,
    },
    drillErrorWrap: {
      alignItems: 'center',
      gap: 16,
      paddingHorizontal: 16,
      paddingVertical: 32,
    },
    drillTitle: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 20,
      color: tokens.fg1,
      letterSpacing: -0.2,
    },
    drillProgress: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 12,
      letterSpacing: 0.24,
      fontVariant: ['tabular-nums'],
      color: tokens.fg3,
      marginTop: 0,
    },
    drillErrorText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 21,
      color: tokens.fg2,
      textAlign: 'center',
    },
    drillEmptyText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 21,
      color: tokens.fg2,
      paddingVertical: 8,
      paddingHorizontal: 24,
    },
  })
}
