import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { AppBar } from '@/components/ui/app-bar'
import { Search } from '@/components/ui/icons'
import { Button } from '@/components/ui/pill-button'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function SearchHeaderAction() {
  const router = useRouter()
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <Button variant="ghost" size="sm" iconOnly label={t('habits.search.title')} onClick={() => router.push('/search')}><Search size={20} color={tokens.fg1} /></Button>
}

const HEADER_KEYS: Record<string, string> = { '/': 'nav.today', '/calendar': 'nav.calendar', '/progress': 'nav.progress' }

export function SearchHeader({ pathname }: Readonly<{ pathname: string }>) {
  const { t } = useTranslation()
  const title = HEADER_KEYS[pathname]
  if (!title) return null
  return <AppBar title={t(title)} action={<SearchHeaderAction />} />
}
