import { ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { AppBar } from '@/components/ui/app-bar'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ChallengeDetail } from './_components/challenge-detail'

export default function ChallengeDetailScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const params = useLocalSearchParams<{ id?: string }>()
  const id = typeof params.id === 'string' ? params.id : ''
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <AppBar
        back
        onBack={() => goBackOrFallback('/social/challenges')}
        title={t('challenges.title')}
        backLabel={t('common.goBack')}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ChallengeDetail challengeId={id} onLeft={() => router.replace('/social/challenges')} />
      </ScrollView>
    </SafeAreaView>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: tokens.bg },
    scroll: { paddingBottom: 40 },
  })
}
