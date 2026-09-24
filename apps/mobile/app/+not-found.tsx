import { ScrollView, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { PillLink } from '@/components/ui/pill-button'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { errorSurfaceStyles as styles } from '@/components/ui/error-surface-styles'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export default function NotFoundScreen() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return (
    <ScrollView style={{ backgroundColor: tokens.bg }} contentContainerStyle={styles.root}>
      <OrbitMark size={40} />
      <Text accessibilityRole="header" style={[styles.title, { color: tokens.fg1 }]}>{t('notFoundPage.title')}</Text>
      <Text style={[styles.body, { color: tokens.fg2 }]}>{t('notFoundPage.description')}</Text>
      <PillLink href="/">{t('notFoundPage.action')}</PillLink>
    </ScrollView>
  )
}
