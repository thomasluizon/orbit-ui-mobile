'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import type { ApiKeyCreateRequest, ApiKeyCreateResponse } from '@orbit/shared/types/api-key'
import { AppOverlay } from '@/components/ui/app-overlay'
import { Chip } from '@/components/ui/chip'
import { SectionLabel } from '@/components/ui/section-label'
import { UnderlinedInput } from '@/components/ui/underlined-input'

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
  const dateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  const match = dateTimePattern.exec(value.trim())

  if (!match) {
    return null
  }

  const [, year, month, day, hour, minute, second] = match
  const parsed = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second ?? '0'),
    ),
  )

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
  const overlayTitle = isRevealState
    ? t('orbitMcp.revealHeading')
    : t('orbitMcp.createHeading')

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

  const [previousOpen, setPreviousOpen] = useState(open)
  if (open !== previousOpen) {
    setPreviousOpen(open)
    if (!open) resetForm()
  }

  const validate = useCallback((): boolean => {
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
  }, [keyName, expiresAt, t])

  function toggleScope(scope: string) {
    setSelectedScopes((current) =>
      current.includes(scope)
        ? current.filter((value) => value !== scope)
        : [...current, scope],
    )
  }

  const handleSubmit = useCallback<NonNullable<React.ComponentProps<'form'>['onSubmit']>>(
    async (e) => {
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
    },
    [expiresAt, isReadOnly, keyName, onCreateKey, onCreated, selectedScopes, validate],
  )

  async function copyKey() {
    if (!createdKey) return
    try {
      await navigator.clipboard.writeText(createdKey.key)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
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
      {isRevealState ? (
        <RevealStep
          createdKey={createdKey}
          copied={copied}
          onCopy={copyKey}
          onDone={handleDone}
        />
      ) : (
        <CreateStep
          keyName={keyName}
          onKeyNameChange={setKeyName}
          availableScopes={availableScopes}
          selectedScopes={selectedScopes}
          onToggleScope={toggleScope}
          onSelectAll={() =>
            setSelectedScopes(availableScopes.map((scope) => scope.scope))
          }
          onClear={() => setSelectedScopes([])}
          isReadOnly={isReadOnly}
          onIsReadOnlyChange={setIsReadOnly}
          expiresAt={expiresAt}
          onExpiresAtChange={setExpiresAt}
          validationError={validationError}
          apiError={apiError ?? null}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
        />
      )}
    </AppOverlay>
  )
}

interface CreateStepProps {
  keyName: string
  onKeyNameChange: (value: string) => void
  availableScopes: ScopeOption[]
  selectedScopes: string[]
  onToggleScope: (scope: string) => void
  onSelectAll: () => void
  onClear: () => void
  isReadOnly: boolean
  onIsReadOnlyChange: (value: boolean) => void
  expiresAt: string
  onExpiresAtChange: (value: string) => void
  validationError: string
  apiError: string | null
  isSubmitting: boolean
  onSubmit: React.FormEventHandler<HTMLFormElement>
}

function CreateStep(props: Readonly<CreateStepProps>) {
  const t = useTranslations()
  const {
    keyName,
    onKeyNameChange,
    availableScopes,
    selectedScopes,
    onToggleScope,
    onSelectAll,
    onClear,
    isReadOnly,
    onIsReadOnlyChange,
    expiresAt,
    onExpiresAtChange,
    validationError,
    apiError,
    isSubmitting,
    onSubmit,
  } = props

  return (
    <form className="flex flex-col" style={{ gap: 18 }} onSubmit={onSubmit}>
      <UnderlinedInput
        id="api-key-name"
        large
        label={t('orbitMcp.keyName')}
        value={keyName}
        onChange={onKeyNameChange}
        placeholder={t('orbitMcp.keyNamePlaceholder')}
        maxLength={50}
      />
      {validationError && (
        <p
          role="alert"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontStyle: 'italic',
            color: 'var(--status-overdue)',
          }}
        >
          {validationError}
        </p>
      )}

      <div>
        <SectionLabel top={6} bottom={6}>
          {t('orbitMcp.scopesLabel')}
        </SectionLabel>
        <div className="flex flex-wrap" style={{ gap: 6 }}>
          {availableScopes.map((scope) => (
            <Chip
              key={scope.scope}
              active={selectedScopes.includes(scope.scope)}
              onClick={() => onToggleScope(scope.scope)}
            >
              {scope.scope}
            </Chip>
          ))}
        </div>
        <div
          className="flex items-center justify-between"
          style={{
            padding: '12px 0',
            borderBottom: '1px solid var(--hairline)',
          }}
        >
          <button
            type="button"
            className="appearance-none border-0 bg-transparent cursor-pointer transition-opacity duration-150 ease-out hover:opacity-80"
            onClick={onSelectAll}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: 'var(--fg-1)',
              padding: 6,
            }}
          >
            {t('common.selectAll')}
          </button>
          <button
            type="button"
            className="appearance-none border-0 bg-transparent cursor-pointer transition-colors duration-150 ease-out hover:text-[var(--fg-1)]"
            onClick={onClear}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: 'var(--fg-3)',
              padding: 6,
            }}
          >
            {t('common.clear')}
          </button>
        </div>
      </div>

      <label
        className="flex items-center justify-between"
        style={{ padding: '12px 0', borderBottom: '1px solid var(--hairline)' }}
      >
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            color: 'var(--fg-1)',
          }}
        >
          {t('orbitMcp.readOnlyKeyLabel')}
        </span>
        <input
          type="checkbox"
          checked={isReadOnly}
          onChange={(event) => onIsReadOnlyChange(event.target.checked)}
          className="accent-[var(--primary)]"
        />
      </label>

      <div className="flex flex-col" style={{ gap: 4 }}>
        <label
          htmlFor="api-key-expiry"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--fg-3)',
          }}
        >
          {t('orbitMcp.expiresAtLabel')}
        </label>
        <input
          id="api-key-expiry"
          type="datetime-local"
          value={expiresAt}
          onChange={(event) => onExpiresAtChange(event.target.value)}
          style={{
            appearance: 'none',
            border: 0,
            background: 'transparent',
            outline: 'none',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'var(--fg-1)',
            padding: '6px 0',
            borderBottom: '1px solid var(--hairline-strong)',
            fontVariantNumeric: 'tabular-nums',
          }}
        />
      </div>

      {apiError && (
        <p
          role="alert"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontStyle: 'italic',
            color: 'var(--status-overdue)',
          }}
        >
          {apiError}
        </p>
      )}

      <div className="flex items-center justify-end" style={{ gap: 12, paddingTop: 8 }}>
        <button
          type="button"
          className="appearance-none border-0 bg-transparent cursor-pointer transition-colors duration-150 ease-out hover:text-[var(--fg-1)]"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            color: 'var(--fg-3)',
            padding: 6,
          }}
          disabled={isSubmitting}
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          className="appearance-none border-0 cursor-pointer disabled:opacity-50 transition-[background-color] duration-150 ease-out hover:bg-[var(--primary-pressed)]"
          disabled={isSubmitting}
          style={{
            padding: '10px 18px',
            background: 'var(--primary)',
            color: 'var(--fg-on-primary)',
            borderRadius: 10,
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {isSubmitting ? t('common.loading') : t('orbitMcp.createKey')}
        </button>
      </div>
    </form>
  )
}

interface RevealStepProps {
  createdKey: ApiKeyCreateResponse | null
  copied: boolean
  onCopy: () => void
  onDone: () => void
}

function RevealStep({ createdKey, copied, onCopy, onDone }: Readonly<RevealStepProps>) {
  const t = useTranslations()
  if (!createdKey) return null

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          fontStyle: 'italic',
          color: 'var(--status-overdue)',
        }}
      >
        {t('orbitMcp.keyCreatedWarning')}
      </p>
      <div
        className="relative"
        style={{
          padding: '12px 14px',
          borderRadius: 8,
          background: 'var(--bg-sunk)',
          boxShadow: 'inset 0 0 0 1px var(--hairline)',
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          color: 'var(--fg-1)',
          lineHeight: 1.5,
          wordBreak: 'break-all',
        }}
      >
        <button
          type="button"
          className="appearance-none border-0 bg-transparent cursor-pointer"
          onClick={onCopy}
          style={{
            position: 'absolute',
            top: 8,
            right: 10,
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            color: 'var(--fg-3)',
            textDecoration: 'underline',
          }}
        >
          {copied ? t('orbitMcp.copied') : t('orbitMcp.copy')}
        </button>
        {createdKey.key}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--fg-3)',
        }}
      >
        {t('orbitMcp.revealSummary', {
          scopes: createdKey.scopes.length || 0,
          readOnly: createdKey.isReadOnly
            ? t('common.yes')
            : t('common.no'),
          expires: createdKey.expiresAtUtc ?? t('common.never'),
        })}
      </div>
      <div className="flex items-center justify-end" style={{ paddingTop: 8 }}>
        <button
          type="button"
          className="appearance-none border-0 cursor-pointer"
          onClick={onDone}
          style={{
            padding: '10px 18px',
            background: 'var(--primary)',
            color: 'var(--fg-on-primary)',
            borderRadius: 10,
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {t('orbitMcp.done')}
        </button>
      </div>
    </div>
  )
}
