'use client'

import { useState, useEffect, useCallback } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/hooks/use-profile'
import { useOffline } from '@/hooks/use-offline'
import { isValidEmail } from '@orbit/shared/utils/email'
import { buildSupportRequestBody, getErrorMessage } from '@orbit/shared/utils'
import { sendSupportMessage } from '@/app/actions/support'
import { AppBar } from '@/components/ui/app-bar'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'

const SUPPORT_DRAFT_STORAGE_KEY = 'orbit-support-draft'

interface UnderlinedInputProps {
  label?: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  ariaLabel?: string
  type?: 'text' | 'email'
  mono?: boolean
  error?: string | null
  multiline?: boolean
  rows?: number
}

function UnderlinedInput({
  label,
  value,
  onChange,
  placeholder,
  ariaLabel,
  type = 'text',
  mono = false,
  error,
  multiline = false,
  rows = 4,
}: Readonly<UnderlinedInputProps>) {
  const family = mono ? 'var(--font-family-mono)' : 'var(--font-family-sans)'
  const Tag = multiline ? 'textarea' : 'input'
  return (
    <label className="flex flex-col gap-1.5 flex-1 min-w-0">
      {label && (
        <span
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--fg-3)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
      )}
      <Tag
        type={multiline ? undefined : type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? label}
        rows={multiline ? rows : undefined}
        className="appearance-none border-0 bg-transparent outline-none resize-none w-full"
        style={{
          fontFamily: family,
          fontSize: 15,
          color: 'var(--fg-1)',
          padding: '6px 0',
          borderBottom: `1px solid ${error ? 'var(--status-overdue)' : 'var(--hairline-strong)'}`,
        }}
      />
      {error && (
        <span
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 12,
            fontStyle: 'italic',
            color: 'var(--status-overdue)',
          }}
        >
          {error}
        </span>
      )}
    </label>
  )
}

export default function SupportPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile } = useProfile()
  const { isOnline } = useOffline()

  const initialDraft = (() => {
    if (typeof globalThis === 'undefined' || globalThis.localStorage === undefined) {
      return { name: '', email: '', subject: '', message: '' }
    }
    const stored = globalThis.localStorage.getItem(SUPPORT_DRAFT_STORAGE_KEY)
    if (!stored) return { name: '', email: '', subject: '', message: '' }
    try {
      const draft = JSON.parse(stored) as Partial<Record<'name' | 'email' | 'subject' | 'message', string>>
      return {
        name: draft.name ?? '',
        email: draft.email ?? '',
        subject: draft.subject ?? '',
        message: draft.message ?? '',
      }
    } catch {
      globalThis.localStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
      return { name: '', email: '', subject: '', message: '' }
    }
  })()
  const [name, setName] = useState(initialDraft.name)
  const [email, setEmail] = useState(initialDraft.email)
  const [subject, setSubject] = useState(initialDraft.subject)
  const [message, setMessage] = useState(initialDraft.message)
  const [isSending, setIsSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  const profileKey = profile?.email ?? null
  const [previousProfileKey, setPreviousProfileKey] = useState<string | null>(profileKey)
  if (profileKey !== previousProfileKey) {
    setPreviousProfileKey(profileKey)
    if (profile) {
      if (!name) setName(profile.name ?? '')
      if (!email) setEmail(profile.email ?? '')
    }
  }

  useEffect(() => {
    if (globalThis.localStorage === undefined) return
    const draft = { name, email, subject, message }
    const hasDraft = Object.values(draft).some((value) => value.trim().length > 0)
    if (!hasDraft) {
      globalThis.localStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
      return
    }
    globalThis.localStorage.setItem(SUPPORT_DRAFT_STORAGE_KEY, JSON.stringify(draft))
  }, [email, message, name, subject])

  const validateForm = useCallback((): boolean => {
    setNameError(null)
    setEmailError(null)
    let valid = true

    const effectiveName = name.trim() || profile?.name
    if (!effectiveName) {
      setNameError(t('profile.support.nameRequired'))
      valid = false
    }

    const effectiveEmail = email.trim() || profile?.email
    if (!effectiveEmail) {
      setEmailError(t('profile.support.emailRequired'))
      valid = false
    } else if (!isValidEmail(effectiveEmail)) {
      setEmailError(t('profile.support.emailInvalid'))
      valid = false
    }

    return valid
  }, [name, email, profile?.name, profile?.email, t])

  const handleSend = useCallback(async () => {
    if (!isOnline) return
    if (!subject.trim() || !message.trim()) return
    if (!validateForm()) return

    setIsSending(true)
    setError(null)
    setSuccess(false)

    try {
      const payload = buildSupportRequestBody(profile, { name, email, subject, message })
      await sendSupportMessage(payload)
      setSuccess(true)
      setSubject('')
      setMessage('')
      if (globalThis.localStorage !== undefined) {
        globalThis.localStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, t('auth.genericError')))
    } finally {
      setIsSending(false)
    }
  }, [email, isOnline, message, name, profile, subject, t, validateForm])

  const disabled = isSending || !subject.trim() || !message.trim() || !isOnline

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <AppBar
        back
        backLabel={t('common.backToProfile')}
        onBack={() => goBackOrFallback('/profile')}
        title={t('profile.support.title')}
      />
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: '16px 20px' }}>
        {!isOnline && (
          <div className="mb-4">
            <OfflineUnavailableState
              title={t('calendarSync.notConnected')}
              description={`${t('profile.support.send')} / ${t('profile.support.description')}`}
              compact
            />
          </div>
        )}

        {success ? (
          <div className="flex flex-col items-center gap-3.5 py-10">
            <Check size={28} strokeWidth={1.8} color="var(--primary)" />
            <span
              style={{
                fontFamily: 'var(--font-family-sans)',
                fontSize: 16,
                color: 'var(--fg-1)',
              }}
            >
              {t('profile.support.success')}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-family-sans)',
                fontSize: 13,
                color: 'var(--fg-3)',
                fontStyle: 'italic',
              }}
            >
              {t('profile.support.description')}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex gap-3">
              <UnderlinedInput
                label={t('profile.support.namePlaceholder')}
                value={name}
                onChange={setName}
                placeholder={t('profile.support.namePlaceholder')}
                ariaLabel={t('profile.support.namePlaceholder')}
                error={nameError}
              />
              <UnderlinedInput
                label={t('profile.support.emailPlaceholder')}
                value={email}
                onChange={setEmail}
                placeholder={t('profile.support.emailPlaceholder')}
                ariaLabel={t('profile.support.emailPlaceholder')}
                type="email"
                mono
                error={emailError}
              />
            </div>
            <UnderlinedInput
              label={t('profile.support.subjectPlaceholder')}
              value={subject}
              onChange={setSubject}
              placeholder={t('profile.support.subjectPlaceholder')}
              ariaLabel={t('profile.support.subjectPlaceholder')}
            />
            <UnderlinedInput
              label={t('profile.support.messagePlaceholder')}
              value={message}
              onChange={setMessage}
              placeholder={t('profile.support.messagePlaceholder')}
              ariaLabel={t('profile.support.messagePlaceholder')}
              multiline
              rows={6}
            />
            {error && (
              <div
                style={{
                  fontFamily: 'var(--font-family-sans)',
                  fontSize: 14,
                  fontStyle: 'italic',
                  color: 'var(--status-overdue)',
                }}
              >
                {error}
              </div>
            )}
            <button
              type="button"
              disabled={disabled}
              onClick={handleSend}
              aria-label={t('profile.support.send')}
              className="appearance-none border-0 cursor-pointer disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 w-full"
              style={{
                marginTop: 8,
                height: 44,
                borderRadius: 8,
                background: disabled ? 'var(--bg-elev)' : 'var(--primary)',
                color: disabled ? 'var(--fg-3)' : 'var(--fg-on-primary)',
                fontFamily: 'var(--font-family-sans)',
                fontSize: 14,
                fontWeight: 600,
                boxShadow: disabled ? 'inset 0 0 0 1px var(--hairline-strong)' : 'none',
              }}
            >
              {isSending && <Loader2 size={14} className="animate-spin" />}
              {t('profile.support.send')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
