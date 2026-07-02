'use client'

import { Check, Clipboard } from 'lucide-react'
import type { ApiKey } from '@orbit/shared/types'

type TranslationFn = (key: string, params?: Record<string, string | number | Date>) => string

/** Writes to the clipboard and reports whether the write succeeded, so callers
 *  only show "Copied!" on success. */
export async function copyToClipboard(text: string): Promise<boolean> {
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
      <div className="flex justify-end" style={{ marginBottom: 6 }}>
        <button
          type="button"
          aria-label={copied ? copiedLabel : copyLabel}
          className="icon-btn touch-target"
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
      <pre
        className="overflow-x-auto"
        style={{
          margin: 0,
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          lineHeight: 1.55,
          color: 'var(--fg-2)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {content}
      </pre>
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
  const isReadOnly = apiKey.isReadOnly ?? false
  const expiresAtUtc = apiKey.expiresAtUtc ?? null

  return (
    <div
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
            {apiKey.name}
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
            {apiKey.keyPrefix}...
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
          <p>{t('orbitMcp.created')} {formatKeyDate(apiKey.createdAtUtc)}</p>
          <p>
            {t('orbitMcp.lastUsed')}{' '}
            {apiKey.lastUsedAtUtc ? formatKeyDate(apiKey.lastUsedAtUtc) : t('orbitMcp.never')}
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
          className="chip min-h-[44px]"
          style={{ color: 'var(--status-bad-text)' }}
          onClick={() => onRevoke(apiKey.id)}
        >
          {t('orbitMcp.revoke')}
        </button>
      </div>
    </div>
  )
}
