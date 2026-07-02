'use client'

import { useTranslations } from 'next-intl'
import type { FriendFeedItem } from '@orbit/shared/types/social'
import { UserAvatar } from '@/components/ui/user-avatar'
import type { CheerTarget } from './cheer-composer'

interface FeedEventCardProps {
  item: FriendFeedItem
  onCheer: (target: CheerTarget) => void
}

/** One warm activity-feed row (streak kept / achievement / completion milestone) with a Cheer action. */
export function FeedEventCard({ item, onCheer }: Readonly<FeedEventCardProps>) {
  const t = useTranslations()
  const name = item.actorDisplayName

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
      <UserAvatar name={name} />
      <p
        className="flex-1 min-w-0"
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
    </div>
  )
}
