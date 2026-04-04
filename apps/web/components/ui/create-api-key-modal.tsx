'use client'

import { useState, useEffect, useCallback } from 'react'
import { Clipboard, Check, AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'

interface ApiKeyCreateResponse {
  id: string
  key: string
  name: string
}

interface CreateApiKeyModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateKey: (name: string) => Promise<ApiKeyCreateResponse | null>
  apiError?: string | null
  onCreated?: () => void
}

export function CreateApiKeyModal({
  open,
  onOpenChange,
  onCreateKey,
  apiError,
  onCreated,
}: CreateApiKeyModalProps) {
  const t = useTranslations()
  const [keyName, setKeyName] = useState('')
  const [validationError, setValidationError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdKey, setCreatedKey] = useState<ApiKeyCreateResponse | null>(null)
  const [copied, setCopied] = useState(false)

  const isRevealState = createdKey !== null
  const overlayTitle = isRevealState ? t('orbitMcp.keyCreated') : t('orbitMcp.createKey')

  function resetForm() {
    setKeyName('')
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
    return true
  }

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)
    try {
      const result = await onCreateKey(keyName.trim())
      if (result) {
        setCreatedKey(result)
        onCreated?.()
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [keyName, onCreateKey, onCreated])

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
      {!isRevealState ? (
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
      ) : (
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

          {/* Done button */}
          <button
            type="button"
            className="w-full py-3.5 rounded-[var(--radius-xl)] bg-primary text-white font-bold text-sm text-center hover:bg-primary/90 transition-all duration-150 active:scale-[0.98] shadow-[var(--shadow-glow)]"
            onClick={handleDone}
          >
            {t('orbitMcp.done')}
          </button>
        </div>
      )}
    </AppOverlay>
  )
}
