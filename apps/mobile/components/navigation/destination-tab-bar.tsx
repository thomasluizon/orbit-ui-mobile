import { useMemo } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { resolveShellDestination } from '@orbit/shared/utils'
import { CalendarDays, ChartLine, Home, User } from '@/components/ui/icons'
import { useUIStore } from '@/stores/ui-store'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { BottomTabBar } from './bottom-tab-bar'

export function DestinationTabBar({ pathname }: Readonly<{ pathname: string }>) {
  const router = useRouter()
  const setActiveView = useUIStore((s) => s.setActiveView)

  const active = useMemo(
    () => resolveShellDestination(pathname),
    [pathname],
  )

  const handleTab = (id: string) => {
    if (id === 'hoje') {
      setActiveView('today')
      router.navigate('/')
      return
    }
    if (id === 'calendario') router.navigate('/calendar')
    else if (id === 'progresso') router.navigate('/progress')
    else router.navigate('/profile')
  }

  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <BottomTabBar activeId={active ?? ''} onSelect={handleTab} label={t('nav.mainNavigation')}
    items={[
      { id: 'hoje', label: t('nav.today'), icon: ({ active }) => <Home size={24} strokeWidth={active ? 2 : 1.5} color={active ? tokens.primary : tokens.fg4} /> },
      { id: 'calendario', label: t('nav.calendar'), icon: ({ active }) => <CalendarDays size={24} strokeWidth={active ? 2 : 1.5} color={active ? tokens.primary : tokens.fg4} /> },
      { id: 'progresso', label: t('nav.progress'), icon: ({ active }) => <ChartLine size={24} strokeWidth={active ? 2 : 1.5} color={active ? tokens.primary : tokens.fg4} /> },
      { id: 'perfil', label: t('nav.profile'), icon: ({ active }) => <User size={24} strokeWidth={active ? 2 : 1.5} color={active ? tokens.primary : tokens.fg4} /> },
    ]} />
}

