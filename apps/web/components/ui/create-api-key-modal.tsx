'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import type { ApiKeyCreateRequest, ApiKeyCreateResponse } from '@orbit/shared/types/api-key'
import { MAX_API_KEY_NAME_LENGTH, parseApiKeyExpiryUtc } from '@orbit/shared/validation'
import type { AgentScopeOption } from '@orbit/shared/utils'
import { AppOverlay } from '@/components/ui/app-overlay'
import { Chip } from '@/components/ui/chip'
import { FieldInput } from '@/components/ui/field-input'
import { PillButton } from '@/components/ui/pill-button'
import { Switch } from '@/components/ui/settings-row'

const CREATED_KEY_STYLE = {
  padding: '14px 16px',
  paddingRight: 76,
  boxShadow: 'inset 0 0 0 1px var(--hairline)',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  color: 'var(--fg-1)',
  lineHeight: 1.6,
  wordBreak: 'break-all',
  fontVariantNumeric: 'tabular-nums',
} as const

interface CreateApiKeyModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  availableScopes: AgentScopeOption[]
  onCreateKey: (request: ApiKeyCreateRequest) => Promise<ApiKeyCreateResponse | null>
  apiError?: string | null
  onCreated?: () => void
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
    if (trimmed.length > MAX_API_KEY_NAME_LENGTH) {
      setValidationError(t('orbitMcp.keyNameMaxLength'))
      return false
    }
    if (expiresAt.trim()) {
      if (!parseApiKeyExpiryUtc(expiresAt)) {
        setValidationError(t('orbitMcp.invalidExpiry'))
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

  const handleSubmit = useCallback(
    async (e: React.SubmitEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (!validate()) return

      setIsSubmitting(true)
      try {
        const expiresAtUtc = expiresAt.trim()
          ? parseApiKeyExpiryUtc(expiresAt)?.toISOString() ?? null
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
          onCopy={() => void copyKey()}
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
          onSubmit={(e) => void handleSubmit(e)}
          onCancel={() => onOpenChange(false)}
        />
      )}
    </AppOverlay>
  )
}

interface CreateStepProps {
  keyName: string
  onKeyNameChange: (value: string) => void
  availableScopes: AgentScopeOption[]
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
  onSubmit: React.SubmitEventHandler<HTMLFormElement>
  onCancel: () => void
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
    onCancel,
  } = props
  const selectedScopeSet = new Set(selectedScopes)

  return (
    <form className="flex flex-col" style={{ gap: 18, paddingBottom: 8 }} onSubmit={onSubmit}>
      <FieldInput
        id="api-key-name"
        label={t('orbitMcp.keyName')}
        value={keyName}
        onChange={onKeyNameChange}
        placeholder={t('orbitMcp.keyNamePlaceholder')}
        maxLength={MAX_API_KEY_NAME_LENGTH}
      />
      {validationError && (
        <p
          role="alert"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: 'var(--status-bad)',
          }}
        >
          {validationError}
        </p>
      )}

      <div className="flex flex-col" style={{ gap: 8 }}>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--fg-2)',
          }}
        >
          {t('orbitMcp.scopesLabel')}
        </span>
        <div className="flex flex-wrap" style={{ gap: 6 }}>
          {availableScopes.map((scope) => (
            <Chip
              key={scope.scope}
              active={selectedScopeSet.has(scope.scope)}
              onClick={() => onToggleScope(scope.scope)}
            >
              {scope.scope}
            </Chip>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent transition-[opacity] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:opacity-80"
            onClick={onSelectAll}
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--fg-1)',
              padding: 6,
            }}
          >
            {t('common.selectAll')}
          </button>
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent transition-[color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:text-[var(--fg-1)]"
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

      <div
        className="flex items-center justify-between rounded-[14px] bg-[var(--bg-field)]"
        style={{
          padding: '8px 16px',
          minHeight: 54,
          gap: 12,
          boxShadow: 'inset 0 0 0 1px var(--hairline)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 16,
            color: 'var(--fg-1)',
          }}
        >
          {t('orbitMcp.readOnlyKeyLabel')}
        </span>
        <Switch
          on={isReadOnly}
          onToggle={() => onIsReadOnlyChange(!isReadOnly)}
          ariaLabel={t('orbitMcp.readOnlyKeyLabel')}
        />
      </div>

      <div className="flex flex-col" style={{ gap: 8 }}>
        <label
          htmlFor="api-key-expiry"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--fg-2)',
          }}
        >
          {t('orbitMcp.expiresAtLabel')}
        </label>
        <input
          id="api-key-expiry"
          type="datetime-local"
          value={expiresAt}
          onChange={(event) => onExpiresAtChange(event.target.value)}
          className="w-full appearance-none rounded-[14px] border-0 bg-[var(--bg-field)] shadow-[inset_0_0_0_1px_var(--hairline)] outline-none focus:shadow-[inset_0_0_0_2px_var(--primary)]"
          style={{
            minHeight: 54,
            padding: '0 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: 15,
            color: 'var(--fg-1)',
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
            color: 'var(--status-bad)',
          }}
        >
          {apiError}
        </p>
      )}

      <div className="flex items-center justify-end" style={{ gap: 10, paddingTop: 8 }}>
        <PillButton variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          {t('common.cancel')}
        </PillButton>
        <PillButton type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('common.loading') : t('orbitMcp.createKey')}
        </PillButton>
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
    <div className="flex flex-col" style={{ gap: 14, paddingBottom: 8 }}>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 14,
          fontWeight: 500,
          color: 'var(--status-overdue-text)',
        }}
      >
        {t('orbitMcp.keyCreatedWarning')}
      </p>
      <div
        className="relative rounded-[14px] bg-[var(--bg-field)]"
        style={CREATED_KEY_STYLE}
      >
        <button
          type="button"
          className="absolute cursor-pointer border-0 bg-transparent"
          onClick={onCopy}
          style={{
            top: 10,
            right: 12,
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontWeight: 500,
            color: copied ? 'var(--status-done)' : 'var(--primary)',
            padding: 4,
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
          letterSpacing: '0.02em',
          color: 'var(--fg-3)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {`${t('orbitMcp.scopesLabel')} ${
          createdKey.scopes.length > 0
            ? createdKey.scopes.length
            : t('orbitMcp.noScopes')
        } · ${t('orbitMcp.readOnlyLabel')} ${
          createdKey.isReadOnly ? t('common.yes') : t('common.no')
        } · ${createdKey.expiresAtUtc ?? t('common.never')}`}
      </div>
      <div className="flex items-center justify-end" style={{ paddingTop: 8 }}>
        <PillButton onClick={onDone}>{t('orbitMcp.done')}</PillButton>
      </div>
    </div>
  )
}
