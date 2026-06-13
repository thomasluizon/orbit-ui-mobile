'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  CheckCircle,
  Clock,
  List,
  RotateCcw,
  ChevronRight,
  ChevronDown,
  Clipboard,
  Check,
  Plus,
  Lock,
  Smartphone,
} from 'lucide-react'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { aiKeys, apiKeyKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { useProfile } from '@/hooks/use-profile'
import { ProBadge } from '@/components/ui/pro-badge'
import { AppOverlay } from '@/components/ui/app-overlay'
import { Chip } from '@/components/ui/chip'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CreateApiKeyModal } from '@/components/ui/create-api-key-modal'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import type {
  AgentCapability,
  ApiKey,
  ApiKeyCreateRequest,
} from '@orbit/shared/types'
import { createApiKey, revokeApiKey } from '@/app/actions/api-keys'

async function fetchApiKeys(): Promise<ApiKey[]> {
  const res = await fetch(API.apiKeys.list)
  if (!res.ok) {
    throw new Error('Failed to load API keys')
  }
  return res.json()
}

async function fetchCapabilities(): Promise<AgentCapability[]> {
  const res = await fetch(API.ai.capabilities)
  if (!res.ok) {
    throw new Error('Failed to load AI capabilities')
  }
  return res.json()
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
  }
}

function CodeWell({
  content,
  copyButton,
}: Readonly<{ content: string; copyButton: React.ReactNode }>) {
  return (
    <div className="relative">
      <pre
        className="overflow-x-auto rounded-[14px] bg-[var(--bg-field)]"
        style={{
          padding: '14px 16px',
          boxShadow: 'inset 0 0 0 1px var(--hairline)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12.5,
          lineHeight: 1.6,
          color: 'var(--fg-2)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {content}
      </pre>
      {copyButton}
    </div>
  )
}

function CopyIconButton({
  copied,
  onClick,
  ariaLabel,
}: Readonly<{ copied?: boolean; onClick: () => void; ariaLabel: string }>) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className="icon-btn icon-btn-well absolute"
      style={{ top: 8, right: 8, width: 36, height: 36, color: 'var(--fg-2)' }}
      onClick={onClick}
    >
      {copied ? (
        <Check size={18} strokeWidth={1.8} color="var(--status-done)" />
      ) : (
        <Clipboard size={18} strokeWidth={1.8} />
      )}
    </button>
  )
}

function SubsectionTitle({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <h2
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 16,
        fontWeight: 500,
        letterSpacing: '-0.01em',
        color: 'var(--fg-1)',
      }}
    >
      {children}
    </h2>
  )
}

export default function AdvancedPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const { profile } = useProfile()
  const queryClient = useQueryClient()

  const [showWidgetInfo, setShowWidgetInfo] = useState(false)

  const apiKeysQuery = useQuery({
    queryKey: apiKeyKeys.lists(),
    queryFn: fetchApiKeys,
    enabled: profile?.hasProAccess ?? false,
    staleTime: 5 * 60 * 1000,
  })

  const capabilitiesQuery = useQuery({
    queryKey: aiKeys.capabilities(),
    queryFn: fetchCapabilities,
    enabled: profile?.hasProAccess ?? false,
    staleTime: 5 * 60 * 1000,
  })

  const apiKeys = apiKeysQuery.data ?? []
  const scopeOptions = useMemo(() => {
    const grouped = new Map<string, string[]>()

    for (const capability of capabilitiesQuery.data ?? []) {
      const descriptions = grouped.get(capability.scope) ?? []
      descriptions.push(capability.displayName)
      grouped.set(capability.scope, descriptions)
    }

    return Array.from(grouped.entries())
      .map(([scope, labels]) => ({
        scope,
        label: scope,
        description: labels.join(', '),
      }))
      .sort((left, right) => left.scope.localeCompare(right.scope))
  }, [capabilitiesQuery.data])
  const MAX_API_KEYS = 5
  const canCreateKey = apiKeys.length < MAX_API_KEYS
  const canCreateScopedKey =
    canCreateKey &&
    !capabilitiesQuery.isLoading &&
    !capabilitiesQuery.error &&
    scopeOptions.length > 0

  const [createKeyModalOpen, setCreateKeyModalOpen] = useState(false)
  const [createKeyError, setCreateKeyError] = useState<string | null>(null)
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null)

  const revokeKeyMutation = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => {
      setRevokingKeyId(null)
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
    },
  })

  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [activeConfigTab, setActiveConfigTab] = useState<(typeof MCP_CONFIG_TABS)[number]>('web')
  const [configCopied, setConfigCopied] = useState(false)

  const mcpConfigJson = buildMcpConfigJson()

  async function copyConfig() {
    await copyToClipboard(mcpConfigJson)
    setConfigCopied(true)
    setTimeout(() => setConfigCopied(false), 2000)
  }

  function formatKeyDate(dateStr: string): string {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true, locale: dateFnsLocale })
  }

  async function handleCreateKey(request: ApiKeyCreateRequest) {
    setCreateKeyError(null)
    try {
      const result = await createApiKey(request)
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
      return result
    } catch {
      setCreateKeyError(t('orbitMcp.createKeyError'))
      return null
    }
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <AppBar
        back
        backLabel={t('common.backToProfile')}
        onBack={() => goBackOrFallback('/profile')}
        title={t('advancedSettings.title')}
      />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <SectionLabel>{t('advancedSettings.widgetSection')}</SectionLabel>
        <button
          type="button"
          onClick={() => setShowWidgetInfo(true)}
          aria-haspopup="dialog"
          aria-expanded={showWidgetInfo}
          aria-controls="widget-info-dialog"
          aria-label={t('profile.widgetTitle')}
          className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent text-left transition-[background-color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] active:bg-[var(--bg-elev-pressed)]"
          style={{ padding: '16px 20px', gap: 14, minHeight: 56 }}
        >
          <span className="flex min-w-0 flex-1 items-center" style={{ gap: 14 }}>
            <span
              className="flex shrink-0 items-center justify-center"
              style={{ width: 26 }}
              aria-hidden="true"
            >
              <Smartphone size={22} strokeWidth={1.8} color="var(--fg-1)" />
            </span>
            <span className="flex min-w-0 flex-col" style={{ gap: 3 }}>
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 18,
                  lineHeight: 1.25,
                  color: 'var(--fg-1)',
                }}
              >
                {t('profile.widgetTitle')}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                  lineHeight: 1.35,
                  color: 'var(--fg-3)',
                }}
              >
                {t('profile.widgetHint')}
              </span>
            </span>
          </span>
          <ChevronRight size={22} strokeWidth={1.8} color="var(--fg-3)" />
        </button>

        <SectionLabel trailing={<ProBadge />}>{t('orbitMcp.title')}</SectionLabel>
        <div style={{ padding: '0 20px 14px' }}>
          {!profile?.hasProAccess && (
            <div className="flex items-center justify-end" style={{ marginBottom: 8 }}>
              <Link href="/upgrade" className="chip">
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
          <div className="px-5 space-y-4" style={{ paddingBottom: 8 }}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <SubsectionTitle>{t('orbitMcp.apiKeys')}</SubsectionTitle>
                  {canCreateKey && (
                    <button
                      type="button"
                      disabled={!canCreateScopedKey}
                      className="chip chip-active disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => setCreateKeyModalOpen(true)}
                    >
                      <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
                      {t('orbitMcp.createKey')}
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

                {apiKeysQuery.error && !apiKeysQuery.isLoading && (
                  <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--status-bad)' }}>
                    {t('orbitMcp.apiKeysError')}
                  </p>
                )}

                {capabilitiesQuery.error && !capabilitiesQuery.isLoading && (
                  <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--status-bad)' }}>
                    {t('orbitMcp.apiKeysError')}
                  </p>
                )}

                {!apiKeysQuery.isLoading && !apiKeysQuery.error && apiKeys.length === 0 && (
                  <p
                    className="text-center"
                    style={{
                      padding: '16px 0',
                      fontFamily: 'var(--font-sans)',
                      fontSize: 14,
                      color: 'var(--fg-3)',
                    }}
                  >
                    {t('orbitMcp.noKeys')}
                  </p>
                )}

                {apiKeys.length > 0 && (
                  <div className="space-y-2 stagger-enter">
                    {apiKeys.map((key) => {
                      const scopes = Array.isArray(key.scopes) ? key.scopes : []
                      const isReadOnly = key.isReadOnly ?? false
                      const expiresAtUtc = key.expiresAtUtc ?? null

                      return (
                      <div
                        key={key.id}
                        className="rounded-[16px] bg-[var(--bg-card)] space-y-2"
                        style={{
                          padding: '14px 16px',
                          boxShadow: 'inset 0 0 0 1px var(--hairline)',
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p
                              className="truncate"
                              style={{
                                fontFamily: 'var(--font-sans)',
                                fontSize: 15,
                                fontWeight: 500,
                                color: 'var(--fg-1)',
                              }}
                            >
                              {key.name}
                            </p>
                            <p
                              style={{
                                marginTop: 3,
                                fontFamily: 'var(--font-mono)',
                                fontSize: 13,
                                color: 'var(--fg-2)',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {key.keyPrefix}...
                            </p>
                            <p
                              style={{
                                marginTop: 4,
                                fontFamily: 'var(--font-mono)',
                                fontSize: 11,
                                letterSpacing: '0.02em',
                                color: 'var(--fg-3)',
                              }}
                            >
                              {scopes.length > 0 ? scopes.join(', ') : t('orbitMcp.noScopes')}
                            </p>
                          </div>
                          <div
                            className="shrink-0 text-right"
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 11,
                              lineHeight: 1.6,
                              letterSpacing: '0.02em',
                              color: 'var(--fg-3)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            <p>{t('orbitMcp.created')} {formatKeyDate(key.createdAtUtc)}</p>
                            <p>
                              {t('orbitMcp.lastUsed')}{' '}
                              {key.lastUsedAtUtc ? formatKeyDate(key.lastUsedAtUtc) : t('orbitMcp.never')}
                            </p>
                            <p>
                              {isReadOnly ? t('orbitMcp.permReadOnly') : t('orbitMcp.permReadWrite')}
                            </p>
                            {expiresAtUtc && (
                              <p>{t('orbitMcp.expiresOn', { date: formatKeyDate(expiresAtUtc) })}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="button"
                            className="chip"
                            style={{ color: 'var(--status-bad)' }}
                            onClick={() => setRevokingKeyId(key.id)}
                          >
                            {t('orbitMcp.revoke')}
                          </button>
                        </div>
                      </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-3" style={{ borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
                <button
                  type="button"
                  className="group flex w-full cursor-pointer items-center justify-between border-0 bg-transparent transition-opacity duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:opacity-80 active:opacity-70"
                  style={{ padding: '4px 0' }}
                  onClick={() => setInstructionsOpen(!instructionsOpen)}
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

                {instructionsOpen && (
                  <div id="mcp-instructions" className="space-y-3">
                    <div className="flex gap-2">
                      {MCP_CONFIG_TABS.map((tab) => {
                        let tabLabel = t('orbitMcp.claudeCode')
                        if (tab === 'web') {
                          tabLabel = t('orbitMcp.claudeWeb')
                        } else if (tab === 'desktop') {
                          tabLabel = t('orbitMcp.claudeDesktop')
                        }

                        return (
                          <Chip
                            key={tab}
                            active={activeConfigTab === tab}
                            onClick={() => setActiveConfigTab(tab)}
                          >
                            {tabLabel}
                          </Chip>
                        )
                      })}
                    </div>

                    {activeConfigTab === 'web' ? (
                      <div className="space-y-3">
                        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5, color: 'var(--fg-3)' }}>
                          {t('orbitMcp.webInstructions')}
                        </p>
                        <ol
                          className="list-decimal list-inside space-y-2"
                          style={{ fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5, color: 'var(--fg-2)' }}
                        >
                          <li>{t('orbitMcp.webStep1')}</li>
                          <li>{t('orbitMcp.webStep2')}</li>
                          <li>{t('orbitMcp.webStep3')}</li>
                          <li>{t('orbitMcp.webStep4')}</li>
                        </ol>
                        <CodeWell
                          content={MCP_ENDPOINT_URL}
                          copyButton={
                            <CopyIconButton
                              ariaLabel={t('orbitMcp.copy')}
                              onClick={() => copyToClipboard(MCP_ENDPOINT_URL)}
                            />
                          }
                        />
                        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5, color: 'var(--fg-3)' }}>
                          {t('orbitMcp.webNoApiKey')}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5, color: 'var(--fg-3)' }}>
                          {t('orbitMcp.configInstructions')}
                        </p>
                        <CodeWell
                          content={mcpConfigJson}
                          copyButton={
                            <CopyIconButton
                              ariaLabel={t('orbitMcp.copyConfig')}
                              copied={configCopied}
                              onClick={() => {
                                void copyConfig()
                              }}
                            />
                          }
                        />
                        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5, color: 'var(--fg-3)' }}>
                          {t('orbitMcp.replaceKey')}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
          </div>
        )}
        <div style={{ height: 24 }} />
      </div>

      <AppOverlay
        open={showWidgetInfo}
        onOpenChange={setShowWidgetInfo}
        title={t('profile.widgetTitle')}
      >
        <div id="widget-info-dialog" className="space-y-5" style={{ paddingBottom: 8 }}>
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
  )
}
