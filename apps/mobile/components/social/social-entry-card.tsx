import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { ChevronRight, Users, X } from 'lucide-react-native'
import { plural } from '@/lib/plural'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'
import { useFriends } from '@/hooks/use-friends'
import { useProfile } from '@/hooks/use-profile'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/**
 * Today entry to the Social hub. Shows an actionable "friend requests waiting"
 * card whenever requests are pending; otherwise a one-time dismissible
 * "connect with friends" invitation. Renders unconditionally, visibility is
 * arbitrated by useEngagementSlot.
 */
export function SocialEntryCard() {
  const { t } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { profile } = useProfile()
  const socialOptIn = profile?.socialOptIn ?? false
  const { data } = useFriends({ enabled: socialOptIn })
  const pendingRequests = data?.incomingRequests.length ?? 0
  const dismissSocialEntry = useEngagementPromptStore((s) => s.dismissSocialEntry)

  const hasRequests = pendingRequests > 0

  const title = hasRequests
    ? t('social.today.requestsTitle')
    : t('social.today.entryTitle')
  const subtitle = hasRequests
    ? plural(t('social.today.requestsSubtitle', { count: pendingRequests }), pendingRequests)
    : t('social.today.entrySubtitle')

  return (
    <View style={styles.cardWrap}>
      <Pressable
        onPress={() => router.push(hasRequests ? '/social?tab=friends' : '/social')}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: pressed ? tokens.bgElev : tokens.bgCard,
            borderColor: pressed ? tokens.hairlineStrong : tokens.hairline,
          },
          pressed ? styles.cardPressed : null,
        ]}
      >
        <View
          style={[
            styles.iconDisc,
            { backgroundColor: tintFromPrimary(tokens, 0.15) },
          ]}
        >
          <Users size={22} strokeWidth={1.8} color={tokens.primarySoft} />
        </View>
        <View style={styles.body}>
          <Text style={[styles.title, { color: tokens.fg1 }]}>{title}</Text>
          <Text style={[styles.desc, { color: hasRequests ? tokens.fg2 : tokens.fg3 }]}>
            {subtitle}
          </Text>
        </View>
        {hasRequests ? (
          <ChevronRight size={22} strokeWidth={1.8} color={tokens.fg4} />
        ) : (
          <Pressable
            onPress={dismissSocialEntry}
            accessibilityRole="button"
            accessibilityLabel={t('common.dismiss')}
            hitSlop={8}
            style={({ pressed }) => [
              styles.dismissButton,
              pressed ? styles.dismissButtonPressed : null,
            ]}
          >
            <X size={18} strokeWidth={1.8} color={tokens.fg4} />
          </Pressable>
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  cardWrap: {
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  cardPressed: {
    transform: [{ scale: 0.99 }],
  },
  iconDisc: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  dismissButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButtonPressed: {
    opacity: 0.6,
  },
  title: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
  },
  desc: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
  },
})
