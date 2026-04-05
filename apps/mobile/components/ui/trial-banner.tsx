import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Clock, X } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useProfile, useTrialDaysLeft, useTrialUrgent } from '@/hooks/use-profile'
import { colors, radius } from '@/lib/theme'

export function TrialBanner() {
  const { t } = useTranslation()
  const { profile } = useProfile()
  const trialDaysLeft = useTrialDaysLeft()
  const trialUrgent = useTrialUrgent()
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)

  const visible = profile?.isTrialActive && !dismissed

  if (!visible) return null

  const accentColor = trialUrgent ? colors.amber400 : colors.primary
  const bgColor = trialUrgent
    ? 'rgba(245,158,11,0.10)'
    : colors.primary_10
  const borderColor = trialUrgent
    ? 'rgba(245,158,11,0.20)'
    : colors.primary_20

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: bgColor, borderColor },
      ]}
      accessibilityRole="alert"
    >
      <Clock size={16} color={accentColor} />
      <Text style={[styles.text, { color: accentColor }]}>
        {trialDaysLeft === 0
          ? t('trial.banner.lastDay')
          : t('trial.banner.daysLeft', { days: trialDaysLeft ?? 0 })}
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
    marginTop: 16,
    marginBottom: 8,
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
