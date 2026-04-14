'use client'

import { useState, useEffect, useCallback } from 'react'
import { Clipboard, Check, AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ApiKeyCreateRequest, ApiKeyCreateResponse } from '@orbit/shared/types/api-key'
import { AppOverlay } from '@/components/ui/app-overlay'

interface ScopeOption {
  scope: string
  label: string
  description: string
}

interface CreateApiKeyModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  availableScopes: ScopeOption[]
  onCreateKey: (request: ApiKeyCreateRequest) => Promise<ApiKeyCreateResponse | null>
  apiError?: string | null
  onCreated?: () => void
}

function parseUtcDateTimeLocal(value: string): Date | null {
  const match = value
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/)

  if (!match) {
    return null
  }

  const [, year, month, day, hour, minute, second] = match
  const parsed = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? '0'),
  ))

  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day) ||
    parsed.getUTCHours() !== Number(hour) ||
    parsed.getUTCMinutes() !== Number(minute) ||
    parsed.getUTCSeconds() !== Number(second ?? '0')
  ) {
    return null
  }

  return parsed
}

export function CreateApiKeyModal({
  open,
  onOpenChange,
  availableScopes,
  onCreateKey,
  apiError,
  onCreated,
}: Readonly<CreateApiKeyModalProps>) {
  const t = useTranslations()
  const [keyName, setKeyName] = useState('')
  const [selectedScopes, setSelectedScopes] = useState<string[]>([])
  const [isReadOnly, setIsReadOnly] = useState(false)
  const [expiresAt, setExpiresAt] = useState('')
  const [validationError, setValidationError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdKey, setCreatedKey] = useState<ApiKeyCreateResponse | null>(null)
  const [copied, setCopied] = useState(false)

  const isRevealState = createdKey !== null
  const overlayTitle = isRevealState ? t('orbitMcp.keyCreated') : t('orbitMcp.createKey')

  function resetForm() {
    setKeyName('')
    setSelectedScopes([])
    setIsReadOnly(false)
    setExpiresAt('')
    setValidationError('')
    setIsSubmitting(false)
    setCreatedKey(null)
    setCopied(false)
  }

  useEffect(() => {
    if (!open) {
      resetForm()
    }
  }, [open])

  function validate(): boolean {
    setValidationError('')
    const trimmed = keyName.trim()
    if (!trimmed) {
      setValidationError(t('orbitMcp.keyNameRequired'))
      return false
    }
    if (trimmed.length > 50) {
      setValidationError(t('orbitMcp.keyNameMaxLength'))
      return false
    }
    if (expiresAt.trim()) {
      if (!parseUtcDateTimeLocal(expiresAt)) {
        setValidationError(t('auth.genericError'))
        return false
      }
    }
    return true
  }

  function toggleScope(scope: string) {
    setSelectedScopes((current) =>
      current.includes(scope)
        ? current.filter((value) => value !== scope)
        : [...current, scope],
    )
  }

  const handleSubmit = useCallback<NonNullable<React.ComponentProps<'form'>['onSubmit']>>(async (e) => {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)
    try {
      const expiresAtUtc = expiresAt.trim()
        ? parseUtcDateTimeLocal(expiresAt)?.toISOString() ?? null
        : null

      const result = await onCreateKey({
        name: keyName.trim(),
        scopes: selectedScopes.length > 0 ? selectedScopes : undefined,
        isReadOnly,
        expiresAtUtc,
      })
      if (result) {
        setCreatedKey(result)
        onCreated?.()
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [expiresAt, isReadOnly, keyName, onCreateKey, onCreated, selectedScopes])

  async function copyKey() {
    if (!createdKey) return
    try {
      await navigator.clipboard.writeText(createdKey.key)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API not available
    }
  }

  function handleDone() {
    onOpenChange(false)
  }

  return (
    <AppOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={overlayTitle}
      dismissible={!isRevealState}
    >
      {/* Create Form */}
      {isRevealState ? (
        <div className="space-y-5">
          {/* Warning */}
          <div className="flex items-start gap-2.5 rounded-[var(--radius-lg)] bg-amber-500/10 border border-amber-500/20 px-3.5 py-3">
            <AlertTriangle className="size-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300 leading-relaxed font-medium">
              {t('orbitMcp.keyCreatedWarning')}
            </p>
          </div>

          {/* Key Display */}
          <div className="relative group">
            <div className="rounded-[var(--radius-lg)] bg-background border border-border p-4 font-mono text-sm text-text-primary break-all leading-relaxed select-all">
              {createdKey?.key}
            </div>
            <button
              type="button"
              className="absolute top-2.5 right-2.5 p-1.5 rounded-[var(--radius-lg)] bg-surface-elevated/80 backdrop-blur-sm text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-all"
              onClick={copyKey}
            >
              {copied ? (
                <Check className="size-4 text-emerald-400 transition-all" />
              ) : (
                <Clipboard className="size-4 transition-all" />
              )}
            </button>
          </div>

          {/* Copied feedback */}
          {copied && (
            <p className="text-xs text-emerald-400 font-medium text-center">
              {t('orbitMcp.copied')}
            </p>
          )}

          <div className="rounded-[var(--radius-lg)] border border-border bg-background px-4 py-3 text-xs text-text-secondary space-y-1">
            <p>
              <span className="font-semibold text-text-primary">Scopes:</span>{' '}
              {createdKey?.scopes.length ? createdKey.scopes.join(', ') : 'None'}
            </p>
            <p>
              <span className="font-semibold text-text-primary">Read-only:</span>{' '}
              {createdKey?.isReadOnly ? t('common.yes') : t('common.no')}
            </p>
            {createdKey?.expiresAtUtc && (
              <p>
                <span className="font-semibold text-text-primary">Expires:</span>{' '}
                {createdKey.expiresAtUtc}
              </p>
            )}
          </div>

          {/* Done button */}
          <button
            type="button"
            className="w-full py-3.5 rounded-[var(--radius-xl)] bg-primary text-white font-bold text-sm text-center hover:bg-primary/90 transition-all duration-150 active:scale-[0.98] shadow-[var(--shadow-glow)]"
            onClick={handleDone}
          >
            {t('orbitMcp.done')}
          </button>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="api-key-name" className="form-label">
              {t('orbitMcp.keyName')}
            </label>
            <input
              id="api-key-name"
              type="text"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              className="form-input"
              placeholder={t('orbitMcp.keyNamePlaceholder')}
              maxLength={50}
            />
            {validationError && (
              <p className="mt-1.5 text-xs text-red-400">{validationError}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="form-label mb-0">{t('orbitMcp.apiKeys')}</label>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  className="text-text-secondary hover:text-text-primary transition-colors"
                  onClick={() => setSelectedScopes(availableScopes.map((scope) => scope.scope))}
                >
                  {t('common.selectAll')}
                </button>
                <button
                  type="button"
                  className="text-text-secondary hover:text-text-primary transition-colors"
                  onClick={() => setSelectedScopes([])}
                >
                  {t('common.clear')}
                </button>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-background p-2 space-y-2">
              {availableScopes.map((scope) => (
                <label
                  key={scope.scope}
                  className="flex items-start gap-3 rounded-[var(--radius-lg)] px-2 py-2 hover:bg-surface-elevated"
                >
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(scope.scope)}
                    onChange={() => toggleScope(scope.scope)}
                    className="mt-0.5 accent-primary"
                  />
                  <span className="space-y-0.5">
                    <span className="block text-xs font-semibold text-text-primary">
                      {scope.scope}
                    </span>
                    <span className="block text-[11px] text-text-secondary">
                      {scope.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-background px-3 py-3">
            <input
              type="checkbox"
              checked={isReadOnly}
              onChange={(event) => setIsReadOnly(event.target.checked)}
              className="accent-primary"
            />
            <span className="text-xs text-text-primary">Read-only key</span>
          </label>

          <div>
            <label htmlFor="api-key-expiry" className="form-label">
              Expires At (UTC, optional)
            </label>
            <input
              id="api-key-expiry"
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className="form-input"
            />
          </div>

          {apiError && (
            <p className="text-xs text-red-400">{apiError}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 rounded-[var(--radius-xl)] bg-primary text-white font-bold text-sm text-center hover:bg-primary/90 transition-all duration-150 active:scale-[0.98] shadow-[var(--shadow-glow)] disabled:opacity-50"
          >
            {isSubmitting ? '...' : t('orbitMcp.createKey')}
          </button>
        </form>
      )}
    </AppOverlay>
  )
}
