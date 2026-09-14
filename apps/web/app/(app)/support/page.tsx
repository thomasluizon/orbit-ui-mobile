'use client'

import { useState, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/hooks/use-profile'
import { useOffline } from '@/hooks/use-offline'
import { buildSupportRequestBody, getFriendlyErrorMessage } from '@orbit/shared/utils'
import { isValidEmail } from '@orbit/shared/utils/email'
import { sendSupportMessage } from '@/app/actions/support'
import { AppBar } from '@/components/ui/app-bar'
import { ErrorState } from '@/components/ui/error-state'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { SupportSuccessState } from './_components/support-success-state'
import { SupportForm } from './_components/support-form'

const SUPPORT_DRAFT_STORAGE_KEY = 'orbit-support-draft'

function readSupportDraft() {
  if (typeof localStorage === 'undefined') return { subject: '', message: '' }
  const stored = localStorage.getItem(SUPPORT_DRAFT_STORAGE_KEY)
  if (!stored) return { subject: '', message: '' }
  try {
    const draft = JSON.parse(stored) as Record<string, unknown>
    return {
      subject: typeof draft.subject === 'string' ? draft.subject : '',
      message: typeof draft.message === 'string' ? draft.message : '',
    }
  } catch {
    localStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
    return { subject: '', message: '' }
  }
}

export default function SupportPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile } = useProfile()
  const { isOnline } = useOffline()

  const [initialDraft] = useState(readSupportDraft)
  const draftRef = useRef(initialDraft)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState(initialDraft.subject)
  const [message, setMessage] = useState(initialDraft.message)
  const [isSending, setIsSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [nameFocusRequest, setNameFocusRequest] = useState(0)
  const [emailFocusRequest, setEmailFocusRequest] = useState(0)

  const persistDraft = useCallback((change: Partial<typeof initialDraft>) => {
    draftRef.current = { ...draftRef.current, ...change }
    globalThis.localStorage.setItem(
      SUPPORT_DRAFT_STORAGE_KEY,
      JSON.stringify(draftRef.current),
    )
  }, [])

  const validateContact = useCallback(() => {
    const effectiveName = name.trim() || profile?.name || ''
    const effectiveEmail = email.trim() || profile?.email || ''
    const nextNameError = effectiveName ? null : t('profile.support.nameRequired')
    const nextEmailError = !effectiveEmail
      ? t('profile.support.emailRequired')
      : isValidEmail(effectiveEmail) ? null : t('profile.support.emailInvalid')
    setNameError(nextNameError)
    setEmailError(nextEmailError)
    if (nextNameError) setNameFocusRequest((request) => request + 1)
    else if (nextEmailError) setEmailFocusRequest((request) => request + 1)
    return !nextNameError && !nextEmailError
  }, [email, name, profile, t])

  const handleSend = useCallback(async () => {
    if (!isOnline) return
    if (!subject.trim() || !message.trim()) return
    if (!validateContact()) return

    setIsSending(true)
    setError(null)
    setSuccess(false)

    try {
      const payload = buildSupportRequestBody(profile, {
        name,
        email,
        subject,
        message,
      })
      await sendSupportMessage(payload)
      setSuccess(true)
      draftRef.current = { subject: '', message: '' }
      setSubject('')
      setMessage('')
      globalThis.localStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
    } catch (err: unknown) {
      setError(getFriendlyErrorMessage(err, t, 'auth.genericError', 'generic'))
    } finally {
      setIsSending(false)
    }
  }, [email, isOnline, message, name, profile, subject, t, validateContact])

  const disabled = isSending || !subject.trim() || !message.trim() || !isOnline

  return (
    <div className="min-w-0 md:mx-auto md:w-full md:max-w-[620px]">
      <div className="flex flex-col min-h-[100dvh]">
        <AppBar
          backLabel={t('common.backToProfile')}
          onBack={() => goBackOrFallback('/profile')}
          title={t('profile.support.title')}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {!isOnline && (
            <div className="mb-4">
              <ErrorState message={t('offline.description')} />
            </div>
          )}

          {success ? (
            <SupportSuccessState />
          ) : (
            <div className="min-w-0 md:max-w-[520px]">
              <SupportForm
                name={name || profile?.name || ''}
                email={email || profile?.email || ''}
                subject={subject}
                message={message}
                error={error}
                nameError={nameError}
                emailError={emailError}
                isSending={isSending}
                disabled={disabled}
                emailDisabled={Boolean(profile?.email)}
                nameFocusRequest={nameFocusRequest}
                emailFocusRequest={emailFocusRequest}
                onNameChange={(next) => {
                  setName(next)
                  setNameError(null)
                }}
                onEmailChange={(next) => {
                  setEmail(next)
                  setEmailError(null)
                }}
                onSubjectChange={(next) => {
                  setSubject(next)
                  persistDraft({ subject: next })
                }}
                onMessageChange={(next) => {
                  setMessage(next)
                  persistDraft({ message: next })
                }}
                onSend={() => void handleSend()}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
