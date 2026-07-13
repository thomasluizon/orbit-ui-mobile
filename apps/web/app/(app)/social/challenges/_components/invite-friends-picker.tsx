'use client'

import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useFriends } from '@/hooks/use-friends'

interface InviteFriendsPickerProps {
  selectedIds: string[]
  onToggle: (userId: string) => void
}

/** Multi-select over the user's accepted friends, used to invite them when creating a challenge. */
export function InviteFriendsPicker({ selectedIds, onToggle }: Readonly<InviteFriendsPickerProps>) {
  const t = useTranslations()
  const { data } = useFriends()
  const friends = data?.friends ?? []
  const selectedIdSet = new Set(selectedIds)

  if (friends.length === 0) {
    return (
      <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-3)' }}>
        {t('challenges.invite.empty')}
      </p>
    )
  }

  return (
    <div className="flex flex-col" style={{ gap: 2 }}>
      {friends.map((friend) => {
        const active = selectedIdSet.has(friend.userId)
        return (
          <button
            key={friend.userId}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(friend.userId)}
            className="flex items-center rounded-[12px] transition-[background-color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)]"
            style={{
              gap: 12,
              padding: '10px 4px',
              border: 0,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <UserAvatar name={friend.displayName} size={36} />
            <span
              className="flex-1 min-w-0 truncate"
              style={{ fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--fg-1)' }}
            >
              {friend.displayName}
            </span>
            <span
              aria-hidden="true"
              className="inline-flex shrink-0 items-center justify-center"
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                background: active ? 'var(--primary)' : 'transparent',
                boxShadow: active ? 'none' : 'inset 0 0 0 1.5px var(--hairline-strong)',
                color: 'var(--fg-on-primary)',
              }}
            >
              {active ? <Check size={14} strokeWidth={2.5} /> : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}
