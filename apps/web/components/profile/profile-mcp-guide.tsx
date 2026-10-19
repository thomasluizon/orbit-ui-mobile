'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getMcpEndpointUrl } from '@orbit/shared/utils/advanced-settings'
import { accountEventApiBase } from '@/lib/account-event-api-base'
import { PillButton } from '@/components/ui/pill-button'
import { Sheet, useSheetHost } from '@/components/ui/sheet'

function McpWebSheet({ onClose }: Readonly<{ onClose: () => void }>) {
  const t = useTranslations()
  const copyMessageId = useId()
  const { sheetRef, closeSheet } = useSheetHost()
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle')
  const endpoint = getMcpEndpointUrl(accountEventApiBase())

  async function copyEndpoint() {
    if (copyState === 'copying') return
    setCopyState('copying')
    try {
      await navigator.clipboard.writeText(endpoint)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
  }

  return (
    <Sheet
      ref={sheetRef}
      title={t('orbitMcp.claudeWeb')}
      onClose={onClose}
      actions={<>
        <PillButton variant="ghost" size="sm" onClick={() => closeSheet()}>{t('orbitMcp.done')}</PillButton>
        <span aria-live="polite">
          <PillButton descriptionId={copyMessageId} size="sm" loading={copyState === 'copying'} disabled={copyState === 'copying'} onClick={() => void copyEndpoint()}>
            {copyState === 'copied' ? t('orbitMcp.copied') : t('orbitMcp.copy')}
          </PillButton>
        </span>
      </>}
    >
      <div className="flex min-w-0 max-w-prose flex-col" style={{ gap: 24 }}>
        <p className="font-sans text-[16px] leading-[1.55] text-[var(--fg-2)] [text-wrap:pretty]">{t('orbitMcp.webInstructions')}</p>
        <ol className="flex list-decimal flex-col font-sans text-[16px] leading-[1.55] text-[var(--fg-1)]" style={{ gap: 12, paddingInlineStart: 24 }}>
          <li>{t('orbitMcp.webStep1')}</li>
          <li>{t('orbitMcp.webStep2')}</li>
          <li>{t('orbitMcp.webStep3')}</li>
          <li>{t('orbitMcp.webStep4')}</li>
        </ol>
        <div className="flex min-w-0 flex-col">
          <code dir="ltr" translate="no" className="break-all font-mono text-[12px] leading-[1.4] text-[var(--fg-2)]">{endpoint}</code>
          <p id={copyMessageId} role="status" className="font-sans text-[14px] leading-[1.55] text-[var(--status-bad-text)]" style={{ paddingTop: copyState === 'error' ? 12 : 0 }}>{copyState === 'error' ? t('orbitMcp.copyError') : ''}</p>
        </div>
        <p className="font-sans text-[14px] leading-[1.55] text-[var(--fg-3)] [text-wrap:pretty]">{t('orbitMcp.webNoApiKey')}</p>
      </div>
    </Sheet>
  )
}

export function ProfileMcpGuide() {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  return (
    <div className="flex min-w-0 flex-col items-start">
      <PillButton variant="ghost" size="sm" expanded={open} onClick={() => setOpen(true)}>{t('orbitMcp.connectionInstructions')}</PillButton>
      {open ? <McpWebSheet onClose={() => setOpen(false)} /> : null}
    </div>
  )
}
