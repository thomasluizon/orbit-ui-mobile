'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { AccountabilityPair } from '@orbit/shared/types/accountability'
import { getAccountabilityErrorKey } from '@orbit/shared/utils'
import { AppOverlay } from '@/components/ui/app-overlay'
import { PillButton } from '@/components/ui/pill-button'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useAppToast } from '@/hooks/use-app-toast'
import {
  useAcceptAccountabilityPair,
  useEndAccountabilityPair,
} from '@/hooks/use-accountability'
import { HabitMultiSelect } from './habit-multi-select'

interface BuddyInviteRowProps {
  pair: AccountabilityPair
  direction: 'incoming' | 'outgoing'
}

const actionButtonStyle = {
  padding: '8px 14px',
  borderRadius: 999,
  border: 0,
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
} as const

/** A pending accountability invite: accept (picking habits) / decline when incoming, rescind when outgoing. */
export function BuddyInviteRow({ pair, direction }: Readonly<BuddyInviteRowProps>) {
  const t = useTranslations()
  const { showSuccess, showError } = useAppToast()
  const accept = useAcceptAccountabilityPair()
  const end = useEndAccountabilityPair()
  const [acceptOpen, setAcceptOpen] = useState(false)
  const [habitIds, setHabitIds] = useState<string[]>([])
  const busy = accept.isPending || end.isPending

  async function handleEnd() {
    try {
      await end.mutateAsync(pair.id)
    } catch (error: unknown) {
      showError(t(getAccountabilityErrorKey(error)))
    }
  }

  async function handleAccept() {
    if (habitIds.length === 0) {
      showError(t('social.buddies.errors.habitRequired'))
      return
    }
    try {
      await accept.mutateAsync({ pairId: pair.id, habitIds })
      showSuccess(t('social.buddies.acceptSuccess'))
      setAcceptOpen(false)
    } catch (error: unknown) {
      showError(t(getAccountabilityErrorKey(error)))
    }
  }

  return (
    <>
      <div className="flex items-center" style={{ gap: 12, padding: '12px 20px' }}>
        <UserAvatar name={pair.buddy.displayName} />
        <div className="flex-1 min-w-0">
          <p
            className="truncate"
            style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500, color: 'var(--fg-1)' }}
          >
            {pair.buddy.displayName}
          </p>
          <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-3)' }}>
            {direction === 'incoming'
              ? t('social.buddies.invitedYou', { cadence: t(`social.buddies.cadence.${pair.cadence}`) })
              : t('social.buddies.youInvited')}
          </p>
        </div>
        <div className="flex items-center" style={{ gap: 8 }}>
          {direction === 'incoming' ? (
            <>
              <button
                type="button"
                onClick={() => setAcceptOpen(true)}
                disabled={busy}
                style={{ ...actionButtonStyle, color: 'var(--fg-on-primary)', background: 'var(--primary)' }}
              >
                {t('social.buddies.accept')}
              </button>
              <button
                type="button"
                onClick={handleEnd}
                disabled={busy}
                style={{ ...actionButtonStyle, color: 'var(--fg-2)', background: 'var(--bg-elev)' }}
              >
                {t('social.buddies.decline')}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleEnd}
              disabled={busy}
              style={{ ...actionButtonStyle, color: 'var(--fg-2)', background: 'var(--bg-elev)' }}
            >
              {t('social.buddies.rescind')}
            </button>
          )}
        </div>
      </div>

      <AppOverlay
        open={acceptOpen}
        onOpenChange={setAcceptOpen}
        title={t('social.buddies.acceptTitle')}
        description={t('social.buddies.acceptSubtitle', { name: pair.buddy.displayName })}
        footer={
          <PillButton
            onClick={handleAccept}
            disabled={habitIds.length === 0 || accept.isPending}
            busy={accept.isPending}
            fullWidth
          >
            {t('social.buddies.acceptSubmit')}
          </PillButton>
        }
      >
        <HabitMultiSelect selectedIds={habitIds} onChange={setHabitIds} />
      </AppOverlay>
    </>
  )
}
