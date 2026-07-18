'use client'

import { useLocale, useTranslations } from 'next-intl'
import { ChevronRight } from '@/components/ui/icons'
import type { AccountabilityPair } from '@orbit/shared/types/accountability'
import { formatAPIDate, formatLocaleDate, getAccountabilityErrorKey } from '@orbit/shared/utils'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useAppToast } from '@/hooks/use-app-toast'
import { useCheckInAccountability } from '@/hooks/use-accountability'

interface BuddyRowProps {
  pair: AccountabilityPair
  onOpen: (pairId: string) => void
}

/** Compact active-pair row: cadence, both sides' last check-in, quick check-in, tap to open detail. */
export function BuddyRow({ pair, onOpen }: Readonly<BuddyRowProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const { showSuccess, showError } = useAppToast()
  const checkIn = useCheckInAccountability()

  const today = formatAPIDate(new Date())
  const checkedInToday = pair.myLastCheckInDate === today

  function formatSide(date: string | null): string {
    if (!date) return t('social.buddies.never')
    return formatLocaleDate(date, locale, { month: 'short', day: 'numeric' })
  }

  const status = t('social.buddies.checkInStatus', {
    you: formatSide(pair.myLastCheckInDate),
    name: pair.buddy.displayName,
    buddy: formatSide(pair.buddyLastCheckInDate),
  })

  async function handleCheckIn() {
    try {
      await checkIn.mutateAsync({ pairId: pair.id })
      showSuccess(t('social.buddies.checkInSuccess'))
    } catch (error: unknown) {
      showError(t(getAccountabilityErrorKey(error)))
    }
  }

  return (
    <div className="flex items-center" style={{ gap: 12, padding: '12px 20px' }}>
      <button
        type="button"
        onClick={() => onOpen(pair.id)}
        className="flex flex-1 min-w-0 items-center cursor-pointer"
        style={{ gap: 12, border: 0, background: 'transparent', textAlign: 'left', padding: 0 }}
      >
        <UserAvatar name={pair.buddy.displayName} />
        <span className="flex-1 min-w-0">
          <span
            className="flex items-center truncate"
            style={{ gap: 8, fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500, color: 'var(--fg-1)' }}
          >
            {pair.buddy.displayName}
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                // react-doctor-disable-next-line no-tiny-text -- intentional inline cadence pill tag (badge pattern), not body text https://github.com/thomasluizon/orbit-ui-mobile/issues/243
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--fg-3)',
                background: 'var(--bg-elev)',
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              {t(`social.buddies.cadence.${pair.cadence}`)}
            </span>
          </span>
          <span
            className="block truncate"
            style={{ marginTop: 2, fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-3)' }}
          >
            {status}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => void handleCheckIn()}
        disabled={checkedInToday || checkIn.isPending}
        className="touch-target-y shrink-0 cursor-pointer rounded-full transition-transform enabled:active:scale-[0.96] disabled:cursor-default"
        style={{
          padding: '7px 14px',
          border: 0,
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          fontWeight: 500,
          color: checkedInToday ? 'var(--fg-3)' : 'var(--primary-soft)',
          background: checkedInToday ? 'var(--bg-elev)' : 'rgba(var(--primary-rgb), 0.12)',
        }}
      >
        {checkedInToday ? t('social.buddies.checkedInLabel') : t('social.buddies.checkInAction')}
      </button>
      <ChevronRight size={20} strokeWidth={1.8} color="var(--fg-4)" />
    </div>
  )
}
