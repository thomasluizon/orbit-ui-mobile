import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronRight, Trophy } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** Tappable card on the Social screen that routes into the dedicated challenges surface. */
export function ChallengesEntryCard() {
  const { t } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('challenges.entryCard.title')}
        onPress={() => router.push('/social/challenges')}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: pressed ? tokens.bgElev : tokens.bgCard,
            borderColor: pressed ? tokens.hairlineStrong : tokens.hairline,
          },
          pressed ? styles.pressed : null,
        ]}
      >
        <View style={[styles.iconDisc, { backgroundColor: tintFromPrimary(tokens, 0.14) }]}>
          <Trophy size={22} strokeWidth={1.8} color={tokens.primarySoft} />
        </View>
        <View style={styles.textBlock}>
          <Text style={[styles.title, { color: tokens.fg1 }]}>{t('challenges.entryCard.title')}</Text>
          <Text style={[styles.desc, { color: tokens.fg3 }]}>
            {t('challenges.entryCard.description')}
          </Text>
        </View>
        <ChevronRight size={22} strokeWidth={1.8} color={tokens.fg4} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  pressed: { transform: [{ scale: 0.99 }] },
  iconDisc: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontFamily: 'Rubik_500Medium', fontSize: 16 },
  desc: { fontFamily: 'Rubik_400Regular', fontSize: 13, lineHeight: 18 },
})
