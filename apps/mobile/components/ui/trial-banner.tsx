import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Clock, X } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useProfile, useTrialDaysLeft, useTrialUrgent } from '@/hooks/use-profile'
import { plural } from '@/lib/plural'
import { gradients, lightenHex, radius, shadows } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function TrialBanner() {
  const { t } = useTranslation()
  const { profile } = useProfile()
  const trialDaysLeft = useTrialDaysLeft()
  const trialUrgent = useTrialUrgent()
  const router = useRouter()
  const { colors } = useAppTheme()
  const [dismissed, setDismissed] = useState(false)

  const visible = profile?.isTrialActive && !dismissed

  if (!visible) return null

  const accentColor = trialUrgent ? colors.amber400 : colors.primary
  const borderColor = trialUrgent
    ? 'rgba(245,158,11,0.20)'
    : colors.primary_20

  const gradientStart = trialUrgent ? colors.amber400 : colors.primary
  const gradientEnd = trialUrgent
    ? lightenHex(colors.amber400, 0.2)
    : lightenHex(colors.primary, 0.2)

  const gradientColors: [string, string] = [gradientStart, gradientEnd]

  return (
    <View
      style={[
        styles.container,
        { borderColor },
      ]}
      accessibilityRole="alert"
    >
      {/* Full-width diagonal gradient background */}
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFillObject, styles.gradientBg]}
        pointerEvents="none"
      />
      {/* Sheen overlay */}
      <LinearGradient
        colors={gradients.surfaceSheen}
        locations={gradients.surfaceSheenLocations}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.25, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {/* Inset top highlight */}
      <View style={styles.insetHighlight} pointerEvents="none" />
      <Clock size={16} color={accentColor} />
      <Text style={[styles.text, { color: accentColor }]}>
        {trialDaysLeft === 0
          ? t('trial.banner.lastDay')
          : plural(t('trial.banner.daysLeft', { days: trialDaysLeft ?? 0 }), trialDaysLeft ?? 0)}
      </Text>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.push('/upgrade')}
      >
        <Text style={[styles.upgradeText, { color: accentColor }]}>
          {t('trial.banner.upgrade')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.dismissBtn}
        activeOpacity={0.7}
        onPress={() => setDismissed(true)}
        accessibilityLabel={t('common.dismiss')}
      >
        <X size={14} color={`${accentColor}99`} />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderLeftWidth: 2,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 8,
    overflow: 'hidden',
    ...shadows.cardParent,
    elevation: 5,
  },
  gradientBg: {
    borderRadius: radius.lg,
    opacity: 0.18,
  },
  insetHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  upgradeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  dismissBtn: {
    padding: 2,
    borderRadius: radius.full,
  },
})
