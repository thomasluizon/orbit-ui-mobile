'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { parseISO } from 'date-fns'
import { Clock } from 'lucide-react'
import { getErrorMessage } from '@orbit/shared/utils'
import type { Profile } from '@orbit/shared/types/profile'
import { AppOverlay } from '@/components/ui/app-overlay'
import { useAuthStore } from '@/stores/auth-store'
import { useDateFormat } from '@/hooks/use-date-format'
import { requestDeletion, confirmDeletion } from '@/app/actions/auth'

interface DeleteAccountModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: Profile | undefined
}

export function DeleteAccountModal({ open, onOpenChange, profile }: Readonly<DeleteAccountModalProps>) {
  const t = useTranslations()
  const { displayDate } = useDateFormat()
  const logout = useAuthStore((s) => s.logout)

  const [step, setStep] = useState<'confirm' | 'code' | 'deactivated'>('confirm')
  const [code, setCode] = useState(['', '', '', '', '', ''])
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

  function handleCodeInput(index: number, event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value.replaceAll(/\D/g, '')
    const next = [...code]
    next[index] = value.slice(-1)
    setCode(next)
    if (value && index < 5) {
      const nextInput = event.target.parentElement?.children[index + 1] as HTMLInputElement
      nextInput?.focus()
    }
  }

  function handleCodeKeydown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !code[index] && index > 0) {
      const prev = (event.target as HTMLElement).parentElement?.children[index - 1] as HTMLInputElement
      prev?.focus()
    }
  }

  function handleCodePaste(event: React.ClipboardEvent) {
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

  const warningMessage = useMemo(() => {
    if (profile?.hasProAccess && profile?.planExpiresAt) {
      return t('profile.deleteAccount.warningPro', {
        date: displayDate(parseISO(profile.planExpiresAt)),
      })
    }
    return t('profile.deleteAccount.warningFree')
  }, [profile?.hasProAccess, profile?.planExpiresAt, displayDate, t])

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

  return (
    <AppOverlay
      open={open}
      onOpenChange={handleOpenChange}
      title={t('profile.deleteAccount.title')}
    >
      {renderStep()}
    </AppOverlay>
  )
}

// --- Sub-components for each step ---

const CODE_DIGIT_INDICES = [0, 1, 2, 3, 4, 5] as const

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
    <div className="space-y-4">
      <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
        <p className="text-sm text-red-400 font-bold mb-2">{warningMessage}</p>
        <p className="text-xs text-text-secondary leading-relaxed">
          {t('profile.deleteAccount.warningDetail')}
        </p>
      </div>
      {error && (
        <p className="text-xs text-red-400 text-center">{error}</p>
      )}
      <button
        className="w-full py-3 rounded-2xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors disabled:opacity-50"
        disabled={loading}
        onClick={onRequestDeletion}
      >
        {loading ? t('profile.deleteAccount.sending') : t('profile.deleteAccount.sendCode')}
      </button>
    </div>
  )
}

function DeleteCodeStep({
  code,
  error,
  loading,
  onCodeInput,
  onCodeKeydown,
  onCodePaste,
  onConfirmDeletion,
}: Readonly<{
  code: string[]
  error: string
  loading: boolean
  onCodeInput: (index: number, event: React.ChangeEvent<HTMLInputElement>) => void
  onCodeKeydown: (index: number, event: React.KeyboardEvent<HTMLInputElement>) => void
  onCodePaste: (event: React.ClipboardEvent) => void
  onConfirmDeletion: () => void
}>) {
  const t = useTranslations()

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary text-center">
        {t('profile.deleteAccount.codeInstructions')}
      </p>
      <div className="flex justify-center gap-2" onPaste={onCodePaste}>
        {CODE_DIGIT_INDICES.map((i) => (
          <input
            key={`digit-${i}`}
            aria-label={t('auth.codeDigit', { n: i + 1 })}
            type="text"
            inputMode="numeric"
            maxLength={1}
            className="w-11 h-13 text-center text-xl font-bold bg-surface-elevated border border-border rounded-xl text-text-primary focus:border-red-500 focus:outline-none transition-colors"
            value={code[i]}
            onChange={(e) => onCodeInput(i, e)}
            onKeyDown={(e) => onCodeKeydown(i, e)}
          />
        ))}
      </div>
      {error && (
        <p className="text-xs text-red-400 text-center">{error}</p>
      )}
      <button
        className="w-full py-3 rounded-2xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors disabled:opacity-50"
        disabled={loading || code.join('').length !== 6}
        onClick={onConfirmDeletion}
      >
        {loading ? t('profile.deleteAccount.deleting') : t('profile.deleteAccount.confirmDelete')}
      </button>
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
    <div className="space-y-4">
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="size-5 text-amber-400" />
          <p className="text-sm text-amber-400 font-bold">
            {t('profile.deleteAccount.title')}
          </p>
        </div>
        <p className="text-sm text-text-secondary leading-relaxed">
          {t('profile.deleteAccount.deactivated', { date: formattedDeletionDate })}
        </p>
      </div>
      <button
        className="w-full py-3 rounded-2xl bg-surface-elevated text-text-primary font-bold text-sm hover:bg-border transition-colors"
        onClick={onLogout}
      >
        {t('profile.logout')}
      </button>
    </div>
  )
}
