'use client'

import { useState } from 'react'
import {
  Check,
  CheckCircle,
  ChevronDown,
  Clipboard,
  Clock,
  List,
  Plus,
  RotateCcw,
} from '@/components/ui/icons'
import type { ApiKey } from '@orbit/shared/types'
import {
  buildMcpConfigJson,
  MCP_CONFIG_TABS,
  MCP_ENDPOINT_URL,
  WIDGET_FEATURES,
  WIDGET_STEP_KEYS,
} from '@orbit/shared/utils/advanced-settings'
import { AppOverlay } from '@/components/ui/app-overlay'
import { Chip } from '@/components/ui/chip'
import { useIsDesktop } from '@/hooks/use-is-desktop'

type TranslationFn = (key: string, params?: Record<string, string | number | Date>) => string

interface QueryStatus {
  isLoading: boolean
  error: Error | null
}

/** Writes to the clipboard and reports whether the write succeeded, so callers
 *  only show "Copied!" on success. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function CodeWell({
  content,
  copied,
  onCopy,
  copyLabel,
  copiedLabel,
}: Readonly<{
  content: string
  copied?: boolean
  onCopy: () => void
  copyLabel: string
  copiedLabel: string
}>) {
  return (
    <div
      className="rounded-[14px] bg-[var(--bg-field)]"
      style={{
        padding: '10px 12px',
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
      }}
    >
      <div className="flex items-center" style={{ gap: 8 }}>
        <pre
          className="min-w-0 flex-1 overflow-x-auto"
          style={{
            margin: 0,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            lineHeight: 1.55,
            color: 'var(--fg-2)',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          {content}
        </pre>
        <button
          type="button"
          aria-label={copied ? copiedLabel : copyLabel}
          className="icon-btn touch-target shrink-0"
          onClick={onCopy}
        >
          {copied ? (
            <Check size={18} strokeWidth={1.8} color="var(--status-done)" aria-hidden="true" />
          ) : (
            <Clipboard size={18} strokeWidth={1.8} aria-hidden="true" />
          )}
        </button>
        <span aria-live="polite" className="sr-only">
          {copied ? copiedLabel : ''}
        </span>
      </div>
    </div>
  )
}

export function SubsectionTitle({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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

/** Single-line query-state message for the Orbit MCP keys list: `error` is the
 *  load-failure line, `empty` the no-keys placeholder. */
export function QueryStateMessage({
  tone,
  children,
}: Readonly<{ tone: 'error' | 'empty'; children: React.ReactNode }>) {
  if (tone === 'error') {
    return (
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--status-bad-text)' }}>
        {children}
      </p>
    )
  }
  return (
    <p
      className="text-center"
      style={{
        padding: '16px 0',
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
        color: 'var(--fg-3)',
      }}
    >
      {children}
    </p>
  )
}

interface ApiKeyCardProps {
  apiKey: ApiKey
  t: TranslationFn
  formatKeyDate: (dateStr: string) => string
  onRevoke: (id: string) => void
}

export function ApiKeyCard({
  apiKey,
  t,
  formatKeyDate,
  onRevoke,
}: Readonly<ApiKeyCardProps>) {
  const scopes = Array.isArray(apiKey.scopes) ? apiKey.scopes : []
  const lastUsed = apiKey.lastUsedAtUtc
    ? `${t('orbitMcp.lastUsed')} ${formatKeyDate(apiKey.lastUsedAtUtc)}`
    : t('orbitMcp.never')
  const perm = apiKey.isReadOnly ? t('orbitMcp.permReadOnly') : t('orbitMcp.permReadWrite')
  const metaParts = [
    perm,
    lastUsed,
    `${t('orbitMcp.created')} ${formatKeyDate(apiKey.createdAtUtc)}`,
  ]
  if (apiKey.expiresAtUtc) {
    metaParts.push(t('orbitMcp.expiresOn', { date: formatKeyDate(apiKey.expiresAtUtc) }))
  }
  const meta = metaParts.join(' · ')

  return (
    <div
      className="flex flex-col rounded-[16px] bg-[var(--bg-card)]"
      style={{
        padding: '14px 16px',
        gap: 4,
        boxShadow: 'inset 0 0 0 1px var(--hairline)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <p
          className="min-w-0 flex-1 truncate"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            fontWeight: 500,
            color: 'var(--fg-1)',
          }}
        >
          {apiKey.name}
        </p>
        <button
          type="button"
          className="chip min-h-[44px] shrink-0"
          style={{ color: 'var(--status-bad-text)' }}
          onClick={() => onRevoke(apiKey.id)}
        >
          {t('orbitMcp.revoke')}
        </button>
      </div>
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          color: 'var(--fg-2)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {apiKey.keyPrefix}...
      </p>
      <p
        className="line-clamp-2"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          lineHeight: 1.5,
          letterSpacing: '0.02em',
          color: 'var(--fg-3)',
        }}
      >
        {scopes.length > 0 ? scopes.join(', ') : t('orbitMcp.noScopes')}
      </p>
      <p
        className="line-clamp-2"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          lineHeight: 1.5,
          letterSpacing: '0.02em',
          color: 'var(--fg-3)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {meta}
      </p>
    </div>
  )
}

interface ApiKeysSectionProps {
  apiKeysQuery: QueryStatus
  capabilitiesQuery: QueryStatus
  apiKeys: ApiKey[]
  canCreateKey: boolean
  canCreateScopedKey: boolean
  onCreateKey: () => void
  onRevoke: (id: string) => void
  formatKeyDate: (dateStr: string) => string
  t: TranslationFn
}

/** Orbit MCP "API keys" block: header with create action, description, and the
 *  loading / error / empty / list states for the user's keys. */
export function ApiKeysSection({
  apiKeysQuery,
  capabilitiesQuery,
  apiKeys,
  canCreateKey,
  canCreateScopedKey,
  onCreateKey,
  onRevoke,
  formatKeyDate,
  t,
}: Readonly<ApiKeysSectionProps>) {
  return (
    <div className="flex flex-col px-5 gap-3" style={{ paddingBottom: 8 }}>
      <div className="flex items-center justify-between">
        <SubsectionTitle>{t('orbitMcp.apiKeys')}</SubsectionTitle>
        {canCreateKey && (
          <button
            type="button"
            data-testid="api-key-create-open"
            disabled={!canCreateScopedKey}
            aria-label={t('orbitMcp.createKey')}
            className="chip chip-active min-h-[44px] disabled:cursor-not-allowed disabled:opacity-40"
            onClick={onCreateKey}
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
        <div className="flex flex-col gap-2">
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
        <div className="flex flex-col gap-2 stagger-enter">
          {apiKeys.map((key) => (
            <ApiKeyCard
              key={key.id}
              apiKey={key}
              t={t}
              formatKeyDate={formatKeyDate}
              onRevoke={onRevoke}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function McpInstructionsPanel({
  description,
  steps,
  content,
  copied,
  onCopy,
  footnote,
  copyLabel,
  copiedLabel,
}: Readonly<{
  description: string
  steps?: string[]
  content: string
  copied: boolean
  onCopy: () => void
  footnote: string
  copyLabel: string
  copiedLabel: string
}>) {
  return (
    <div className="space-y-2.5">
      <p className="t-secondary" style={{ color: 'var(--fg-3)' }}>
        {description}
      </p>
      {steps ? (
        <ol className="flex flex-col t-secondary list-decimal list-inside gap-2">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
      <CodeWell
        content={content}
        copied={copied}
        onCopy={onCopy}
        copyLabel={copyLabel}
        copiedLabel={copiedLabel}
      />
      <p className="t-secondary" style={{ color: 'var(--fg-3)' }}>
        {footnote}
      </p>
    </div>
  )
}

/** Collapsible "how to connect" instructions for the Orbit MCP endpoint, with
 *  Claude-web / Claude Code tabs and copy-to-clipboard wells. */
export function McpConnectionInstructions({ t }: Readonly<{ t: TranslationFn }>) {
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

  return (
    <div className="flex flex-col px-5 gap-3 border-t border-[var(--hairline)] pt-4 md:border-t-0 md:pt-6">
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
        <div id="mcp-instructions" className="flex flex-col gap-3">
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
            <McpInstructionsPanel
              description={t('orbitMcp.webInstructions')}
              steps={[
                t('orbitMcp.webStep1'),
                t('orbitMcp.webStep2'),
                t('orbitMcp.webStep3'),
                t('orbitMcp.webStep4'),
              ]}
              content={MCP_ENDPOINT_URL}
              copied={endpointCopied}
              onCopy={() => {
                void copyEndpoint()
              }}
              footnote={t('orbitMcp.webNoApiKey')}
              copyLabel={t('orbitMcp.copy')}
              copiedLabel={t('orbitMcp.copied')}
            />
          ) : (
            <McpInstructionsPanel
              description={t('orbitMcp.configInstructions')}
              content={mcpConfigJson}
              copied={configCopied}
              onCopy={() => {
                void copyConfig()
              }}
              footnote={t('orbitMcp.replaceKey')}
              copyLabel={t('orbitMcp.copy')}
              copiedLabel={t('orbitMcp.copied')}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** Widget how-to overlay: setup steps and feature list for the Android
 *  home-screen widget. */
export function WidgetInfoOverlay({
  open,
  onOpenChange,
  t,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; t: TranslationFn }>) {
  return (
    <AppOverlay open={open} onOpenChange={onOpenChange} title={t('profile.widgetTitle')}>
      <div className="flex flex-col gap-5" style={{ paddingBottom: 8 }}>
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
          <ol className="flex flex-col gap-2" style={{ fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.55, color: 'var(--fg-2)' }}>
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
          <ul className="flex flex-col gap-2" style={{ fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.55, color: 'var(--fg-2)' }}>
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
  )
}
