import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { achievementEmoji, ApiClientError } from '@orbit/shared/utils'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useFriendProfile } from '@/hooks/use-friends'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface FriendProfileSheetProps {
  userId: string | null
  displayName: string
  open: boolean
  onClose: () => void
}

function sectionEntrance(index: number) {
  return FadeInDown.duration(220)
    .delay(index * 60)
    .reduceMotion(ReduceMotion.System)
}

/** Bottom sheet showing an accepted friend's public profile: avatar/handle, streak, level, and
 *  achievement chips. Renders the permanent "unavailable" state on 403/404 or a missing view,
 *  and a retryable error state on transient failures. */
export function FriendProfileSheet({
  userId,
  displayName,
  open,
  onClose,
}: Readonly<FriendProfileSheetProps>) {
  const { t, i18n } = useTranslation()
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
    <BottomSheetModal open={open} onClose={onClose} title={displayName} snapPoints={['60%', '85%']}>
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
          <>
            <Animated.View entering={sectionEntrance(0)} style={styles.identity}>
              <UserAvatar name={view.displayName} size={72} />
              {view.handle ? <Text style={styles.handle}>@{view.handle}</Text> : null}
            </Animated.View>

            <Animated.View entering={sectionEntrance(1)} style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{view.currentStreak}</Text>
                <Text style={styles.statLabel}>{t('profile.publicProfile.view.dayStreakLabel')}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{view.level}</Text>
                <Text style={styles.statLabel}>{t('social.friendProfile.levelLabel')}</Text>
              </View>
            </Animated.View>

            <Animated.View entering={sectionEntrance(2)} style={styles.achievements}>
              <Text style={styles.sectionLabel}>
                {t('profile.publicProfile.view.achievementsTitle')}
              </Text>
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
                        <Text style={styles.chipText}>
                          {`${achievementEmoji(achievement.iconKey)} ${label}`}
                        </Text>
                      </View>
                    )
                  })}
                </View>
              ) : (
                <Text style={styles.noAchievements}>{t('social.friendProfile.noAchievements')}</Text>
              )}
            </Animated.View>
          </>
        )}
      </View>
    </BottomSheetModal>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    body: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 28, gap: 16 },
    centered: { alignItems: 'center', justifyContent: 'center', gap: 14, paddingVertical: 48 },
    unavailable: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 15,
      lineHeight: 22,
      color: tokens.fg3,
      textAlign: 'center',
    },
    identity: { alignItems: 'center', gap: 8 },
    handle: { fontFamily: 'Roboto_400Regular', fontSize: 14, color: tokens.fg3 },
    statsRow: { flexDirection: 'row', gap: 12 },
    statCard: {
      flex: 1,
      borderRadius: 18,
      backgroundColor: tokens.bgElev,
      borderWidth: 1,
      borderColor: tokens.hairline,
      paddingVertical: 18,
      paddingHorizontal: 18,
      gap: 4,
    },
    statValue: {
      fontFamily: 'Inter_700Bold',
      fontSize: 34,
      lineHeight: 34,
      color: tokens.fg1,
      fontVariant: ['tabular-nums'],
    },
    statLabel: { fontFamily: 'Rubik_400Regular', fontSize: 13, color: tokens.fg3 },
    achievements: {
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
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
    chipText: { fontFamily: 'Rubik_400Regular', fontSize: 13, color: tokens.fg2 },
    noAchievements: { fontFamily: 'Rubik_400Regular', fontSize: 13, color: tokens.fg4 },
  })
}
