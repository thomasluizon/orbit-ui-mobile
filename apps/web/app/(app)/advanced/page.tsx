'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle,
  Clock,
  List,
  RotateCcw,
  ChevronDown,
  Plus,
  Lock,
  Smartphone,
} from 'lucide-react'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { useIsDesktop } from '@/components/goals/use-is-desktop'
import { useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { useTranslations, useLocale } from 'next-intl'
import {
  buildMcpConfigJson,
  MCP_CONFIG_TABS,
  MCP_ENDPOINT_URL,
  WIDGET_FEATURES,
  WIDGET_STEP_KEYS,
} from '@orbit/shared/utils/advanced-settings'
import { useProfile } from '@/hooks/use-profile'
import { ProBadge } from '@/components/ui/pro-badge'
import { AppOverlay } from '@/components/ui/app-overlay'
import { Chip } from '@/components/ui/chip'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CreateApiKeyModal } from '@/components/ui/create-api-key-modal'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useApiKeyManagement } from '@/hooks/use-api-key-management'
import {
  ApiKeyCard,
  CodeWell,
  QueryStateMessage,
  SubsectionTitle,
  copyToClipboard,
} from '@/components/advanced/advanced-sections'

export default function AdvancedPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const { profile } = useProfile()
  const queryClient = useQueryClient()

  const [showWidgetInfo, setShowWidgetInfo] = useState(false)

  const {
    apiKeysQuery,
    capabilitiesQuery,
    apiKeys,
    scopeOptions,
    canCreateKey,
    canCreateScopedKey,
    createKeyModalOpen,
    setCreateKeyModalOpen,
    createKeyError,
    revokingKeyId,
    setRevokingKeyId,
    revokeKeyMutation,
    handleCreateKey,
  } = useApiKeyManagement({
    hasProAccess: profile?.hasProAccess ?? false,
    queryClient,
    t,
  })

  const isDesktop = useIsDesktop()
  const [instructionsToggled, setInstructionsToggled] = useState<boolean | null>(null)
  const instructionsOpen = instructionsToggled ?? isDesktop
  const [activeConfigTab, setActiveConfigTab] = useState<(typeof MCP_CONFIG_TABS)[number]>('web')
  const [configCopied, setConfigCopied] = useState(false)
  const [endpointCopied, setEndpointCopied] = useState(false)

  const mcpConfigJson = buildMcpConfigJson()

  async function copyConfig() {
    const didCopy = await copyToClipboard(mcpConfigJson)
    if (!didCopy) return
    setConfigCopied(true)
    setTimeout(() => setConfigCopied(false), 2000)
  }

  async function copyEndpoint() {
    const didCopy = await copyToClipboard(MCP_ENDPOINT_URL)
    if (!didCopy) return
    setEndpointCopied(true)
    setTimeout(() => setEndpointCopied(false), 2000)
  }

  function formatKeyDate(dateStr: string): string {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true, locale: dateFnsLocale })
  }

  return (
    <div className="md:mx-auto md:max-w-[760px]">
      <div className="flex flex-col min-h-[100dvh]">
        <AppBar
          back
          backLabel={t('common.backToProfile')}
          onBack={() => goBackOrFallback('/profile')}
          title={t('advancedSettings.title')}
        />
        <div className="flex-1 min-h-0 overflow-y-auto stagger-enter">
          <div className="md:grid md:grid-cols-2 md:gap-x-10 md:items-start">
            <div>
              <SectionLabel>{t('advancedSettings.widgetSection')}</SectionLabel>
              <SettingsRow
                label={t('profile.widgetTitle')}
                desc={t('profile.widgetHint')}
                icon={Smartphone}
                accessory="chevron"
                onClick={() => setShowWidgetInfo(true)}
                divider={false}
              />

              <SectionLabel trailing={<ProBadge />}>{t('orbitMcp.title')}</SectionLabel>
              <div style={{ padding: '0 20px 14px' }}>
                {!profile?.hasProAccess && (
                  <div className="flex items-center justify-end" style={{ marginBottom: 8 }}>
                    <Link href="/upgrade" className="chip min-h-[44px]">
                      <Lock size={14} strokeWidth={1.8} aria-hidden="true" />
                      {t('common.proBadge')}
                    </Link>
                  </div>
                )}

                <p className="t-secondary" style={{ color: 'var(--fg-3)' }}>
                  {t('orbitMcp.description')}
                </p>
              </div>
              {profile?.hasProAccess && (
                <div className="px-5 space-y-3" style={{ paddingBottom: 8 }}>
                  <div className="flex items-center justify-between">
                    <SubsectionTitle>{t('orbitMcp.apiKeys')}</SubsectionTitle>
                    {canCreateKey && (
                      <button
                        type="button"
                        disabled={!canCreateScopedKey}
                        aria-label={t('orbitMcp.createKey')}
                        className="chip chip-active min-h-[44px] disabled:cursor-not-allowed disabled:opacity-40"
                        onClick={() => setCreateKeyModalOpen(true)}
                      >
                        <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
                        {t('orbitMcp.createKeyShort')}
                      </button>
                    )}
                  </div>

                  <p
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: 'var(--fg-3)',
                    }}
                  >
                    {t('orbitMcp.apiKeysDescription')}
                  </p>

                  {!canCreateKey && (
                    <p
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: 13,
                        fontWeight: 500,
                        color: 'var(--status-overdue-text)',
                      }}
                    >
                      {t('orbitMcp.maxKeysReached')}
                    </p>
                  )}

                  {apiKeysQuery.isLoading && (
                    <div className="space-y-2">
                      <div className="h-16 w-full bg-[var(--bg-card)] rounded-[16px] animate-pulse" />
                      <div className="h-16 w-full bg-[var(--bg-card)] rounded-[16px] animate-pulse" />
                    </div>
                  )}

                  {(apiKeysQuery.error || capabilitiesQuery.error) &&
                    !apiKeysQuery.isLoading &&
                    !capabilitiesQuery.isLoading && (
                      <QueryStateMessage tone="error">
                        {t('orbitMcp.apiKeysError')}
                      </QueryStateMessage>
                    )}

                  {!apiKeysQuery.isLoading && !apiKeysQuery.error && apiKeys.length === 0 && (
                    <QueryStateMessage tone="empty">
                      {t('orbitMcp.noKeys')}
                    </QueryStateMessage>
                  )}

                  {apiKeys.length > 0 && (
                    <div className="space-y-2 stagger-enter">
                      {apiKeys.map((key) => (
                        <ApiKeyCard
                          key={key.id}
                          apiKey={key}
                          t={t}
                          formatKeyDate={formatKeyDate}
                          onRevoke={setRevokingKeyId}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {profile?.hasProAccess && (
              <div className="px-5 space-y-3 border-t border-[var(--hairline)] pt-4 md:border-t-0 md:pt-6">
                  <button
                    type="button"
                    className="group flex w-full cursor-pointer items-center justify-between border-0 bg-transparent transition-[background-color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] active:bg-[var(--bg-elev-pressed)]"
                    style={{ padding: '4px 0' }}
                    onClick={() => setInstructionsToggled(!instructionsOpen)}
                    aria-expanded={instructionsOpen}
                    aria-controls="mcp-instructions"
                  >
                    <SubsectionTitle>{t('orbitMcp.connectionInstructions')}</SubsectionTitle>
                    <ChevronDown
                      size={20}
                      strokeWidth={1.8}
                      color="var(--fg-3)"
                      className={`transition-transform duration-[var(--dur-base)] ease-[var(--ease-standard)] ${
                        instructionsOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  <div className={`collapsible ${instructionsOpen ? 'is-open' : ''}`}>
                    <div id="mcp-instructions" className="space-y-3">
                      <div className="flex gap-2">
                        {MCP_CONFIG_TABS.map((tab) => (
                          <Chip
                            key={tab}
                            active={activeConfigTab === tab}
                            onClick={() => setActiveConfigTab(tab)}
                          >
                            {tab === 'web'
                              ? t('orbitMcp.claudeWeb')
                              : t('orbitMcp.claudeCode')}
                          </Chip>
                        ))}
                      </div>

                      {activeConfigTab === 'web' ? (
                        <div className="space-y-2.5">
                          <p className="t-secondary" style={{ color: 'var(--fg-3)' }}>
                            {t('orbitMcp.webInstructions')}
                          </p>
                          <ol className="t-secondary list-decimal list-inside space-y-2">
                            <li>{t('orbitMcp.webStep1')}</li>
                            <li>{t('orbitMcp.webStep2')}</li>
                            <li>{t('orbitMcp.webStep3')}</li>
                            <li>{t('orbitMcp.webStep4')}</li>
                          </ol>
                          <CodeWell
                            content={MCP_ENDPOINT_URL}
                            copied={endpointCopied}
                            onCopy={() => {
                              void copyEndpoint()
                            }}
                            copyLabel={t('orbitMcp.copy')}
                            copiedLabel={t('orbitMcp.copied')}
                          />
                          <p className="t-secondary" style={{ color: 'var(--fg-3)' }}>
                            {t('orbitMcp.webNoApiKey')}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          <p className="t-secondary" style={{ color: 'var(--fg-3)' }}>
                            {t('orbitMcp.configInstructions')}
                          </p>
                          <CodeWell
                            content={mcpConfigJson}
                            copied={configCopied}
                            onCopy={() => {
                              void copyConfig()
                            }}
                            copyLabel={t('orbitMcp.copy')}
                            copiedLabel={t('orbitMcp.copied')}
                          />
                          <p className="t-secondary" style={{ color: 'var(--fg-3)' }}>
                            {t('orbitMcp.replaceKey')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
              </div>
            )}
          </div>
          <div style={{ height: 24 }} />
        </div>

        <AppOverlay
          open={showWidgetInfo}
          onOpenChange={setShowWidgetInfo}
          title={t('profile.widgetTitle')}
        >
          <div className="space-y-5" style={{ paddingBottom: 8 }}>
            <div>
              <h3
                style={{
                  marginBottom: 8,
                  fontFamily: 'var(--font-sans)',
                  fontSize: 15,
                  fontWeight: 500,
                  color: 'var(--fg-1)',
                }}
              >
                {t('profile.widgetHow.title')}
              </h3>
              <ol className="space-y-2" style={{ fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.55, color: 'var(--fg-2)' }}>
                {WIDGET_STEP_KEYS.map((stepKey, index) => (
                  <li key={stepKey} className="flex gap-2">
                    <span
                      className="shrink-0"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 500,
                        color: 'var(--primary)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {index + 1}.
                    </span>
                    <span>{t(stepKey)}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h3
                style={{
                  marginBottom: 8,
                  fontFamily: 'var(--font-sans)',
                  fontSize: 15,
                  fontWeight: 500,
                  color: 'var(--fg-1)',
                }}
              >
                {t('profile.widgetHow.featuresTitle')}
              </h3>
              <ul className="space-y-2" style={{ fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.55, color: 'var(--fg-2)' }}>
                {WIDGET_FEATURES.map((feature) => {
                  const icon = {
                    checkCircle: <CheckCircle size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-[var(--primary)]" />,
                    clock: <Clock size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-[var(--primary)]" />,
                    list: <List size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-[var(--primary)]" />,
                    rotateCcw: <RotateCcw size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-[var(--primary)]" />,
                  }[feature.iconKey]

                  return (
                    <li key={feature.textKey} className="flex items-start gap-2">
                      {icon}
                      <span>{t(feature.textKey)}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </AppOverlay>

        <CreateApiKeyModal
          open={createKeyModalOpen}
          onOpenChange={setCreateKeyModalOpen}
          onCreateKey={handleCreateKey}
          availableScopes={scopeOptions}
          apiError={createKeyError}
        />

        <ConfirmDialog
          open={revokingKeyId !== null}
          onOpenChange={(open) => {
            if (!open) setRevokingKeyId(null)
          }}
          title={t('orbitMcp.revoke')}
          description={t('orbitMcp.revokeConfirm')}
          cancelLabel={t('orbitMcp.cancel')}
          confirmLabel={t('orbitMcp.confirm')}
          variant="danger"
          onConfirm={() => {
            if (revokingKeyId) revokeKeyMutation.mutate(revokingKeyId)
          }}
        />
      </div>
    </div>
  )
}
