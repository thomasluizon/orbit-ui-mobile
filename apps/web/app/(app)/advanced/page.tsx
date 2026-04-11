'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
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
import { apiKeyKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { useProfile } from '@/hooks/use-profile'
import { ProBadge } from '@/components/ui/pro-badge'
import { AppOverlay } from '@/components/ui/app-overlay'
import { CreateApiKeyModal } from '@/components/ui/create-api-key-modal'
import type { ApiKey } from '@orbit/shared/types/api-key'

async function fetchApiKeys(): Promise<ApiKey[]> {
  const res = await fetch(API.apiKeys.list)
  if (!res.ok) return []
  return res.json()
}

async function createApiKey(name: string): Promise<{ id: string; key: string; name: string }> {
  const res = await fetch(API.apiKeys.create, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error('Failed to create API key')
  return res.json()
}

async function revokeApiKey(id: string): Promise<void> {
  const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to revoke API key')
}

// ---------------------------------------------------------------------------
// Standalone helpers (S7721: moved to module scope)
// ---------------------------------------------------------------------------

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Clipboard API not available
  }
}

// ---------------------------------------------------------------------------
// Advanced Settings Page
// ---------------------------------------------------------------------------

export default function AdvancedPage() {
  const t = useTranslations()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const { profile } = useProfile()
  const queryClient = useQueryClient()

  // --- Widget Info ---
  const [showWidgetInfo, setShowWidgetInfo] = useState(false)

  // --- API Keys ---
  const apiKeysQuery = useQuery({
    queryKey: apiKeyKeys.lists(),
    queryFn: fetchApiKeys,
    enabled: profile?.hasProAccess ?? false,
    staleTime: 5 * 60 * 1000,
  })

  const apiKeys = apiKeysQuery.data ?? []
  const MAX_API_KEYS = 5
  const canCreateKey = apiKeys.length < MAX_API_KEYS

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

  // Connection instructions
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

  async function handleCreateKey(name: string) {
    setCreateKeyError(null)
    try {
      const result = await createApiKey(name)
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.all })
      return result
    } catch (err: unknown) {
      setCreateKeyError(err instanceof Error ? err.message : t('apiKeys.errors.create'))
      return null
    }
  }

  return (
    <div className="pb-8">
      <header className="pt-8 pb-6 flex items-center gap-3">
        <Link
          href="/profile"
          aria-label={t('common.backToProfile')}
          className="p-2 -ml-2 text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-[length:var(--text-fluid-2xl)] font-bold text-text-primary tracking-tight">
          {t('advancedSettings.title')}
        </h1>
      </header>

      <div className="space-y-4">
        {/* Widget tip */}
        <button
          className="w-full bg-surface rounded-[var(--radius-xl)] border border-border-muted p-5 flex items-center gap-4 hover:bg-surface-elevated hover:shadow-[var(--shadow-md)] hover:border-border transition-all duration-200 group text-left shadow-[var(--shadow-sm)]"
          onClick={() => setShowWidgetInfo(true)}
          aria-haspopup="dialog"
          aria-expanded={showWidgetInfo}
          aria-controls="widget-info-dialog"
        >
          <div className="shrink-0 flex items-center justify-center bg-primary/10 rounded-[var(--radius-lg)] p-3 transition-colors">
            <Smartphone className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary">{t('profile.widgetTitle')}</p>
            <p className="text-xs text-text-secondary mt-0.5">{t('profile.widgetHint')}</p>
          </div>
          <ChevronRight className="size-4 text-text-muted group-hover:text-text-primary transition-colors shrink-0" />
        </button>

        {/* For Developers */}
        <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">{t('orbitMcp.title')}</h2>
              <ProBadge />
            </div>
            {!profile?.hasProAccess && (
              <Link
                href="/upgrade"
                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80"
              >
                <Lock className="size-3.5" />
                {t('common.proBadge')}
              </Link>
            )}
          </div>

          <p className="text-sm text-text-secondary">{t('orbitMcp.description')}</p>

          {profile?.hasProAccess && (
            <>
              {/* API Keys Sub-section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">{t('orbitMcp.apiKeys')}</h4>
                  {canCreateKey && (
                    <button
                      className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                      onClick={() => setCreateKeyModalOpen(true)}
                    >
                      <Plus className="size-3.5" />
                      {t('orbitMcp.createKey')}
                    </button>
                  )}
                </div>

                <p className="text-xs text-text-muted">{t('orbitMcp.apiKeysDescription')}</p>

                {/* Max keys warning */}
                {!canCreateKey && (
                  <p className="text-xs text-amber-400 font-medium">
                    {t('orbitMcp.maxKeysReached')}
                  </p>
                )}

                {/* Loading state */}
                {apiKeysQuery.isLoading && (
                  <div className="space-y-2">
                    <div className="h-14 w-full bg-surface-elevated rounded-2xl animate-pulse" />
                    <div className="h-14 w-full bg-surface-elevated rounded-2xl animate-pulse" />
                  </div>
                )}

                {/* Error */}
                {apiKeysQuery.error && !apiKeysQuery.isLoading && (
                  <p className="text-xs text-red-400">{t('orbitMcp.apiKeysError')}</p>
                )}

                {/* Empty state */}
                {!apiKeysQuery.isLoading && !apiKeysQuery.error && apiKeys.length === 0 && (
                  <div className="text-center py-4">
                    <p className="text-text-muted text-sm">{t('orbitMcp.noKeys')}</p>
                  </div>
                )}

                {/* Key list */}
                {apiKeys.length > 0 && (
                  <div className="space-y-2">
                    {apiKeys.map((key) => (
                      <div key={key.id} className="rounded-2xl bg-background p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate">{key.name}</p>
                            <p className="text-xs font-mono text-text-muted mt-0.5">{key.keyPrefix}...</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[10px] text-text-muted">{t('orbitMcp.created')} {formatKeyDate(key.createdAtUtc)}</p>
                            <p className="text-[10px] text-text-muted">
                              {t('orbitMcp.lastUsed')}{' '}
                              {key.lastUsedAtUtc ? formatKeyDate(key.lastUsedAtUtc) : t('orbitMcp.never')}
                            </p>
                          </div>
                        </div>

                        {/* Revoke */}
                        {revokingKeyId === key.id ? (
                          /* Revoke: confirmation state */
                          <div className="flex items-center justify-between rounded-xl bg-red-500/5 border border-red-500/20 px-3 py-2">
                            <p className="text-xs text-red-400">{t('orbitMcp.revokeConfirm')}</p>
                            <div className="flex items-center gap-2 shrink-0 ml-3">
                              <button
                                className="text-xs font-semibold text-text-muted hover:text-text-primary transition-colors"
                                onClick={() => setRevokingKeyId(null)}
                              >
                                {t('orbitMcp.cancel')}
                              </button>
                              <button
                                className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors"
                                onClick={() => revokeKeyMutation.mutate(key.id)}
                              >
                                {t('orbitMcp.confirm')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Revoke: normal state */
                          <div className="flex justify-end">
                            <button
                              className="text-xs font-semibold text-text-muted hover:text-red-500 transition-colors"
                              onClick={() => setRevokingKeyId(key.id)}
                            >
                              {t('orbitMcp.revoke')}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Connection Instructions */}
              <div className="border-t border-border pt-4 space-y-3">
                <button
                  className="flex items-center justify-between w-full group"
                  onClick={() => setInstructionsOpen(!instructionsOpen)}
                  aria-expanded={instructionsOpen}
                  aria-controls="mcp-instructions"
                >
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted group-hover:text-text-secondary transition-colors">
                    {t('orbitMcp.connectionInstructions')}
                  </h4>
                  <ChevronDown
                    className={`size-4 text-text-muted transition-transform duration-200 ${
                      instructionsOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {instructionsOpen && (
                  <div id="mcp-instructions">
                    {/* Tab buttons */}
                    <div className="flex gap-2">
                      {MCP_CONFIG_TABS.map((tab) => (
                        (() => {
                          let tabLabel = t('orbitMcp.claudeCode')
                          if (tab === 'web') {
                            tabLabel = t('orbitMcp.claudeWeb')
                          } else if (tab === 'desktop') {
                            tabLabel = t('orbitMcp.claudeDesktop')
                          }

                          return (
                            <button
                              key={tab}
                              className={`px-3 py-1.5 rounded-[var(--radius-lg)] text-xs font-semibold transition-all ${
                                activeConfigTab === tab
                                  ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                                  : 'bg-background border border-border text-text-secondary hover:text-text-primary'
                              }`}
                              onClick={() => setActiveConfigTab(tab)}
                            >
                              {tabLabel}
                            </button>
                          )
                        })()
                      ))}
                    </div>

                    {/* Claude Web instructions (OAuth, no API key needed) */}
                    {activeConfigTab === 'web' ? (
                      <div className="space-y-3">
                        <p className="text-xs text-text-muted">{t('orbitMcp.webInstructions')}</p>
                        <ol className="text-xs text-text-secondary space-y-2 list-decimal list-inside">
                          <li>{t('orbitMcp.webStep1')}</li>
                          <li>{t('orbitMcp.webStep2')}</li>
                          <li>{t('orbitMcp.webStep3')}</li>
                          <li>{t('orbitMcp.webStep4')}</li>
                        </ol>
                        <div className="relative">
                          <pre className="rounded-[var(--radius-lg)] bg-background border border-border p-4 text-xs font-mono text-text-secondary overflow-x-auto leading-relaxed">{MCP_ENDPOINT_URL}</pre>
                          <button
                            className="absolute top-2.5 right-2.5 p-1.5 rounded-[var(--radius-lg)] bg-surface-elevated/80 backdrop-blur-sm text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-all"
                            onClick={() => copyToClipboard(MCP_ENDPOINT_URL)}
                          >
                            <Clipboard className="size-4" />
                          </button>
                        </div>
                        <p className="text-xs text-text-muted italic">{t('orbitMcp.webNoApiKey')}</p>
                      </div>
                    ) : (
                      /* Desktop / Code instructions (API key required) */
                      <div className="space-y-3">
                        <p className="text-xs text-text-muted">{t('orbitMcp.configInstructions')}</p>

                        {/* Config code block */}
                        <div className="relative">
                          <pre className="rounded-[var(--radius-lg)] bg-background border border-border p-4 text-xs font-mono text-text-secondary overflow-x-auto leading-relaxed">{mcpConfigJson}</pre>
                          <button
                            className="absolute top-2.5 right-2.5 p-1.5 rounded-[var(--radius-lg)] bg-surface-elevated/80 backdrop-blur-sm text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-all"
                            onClick={copyConfig}
                          >
                            {configCopied ? (
                              <Check className="size-4 text-emerald-400" />
                            ) : (
                              <Clipboard className="size-4" />
                            )}
                          </button>
                        </div>

                        <p className="text-xs text-text-muted italic">{t('orbitMcp.replaceKey')}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Widget Info Overlay */}
      <AppOverlay
        open={showWidgetInfo}
        onOpenChange={setShowWidgetInfo}
        title={t('profile.widgetTitle')}
      >
        <div id="widget-info-dialog" className="space-y-5">
          <div>
            <h3 className="text-sm font-bold text-text-primary mb-1.5">{t('profile.widgetHow.title')}</h3>
            <ol className="text-sm text-text-secondary leading-relaxed space-y-2">
              {WIDGET_STEP_KEYS.map((stepKey, index) => (
                <li key={stepKey} className="flex gap-2">
                  <span className="text-primary font-bold shrink-0">{index + 1}.</span>
                  <span>{t(stepKey)}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-primary mb-1.5">{t('profile.widgetHow.featuresTitle')}</h3>
            <ul className="text-sm text-text-secondary leading-relaxed space-y-1.5">
              {WIDGET_FEATURES.map((feature) => {
                const icon = {
                  checkCircle: <CheckCircle className="size-4 text-primary shrink-0 mt-0.5" />,
                  clock: <Clock className="size-4 text-primary shrink-0 mt-0.5" />,
                  list: <List className="size-4 text-primary shrink-0 mt-0.5" />,
                  rotateCcw: <RotateCcw className="size-4 text-primary shrink-0 mt-0.5" />,
                }[feature.iconKey]

                return (
                  <li key={feature.textKey} className="flex gap-2 items-start">
                    {icon}
                    <span>{t(feature.textKey)}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </AppOverlay>

      {/* Create API Key Modal */}
      <CreateApiKeyModal open={createKeyModalOpen} onOpenChange={setCreateKeyModalOpen} onCreateKey={handleCreateKey} apiError={createKeyError} />
    </div>
  )
}
