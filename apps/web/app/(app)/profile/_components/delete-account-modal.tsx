'use client'

import { useState, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { parseISO } from 'date-fns'
import { TriangleAlert } from 'lucide-react'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import type { Profile } from '@orbit/shared/types/profile'
import { AppOverlay } from '@/components/ui/app-overlay'
import { CodeInput } from '@/components/ui/code-input'
import { PillButton } from '@/components/ui/pill-button'
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
      setError(getFriendlyErrorMessage(err, t, 'profile.deleteAccount.errorGeneric', 'generic'))
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
      setError(getFriendlyErrorMessage(err, t, 'profile.deleteAccount.errorGeneric', 'generic'))
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
          onCancel={() => onOpenChange(false)}
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
          onBack={() => {
            setStep('confirm')
            setCode(['', '', '', '', '', ''])
            setError('')
          }}
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

function DangerPillButton({
  disabled = false,
  onClick,
  children,
}: Readonly<{
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}>) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex w-full cursor-pointer items-center justify-center gap-[9px] rounded-full border-0 px-[26px] py-[15px] text-[16px] font-medium transition-[opacity,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] enabled:hover:opacity-90 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        fontFamily: 'var(--font-sans)',
        background: 'var(--status-bad)',
        color: 'var(--fg-on-bad)',
      }}
    >
      {children}
    </button>
  )
}

function DeleteWarningCard({
  title,
  desc,
}: Readonly<{ title: string; desc: string }>) {
  return (
    <div className="flex flex-col items-center text-center" style={{ gap: 16, paddingTop: 4 }}>
      <div
        aria-hidden="true"
        className="flex items-center justify-center rounded-full"
        style={{
          width: 80,
          height: 80,
          background: 'color-mix(in srgb, var(--status-bad) 14%, transparent)',
        }}
      >
        <TriangleAlert size={34} strokeWidth={1.8} color="var(--status-bad)" />
      </div>
      <div className="min-w-0">
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            fontWeight: 500,
            lineHeight: 1.5,
            color: 'var(--fg-1)',
            textWrap: 'pretty',
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            color: 'var(--fg-2)',
            marginTop: 6,
            lineHeight: 1.5,
            textWrap: 'pretty',
          }}
        >
          {desc}
        </div>
      </div>
    </div>
  )
}

function DeleteConfirmStep({
  warningMessage,
  error,
  loading,
  onCancel,
  onRequestDeletion,
}: Readonly<{
  warningMessage: string
  error: string
  loading: boolean
  onCancel: () => void
  onRequestDeletion: () => void
}>) {
  const t = useTranslations()

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <DeleteWarningCard
        title={warningMessage}
        desc={t('profile.deleteAccount.warningDetail')}
      />
      {error && (
        <p
          role="alert"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: 'var(--status-bad-text)',
          }}
        >
          {error}
        </p>
      )}
      <div
        className="flex flex-col sm:mx-auto sm:w-full sm:max-w-[360px]"
        style={{ gap: 12, paddingTop: 8 }}
      >
        <DangerPillButton disabled={loading} onClick={onRequestDeletion}>
          {loading ? t('profile.deleteAccount.sending') : t('profile.deleteAccount.sendCode')}
        </DangerPillButton>
        <PillButton variant="ghost" fullWidth disabled={loading} onClick={onCancel}>
          {t('common.cancel')}
        </PillButton>
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
  onBack,
  onConfirmDeletion,
}: Readonly<{
  code: string[]
  inputRefs: React.RefObject<(HTMLInputElement | null)[]>
  error: string
  loading: boolean
  onCodeInput: (index: number, value: string) => void
  onCodeKeydown: (index: number, event: React.KeyboardEvent<HTMLInputElement>) => void
  onCodePaste: (event: React.ClipboardEvent<HTMLInputElement>) => void
  onBack: () => void
  onConfirmDeletion: () => void
}>) {
  const t = useTranslations()

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 15,
          color: 'var(--fg-2)',
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
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: 'var(--status-bad-text)',
          }}
        >
          {error}
        </p>
      )}
      <div
        className="flex flex-col sm:mx-auto sm:w-full sm:max-w-[360px]"
        style={{ gap: 12, paddingTop: 8 }}
      >
        <DangerPillButton
          disabled={loading || code.join('').length !== 6}
          onClick={onConfirmDeletion}
        >
          {loading ? t('profile.deleteAccount.deleting') : t('profile.deleteAccount.confirmDelete')}
        </DangerPillButton>
        <PillButton variant="ghost" fullWidth disabled={loading} onClick={onBack}>
          {t('common.back')}
        </PillButton>
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
          fontFamily: 'var(--font-sans)',
          fontSize: 15,
          color: 'var(--fg-2)',
          lineHeight: 1.55,
        }}
      >
        {t('profile.deleteAccount.deactivated', { date: formattedDeletionDate })}
      </p>
      <div
        className="flex flex-col sm:mx-auto sm:w-full sm:max-w-[360px]"
        style={{ paddingTop: 8 }}
      >
        <PillButton fullWidth onClick={onLogout}>
          {t('profile.logout')}
        </PillButton>
      </div>
    </div>
  )
}
