import { useAccountScopedState } from '@/hooks/use-session-reset'
import { Text, View, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useNotionConnectionController } from './astra-settings-controller'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { PillButton } from '@/components/ui/pill-button'

interface NotionConnectionSheetProps {
  callbackFailed: boolean
  controller: ReturnType<typeof useNotionConnectionController>
  onClose: () => void
  onAuthorize: (open: (url: string) => void) => void
  onOpenUrl: (url: string) => void
}

function NotionConnectionDetails({ controller }: Readonly<Pick<NotionConnectionSheetProps, 'controller'>>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { connection } = controller
  const current = connection.data
  const reconnect = current?.status === 'ReconnectRequired'
  const hasConnection = current?.connected || reconnect
  return <>{connection.isLoading ? <Text style={[styles.body, { color: tokens.fg2 }]} >{t('common.loading')}</Text> : hasConnection ? <>
          {current.workspaceName ? <PersonalTextDetails textStyle={styles.workspace}>{current.workspaceName}</PersonalTextDetails> : null}
          {current.lastPollAtUtc ? <Text style={[styles.body, { color: tokens.fg2 }]} >{t('profile.connections.lastSync', { time: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(current.lastPollAtUtc)) })}</Text> : <Text style={[styles.body, { color: tokens.fg2 }]} >{t('profile.connections.awaitingSync')}</Text>}
          {reconnect ? <Text style={[styles.body, { color: tokens.fg2 }]} >{t('profile.connections.renew')}</Text> : null}
        </> : <Text style={[styles.body, { color: tokens.fg2 }]} >{t('profile.connections.description')}</Text>}</>
}

export function NotionConnectionSheet({ callbackFailed, controller, onClose, onAuthorize, onOpenUrl }: Readonly<NotionConnectionSheetProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { sheetRef, closeSheet } = useSheetHost()
  const [leaving, setLeaving] = useAccountScopedState(false)
  const [confirming, setConfirming] = useAccountScopedState(false)
  const { connection, authorize, disconnect, isOnline } = controller
  const current = connection.data
  const reconnect = current?.status === 'ReconnectRequired'
  const hasConnection = current?.connected || reconnect
  const busy = authorize.isPending || disconnect.isPending || leaving
  const disabled = !isOnline || busy || connection.isLoading || connection.isError
  const connect = () => onAuthorize((url) => { setLeaving(true); closeSheet(() => { onClose(); onOpenUrl(url) }) })
  const actionKey = reconnect ? 'reconnect' : hasConnection ? 'choosePages' : 'connect'
  const error = [callbackFailed, connection.isError, authorize.isError, disconnect.isError, current?.status === 'TransientError'].some(Boolean)
  const actions = <>
    {hasConnection ? <PillButton variant="ghost" disabled={!isOnline || busy} onClick={() => setConfirming(true)}>{t('profile.connections.disconnect')}</PillButton> : null}
    {connection.isError ? <PillButton disabled={!isOnline || connection.isFetching} loading={connection.isFetching} onClick={() => void connection.refetch()}>{t('common.retry')}</PillButton>
      : <PillButton disabled={disabled} loading={authorize.isPending || leaving} onClick={connect}>{t(`profile.connections.${actionKey}`)}</PillButton>}
  </>
  return <>
    <Sheet ref={sheetRef} title={t('profile.connections.notion')}  onClose={onClose} actions={actions}>
      <View style={{ gap: 16 }}>
        <NotionConnectionDetails controller={controller} />
        <Text accessibilityLiveRegion="polite" style={[styles.body, { color: tokens.statusBadText }]}>{error ? t('profile.connections.error') : ''}</Text>
        {!isOnline ? <Text style={[styles.body, { color: tokens.fg2 }]} >{t('profile.connections.offline')}</Text> : null}
      </View>
    </Sheet>
    <ConfirmSheet open={confirming && isOnline} destructive title={t('profile.connections.disconnectTitle')}
      message={t('profile.connections.disconnectBody')} confirmLabel={t('profile.connections.disconnect')}
      onCancel={() => setConfirming(false)} onConfirm={() => {
        setConfirming(false)
        if (isOnline && !disconnect.isPending) disconnect.mutate(getAccountGeneration())
      }} />
  </>
}

const styles = StyleSheet.create({
  body: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
  workspace: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24 },
})
