import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { FriendFeedItem } from '@orbit/shared/types/social'
import { UserAvatar } from '@/components/ui/user-avatar'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2 } from '@/lib/theme'
import { typeRoleStyle } from '@/lib/type-roles'
import { useAppTheme } from '@/lib/use-app-theme'
import type { CheerTarget } from './cheer-composer'
import type { ProfileTarget } from './friend-profile-sheet'

interface FeedEventCardProps {
  item: FriendFeedItem
  onCheer: (target: CheerTarget) => void
  onOpenProfile: (target: ProfileTarget) => void
}

/** One warm activity-feed row (streak kept / achievement / completion milestone). The identity opens
 *  the actor's friend profile; the Cheer action stays a separate, non-overlapping hit target. */
export function FeedEventCard({ item, onCheer, onOpenProfile }: Readonly<FeedEventCardProps>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
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
          item.achievementId && i18n.exists(key) ? t(key) : t('social.feed.achievementGeneric')
        return t('social.feed.achievementUnlocked', { name, achievement })
      }
    }
  }

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('social.feed.viewProfile', { name })}
        onPress={() => onOpenProfile({ userId: item.actorUserId, displayName: name })}
        style={({ pressed }) => [styles.identity, pressed ? styles.identityPressed : null]}
      >
        <UserAvatar name={name} />
        <Text style={[typeRoleStyle('body', tokens), styles.text]}>{eventText()}</Text>
      </Pressable>
      <PillButton
        variant="ghost"
        size="sm"
        onPress={() => onCheer({ recipientId: item.actorUserId, displayName: name })}
      >
        {t('social.feed.cheerAction')}
      </PillButton>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  identity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
  },
  identityPressed: { opacity: 0.7 },
  text: { flex: 1 },
})
