import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
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

/** Bottom sheet showing an accepted friend's public profile: avatar/handle, streak, level, and
 *  achievement chips. Falls back to a graceful "unavailable" state on 403/404 or any load failure. */
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
  const { data: view, isLoading, isError } = useFriendProfile(open ? userId : null)

  return (
    <BottomSheetModal open={open} onClose={onClose} title={displayName} snapPoints={['60%', '85%']}>
      <View style={styles.body}>
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={tokens.primary} />
          </View>
        ) : isError || !view ? (
          <View style={styles.centered}>
            <SatelliteGlyph size={84} />
            <Text style={styles.unavailable}>{t('social.friendProfile.unavailable')}</Text>
          </View>
        ) : (
          <>
            <View style={styles.identity}>
              <UserAvatar name={view.displayName} size={72} />
              {view.handle ? <Text style={styles.handle}>@{view.handle}</Text> : null}
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{view.currentStreak}</Text>
                <Text style={styles.statLabel}>{t('profile.publicProfile.view.dayStreakLabel')}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.levelValue}>
                  {t('profile.publicProfile.view.level', { level: view.level })}
                </Text>
              </View>
            </View>

            {view.achievements.length > 0 ? (
              <View style={styles.achievements}>
                <Text style={styles.sectionLabel}>
                  {t('profile.publicProfile.view.achievementsTitle')}
                </Text>
                <View style={styles.chipRow}>
                  {view.achievements.map((achievement) => {
                    const key = `gamification.achievements.${achievement.iconKey}.name`
                    return (
                      <View
                        key={achievement.iconKey}
                        style={[styles.chip, { backgroundColor: tintFromPrimary(tokens, 0.12) }]}
                      >
                        <Text style={styles.chipText}>
                          {i18n.exists(key) ? t(key) : achievement.name}
                        </Text>
                      </View>
                    )
                  })}
                </View>
              </View>
            ) : null}
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
      justifyContent: 'center',
    },
    statValue: {
      fontFamily: 'Rubik_700Bold',
      fontSize: 34,
      color: tokens.fg1,
      fontVariant: ['tabular-nums'],
    },
    statLabel: { fontFamily: 'Rubik_400Regular', fontSize: 13, color: tokens.fg3 },
    levelValue: { fontFamily: 'Rubik_600SemiBold', fontSize: 20, color: tokens.fg1 },
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
  })
}
