'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { buildMcpConfigJson, MCP_CONFIG_TABS, type McpConfigTab } from '@orbit/shared/utils/advanced-settings'
import { SPACING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { Copy } from '@/components/ui/icons'
import { ActionRow } from '@/components/ui/action-row'
import { Chip } from '@/components/ui/chip'
import { PillButton } from '@/components/ui/pill-button'

function McpCodeConfig({ endpoint }: Readonly<{ endpoint: string }>) {
  const t = useTranslations()
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle')
  const configuration = buildMcpConfigJson(endpoint)

  async function copyConfiguration() {
    if (copyStatus === 'copying') return
    setCopyStatus('copying')
    try {
      await navigator.clipboard.writeText(configuration)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }
  }

  return (
    <div className="flex min-w-0 flex-col" style={{ gap: 12 }}>
      <p className="text-sm leading-[1.5] text-[var(--fg-3)]">{t('orbitMcp.configInstructions')}</p>
      <pre translate="no" className="min-w-0 whitespace-pre-wrap font-mono text-[12px] leading-[1.4] text-[var(--fg-2)] [overflow-wrap:anywhere]">{configuration}</pre>
      <p className="text-sm leading-[1.5] text-[var(--fg-3)]">{t('orbitMcp.replaceKey')}</p>
      <ActionRow>
        <PillButton size="sm" variant="ghost" iconOnly label={t('orbitMcp.copyConfig')} minimumHeight={TOUCH_TARGET_MIN} loading={copyStatus === 'copying'} onClick={() => void copyConfiguration()}><Copy size={24} strokeWidth={1.5} aria-hidden="true" /></PillButton>
      </ActionRow>
      <p role="status" className={`text-sm leading-[1.5] ${copyStatus === 'error' ? 'text-[var(--status-bad-text)]' : 'text-[var(--fg-2)]'}`}>
        {copyStatus === 'error' ? t('orbitMcp.configCopyError') : copyStatus === 'copied' ? t('orbitMcp.copied') : ''}
      </p>
    </div>
  )
}

export function McpCodeClient({ endpoint }: Readonly<{ endpoint: string }>) {
  const t = useTranslations()
  const [activeTab, setActiveTab] = useState<McpConfigTab>('web')

  return (
    <div className="flex min-w-0 flex-col rounded-[12px] bg-[var(--bg-well)]" style={{ gap: 24, padding: SPACING.s16 }}>
      <p className="font-sans text-[14px] font-medium text-[var(--fg-1)]">{t('profile.apiKeys.mcpTitle')}</p>
      <div role="group" aria-label={t('orbitMcp.connectionInstructions')} className="flex flex-wrap" style={{ gap: 12 }}>
        {MCP_CONFIG_TABS.map((tab) => (
          <Chip key={tab} active={activeTab === tab} onClick={() => setActiveTab(tab)}>
            <span translate="no">{tab === 'web' ? t('orbitMcp.claudeWeb') : t('orbitMcp.claudeCode')}</span>
          </Chip>
        ))}
      </div>
      {activeTab === 'web' ? (
        <div className="flex min-w-0 flex-col" style={{ gap: 12 }}>
          <p translate="no" className="break-all font-mono text-[12px] text-[var(--fg-2)]">{endpoint}</p>
          <p className="text-sm leading-[1.5] text-[var(--fg-3)]">{t('orbitMcp.webNoApiKey')}</p>
        </div>
      ) : <McpCodeConfig endpoint={endpoint} />}
    </div>
  )
}
