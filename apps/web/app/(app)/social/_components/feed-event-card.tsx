'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { FriendFeedItem } from '@orbit/shared/types/social'
import { UserAvatar } from '@/components/ui/user-avatar'
import type { CheerTarget } from './cheer-composer'
import { FriendProfileView } from './friend-profile-view'

interface FeedEventCardProps {
  item: FriendFeedItem
  onCheer: (target: CheerTarget) => void
}

/** One warm activity-feed row (streak kept / achievement / completion milestone). The identity opens
 *  the actor's friend profile; the Cheer action stays a separate, non-overlapping hit target. */
export function FeedEventCard({ item, onCheer }: Readonly<FeedEventCardProps>) {
  const t = useTranslations()
  const name = item.actorDisplayName
  const [profileOpen, setProfileOpen] = useState(false)

  function eventText(): string {
    switch (item.type) {
      case 'StreakMilestone':
        return t('social.feed.streakMilestone', { name, count: item.value ?? 0 })
      case 'HabitCompletedMilestone':
        return t('social.feed.habitCompletedMilestone', { name, count: item.value ?? 0 })
      case 'AchievementUnlocked': {
        const key = `gamification.achievements.${item.achievementId}.name`
        const achievement =
          item.achievementId && t.has(key) ? t(key) : t('social.feed.achievementGeneric')
        return t('social.feed.achievementUnlocked', { name, achievement })
      }
    }
  }

  return (
    <div className="flex items-center" style={{ gap: 12, padding: '12px 20px' }}>
      <button
        type="button"
        aria-label={t('social.feed.viewProfile', { name })}
        onClick={() => setProfileOpen(true)}
        className="flex min-w-0 flex-1 cursor-pointer appearance-none items-center rounded-[12px] border-0 bg-transparent p-0 text-left transition-[background-color,transform] hover:bg-[var(--bg-elev)] active:scale-[0.99]"
        style={{ gap: 12 }}
      >
        <UserAvatar name={name} />
        <p
          className="min-w-0 flex-1"
          style={{
            margin: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            lineHeight: 1.4,
            color: 'var(--fg-1)',
          }}
        >
          {eventText()}
        </p>
      </button>
      <button
        type="button"
        onClick={() => onCheer({ recipientId: item.actorUserId, displayName: name })}
        className="touch-target-y shrink-0 cursor-pointer rounded-full transition-[background-color,transform] active:scale-[0.96]"
        style={{
          padding: '7px 14px',
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          fontWeight: 500,
          color: 'var(--primary)',
          background: 'rgba(var(--primary-rgb), 0.12)',
          border: 0,
        }}
      >
        {t('social.feed.cheerAction')}
      </button>

      <FriendProfileView
        userId={item.actorUserId}
        displayName={name}
        open={profileOpen}
        onOpenChange={setProfileOpen}
      />
    </div>
  )
}
