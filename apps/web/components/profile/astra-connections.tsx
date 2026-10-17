'use client'

import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
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
  const t = useTranslations()
  const value = controller.connection.isLoading ? t('common.loading') : t(notionConnectionLabel(controller.connection.data))
  return <ListRow textMode="label" compact titleTranslate="no" title={t('profile.connections.notion')}
        icon={hasProAccess ? <FileText size={24} strokeWidth={1.8} /> : <Lock size={24} strokeWidth={1.8} />}
        value={hasProAccess ? value : undefined} wrapValue
        trailing={hasProAccess ? undefined : <ProBadge alwaysVisible />} chevron={hasProAccess}
        onClick={hasProAccess ? onOpen : onUpgrade} />
}

export function AstraConnections({ hasProAccess }: Readonly<{ hasProAccess: boolean }>) {
  const t = useTranslations()
  const params = useSearchParams()
  const [callbackFailed, setCallbackFailed] = useAccountScopedState(params.get('notionError') === '1')
  const router = useRouter()
  const controller = useNotionConnectionController(hasProAccess)
  const [open, setOpen] = useAccountScopedState(false)
  const [launchFailed, setLaunchFailed] = useAccountScopedState(false)
  const onUpgrade = () => router.push('/upgrade?from=%2Fprofile%2Fastra')
  const connect = (ready: (url: string) => void) => {
    if (!controller.isOnline || controller.authorize.isPending) return
    setLaunchFailed(false)
    setCallbackFailed(false)
    controller.authorize.mutate(undefined, { onSuccess: (response) => ready(response.authorizeUrl) })
  }
  const openUrl = (url: string) => { try { window.location.assign(url) } catch { setLaunchFailed(true) } }
  const error = [callbackFailed, launchFailed, controller.connection.isError].some(Boolean)
  return <section className="flex min-w-0 flex-col" style={{ gap: 8 }}>
    <h2 className="font-sans text-sm font-medium text-[var(--fg-2)]">{t('profile.connections.title')}</h2>
    <SettingsGroup>
      <ListRow textMode="label" compact icon={<Calendar size={24} strokeWidth={1.8} />} title={t('profile.connections.googleCalendar')}
        href="/calendar?import=1" />
      {controller.visible ? <NotionConnectionRow controller={controller} hasProAccess={hasProAccess} onUpgrade={onUpgrade}
        onOpen={() => { controller.authorize.reset(); controller.disconnect.reset(); setOpen(true) }} /> : null}
    </SettingsGroup>
    <p role="status" className="text-sm text-[var(--status-bad-text)]">{error && controller.enabled ? t('profile.connections.error') : ''}</p>
    {open && controller.enabled ? <NotionConnectionSheet callbackFailed={callbackFailed} controller={controller} onClose={() => { controller.authorize.reset(); setOpen(false) }} onAuthorize={connect} onOpenUrl={openUrl} /> : null}
  </section>
}
