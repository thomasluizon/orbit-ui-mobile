'use client'

import { notionConnectionSheetState } from '@orbit/shared/types/notion-connection'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useTranslations, useLocale } from 'next-intl'
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

function NotionConnectionDetails({ controller, reconnect, hasConnection }: Readonly<
  Pick<NotionConnectionSheetProps, 'controller'> & Pick<ReturnType<typeof notionConnectionSheetState>, 'reconnect' | 'hasConnection'>
>) {
  const t = useTranslations()
  const locale = useLocale()
  const { connection } = controller
  const current = connection.data
  return <>{connection.isLoading ? <p className="text-sm text-[var(--fg-2)]" >{t('common.loading')}</p> : hasConnection ? <>
          {current?.workspaceName ? <PersonalTextDetails textStyle={{ fontSize: '1rem', lineHeight: 1.5 }}>{current.workspaceName}</PersonalTextDetails> : null}
          {current?.lastPollAtUtc ? <p className="text-sm text-[var(--fg-2)]" >{t('profile.connections.lastSync', { time: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(current.lastPollAtUtc)) })}</p> : <p className="text-sm text-[var(--fg-2)]" >{t('profile.connections.awaitingSync')}</p>}
          {reconnect ? <p className="text-sm text-[var(--fg-2)]" >{t('profile.connections.renew')}</p> : null}
        </> : <p className="text-sm text-[var(--fg-2)]" >{t('profile.connections.description')}</p>}</>
}

export function NotionConnectionSheet({ callbackFailed, controller, onClose, onAuthorize, onOpenUrl }: Readonly<NotionConnectionSheetProps>) {
  const t = useTranslations()
  const { sheetRef, closeSheet } = useSheetHost()
  const [leaving, setLeaving] = useAccountScopedState(false)
  const [confirming, setConfirming] = useAccountScopedState(false)
  const { connection, authorize, disconnect, isOnline } = controller
  const { reconnect, hasConnection, busy, disabled, actionKey, error } = notionConnectionSheetState({ ...controller, leaving, callbackFailed })
  const connect = () => onAuthorize((url) => { setLeaving(true); closeSheet(() => { onClose(); onOpenUrl(url) }) })
  const actions = <>
    {hasConnection ? <PillButton variant="ghost" loading={disconnect.isPending} disabled={!isOnline || busy} onClick={() => setConfirming(true)}>{t('profile.connections.disconnect')}</PillButton> : null}
    {connection.isError ? <PillButton disabled={!isOnline || connection.isFetching} loading={connection.isFetching} onClick={() => void connection.refetch()}>{t('common.retry')}</PillButton>
      : <PillButton disabled={disabled} loading={authorize.isPending || leaving} onClick={connect}>{t(`profile.connections.${actionKey}`)}</PillButton>}
  </>
  return <>
    <Sheet ref={sheetRef} title={t('profile.connections.notion')} titleTranslate="no" onClose={onClose} actions={actions}>
      <div className="flex min-w-0 flex-col" style={{ gap: 16 }}>
        <NotionConnectionDetails controller={controller} reconnect={reconnect} hasConnection={hasConnection} />
        <p role="status" className="text-sm text-[var(--status-bad-text)]">{error ? t('profile.connections.error') : ''}</p>
        {!isOnline ? <p className="text-sm text-[var(--fg-2)]" >{t('profile.connections.offline')}</p> : null}
      </div>
    </Sheet>
    <ConfirmSheet open={confirming && isOnline} destructive title={t('profile.connections.disconnectTitle')}
      message={t('profile.connections.disconnectBody')} confirmLabel={t('profile.connections.disconnect')}
      onCancel={() => setConfirming(false)} onConfirm={() => {
        setConfirming(false)
        if (isOnline && !disconnect.isPending) disconnect.mutate(undefined)
      }} />
  </>
}
