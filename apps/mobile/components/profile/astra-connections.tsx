import { useAccountScopedState } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import { Linking, Text, View, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { notionConnectionLabel } from '@orbit/shared/types/notion-connection'
import { Calendar, FileText, Lock } from '@/components/ui/icons'
import { ListRow } from '@/components/ui/list-row'
import { SettingsGroup } from '@/components/ui/settings-group'
import { ProBadge } from '@/components/ui/pro-badge'
import { useNotionConnectionController } from './astra-settings-controller'
import { NotionConnectionSheet } from './notion-connection-sheet'

interface NotionConnectionRowProps {
  controller: ReturnType<typeof useNotionConnectionController>
  hasProAccess: boolean
  onOpen: () => void
  onUpgrade: () => void
}
function NotionConnectionRow({ controller, hasProAccess, onOpen, onUpgrade }: Readonly<NotionConnectionRowProps>) {
  const { t } = useTranslation()
  const value = controller.connection.isLoading ? t('common.loading') : t(notionConnectionLabel(controller.connection.data))
  return <ListRow textMode="label" compact  title={t('profile.connections.notion')}
        icon={hasProAccess ? <FileText size={24} strokeWidth={1.8} /> : <Lock size={24} strokeWidth={1.8} />}
        value={hasProAccess ? value : undefined} wrapValue
        trailing={hasProAccess ? undefined : <ProBadge alwaysVisible />} chevron={hasProAccess}
        onClick={hasProAccess ? onOpen : onUpgrade} />
}

export function AstraConnections({ hasProAccess }: Readonly<{ hasProAccess: boolean }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const params = useLocalSearchParams<{ notionError?: string }>()
  const [callbackFailed, setCallbackFailed] = useAccountScopedState(params.notionError === '1')
  const router = useRouter()
  const controller = useNotionConnectionController(hasProAccess)
  const [open, setOpen] = useAccountScopedState(false)
  const [launchFailed, setLaunchFailed] = useAccountScopedState(false)
  const onUpgrade = () => router.push(buildUpgradeHref('/profile/astra'))
  const connect = (ready: (url: string) => void) => {
    if (!controller.isOnline || controller.authorize.isPending) return
    setLaunchFailed(false)
    setCallbackFailed(false)
    controller.authorize.mutate(getAccountGeneration(), { onSuccess: (response) => ready(response.authorizeUrl) })
  }
  const openUrl = (url: string) => { void Linking.openURL(url).catch(() => setLaunchFailed(true)) }
  const error = [callbackFailed, launchFailed, controller.connection.isError].some(Boolean)
  return <View style={{ gap: 8 }}>
    <Text accessibilityRole="header" style={[styles.heading, { color: tokens.fg2 }]}>{t('profile.connections.title')}</Text>
    <SettingsGroup>
      <ListRow textMode="label" compact icon={<Calendar size={24} strokeWidth={1.8} />} title={t('profile.connections.googleCalendar')}
        onClick={() => router.push('/calendar?import=1')} />
      {controller.visible ? <NotionConnectionRow controller={controller} hasProAccess={hasProAccess} onUpgrade={onUpgrade}
        onOpen={() => { controller.authorize.reset(); if (!controller.disconnect.isPending) controller.disconnect.reset(); setOpen(true) }} /> : null}
    </SettingsGroup>
    <Text accessibilityLiveRegion="polite" style={[styles.body, { color: tokens.statusBadText }]}>{error && controller.enabled ? t('profile.connections.error') : ''}</Text>
    {open && controller.enabled ? <NotionConnectionSheet callbackFailed={callbackFailed} controller={controller} onClose={() => { controller.authorize.reset(); setOpen(false) }} onAuthorize={connect} onOpenUrl={openUrl} /> : null}
  </View>
}

const styles = StyleSheet.create({
  heading: { fontFamily: 'Geist_500Medium', fontSize: 14 },
  body: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
})
