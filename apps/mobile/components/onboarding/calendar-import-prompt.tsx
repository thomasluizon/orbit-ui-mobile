import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { CalendarDays } from 'lucide-react-native'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
import { useProfile } from '@/hooks/use-profile'
import { apiClient } from '@/lib/api-client'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { radius, shadows } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function CalendarImportPrompt() {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const { profile, invalidate } = useProfile()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const [dismissed, setDismissed] = useState(false)

  const shouldShow = Boolean(
    profile?.hasCompletedOnboarding &&
      !profile?.hasImportedCalendar &&
      pathname !== '/calendar-sync' &&
      !dismissed,
  )

  useEffect(() => {
    if (profile?.hasImportedCalendar) {
      setDismissed(true)
    }
  }, [profile?.hasImportedCalendar])

  const dismissPrompt = useCallback(async () => {
    setDismissed(true)

    try {
      await apiClient(API.calendar.dismiss, { method: 'PUT' })
    } catch {
      // Dismissal is best-effort; keep the prompt hidden for this session.
    } finally {
      invalidate()
    }
  }, [invalidate])

  const handleImport = useCallback(async () => {
    await dismissPrompt()
    router.push('/calendar-sync' as never)
  }, [dismissPrompt, router])

  if (!shouldShow) return null

  return (
    <BottomSheetModal
      open={shouldShow}
      onClose={() => {
        void dismissPrompt()
      }}
      title={t('onboarding.wizard.calendarTitle')}
      snapPoints={['42%']}
    >
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <CalendarDays size={24} color={colors.primary} />
        </View>
        <Text style={styles.description}>
          {t('onboarding.wizard.calendarDescription')}
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.85}
          onPress={handleImport}
        >
          <Text style={styles.primaryButtonText}>
            {t('onboarding.wizard.calendarButton')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.75}
          onPress={() => {
            void dismissPrompt()
          }}
        >
          <Text style={styles.secondaryButtonText}>{t('common.later')}</Text>
        </TouchableOpacity>
      </View>
    </BottomSheetModal>
  )
}

function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    content: {
      alignItems: 'center',
      gap: 18,
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    iconCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary_10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    description: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    primaryButton: {
      width: '100%',
      borderRadius: radius.xl,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      alignItems: 'center',
      ...shadows.sm,
      elevation: 3,
    },
    primaryButtonText: {
      color: colors.white,
      fontSize: 14,
      fontWeight: '700',
    },
    secondaryButton: {
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    secondaryButtonText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
  })
}

