'use client'

import { useTranslations } from 'next-intl'
import { useDesktopUpdateStore } from '@/stores/desktop-update-store'
import { ActionRow } from '@/components/ui/action-row'
import { PillButton } from '@/components/ui/pill-button'

export function DesktopUpdateNotice() {
  const t = useTranslations()
  const { notice, restart, later } = useDesktopUpdateStore()
  if (!notice) return null
  const busy = notice.phase === 'downloading' || notice.phase === 'installing'
  const message = notice.phase === 'failed' ? t('desktopUpdate.failed')
    : notice.phase === 'downloading' ? t('desktopUpdate.downloading')
    : notice.phase === 'installing' ? t('desktopUpdate.installing') : t('forceUpdate.banner')
  return <div data-desktop-update={notice.kind} data-update-phase={notice.phase} className="rounded-[var(--r-card)] bg-[var(--bg-elev)] p-4 text-[var(--fg-1)]">
    <ActionRow>
      <p className="min-w-0 flex-1 basis-[240px] text-sm font-medium leading-[1.4]">{message}</p>
      {!busy && <PillButton size="sm" variant="ghost" onClick={() => later?.()}>{t('versionUpdate.laterCta')}</PillButton>}
      <PillButton size="sm" variant="ghost" disabled={busy} onClick={() => restart?.()}>
        {notice.phase === 'failed' ? t('common.retry') : t('versionUpdate.restartCta')}
      </PillButton>
    </ActionRow>
  </div>
}
