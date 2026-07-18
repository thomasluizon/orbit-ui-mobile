'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Search, X } from '@/components/ui/icons'
import type { AccountabilityCadence } from '@orbit/shared/types/accountability'
import { getAccountabilityErrorKey } from '@orbit/shared/utils'
import { AppOverlay } from '@/components/ui/app-overlay'
import { PillButton } from '@/components/ui/pill-button'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useAppToast } from '@/hooks/use-app-toast'
import { useFriends } from '@/hooks/use-friends'
import { useInviteAccountabilityBuddy } from '@/hooks/use-accountability'
import { HabitMultiSelect } from './habit-multi-select'

const CADENCES: AccountabilityCadence[] = ['Daily', 'Weekly']
const FRIEND_SEARCH_THRESHOLD = 6

interface NewPairFlowProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialHabitId?: string | null
}

const fieldLabelStyle = {
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--fg-2)',
} as const

/** Overlay flow to invite a friend: pick friend, pick cadence, pick 1–10 of your habits. */
export function NewPairFlow({ open, onOpenChange, initialHabitId }: Readonly<NewPairFlowProps>) {
  const t = useTranslations()
  const { showSuccess, showError } = useAppToast()
  const { data } = useFriends()
  const friends = data?.friends ?? []
  const invite = useInviteAccountabilityBuddy()

  const [buddyUserId, setBuddyUserId] = useState<string | null>(null)
  const [cadence, setCadence] = useState<AccountabilityCadence>('Daily')
  const [habitIds, setHabitIds] = useState<string[]>(initialHabitId ? [initialHabitId] : [])
  const [friendQuery, setFriendQuery] = useState('')

  const friendSearch = friendQuery.trim().toLowerCase()
  const visibleFriends = friendSearch
    ? friends.filter(
        (friend) =>
          friend.displayName.toLowerCase().includes(friendSearch) ||
          friend.handle.toLowerCase().includes(friendSearch),
      )
    : friends

  const canSubmit =
    buddyUserId !== null && habitIds.length >= 1 && habitIds.length <= 10 && !invite.isPending

  function resetState() {
    setBuddyUserId(null)
    setCadence('Daily')
    setHabitIds(initialHabitId ? [initialHabitId] : [])
    setFriendQuery('')
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetState()
    onOpenChange(next)
  }

  async function handleSubmit() {
    if (!buddyUserId) return
    if (habitIds.length === 0) {
      showError(t('social.buddies.errors.habitRequired'))
      return
    }
    try {
      await invite.mutateAsync({ buddyUserId, cadence, habitIds })
      showSuccess(t('social.buddies.newPair.success'))
      handleOpenChange(false)
    } catch (error: unknown) {
      showError(t(getAccountabilityErrorKey(error)))
    }
  }

  return (
    <AppOverlay
      open={open}
      onOpenChange={handleOpenChange}
      title={t('social.buddies.newPair.title')}
      footer={
        <PillButton onClick={() => void handleSubmit()} disabled={!canSubmit} busy={invite.isPending} fullWidth>
          {t('social.buddies.newPair.submit')}
        </PillButton>
      }
    >
      <div className="flex flex-col" style={{ gap: 18 }}>
        <div className="flex flex-col" style={{ gap: 10 }}>
          <span style={fieldLabelStyle}>{t('social.buddies.newPair.friendLabel')}</span>
          {friends.length === 0 ? (
            <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-3)' }}>
              {t('social.buddies.newPair.noFriends')}
            </p>
          ) : (
            <div className="flex flex-col" style={{ gap: 6 }}>
              {friends.length > FRIEND_SEARCH_THRESHOLD ? (
                <div
                  className="flex items-center"
                  style={{
                    gap: 8,
                    padding: '0 12px',
                    height: 44,
                    borderRadius: 14,
                    background: 'var(--bg-sunk)',
                    boxShadow: 'inset 0 0 0 1px var(--hairline)',
                  }}
                >
                  <Search size={16} strokeWidth={2} style={{ color: 'var(--fg-3)', flexShrink: 0 }} />
                  <input
                    value={friendQuery}
                    onChange={(event) => setFriendQuery(event.target.value)}
                    placeholder={t('social.buddies.newPair.searchFriends')}
                    aria-label={t('social.buddies.newPair.searchFriends')}
                    className="field-ring-flush flex-1 min-w-0 rounded-[8px] bg-transparent"
                    style={{ fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--fg-1)' }}
                  />
                  {friendQuery.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setFriendQuery('')}
                      aria-label={t('common.clear')}
                      className="flex size-10 -my-2.5 -mr-2.5 shrink-0 cursor-pointer items-center justify-center rounded-full"
                      style={{ border: 0, background: 'transparent', color: 'var(--fg-3)' }}
                    >
                      <X size={15} strokeWidth={2} />
                    </button>
                  ) : null}
                </div>
              ) : null}
              {visibleFriends.length === 0 ? (
                <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-3)' }}>
                  {t('social.buddies.newPair.noFriendMatch')}
                </p>
              ) : (
                <div className="flex flex-col" style={{ gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                  {visibleFriends.map((friend) => {
                    const active = friend.userId === buddyUserId
                    return (
                      <button
                        key={friend.userId}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setBuddyUserId(friend.userId)}
                        className="flex items-center cursor-pointer transition-[transform,background-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-standard)] active:scale-[0.99]"
                        style={{
                          gap: 12,
                          padding: '10px 12px',
                          borderRadius: 14,
                          border: 0,
                          textAlign: 'left',
                          background: active ? 'rgba(var(--primary-rgb), 0.12)' : 'var(--bg-elev)',
                          boxShadow: active
                            ? 'inset 0 0 0 1px var(--primary)'
                            : 'inset 0 0 0 1px var(--hairline)',
                        }}
                      >
                        <UserAvatar name={friend.displayName} />
                        <span
                          className="flex-1 min-w-0 truncate"
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontSize: 15,
                            fontWeight: 500,
                            color: active ? 'var(--primary-soft)' : 'var(--fg-1)',
                          }}
                        >
                          {friend.displayName}
                        </span>
                        {active ? <Check size={18} strokeWidth={2} color="var(--primary)" /> : null}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col" style={{ gap: 10 }}>
          <span style={fieldLabelStyle}>{t('social.buddies.newPair.cadenceLabel')}</span>
          <div className="flex" style={{ gap: 8 }}>
            {CADENCES.map((option) => {
              const active = option === cadence
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCadence(option)}
                  className="flex-1 cursor-pointer transition-[transform,background-color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-standard)] active:scale-[0.96]"
                  style={{
                    padding: '12px 14px',
                    borderRadius: 999,
                    border: 0,
                    fontFamily: 'var(--font-sans)',
                    fontSize: 14,
                    fontWeight: 500,
                    color: active ? 'var(--primary-soft)' : 'var(--fg-2)',
                    background: active ? 'rgba(var(--primary-rgb), 0.12)' : 'var(--bg-elev)',
                    boxShadow: active
                      ? 'inset 0 0 0 1px var(--primary)'
                      : 'inset 0 0 0 1px var(--hairline)',
                  }}
                >
                  {t(`social.buddies.cadence.${option}`)}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col" style={{ gap: 10 }}>
          <span style={fieldLabelStyle}>{t('social.buddies.newPair.habitsLabel')}</span>
          <HabitMultiSelect selectedIds={habitIds} onChange={setHabitIds} />
        </div>
      </div>
    </AppOverlay>
  )
}
