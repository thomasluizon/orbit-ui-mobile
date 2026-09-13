import type { ReactNode } from 'react'
import { View } from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { habitKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { Switch } from '@/components/ui/switch'

export interface AstraSettingsController {
  aiSummaryEnabled: boolean
  proactiveAstraEnabled: boolean
  summaryPending: boolean
  proactivePending: boolean
  onToggleSummary: () => void
  onToggleProactive: () => void
}

export function useAstraSettingsController(
  profile: Profile | undefined,
  patchProfile: (patch: Partial<Profile>) => void,
): AstraSettingsController {
  const queryClient = useQueryClient()
  const aiSummaryEnabled = Boolean(profile?.hasProAccess && profile.aiSummaryEnabled)
  const proactiveAstraEnabled = Boolean(
    profile?.hasProAccess && profile.proactiveAstraEnabled,
  )
  const aiSummaryMutation = useMutation({
    mutationFn: (enabled: boolean) => performQueuedApiMutation({
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
    onError: (_error, _enabled, context) => {
      if (context?.previous !== undefined) {
        patchProfile({ aiSummaryEnabled: context.previous })
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
  // react-doctor-disable-next-line query-mutation-missing-invalidation -- The optimistic profile cache update mirrors the stored boolean and rolls back on error. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  const proactiveMutation = useMutation({
    mutationFn: (enabled: boolean) => performQueuedApiMutation({
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
    onError: (_error, _enabled, context) => {
      if (context?.previous !== undefined) {
        patchProfile({ proactiveAstraEnabled: context.previous })
      }
    },
  })

  return {
    aiSummaryEnabled,
    proactiveAstraEnabled,
    summaryPending: aiSummaryMutation.isPending,
    proactivePending: proactiveMutation.isPending,
    onToggleSummary: () => aiSummaryMutation.mutate(!aiSummaryEnabled),
    onToggleProactive: () => proactiveMutation.mutate(!proactiveAstraEnabled),
  }
}

interface PendingSwitchBoundaryProps {
  pending: boolean
  checked: boolean
  label: string
  children: ReactNode
}

function PendingSwitchBoundary({
  pending,
  checked,
  label,
  children,
}: Readonly<PendingSwitchBoundaryProps>) {
  return (
    <View
      pointerEvents={pending ? 'none' : 'auto'}
      accessible={pending}
      accessibilityRole={pending ? 'switch' : undefined}
      accessibilityLabel={pending ? label : undefined}
      accessibilityState={pending ? { checked, disabled: true } : undefined}
    >
      <View
        accessibilityElementsHidden={pending}
        importantForAccessibility={pending ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
    </View>
  )
}

interface AstraSettingsSwitchProps {
  checked: boolean
  pending: boolean
  label: string
  onToggle: () => void
}

export function AstraSettingsSwitch({
  checked,
  pending,
  label,
  onToggle,
}: Readonly<AstraSettingsSwitchProps>) {
  return (
    <PendingSwitchBoundary pending={pending} checked={checked} label={label}>
      <Switch checked={checked} onChange={onToggle} label={label} />
    </PendingSwitchBoundary>
  )
}
