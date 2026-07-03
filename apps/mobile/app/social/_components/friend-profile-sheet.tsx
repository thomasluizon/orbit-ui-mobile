import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { Users } from 'lucide-react-native'
import type { FriendProfileView } from '@orbit/shared/types/social'
import { achievementEmoji, ApiClientError, capitalizeFirstLetter, formatLocaleDate } from '@orbit/shared/utils'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { StatTile } from '@/components/ui/stat-tile'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useFriendProfile } from '@/hooks/use-friends'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export interface ProfileTarget {
  userId: string
  displayName: string
}

interface FriendProfileSheetProps {
  userId: string | null
  displayName: string
  open: boolean
  onClose: () => void
}

type Tokens = ReturnType<typeof createTokensV2>

function sectionEntrance(index: number) {
  return FadeInDown.duration(220)
    .delay(index * 60)
    .reduceMotion(ReduceMotion.System)
}

function buildDayLabels(count: number, locale: string): { key: string; label: string }[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'narrow' })
  const base = new Date()
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(base)
    date.setDate(base.getDate() - (count - 1 - index))
    return { key: date.toISOString().slice(0, 10), label: formatter.format(date) }
  })
}

/** Bottom sheet showing an accepted friend's rich profile: identity, stat tiles, a 7-day activity
 *  strip, top habits, any shared accountability or challenge context, and achievement chips. Renders
 *  the permanent "unavailable" state on 403/404 or a missing view, and a retryable transient error. */
export function FriendProfileSheet({
  userId,
  displayName,
  open,
  onClose,
}: Readonly<FriendProfileSheetProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const { data: view, isLoading, isError, error, refetch } = useFriendProfile(open ? userId : null)

  const missingView = !isError && !view
  const isPermanentError =
    isError &&
    error instanceof ApiClientError &&
    (error.status === 403 || error.status === 404)
  const profileUnavailable = missingView || isPermanentError

  return (
    <BottomSheetModal open={open} onClose={onClose} title={displayName} snapPoints={['70%', '90%']}>
      <View style={styles.body}>
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={tokens.primary} accessibilityLabel={t('common.loading')} />
          </View>
        ) : isError || !view ? (
          <View style={styles.centered}>
            {profileUnavailable ? <SatelliteGlyph size={84} /> : null}
            <Text style={styles.unavailable}>
              {t(
                profileUnavailable
                  ? 'social.friendProfile.unavailable'
                  : 'social.friendProfile.loadError',
              )}
            </Text>
            {profileUnavailable ? null : (
              <PillButton variant="ghost" onPress={() => void refetch()}>
                {t('common.retry')}
              </PillButton>
            )}
          </View>
        ) : (
          <ProfileBody view={view} tokens={tokens} styles={styles} />
        )}
      </View>
    </BottomSheetModal>
  )
}

function ProfileBody({
  view,
  tokens,
  styles,
}: Readonly<{ view: FriendProfileView; tokens: Tokens; styles: ReturnType<typeof createStyles> }>) {
  const { t, i18n } = useTranslation()

  const friendsSince = view.friendsSinceUtc
    ? capitalizeFirstLetter(
        formatLocaleDate(view.friendsSinceUtc, i18n.language, { month: 'long', year: 'numeric' }),
      )
    : null
  const hasSharedContext = view.isAccountabilityPartner || view.sharedChallenges.length > 0

  return (
    <>
      <Animated.View entering={sectionEntrance(0)} style={styles.identity}>
        <UserAvatar name={view.displayName} size={72} />
        {view.handle ? <Text style={styles.handle}>@{view.handle}</Text> : null}
        {friendsSince ? (
          <Text style={styles.meta}>{t('social.friendProfile.friendsSince', { date: friendsSince })}</Text>
        ) : null}
      </Animated.View>

      <Animated.View entering={sectionEntrance(1)} style={styles.statsGrid}>
        <StatTile emoji="🔥" value={view.currentStreak} label={t('profile.publicProfile.view.dayStreakLabel')} style={styles.statTile} />
        <StatTile emoji="🥇" value={view.longestStreak} label={t('social.friendProfile.longestStreakLabel')} style={styles.statTile} />
        <StatTile emoji="🏆" value={view.level} label={view.levelTitle} style={styles.statTile} />
        <StatTile emoji="✨" value={view.totalXp} label={t('social.friendProfile.xpLabel')} style={styles.statTile} />
      </Animated.View>

      <Animated.View entering={sectionEntrance(2)} style={styles.card}>
        <Text style={styles.sectionLabel}>{t('social.friendProfile.activityLabel')}</Text>
        <ActivityStrip counts={view.weeklyActivity} locale={i18n.language} tokens={tokens} styles={styles} />
      </Animated.View>

      {view.topHabits.length > 0 ? (
        <Animated.View entering={sectionEntrance(3)} style={styles.card}>
          <Text style={styles.sectionLabel}>{t('profile.publicProfile.view.topHabitsTitle')}</Text>
          <View style={styles.habitList}>
            {view.topHabits.map((habit) => (
              <View key={habit.title} style={styles.habitRow}>
                <View style={styles.emojiWell}>
                  <Text style={styles.emojiWellText}>{habit.emoji ?? '🎯'}</Text>
                </View>
                <Text style={styles.habitTitle} numberOfLines={1}>
                  {habit.title}
                </Text>
                <Text style={styles.habitMeta}>{`🔥 ${habit.completionCount}`}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      ) : null}

      {hasSharedContext ? (
        <Animated.View entering={sectionEntrance(4)} style={styles.card}>
          {view.isAccountabilityPartner ? (
            <View style={styles.partnerRow}>
              <Users size={18} color={tokens.primary} />
              <Text style={styles.partnerText}>{t('social.friendProfile.accountabilityPartner')}</Text>
            </View>
          ) : null}
          {view.sharedChallenges.length > 0 ? (
            <View style={view.isAccountabilityPartner ? styles.sharedChallengesBlock : undefined}>
              <Text style={styles.sectionLabel}>{t('social.friendProfile.sharedChallengesTitle')}</Text>
              {view.sharedChallenges.map((challenge) => (
                <Text key={challenge.id} style={styles.challengeTitle}>
                  {challenge.title}
                </Text>
              ))}
            </View>
          ) : null}
        </Animated.View>
      ) : null}

      <Animated.View entering={sectionEntrance(5)} style={styles.card}>
        <Text style={styles.sectionLabel}>{t('profile.publicProfile.view.achievementsTitle')}</Text>
        {view.achievements.length > 0 ? (
          <View style={styles.chipRow}>
            {view.achievements.map((achievement) => {
              const key = `gamification.achievements.${achievement.iconKey}.name`
              const label = i18n.exists(key) ? t(key) : achievement.name
              return (
                <View
                  key={achievement.iconKey}
                  style={[styles.chip, { backgroundColor: tintFromPrimary(tokens, 0.12) }]}
                >
                  <Text style={styles.chipText}>{`${achievementEmoji(achievement.iconKey)} ${label}`}</Text>
                </View>
              )
            })}
          </View>
        ) : (
          <Text style={styles.noAchievements}>{t('social.friendProfile.noAchievements')}</Text>
        )}
      </Animated.View>
    </>
  )
}

function ActivityStrip({
  counts,
  locale,
  tokens,
  styles,
}: Readonly<{ counts: number[]; locale: string; tokens: Tokens; styles: ReturnType<typeof createStyles> }>) {
  const days = buildDayLabels(counts.length, locale)
  return (
    <View style={styles.activityStrip}>
      {days.map((day, index) => (
        <View key={day.key} style={styles.activityCell}>
          <View
            style={[
              styles.activityBar,
              { backgroundColor: counts[index]! > 0 ? tintFromPrimary(tokens, 0.9) : tokens.statusEmpty },
            ]}
          />
          <Text style={styles.activityDay}>{day.label}</Text>
        </View>
      ))}
    </View>
  )
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    body: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 28, gap: 14 },
    centered: { alignItems: 'center', justifyContent: 'center', gap: 14, paddingVertical: 48 },
    unavailable: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 22,
      color: tokens.fg3,
      textAlign: 'center',
    },
    identity: { alignItems: 'center', gap: 6 },
    handle: { fontFamily: 'Roboto_400Regular', fontSize: 14, color: tokens.fg3 },
    meta: { fontFamily: 'Rubik_400Regular', fontSize: 13, color: tokens.fg3 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    statTile: { flexBasis: '46%', flexGrow: 1 },
    card: {
      borderRadius: 18,
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
      padding: 18,
      gap: 12,
    },
    sectionLabel: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 13,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: tokens.fg3,
    },
    activityStrip: { flexDirection: 'row', gap: 6 },
    activityCell: { flex: 1, alignItems: 'center', gap: 6 },
    activityBar: { height: 30, width: 22, borderRadius: 7 },
    activityDay: { fontFamily: 'Rubik_400Regular', fontSize: 11, color: tokens.fg4 },
    habitList: { gap: 12 },
    habitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    emojiWell: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: tokens.bgField,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emojiWellText: { fontSize: 18 },
    habitTitle: { flex: 1, fontFamily: 'Rubik_400Regular', fontSize: 15, color: tokens.fg1 },
    habitMeta: {
      fontFamily: 'Roboto_400Regular',
      fontSize: 13,
      color: tokens.fg3,
      fontVariant: ['tabular-nums'],
    },
    partnerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    partnerText: { fontFamily: 'Rubik_400Regular', fontSize: 15, color: tokens.fg1 },
    sharedChallengesBlock: { marginTop: 14, gap: 12 },
    challengeTitle: { fontFamily: 'Rubik_400Regular', fontSize: 15, color: tokens.fg1 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
    chipText: { fontFamily: 'Rubik_400Regular', fontSize: 13, color: tokens.fg2 },
    noAchievements: { fontFamily: 'Rubik_400Regular', fontSize: 13, color: tokens.fg4 },
  })
}
