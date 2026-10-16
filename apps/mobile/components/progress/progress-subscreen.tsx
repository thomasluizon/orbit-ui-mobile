import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { ProgressSubmenuId } from '@orbit/shared/utils/progress-navigation'
import { PageHeader } from '@/components/ui/page-header'
import { useShellPageEnd } from '@/components/shell/shell-scroller-clearance'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export function ProgressSubscreen({ screen, children }: Readonly<{ screen: ProgressSubmenuId; children: ReactNode }>) {
  const router = useRouter()
  const { t } = useTranslation()
  const pageEnd = useShellPageEnd()
  const theme = useAppTheme()
  const tokens = createTokensV2(theme.currentScheme, theme.currentTheme)
  return <SafeAreaView edges={pageEnd.safeAreaEdges} style={[styles.root, { backgroundColor: tokens.bg }]}>
    <View style={styles.column} testID={`progress-screen-${screen}`}>
      <PageHeader title={t(`progressScreen.sections.${screen}`)} backLabel={t('progressScreen.back')} onBack={() => router.dismissTo('/progress')} />
      {children}
    </View>
  </SafeAreaView>
}

const styles = StyleSheet.create({
  root: { flex: 1, minWidth: 0 },
  column: { flex: 1, minWidth: 0, width: '100%', maxWidth: 740, alignSelf: 'center' },
})
