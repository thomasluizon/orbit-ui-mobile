import { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient'
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Line,
} from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { plural } from '@/lib/plural'
import { gradients, radius, shadows } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface StreakBadgeProps {
  streak: number
  isFrozen?: boolean
}

export function StreakBadge({ streak, isFrozen }: Readonly<StreakBadgeProps>) {
  const { t } = useTranslation()
  const { colors } = useAppTheme()

  const tier = useMemo(() => {
    if (streak >= 100) return 'legendary'
    if (streak >= 30) return 'intense'
    if (streak >= 7) return 'strong'
    return 'normal'
  }, [streak])

  if (streak <= 0) return null

  const tierStyle = (() => {
    switch (tier) {
      case 'legendary':
        return { bg: 'rgba(251, 191, 36, 0.15)', border: 'rgba(251, 191, 36, 0.30)', count: '#fbbf24' }
      case 'intense':
        return { bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.30)', count: '#f97316' }
      case 'strong':
        return { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.25)', count: '#ef4444' }
      default:
        return { bg: colors.surfaceElevated, border: colors.border, count: colors.textSecondary }
    }
  })()

  const tierGlow = (() => {
    switch (tier) {
      case 'legendary':
        return shadows.glowLg('rgba(251,191,36,1)')
      case 'intense':
        return shadows.glow('rgba(249,115,22,1)')
      case 'strong':
        return shadows.glowSm('rgba(251,191,36,1)')
      default:
        return {}
    }
  })()

  const legendaryGradientColors: readonly [string, string] = ['rgba(251,191,36,0.1)', 'rgba(239,68,68,0.08)']

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: tierStyle.bg, borderColor: tierStyle.border },
        tierGlow,
      ]}
      accessibilityLabel={plural(
        t('streakDisplay.badge.tooltip', { count: streak }),
        streak,
      )}
    >
      {/* Gradient sheen overlay */}
      <ExpoLinearGradient
        colors={gradients.surfaceSheen}
        locations={gradients.surfaceSheenLocations}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.25, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {/* Legendary tier gradient background */}
      {tier === 'legendary' && (
        <ExpoLinearGradient
          colors={legendaryGradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
      )}
      {/* Inset top highlight */}
      <View style={styles.insetHighlight} pointerEvents="none" />
      <Svg width={12} height={15} viewBox="0 0 16 20" fill="none">
        <Defs>
          <LinearGradient
            id="flame-grad"
            x1="8"
            y1="0"
            x2="8"
            y2="20"
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor="#fbbf24" />
            <Stop offset="0.5" stopColor="#f97316" />
            <Stop offset="1" stopColor="#ef4444" />
          </LinearGradient>
        </Defs>
        <Path
          d="M8 0C8 0 2 6.5 2 12a6 6 0 0 0 12 0C14 6.5 8 0 8 0Zm0 17a3 3 0 0 1-3-3c0-2 3-5.5 3-5.5S11 12 11 14a3 3 0 0 1-3 3Z"
          fill="url(#flame-grad)"
        />
      </Svg>

      <Text style={[styles.count, { color: tierStyle.count }]}>{streak}</Text>

      {isFrozen ? (
        <View style={styles.frozenIcon}>
          <Svg width={10} height={12} viewBox="0 0 12 14" fill="none">
            <Line x1={6} y1={0} x2={6} y2={14} stroke="#93c5fd" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            <Line x1={2} y1={2} x2={6} y2={6} stroke="#93c5fd" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            <Line x1={10} y1={2} x2={6} y2={6} stroke="#93c5fd" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            <Line x1={2} y1={12} x2={6} y2={8} stroke="#93c5fd" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            <Line x1={10} y1={12} x2={6} y2={8} stroke="#93c5fd" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            <Line x1={0} y1={7} x2={12} y2={7} stroke="#93c5fd" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    overflow: 'hidden',
  },
  insetHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  count: {
    fontSize: 12,
    fontWeight: '700',
  },
  frozenIcon: {
    marginLeft: 1,
  },
})

