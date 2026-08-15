'use client'

import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { habitKeys } from '@orbit/shared/query'
import { useProfile } from '@/hooks/use-profile'
import { AppBar } from '@/components/ui/app-bar'
import { updateAiSummary, updateProactiveAstra } from '@/app/actions/profile'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { AiFeatureToggles } from './_components/ai-feature-toggles'

export default function AiSettingsPage() {
  const t = useTranslations()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const queryClient = useQueryClient()
  const { profile, patchProfile } = useProfile()
  const hasProAccess = profile?.hasProAccess ?? false
  const aiSummaryEnabled = hasProAccess && (profile?.aiSummaryEnabled ?? false)
  const proactiveAstraEnabled = hasProAccess && (profile?.proactiveAstraEnabled ?? false)

  const aiSummaryMutation = useMutation({
    mutationFn: (enabled: boolean) => updateAiSummary({ enabled }),
    onMutate: (enabled) => {
      const previous = profile?.aiSummaryEnabled
      patchProfile({ aiSummaryEnabled: enabled })
      return { previous }
    },
    onError: (_err, _enabled, context) => {
      if (context?.previous !== undefined) {
        patchProfile({ aiSummaryEnabled: context.previous })
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })

  // react-doctor-disable-next-line query-mutation-missing-invalidation -- optimistic cache update via patchProfile (setQueryData) + onError rollback keeps the profile cache in sync; no dependent query to refetch https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  const proactiveAstraMutation = useMutation({
    mutationFn: (enabled: boolean) => updateProactiveAstra({ enabled }),
    onMutate: (enabled) => {
      const previous = profile?.proactiveAstraEnabled
      patchProfile({ proactiveAstraEnabled: enabled })
      return { previous }
    },
    onError: (_err, _enabled, context) => {
      if (context?.previous !== undefined) {
        patchProfile({ proactiveAstraEnabled: context.previous })
      }
    },
  })

  return (
    <div className="md:mx-auto md:max-w-[760px]">
      <div className="flex flex-col min-h-[100dvh]">
        <AppBar
          back
          backLabel={t('common.backToProfile')}
          onBack={() => goBackOrFallback('/profile')}
          title={t('aiSettings.title')}
        />
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="stagger-enter">
            <AiFeatureToggles
              hasProAccess={hasProAccess}
              aiSummaryEnabled={aiSummaryEnabled}
              proactiveAstraEnabled={proactiveAstraEnabled}
              summaryPending={aiSummaryMutation.isPending}
              proactivePending={proactiveAstraMutation.isPending}
              onToggleSummary={() => aiSummaryMutation.mutate(!aiSummaryEnabled)}
              onToggleProactive={() => proactiveAstraMutation.mutate(!proactiveAstraEnabled)}
              onUpgrade={() => router.push('/upgrade')}
            />
          </div>

          <div style={{ height: 24 }} />
        </div>
      </div>
    </div>
  )
}
