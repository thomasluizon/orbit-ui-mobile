import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export default function NotFoundScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View style={[styles.root, { backgroundColor: tokens.bg }]}>
      <SatelliteGlyph size={104} />
      <Text style={[styles.title, { color: tokens.fg1 }]}>{t('notFoundPage.title')}</Text>
      <Text style={[styles.description, { color: tokens.fg2 }]}>
        {t('notFoundPage.description')}
      </Text>
      <View style={styles.cta}>
        <PillButton onPress={() => router.replace('/')}>{t('common.goHome')}</PillButton>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingVertical: 64,
  },
  title: {
    marginTop: 18,
    fontFamily: 'Rubik_500Medium',
    fontSize: 22,
    lineHeight: 29,
    textAlign: 'center',
  },
  description: {
    marginTop: 8,
    maxWidth: 300,
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  cta: {
    marginTop: 24,
  },
})
