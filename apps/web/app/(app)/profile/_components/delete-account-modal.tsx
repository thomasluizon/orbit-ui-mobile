'use client'

import { useState, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { parseISO } from 'date-fns'
import { getErrorMessage } from '@orbit/shared/utils'
import type { Profile } from '@orbit/shared/types/profile'
import { AppOverlay } from '@/components/ui/app-overlay'
import { CodeInput } from '@/components/ui/code-input'
import { useAuthStore } from '@/stores/auth-store'
import { useDateFormat } from '@/hooks/use-date-format'
import { requestDeletion, confirmDeletion } from '@/app/actions/auth'

interface DeleteAccountModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: Profile | undefined
}

export function DeleteAccountModal({
  open,
  onOpenChange,
  profile,
}: Readonly<DeleteAccountModalProps>) {
  const t = useTranslations()
  const { displayDate } = useDateFormat()
  const logout = useAuthStore((s) => s.logout)

  const [step, setStep] = useState<'confirm' | 'code' | 'deactivated'>('confirm')
  const [code, setCode] = useState<string[]>(['', '', '', '', '', ''])
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [scheduledDeletionDate, setScheduledDeletionDate] = useState<string | null>(null)

  function handleOpenChange(value: boolean) {
    if (value) {
      setStep('confirm')
      setCode(['', '', '', '', '', ''])
      setError('')
      setLoading(false)
      setScheduledDeletionDate(null)
    }
    onOpenChange(value)
  }

  async function handleRequestDeletion() {
    setLoading(true)
    setError('')
    try {
      await requestDeletion()
      setStep('code')
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('profile.deleteAccount.errorGeneric')))
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirmDeletion() {
    const joined = code.join('')
    if (joined.length !== 6) return
    setLoading(true)
    setError('')
    try {
      const response = await confirmDeletion(joined)
      setScheduledDeletionDate(response.scheduledDeletionAt ?? null)
      setStep('deactivated')
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('profile.deleteAccount.errorGeneric')))
    } finally {
      setLoading(false)
    }
  }

  function handleCodeInput(index: number, value: string) {
    const sanitized = value.replaceAll(/\D/g, '')
    const next = [...code]
    next[index] = sanitized.slice(-1)
    setCode(next)
    if (sanitized && index < 5) {
      codeInputRefs.current[index + 1]?.focus()
    }
  }

  function handleCodeKeydown(
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === 'Backspace' && !code[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus()
    }
  }

  function handleCodePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const paste = event.clipboardData?.getData('text')?.replaceAll(/\D/g, '')?.slice(0, 6)
    if (paste) {
      const next = [...code]
      for (let i = 0; i < 6; i++) {
        next[i] = paste[i] || ''
      }
      setCode(next)
      event.preventDefault()
    }
  }

  const hasProAccess = profile?.hasProAccess
  const planExpiresAt = profile?.planExpiresAt
  const warningMessage = useMemo(() => {
    if (hasProAccess && planExpiresAt) {
      return t('profile.deleteAccount.warningPro', {
        date: displayDate(parseISO(planExpiresAt)),
      })
    }
    return t('profile.deleteAccount.warningFree')
  }, [hasProAccess, planExpiresAt, displayDate, t])

  const formattedDeletionDate = useMemo(() => {
    if (!scheduledDeletionDate) return ''
    return displayDate(parseISO(scheduledDeletionDate))
  }, [scheduledDeletionDate, displayDate])

  function renderStep() {
    if (step === 'confirm') {
      return (
        <DeleteConfirmStep
          warningMessage={warningMessage}
          error={error}
          loading={loading}
          onRequestDeletion={handleRequestDeletion}
        />
      )
    }

    if (step === 'code') {
      return (
        <DeleteCodeStep
          code={code}
          inputRefs={codeInputRefs}
          error={error}
          loading={loading}
          onCodeInput={handleCodeInput}
          onCodeKeydown={handleCodeKeydown}
          onCodePaste={handleCodePaste}
          onConfirmDeletion={handleConfirmDeletion}
        />
      )
    }

    return (
      <DeleteDeactivatedStep
        formattedDeletionDate={formattedDeletionDate}
        onLogout={() => logout()}
      />
    )
  }

  const heading = (() => {
    if (step === 'confirm') return t('profile.deleteAccount.headingAreYouSure')
    if (step === 'code') return t('profile.deleteAccount.headingConfirmCode')
    return t('profile.deleteAccount.headingDeactivated')
  })()

  return (
    <AppOverlay open={open} onOpenChange={handleOpenChange} title={heading}>
      {renderStep()}
    </AppOverlay>
  )
}

function DeleteConfirmStep({
  warningMessage,
  error,
  loading,
  onRequestDeletion,
}: Readonly<{
  warningMessage: string
  error: string
  loading: boolean
  onRequestDeletion: () => void
}>) {
  const t = useTranslations()

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <p
        style={{
          fontFamily: 'var(--font-family-sans)',
          fontSize: 14,
          fontStyle: 'italic',
          color: 'var(--fg-2)',
          lineHeight: 1.55,
        }}
      >
        {warningMessage}
      </p>
      <p
        style={{
          fontFamily: 'var(--font-family-sans)',
          fontSize: 13,
          fontStyle: 'italic',
          color: 'var(--fg-3)',
          lineHeight: 1.55,
        }}
      >
        {t('profile.deleteAccount.warningDetail')}
      </p>
      {error && (
        <p
          role="alert"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 13,
            fontStyle: 'italic',
            color: 'var(--status-overdue)',
          }}
        >
          {error}
        </p>
      )}
      <div className="flex items-center justify-end" style={{ gap: 12, paddingTop: 8 }}>
        <button
          type="button"
          className="appearance-none border-0 bg-transparent cursor-pointer"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 14,
            color: 'var(--fg-3)',
            padding: 6,
          }}
          disabled={loading}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="appearance-none border-0 cursor-pointer disabled:opacity-50"
          disabled={loading}
          onClick={onRequestDeletion}
          style={{
            padding: '10px 18px',
            background: 'var(--primary)',
            color: 'var(--fg-on-primary)',
            borderRadius: 10,
            fontFamily: 'var(--font-family-sans)',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {loading ? t('profile.deleteAccount.sending') : t('common.continue')}
        </button>
      </div>
    </div>
  )
}

function DeleteCodeStep({
  code,
  inputRefs,
  error,
  loading,
  onCodeInput,
  onCodeKeydown,
  onCodePaste,
  onConfirmDeletion,
}: Readonly<{
  code: string[]
  inputRefs: React.RefObject<(HTMLInputElement | null)[]>
  error: string
  loading: boolean
  onCodeInput: (index: number, value: string) => void
  onCodeKeydown: (index: number, event: React.KeyboardEvent<HTMLInputElement>) => void
  onCodePaste: (event: React.ClipboardEvent<HTMLInputElement>) => void
  onConfirmDeletion: () => void
}>) {
  const t = useTranslations()

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <p
        style={{
          fontFamily: 'var(--font-family-sans)',
          fontSize: 14,
          fontStyle: 'italic',
          color: 'var(--fg-3)',
          lineHeight: 1.55,
        }}
      >
        {t('profile.deleteAccount.codeInstructions')}
      </p>
      <CodeInput
        digits={code}
        inputRefs={inputRefs}
        onChange={onCodeInput}
        onKeyDown={onCodeKeydown}
        onPaste={onCodePaste}
        ariaLabelForIndex={(n) => t('auth.codeDigit', { n: n + 1 })}
      />
      {error && (
        <p
          role="alert"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 13,
            fontStyle: 'italic',
            color: 'var(--status-overdue)',
          }}
        >
          {error}
        </p>
      )}
      <div className="flex items-center justify-end" style={{ gap: 12, paddingTop: 8 }}>
        <button
          type="button"
          className="appearance-none border-0 bg-transparent cursor-pointer"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 14,
            color: 'var(--fg-3)',
            padding: 6,
          }}
          disabled={loading}
        >
          {t('common.back')}
        </button>
        <button
          type="button"
          className="appearance-none border-0 bg-transparent cursor-pointer disabled:opacity-50"
          disabled={loading || code.join('').length !== 6}
          onClick={onConfirmDeletion}
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--fg-1)',
            fontStyle: 'italic',
            padding: 6,
          }}
        >
          {loading ? t('profile.deleteAccount.deleting') : t('auth.verify')}
        </button>
      </div>
    </div>
  )
}

function DeleteDeactivatedStep({
  formattedDeletionDate,
  onLogout,
}: Readonly<{
  formattedDeletionDate: string
  onLogout: () => void
}>) {
  const t = useTranslations()

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <p
        style={{
          fontFamily: 'var(--font-family-sans)',
          fontSize: 14,
          fontStyle: 'italic',
          color: 'var(--fg-2)',
          lineHeight: 1.55,
        }}
      >
        {t('profile.deleteAccount.deactivated', { date: formattedDeletionDate })}
      </p>
      <div className="flex items-center justify-end" style={{ paddingTop: 8 }}>
        <button
          type="button"
          className="appearance-none border-0 cursor-pointer"
          onClick={onLogout}
          style={{
            padding: '10px 18px',
            background: 'var(--primary)',
            color: 'var(--fg-on-primary)',
            borderRadius: 10,
            fontFamily: 'var(--font-family-sans)',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {t('profile.logout')}
        </button>
      </div>
    </div>
  )
}
