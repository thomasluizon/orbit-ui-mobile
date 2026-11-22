import { useCallback, useEffect, useId, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { usePathname, useRouter } from 'expo-router'
import { buildAccountScopedStorageKey, readAccountScopedFlag, TRIAL_EXPIRED_SEEN_KEY } from '@orbit/shared/utils'
import { hasOpenPromptBlockingOverlay } from '@orbit/shared/stores'
import { useTrialExpired } from '@/hooks/use-profile'
import { useAuthStore } from '@/stores/auth-store'
import { useUIStore } from '@/stores/ui-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useAccountGeneration } from '@/hooks/use-session-reset'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { TrialExpiredDialog } from '@/components/ui/trial-expired-dialog'
import { useSubscriptionPlans } from '@/hooks/use-subscription-plans'

const STORAGE_KEY = TRIAL_EXPIRED_SEEN_KEY

const PAUSED_FEATURES = [
  'trial.expired.orbitCeiling',
  'trial.expired.calendarSync',
  'trial.expired.retrospective',
  'trial.expired.proactiveOrbit',
] as const

function GuidedTrialExpired(actions: Readonly<{ onSeePlans: () => void; onContinueFree: () => void; onClose: () => void }>) {
  const { plans } = useSubscriptionPlans({ handlesError: true })
  return <TrialExpiredDialog {...actions} pausedFeatures={PAUSED_FEATURES} savingsPercent={plans?.savingsPercent} />
}

/** `suppressed` holds the notice back while the person is signed out, onboarding owns the screen or the pending Pro flag is not loaded; the notice stays mounted so a presented sheet closes through its dismissal. */
export function TrialExpiredModal({ suppressed = false }: Readonly<{ suppressed?: boolean }>) {
  const router = useRouter()
  const pathname = usePathname()
  const trialExpired = useTrialExpired()
  const accountId = useAuthStore((state) => state.user?.userId ?? null)
  const accountGeneration = useAccountGeneration()
  const [noticeState, setNoticeState] = useState({
    accountId,
    dismissed: false,
    alreadySeen: true,
  })
  const currentNoticeState = noticeState.accountId === accountId
    ? noticeState
    : { accountId, dismissed: false, alreadySeen: true }
  if (noticeState.accountId !== accountId) setNoticeState(currentNoticeState)
  const scopedKey = accountId === null ? null : buildAccountScopedStorageKey(STORAGE_KEY, accountId)
  const promptId = useId()
  const anotherOverlayOpen = useUIStore(hasOpenPromptBlockingOverlay)
  const openOverlayIds = useUIStore((state) => state.openOverlayIds)
  const unregisterOpenOverlay = useUIStore((state) => state.unregisterOpenOverlay)
  const reservationId = `${promptId}:${scopedKey ?? ''}`

  useEffect(() => {
    if (scopedKey === null) return
    let cancelled = false
    void AsyncStorage.multiGet([scopedKey, STORAGE_KEY]).then(([scoped, legacy]) => {
      if (cancelled) return
      const flag = readAccountScopedFlag(scoped?.[1] ?? null, legacy?.[1] ?? null)
      if (flag.adoptsLegacy) {
        void AsyncStorage.setItem(scopedKey, '1')
        void AsyncStorage.removeItem(STORAGE_KEY)
      }
      setNoticeState((current) => current.accountId === accountId
        ? { ...current, alreadySeen: flag.seen }
        : current)
    })
    return () => {
      cancelled = true
    }
  }, [accountId, scopedKey])

  const isOpen =
    !suppressed && pathname !== '/upgrade' && !currentNoticeState.dismissed && trialExpired &&
    !currentNoticeState.alreadySeen
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

  const hide = useCallback(() => {
    if (getAccountGeneration() !== accountGeneration) return
    setNoticeState((current) => current.accountId === accountId
      ? { ...current, dismissed: true }
      : current)
    if (scopedKey !== null) void AsyncStorage.setItem(scopedKey, '1')
  }, [accountGeneration, accountId, scopedKey])

  const seePlans = () => {
    if (getAccountGeneration() !== accountGeneration) return
    hide()
    router.push(buildUpgradeHref(pathname || '/'))
  }

  if (!presented) return null
  return (
    <GuidedTrialExpired
      onSeePlans={seePlans}
      onContinueFree={hide}
      onClose={hide}
    />
  )
}
