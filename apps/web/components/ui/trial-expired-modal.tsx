'use client'

import { useEffect, useId } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { buildAccountScopedStorageKey, readAccountScopedFlag, TRIAL_EXPIRED_SEEN_KEY } from '@orbit/shared/utils'
import { hasOpenPromptBlockingOverlay } from '@orbit/shared/stores'
import { useIsClient } from '@/hooks/use-is-client'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useHeldAccountId } from '@/stores/auth-store'
import { useTrialExpired } from '@/hooks/use-profile'
import { useSubscriptionPlans } from '@/hooks/use-subscription-plans'
import { useSheetHost } from '@/components/ui/sheet'
import { TrialExpiredDialog } from '@/components/ui/trial-expired-dialog'
import { useUIStore } from '@/stores/ui-store'

const STORAGE_KEY = TRIAL_EXPIRED_SEEN_KEY

const PAUSED_FEATURES = [
  'trial.expired.orbitCeiling',
  'trial.expired.calendarSync',
  'trial.expired.retrospective',
  'trial.expired.proactiveOrbit',
] as const

export function TrialExpiredModal() {
  const { sheetRef, closeSheet } = useSheetHost()
  const router = useRouter()
  const pathname = usePathname()
  const trialExpired = useTrialExpired()
  const [dismissed, setDismissed] = useAccountScopedState(false)
  const mounted = useIsClient()
  const accountId = useHeldAccountId()
  const scopedKey = accountId === null ? null : buildAccountScopedStorageKey(STORAGE_KEY, accountId)
  const promptId = useId()
  const anotherOverlayOpen = useUIStore(hasOpenPromptBlockingOverlay)
  const openOverlayIds = useUIStore((state) => state.openOverlayIds)
  const unregisterOpenOverlay = useUIStore((state) => state.unregisterOpenOverlay)
  const reservationId = `${promptId}:${scopedKey ?? ''}`

  useEffect(() => {
    if (scopedKey === null) return
    if (!readAccountScopedFlag(localStorage.getItem(scopedKey), localStorage.getItem(STORAGE_KEY)).adoptsLegacy) return
    localStorage.setItem(scopedKey, '1')
    localStorage.removeItem(STORAGE_KEY)
  }, [scopedKey])

  const isOpen =
    mounted &&
    scopedKey !== null &&
    pathname !== '/upgrade' &&
    !dismissed &&
    trialExpired &&
    // react-doctor-disable-next-line no-unguarded-browser-global-in-render-or-hook-init -- guarded by the `mounted` (useIsClient) short-circuit at the head of this expression; localStorage is only read on the client, never during SSR https://github.com/thomasluizon/orbit-ui-mobile/issues/243
    !readAccountScopedFlag(localStorage.getItem(scopedKey), localStorage.getItem(STORAGE_KEY)).seen
  const reserved = openOverlayIds.includes(reservationId)
  const presented = isOpen && reserved
  useEffect(() => {
    if (!isOpen) {
      if (reserved) unregisterOpenOverlay(reservationId)
      return
    }
    if (!reserved && !anotherOverlayOpen) useUIStore.getState().tryReservePromptOverlay(reservationId)
  }, [anotherOverlayOpen, isOpen, reservationId, reserved, unregisterOpenOverlay])
  useEffect(() => {
    return () => unregisterOpenOverlay(reservationId)
  }, [reservationId, unregisterOpenOverlay])
  const { plans } = useSubscriptionPlans({
    enabled: presented,
    handlesError: true,
  })

  function hide() {
    setDismissed(true)
    if (scopedKey !== null) localStorage.setItem(scopedKey, '1')
  }

  if (!presented) return null

  const seePlans = () =>
    closeSheet(() => {
      hide()
      router.push(`/upgrade?from=${encodeURIComponent(pathname)}`)
    })

  return (
    <TrialExpiredDialog
      sheetRef={sheetRef}
      pausedFeatures={PAUSED_FEATURES}
      savingsPercent={plans?.savingsPercent}
      onSeePlans={seePlans}
      onContinueFree={() => closeSheet()}
      onClose={hide}
    />
  )
}
