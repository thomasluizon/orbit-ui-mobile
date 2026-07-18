import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { ChevronRight } from '@/components/ui/icons'
import type { AccountabilityPair } from '@orbit/shared/types/accountability'
import { formatAPIDate, formatLocaleDate, getAccountabilityErrorKey } from '@orbit/shared/utils'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useAppToast } from '@/hooks/use-app-toast'
import { useCheckInAccountability } from '@/hooks/use-accountability'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface BuddyRowProps {
  pair: AccountabilityPair
}

/** Compact active-pair row: cadence, both sides' last check-in, quick check-in, tap to open detail. */
export function BuddyRow({ pair }: Readonly<BuddyRowProps>) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const { showSuccess, showError } = useAppToast()
  const checkIn = useCheckInAccountability()

  const today = formatAPIDate(new Date())
  const checkedInToday = pair.myLastCheckInDate === today

  function formatSide(date: string | null): string {
    if (!date) return t('social.buddies.never')
    return formatLocaleDate(date, locale, { month: 'short', day: 'numeric' })
  }

  const status = t('social.buddies.checkInStatus', {
    you: formatSide(pair.myLastCheckInDate),
    name: pair.buddy.displayName,
    buddy: formatSide(pair.buddyLastCheckInDate),
  })

  async function handleCheckIn() {
    try {
      await checkIn.mutateAsync({ pairId: pair.id })
      showSuccess(t('social.buddies.checkInSuccess'))
    } catch (error: unknown) {
      showError(t(getAccountabilityErrorKey(error)))
    }
  }

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('social.buddies.openPairAria', { name: pair.buddy.displayName })}
        onPress={() => router.push(`/accountability-pair?pairId=${pair.id}`)}
        style={styles.identityPress}
      >
        <UserAvatar name={pair.buddy.displayName} />
        <View style={styles.identity}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {pair.buddy.displayName}
            </Text>
            <View style={styles.cadencePill}>
              <Text style={styles.cadenceText}>{t(`social.buddies.cadence.${pair.cadence}`)}</Text>
            </View>
          </View>
          <Text style={styles.sub} numberOfLines={1}>
            {status}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('social.buddies.checkInAction')}
        onPress={() => void handleCheckIn()}
        disabled={checkedInToday || checkIn.isPending}
        hitSlop={{ top: 7, bottom: 7 }}
        style={({ pressed }) => [
          styles.checkIn,
          { backgroundColor: checkedInToday ? tokens.bgElev : tintFromPrimary(tokens, 0.12) },
          pressed ? styles.checkInPressed : null,
        ]}
      >
        <Text style={[styles.checkInText, { color: checkedInToday ? tokens.fg3 : tokens.primary }]}>
          {checkedInToday ? t('social.buddies.checkedInLabel') : t('social.buddies.checkInAction')}
        </Text>
      </Pressable>
      <ChevronRight size={20} color={tokens.fg4} strokeWidth={1.8} />
    </View>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    identityPress: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    identity: { flex: 1, gap: 2 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    name: { flexShrink: 1, fontFamily: 'Rubik_500Medium', fontSize: 15, color: tokens.fg1 },
    cadencePill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: tokens.bgElev,
    },
    cadenceText: { fontFamily: 'Rubik_500Medium', fontSize: 11, color: tokens.fg3 },
    sub: { fontFamily: 'Rubik_400Regular', fontSize: 13, color: tokens.fg3 },
    checkIn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
    checkInPressed: { transform: [{ scale: 0.96 }] },
    checkInText: { fontFamily: 'Rubik_500Medium', fontSize: 14 },
  })
}
