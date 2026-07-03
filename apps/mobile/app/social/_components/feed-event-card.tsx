import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { FriendFeedItem } from '@orbit/shared/types/social'
import { UserAvatar } from '@/components/ui/user-avatar'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import type { CheerTarget } from './cheer-composer'
import { FriendProfileSheet } from './friend-profile-sheet'

interface FeedEventCardProps {
  item: FriendFeedItem
  onCheer: (target: CheerTarget) => void
}

/** One warm activity-feed row (streak kept / achievement / completion milestone). The identity opens
 *  the actor's friend profile; the Cheer action stays a separate, non-overlapping hit target. */
export function FeedEventCard({ item, onCheer }: Readonly<FeedEventCardProps>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
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
        onPress={() => setProfileOpen(true)}
        style={({ pressed }) => [styles.identity, pressed ? styles.identityPressed : null]}
      >
        <UserAvatar name={name} />
        <Text style={styles.text}>{eventText()}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => onCheer({ recipientId: item.actorUserId, displayName: name })}
        hitSlop={{ top: 7, bottom: 7 }}
        style={({ pressed }) => [styles.cheer, pressed ? styles.cheerPressed : null]}
      >
        <Text style={styles.cheerText}>{t('social.feed.cheerAction')}</Text>
      </Pressable>

      <FriendProfileSheet
        userId={item.actorUserId}
        displayName={name}
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
      />
    </View>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
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
    text: { flex: 1, fontFamily: 'Rubik_400Regular', fontSize: 15, lineHeight: 21, color: tokens.fg1 },
    cheer: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: tintFromPrimary(tokens, 0.12),
    },
    cheerPressed: { transform: [{ scale: 0.96 }] },
    cheerText: { fontFamily: 'Rubik_500Medium', fontSize: 14, color: tokens.primary },
  })
}
