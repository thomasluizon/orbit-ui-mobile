import { useMemo } from 'react'
import { View, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { habitKeys } from '@orbit/shared/query'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { useProfile } from '@/hooks/use-profile'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { AppBar } from '@/components/ui/app-bar'
import { createStyles } from './ai-settings-styles'
import { AiFeatureToggles } from '@/components/profile/ai-settings-sections'

export default function AiSettingsScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile, patchProfile } = useProfile()
  const queryClient = useQueryClient()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(), [])
  const hasProAccess = profile?.hasProAccess ?? false
  const aiSummaryEnabled = hasProAccess && (profile?.aiSummaryEnabled ?? false)
  const proactiveAstraEnabled = hasProAccess && (profile?.proactiveAstraEnabled ?? false)

  const aiSummaryMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      performQueuedApiMutation({
        type: 'setAiSummary',
        scope: 'profile',
        endpoint: API.profile.aiSummary,
        method: 'PUT',
        payload: { enabled },
        dedupeKey: 'profile-ai-summary',
      }),
    onMutate: (enabled) => {
      const previous = profile?.aiSummaryEnabled
      patchProfile({ aiSummaryEnabled: enabled })
      return { previous }
    },
    onError: (
      _err: unknown,
      _enabled: boolean,
      context: { previous?: boolean } | undefined,
    ) => {
      if (context?.previous !== undefined) {
        patchProfile({ aiSummaryEnabled: context.previous })
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })

  // react-doctor-disable-next-line query-mutation-missing-invalidation -- Deliberate optimistic update: patchProfile() in onMutate writes the toggle to the profile cache and rolls back on error; the server stores the boolean verbatim, so no post-success refetch is needed. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  const proactiveAstraMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      performQueuedApiMutation({
        type: 'setProactiveAstra',
        scope: 'profile',
        endpoint: API.profile.proactiveAstra,
        method: 'PUT',
        payload: { enabled },
        dedupeKey: 'profile-proactive-astra',
      }),
    onMutate: (enabled) => {
      const previous = profile?.proactiveAstraEnabled
      patchProfile({ proactiveAstraEnabled: enabled })
      return { previous }
    },
    onError: (
      _err: unknown,
      _enabled: boolean,
      context: { previous?: boolean } | undefined,
    ) => {
      if (context?.previous !== undefined) {
        patchProfile({ proactiveAstraEnabled: context.previous })
      }
    },
  })

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: tokens.bg }]}
      edges={['top']}
    >
      <AppBar onBack={() => goBackOrFallback('/profile')}
title={t('aiSettings.title')}
backLabel={t('common.backToProfile')} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <AiFeatureToggles
          tokens={tokens}
          t={t}
          hasProAccess={hasProAccess}
          aiSummaryEnabled={aiSummaryEnabled}
          proactiveAstraEnabled={proactiveAstraEnabled}
          summaryPending={aiSummaryMutation.isPending}
          proactivePending={proactiveAstraMutation.isPending}
          onToggleSummary={() => aiSummaryMutation.mutate(!aiSummaryEnabled)}
          onToggleProactive={() => proactiveAstraMutation.mutate(!proactiveAstraEnabled)}
          onUpgrade={() => router.push(buildUpgradeHref('/ai-settings'))}
        />
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  )
}
