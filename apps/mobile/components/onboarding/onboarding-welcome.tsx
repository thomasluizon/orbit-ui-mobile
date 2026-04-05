import { useMemo } from 'react'
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'
import { colorSchemeOptions, type ColorScheme } from '@orbit/shared/theme'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'
import { apiClient } from '@/lib/api-client'
import { API } from '@orbit/shared/api'
import { createColors, radius as themeRadius, shadows as themeShadows } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type AppColors = ReturnType<typeof createColors>
type AppRadius = typeof themeRadius
type AppShadows = typeof themeShadows

export function OnboardingWelcome() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()
  const { colors, radius, shadows } = useAppTheme()
  const styles = useMemo(() => createStyles(colors, radius, shadows), [colors, radius, shadows])

  // Currently selected scheme -- defaults to purple
  const currentScheme = (profile as Profile & { colorScheme?: string })?.colorScheme ?? 'purple'

  const weekStartDayMutation = useMutation({
    mutationFn: (day: number) =>
      apiClient(API.profile.weekStartDay, {
        method: 'PUT',
        body: JSON.stringify({ weekStartDay: day }),
      }),
    onMutate: async (newDay) => {
      await queryClient.cancelQueries({ queryKey: profileKeys.all })
      const prev = queryClient.getQueryData<Profile>(profileKeys.detail())
      queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
        old ? { ...old, weekStartDay: newDay } : old,
      )
      return { prev }
    },
    onError: (_err, _newDay, context) => {
      if (context?.prev) {
        queryClient.setQueryData<Profile>(profileKeys.detail(), context.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })

  const colorSchemeMutation = useMutation({
    mutationFn: (scheme: string) =>
      apiClient(API.profile.colorScheme, {
        method: 'PUT',
        body: JSON.stringify({ colorScheme: scheme }),
      }),
    onMutate: async (scheme) => {
      await queryClient.cancelQueries({ queryKey: profileKeys.all })
      const prev = queryClient.getQueryData<Profile>(profileKeys.detail())
      queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
        old ? { ...old, colorScheme: scheme } : old,
      )
      return { prev }
    },
    onError: (_err, _scheme, context) => {
      if (context?.prev) {
        queryClient.setQueryData<Profile>(profileKeys.detail(), context.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })

  function handleWeekStartDaySelect(day: number) {
    weekStartDayMutation.mutate(day)
  }

  function handleSchemeSelect(scheme: ColorScheme) {
    colorSchemeMutation.mutate(scheme)
  }

  const weekStartDay = profile?.weekStartDay ?? 1

  return (
    <View style={styles.container}>
      {/* Logo */}
      <View style={styles.logoContainer}>
        <View style={styles.logoGlow} />
        <Image
          source={require('@/assets/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      {/* Title */}
      <Text style={styles.title}>{t('onboarding.flow.welcome.title')}</Text>
      <Text style={styles.subtitle}>
        {t('onboarding.flow.welcome.subtitle')}
      </Text>

      {/* Week start day */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>
          {t('onboarding.flow.welcome.weekStart')}
        </Text>
        <View style={styles.weekDayRow}>
          <TouchableOpacity
            style={[
              styles.weekDayBtn,
              weekStartDay === 1 && styles.weekDayBtnActive,
            ]}
            activeOpacity={0.8}
            onPress={() => handleWeekStartDaySelect(1)}
          >
            <Text
              style={[
                styles.weekDayText,
                weekStartDay === 1 && styles.weekDayTextActive,
              ]}
            >
              {t('settings.weekStartDay.monday')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.weekDayBtn,
              weekStartDay === 0 && styles.weekDayBtnActive,
            ]}
            activeOpacity={0.8}
            onPress={() => handleWeekStartDaySelect(0)}
          >
            <Text
              style={[
                styles.weekDayText,
                weekStartDay === 0 && styles.weekDayTextActive,
              ]}
            >
              {t('settings.weekStartDay.sunday')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Color scheme (Pro/trial only) */}
      {hasProAccess && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            {t('onboarding.flow.welcome.colorScheme')}
          </Text>
          <View style={styles.schemeRow}>
            {colorSchemeOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.schemeBtn,
                  { backgroundColor: option.color },
                  currentScheme === option.value && styles.schemeBtnActive,
                ]}
                activeOpacity={0.8}
                onPress={() => handleSchemeSelect(option.value)}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(
  colors: AppColors,
  radius: AppRadius,
  shadows: AppShadows,
) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
    },
    logoContainer: {
      marginBottom: 24,
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoGlow: {
      position: 'absolute',
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: colors.primary_15,
      opacity: 0.6,
    },
    logo: {
      width: 80,
      height: 80,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: 12,
    },
    subtitle: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: 32,
    },
    section: {
      width: '100%',
      marginBottom: 24,
      alignItems: 'center',
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 12,
    },
    weekDayRow: {
      flexDirection: 'row',
      gap: 12,
    },
    weekDayBtn: {
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    weekDayBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
      ...shadows.sm,
      elevation: 3,
    },
    weekDayText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    weekDayTextActive: {
      color: colors.white,
    },
    schemeRow: {
      flexDirection: 'row',
      gap: 12,
    },
    schemeBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
    },
    schemeBtnActive: {
      borderWidth: 3,
      borderColor: colors.primary,
      transform: [{ scale: 1.1 }],
    },
  })
}
