'use client'

import { useQueryClient } from '@tanstack/react-query'
import type { Profile } from '@orbit/shared/types/profile'
import { habitKeys } from '@orbit/shared/query'
import { updateAiSummary, updateProactiveAstra } from '@/lib/actions/profile'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
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
  const aiSummaryMutation = useAccountScopedMutation({
    mutationFn: (enabled: boolean, intendedAccountId) =>
      updateAiSummary({ enabled }, intendedAccountId),
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
  const proactiveMutation = useAccountScopedMutation({
    mutationFn: (enabled: boolean, intendedAccountId) =>
      updateProactiveAstra({ enabled }, intendedAccountId),
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
    <fieldset disabled={pending} className="m-0 border-0 p-0">
      <Switch checked={checked} onChange={onToggle} label={label} />
    </fieldset>
  )
}
