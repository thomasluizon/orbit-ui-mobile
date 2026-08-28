'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { parseISO } from 'date-fns'
import { TriangleAlert } from '@/components/ui/icons'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import type { Profile } from '@orbit/shared/types/profile'
import { AppOverlay } from '@/components/ui/app-overlay'
import { OtpInput } from '@/components/ui/otp-input'
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
  // react-doctor-disable-next-line prefer-useReducer -- the state pieces are updated in varying independent combinations across handlers (setCode alone, setLoading+setError, full reset), not one coordinated transition https://github.com/thomasluizon/orbit-ui-mobile/issues/243
}: Readonly<DeleteAccountModalProps>) {
  const t = useTranslations()
  const { displayDate } = useDateFormat()
  const logout = useAuthStore((s) => s.logout)

  const [step, setStep] = useState<'confirm' | 'code' | 'deactivated'>('confirm')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [scheduledDeletionDate, setScheduledDeletionDate] = useState<string | null>(null)

  function handleOpenChange(value: boolean) {
    if (value) {
      setStep('confirm')
      setCode('')
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
    if (code.length !== 6) return
    setLoading(true)
    setError('')
    try {
      const response = await confirmDeletion(code)
      setScheduledDeletionDate(response.scheduledDeletionAt ?? null)
      setStep('deactivated')
    } catch (err: unknown) {
      setError(getFriendlyErrorMessage(err, t, 'profile.deleteAccount.errorGeneric', 'generic'))
    } finally {
      setLoading(false)
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
    // react-doctor-disable-next-line exhaustive-deps -- hasProAccess/planExpiresAt are derived from profile every render and already listed; no staleness possible https://github.com/thomasluizon/orbit-ui-mobile/issues/243
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
          onRequestDeletion={() => void handleRequestDeletion()}
        />
      )
    }

    if (step === 'code') {
      return (
        <DeleteCodeStep
          code={code}
          error={error}
          loading={loading}
          onCodeChange={setCode}
          onBack={() => {
            setStep('confirm')
            setCode('')
            setError('')
          }}
          onConfirmDeletion={() => void handleConfirmDeletion()}
        />
      )
    }

    return (
      <DeleteDeactivatedStep
        formattedDeletionDate={formattedDeletionDate}
        onLogout={() => void logout()}
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
      className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border-0 px-[26px] py-4 text-[16px] font-medium transition-[opacity,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] enabled:hover:opacity-90 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
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
        <PillButton variant="ghost"  disabled={loading} onClick={onCancel}>
          {t('common.cancel')}
        </PillButton>
      </div>
    </div>
  )
}

function DeleteCodeStep({
  code,
  error,
  loading,
  onCodeChange,
  onBack,
  onConfirmDeletion,
}: Readonly<{
  code: string
  error: string
  loading: boolean
  onCodeChange: (value: string) => void
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
      <OtpInput
        label={t('profile.deleteAccount.headingConfirmCode')}
        value={code}
        onChange={onCodeChange}
        error={error || undefined}
      />
      <div
        className="flex flex-col sm:mx-auto sm:w-full sm:max-w-[360px]"
        style={{ gap: 12, paddingTop: 8 }}
      >
        <DangerPillButton
          disabled={loading || code.length !== 6}
          onClick={onConfirmDeletion}
        >
          {loading ? t('profile.deleteAccount.deleting') : t('profile.deleteAccount.confirmDelete')}
        </DangerPillButton>
        <PillButton variant="ghost"  disabled={loading} onClick={onBack}>
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
        <PillButton  onClick={onLogout}>
          {t('profile.logout')}
        </PillButton>
      </div>
    </div>
  )
}
