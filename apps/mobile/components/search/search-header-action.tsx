import { Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { AppBar } from '@/components/ui/app-bar'
import { Search } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function SearchHeaderAction() {
  const router = useRouter()
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <Pressable accessibilityRole="button" accessibilityLabel={t('habits.search.title')} onPress={() => router.push('/search')} style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? tokens.bgHover : 'transparent', borderRadius: 999 })}><Search size={20} color={tokens.fg3} /></Pressable>
}

const HEADER_KEYS: Record<string, string> = { '/': 'nav.today', '/calendar': 'nav.calendar', '/progress': 'nav.progress' }

export function SearchHeader({ pathname }: Readonly<{ pathname: string }>) {
  const { t } = useTranslation()
  const title = HEADER_KEYS[pathname]
  if (!title) return null
  return <AppBar title={t(title)} action={<SearchHeaderAction />} />
}
