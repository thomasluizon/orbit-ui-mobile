'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { buildAccountScopedStorageKey, readAccountScopedFlag } from '@orbit/shared/utils'
import { useIsClient } from '@/hooks/use-is-client'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useHeldAccountId } from '@/stores/auth-store'
import { useTrialExpired } from '@/hooks/use-profile'
import { useSubscriptionPlans } from '@/hooks/use-subscription-plans'
import { PillButton } from '@/components/ui/pill-button'
import { SettingsGroup, SettingsGroupRow } from '@/components/ui/settings-group'
import { Sheet, useSheetHost } from '@/components/ui/sheet'

const STORAGE_KEY = 'orbit_trial_expired_seen'

const PAUSED_FEATURES = [
  'trial.expired.astraCeiling',
  'trial.expired.calendarSync',
  'trial.expired.retrospective',
  'trial.expired.proactiveAstra',
] as const

export function TrialExpiredModal() {
  const t = useTranslations()
  const { sheetRef, closeSheet } = useSheetHost()
  const router = useRouter()
  const pathname = usePathname()
  const trialExpired = useTrialExpired()
  const [dismissed, setDismissed] = useAccountScopedState(false)
  const mounted = useIsClient()
  const accountId = useHeldAccountId()
  const scopedKey = accountId === null ? null : buildAccountScopedStorageKey(STORAGE_KEY, accountId)

  /**
   * Moves a notice dismissed before this key carried an account on to the account signed in now,
   * then consumes the old key. Left in place it would answer for every later account too, which
   * is the defect rather than a milder version of it.
   */
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
  const { plans } = useSubscriptionPlans({
    enabled: isOpen,
    handlesError: true,
  })

  function hide() {
    setDismissed(true)
    if (scopedKey !== null) localStorage.setItem(scopedKey, '1')
  }

  if (!isOpen) return null

  return (
    <Sheet
      ref={sheetRef}
      open
      onClose={hide}
      title={t('trial.expired.heading')}
      actions={
        <div className="flex w-full flex-col gap-2">
          <PillButton
            variant="primary"
            onClick={() =>
              closeSheet(() => {
                hide()
                router.push('/upgrade')
              })
            }
          >
            {t('trial.expired.subscribe')}
          </PillButton>
          <PillButton variant="ghost" onClick={() => closeSheet()}>
            {t('trial.expired.continueFree')}
          </PillButton>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="t-eyebrow m-0">{t('trial.expired.eyebrow')}</p>
          <p className="m-0 max-w-[65ch] text-pretty text-base leading-[1.55] text-[var(--fg-2)]">
            {t('trial.expired.subtitleQuiet')}
          </p>
          {plans ? (
            <p className="m-0 font-mono text-xs tabular-nums text-[var(--fg-3)]">
              {t('trial.expired.savings', { percent: plans.savingsPercent })}
            </p>
          ) : null}
        </div>

        <SettingsGroup>
          {PAUSED_FEATURES.map((featureKey) => (
            <SettingsGroupRow
              key={featureKey}
              label={t(featureKey)}
              trailing={
                <span className="font-mono text-xs text-[var(--fg-3)]">
                  {t('trial.expired.paused')}
                </span>
              }
            />
          ))}
        </SettingsGroup>
      </div>
    </Sheet>
  )
}
