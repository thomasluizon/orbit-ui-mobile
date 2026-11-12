import { useMemo } from 'react'
import { useRouter } from 'expo-router'
import { dismissAllSheets } from '@/components/ui/sheet'
import { useTranslation } from 'react-i18next'
import { resolveShellChrome, DESTINATION_ICONS, SHELL_DESTINATION_IDS, SHELL_DESTINATION_PATHS, type ShellDestinationId } from '@orbit/shared/utils'
import { DestinationIcon } from '@/components/navigation/destination-icon'
import { useUIStore } from '@/stores/ui-store'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { BottomTabBar } from './bottom-tab-bar'
import { useRootScrollReselect } from '@/components/shell/root-scroll-context'

export function DestinationTabBar({ pathname, notFound = false }: Readonly<{ pathname: string; notFound?: boolean }>) {
  const router = useRouter()
  const scrollToTop = useRootScrollReselect()
  const lastDestination = useUIStore((s) => s.lastDestination)

  const active = useMemo(
    () => notFound ? '' : resolveShellChrome(pathname, lastDestination).activeId,
    [pathname, lastDestination, notFound],
  )

  const handleTab = (id: string) => {
    if (id === 'hoje') {
      const resetToday = () => {
        scrollToTop?.(id)
        useUIStore.getState().resetToday()
        if (!notFound && pathname === '/') router.setParams({ date: undefined })
        else router.navigate('/(tabs)')
      }
      if (useUIStore.getState().openOverlayIds.length > 0) void dismissAllSheets().then(resetToday)
      else resetToday()
      return
    }
    useUIStore.getState().setAstraConversationOpen(false)
    const rootPath = SHELL_DESTINATION_PATHS[id as ShellDestinationId]
    if (!notFound && id === active && pathname === rootPath) {
      scrollToTop?.(id)
      return
    }
    router.navigate(rootPath)
  }

  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <BottomTabBar activeId={active} onSelect={handleTab} label={t('nav.mainNavigation')}
    items={SHELL_DESTINATION_IDS.map((id) => ({ id, label: t(DESTINATION_ICONS[id].labelKey), icon: ({ active }) => <DestinationIcon destination={id} active={active} color={active ? tokens.primary : tokens.fg3} /> }))} />
}
