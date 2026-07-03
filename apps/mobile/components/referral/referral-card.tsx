import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ChevronRight, UserPlus, X } from 'lucide-react-native'
import { useReferral } from '@/hooks/use-referral'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ReferralCardProps {
  onOpen: () => void
  /** When provided, the card shows a dismiss control instead of the chevron (the dismissible Today entry). */
  onDismiss?: () => void
}

/** Kit referral entry card: primary-tinted icon disc, title, progress line, and either a chevron or a dismiss control. */
export function ReferralCard({ onOpen, onDismiss }: Readonly<ReferralCardProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { stats, isLoading } = useReferral()

  let desc = t('referral.card.hint')
  if (!isLoading && stats) {
    desc = t('referral.card.progress', {
      count: stats.successfulReferrals,
      max: stats.maxReferrals,
    })
  }

  return (
    <View style={styles.cardWrap}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={t('referral.card.title')}
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
          <UserPlus size={22} strokeWidth={1.8} color={tokens.primarySoft} />
        </View>
        <View style={styles.body}>
          <Text style={[styles.title, { color: tokens.fg1 }]}>
            {t('referral.card.title')}
          </Text>
          <Text style={[styles.desc, { color: tokens.fg3 }]}>{desc}</Text>
        </View>
        {onDismiss ? (
          <Pressable
            onPress={onDismiss}
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
        ) : (
          <ChevronRight size={22} strokeWidth={1.8} color={tokens.fg4} />
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
