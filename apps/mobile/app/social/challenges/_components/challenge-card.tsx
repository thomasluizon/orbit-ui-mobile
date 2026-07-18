import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Flame, Target, Users } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { plural } from '@orbit/shared/utils'
import type { ChallengeListItem } from '@orbit/shared/types/challenge'
import { ProgressBar } from '@/components/ui/progress-bar'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ChallengeCardProps {
  challenge: ChallengeListItem
  onOpen: (id: string) => void
}

/** Compact challenge summary: type badge, member count, and a type-appropriate shared-progress view. */
export function ChallengeCard({ challenge, onOpen }: Readonly<ChallengeCardProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const isCoop = challenge.type === 'CoopGoal'
  const target = challenge.targetCount ?? 0
  const ratio = isCoop && target > 0 ? Math.min(1, challenge.currentProgress / target) : 0

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={challenge.title}
      onPress={() => onOpen(challenge.id)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: tokens.bgCard, borderColor: tokens.hairline },
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: tintFromPrimary(tokens, 0.12) }]}>
          {isCoop ? (
            <Target size={13} strokeWidth={2} color={tokens.primarySoft} />
          ) : (
            <Flame size={13} strokeWidth={2} color={tokens.primarySoft} />
          )}
          <Text style={[styles.badgeText, { color: tokens.primarySoft }]}>
            {isCoop ? t('challenges.type.coopGoal') : t('challenges.type.streakTogether')}
          </Text>
        </View>
        {challenge.isComplete ? (
          <Text style={[styles.completeText, { color: tokens.statusDone }]}>
            {t('challenges.detail.complete')}
          </Text>
        ) : null}
      </View>

      <Text style={[styles.title, { color: tokens.fg1 }]} numberOfLines={1}>
        {challenge.title}
      </Text>

      <View style={styles.metaRow}>
        <Users size={14} strokeWidth={1.8} color={tokens.fg3} />
        <Text style={[styles.metaText, { color: tokens.fg3 }]}>
          {plural(
            t('challenges.card.participants', { count: challenge.participantCount }),
            challenge.participantCount,
          )}
        </Text>
      </View>

      {isCoop ? (
        <View style={styles.progressBlock}>
          <ProgressBar progress={ratio} label={t('challenges.detail.progressLabel')} />
          <Text style={[styles.progressText, { color: tokens.fg3 }]}>
            {challenge.currentProgress} / {target}
          </Text>
        </View>
      ) : (
        <View style={styles.streakRow}>
          <Text style={[styles.streakCount, { color: tokens.fg1 }]}>{challenge.currentProgress}</Text>
          <Text style={[styles.streakUnit, { color: tokens.fg3 }]}>
            {t('challenges.card.streakUnit')}
          </Text>
        </View>
      )}

      {!challenge.hasLinkedHabits ? (
        <Text style={[styles.hint, { color: tokens.primarySoft }]}>
          {t('challenges.card.linkHabitsHint')}
        </Text>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 18, borderWidth: 1 },
  pressed: { transform: [{ scale: 0.98 }] },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  badgeText: { fontFamily: 'Rubik_500Medium', fontSize: 12 },
  completeText: { marginLeft: 'auto', fontFamily: 'Rubik_500Medium', fontSize: 12 },
  title: { fontFamily: 'Rubik_500Medium', fontSize: 17 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  metaText: { fontFamily: 'Rubik_400Regular', fontSize: 13 },
  progressBlock: { marginTop: 12, gap: 6 },
  progressText: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  streakRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 12 },
  streakCount: { fontFamily: 'Inter_700Bold', fontSize: 24, fontVariant: ['tabular-nums'] },
  streakUnit: { fontFamily: 'Rubik_400Regular', fontSize: 13 },
  hint: { marginTop: 10, fontFamily: 'Rubik_400Regular', fontSize: 12 },
})
