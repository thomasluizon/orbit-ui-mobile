'use client'

import { useState, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useProfile } from '@/hooks/use-profile'
import { useOffline } from '@/hooks/use-offline'
import {
  buildSupportRequestBody,
  getFriendlyErrorMessage,
  normalizeSupportSubjectId,
  SUPPORT_SUBJECT_OPTIONS,
  type SupportSubjectId,
} from '@orbit/shared/utils'
import { isValidEmail } from '@orbit/shared/utils/email'
import { sendSupportMessage } from '@/app/actions/support'
import { AppBar } from '@/components/ui/app-bar'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { SupportSuccessState } from './_components/support-success-state'
import { SupportForm } from './_components/support-form'

const SUPPORT_DRAFT_STORAGE_KEY = 'orbit-support-draft'

interface SupportDraft {
  subject: SupportSubjectId | null
  message: string
}

function readSupportDraft(): SupportDraft {
  if (typeof localStorage === 'undefined') return { subject: null, message: '' }
  const stored = localStorage.getItem(SUPPORT_DRAFT_STORAGE_KEY)
  if (!stored) return { subject: null, message: '' }
  try {
    const draft = JSON.parse(stored) as Record<string, unknown>
    return {
      subject: normalizeSupportSubjectId(draft.subject),
      message: typeof draft.message === 'string' ? draft.message : '',
    }
  } catch {
    localStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
    return { subject: null, message: '' }
  }
}

export default function SupportPage() {
  const t = useTranslations()
  const router = useRouter()
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
  const [subjectError, setSubjectError] = useState<string | null>(null)
  const [messageError, setMessageError] = useState<string | null>(null)
  const [nameFocusRequest, setNameFocusRequest] = useState(0)
  const [emailFocusRequest, setEmailFocusRequest] = useState(0)
  const [messageFocusRequest, setMessageFocusRequest] = useState(0)
  const resolvedEmail = profile?.email || email
  const displayedName = name || profile?.name || ''
  const displayedNameError = displayedName.trim() ? null : nameError
  const displayedEmailError = resolvedEmail.trim() && isValidEmail(resolvedEmail)
    ? null
    : emailError
  const hasSubject = subject !== null
  const hasMessage = Boolean(message.trim())
  const isIncomplete = !hasSubject || !hasMessage
  const incompleteReason = !isOnline || isSending || !isIncomplete
    ? null
    : !hasSubject && !hasMessage
      ? t('profile.support.sendIncomplete')
      : !hasSubject
        ? t('profile.support.sendNeedsSubject')
        : t('profile.support.sendNeedsMessage')

  const persistDraft = useCallback((change: Partial<typeof initialDraft>) => {
    draftRef.current = { ...draftRef.current, ...change }
    globalThis.localStorage.setItem(
      SUPPORT_DRAFT_STORAGE_KEY,
      JSON.stringify(draftRef.current),
    )
  }, [])

  const validateFields = useCallback(() => {
    const effectiveName = name.trim() || profile?.name || ''
    const effectiveEmail = resolvedEmail.trim()
    const nextNameError = effectiveName ? null : t('profile.support.nameRequired')
    const nextEmailError = !effectiveEmail
      ? t('profile.support.emailRequired')
      : isValidEmail(effectiveEmail) ? null : t('profile.support.emailInvalid')
    const nextSubjectError = subject ? null : t('profile.support.subjectRequired')
    const nextMessageError = message.trim() ? null : t('profile.support.messageRequired')
    setNameError(nextNameError)
    setEmailError(nextEmailError)
    setSubjectError(nextSubjectError)
    setMessageError(nextMessageError)
    if (nextNameError) setNameFocusRequest((request) => request + 1)
    else if (nextEmailError) setEmailFocusRequest((request) => request + 1)
    else if (nextMessageError) setMessageFocusRequest((request) => request + 1)
    return !nextNameError && !nextEmailError && !nextSubjectError && !nextMessageError
  }, [message, name, profile, resolvedEmail, subject, t])

  const handleSend = useCallback(async () => {
    if (!isOnline) return
    if (!validateFields()) return
    const selectedSubject = SUPPORT_SUBJECT_OPTIONS.find((option) => option.id === subject)
    if (!selectedSubject) return

    setIsSending(true)
    setError(null)
    setSuccess(false)

    try {
      const payload = buildSupportRequestBody(profile, {
        name,
        email: resolvedEmail,
        subject: t(selectedSubject.labelKey),
        message,
      })
      await sendSupportMessage(payload)
      setSuccess(true)
      draftRef.current = { subject: null, message: '' }
      setSubject(null)
      setMessage('')
      globalThis.localStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
    } catch (err: unknown) {
      setError(getFriendlyErrorMessage(err, t, 'auth.genericError', 'generic'))
    } finally {
      setIsSending(false)
    }
  }, [isOnline, message, name, profile, resolvedEmail, subject, t, validateFields])

  const disabled = isSending || !isOnline || isIncomplete

  return (
    <div className="min-w-0 md:mx-auto md:w-full md:max-w-[620px]">
      <div className="flex flex-col min-h-[100dvh]">
        <AppBar
          backLabel={t('common.backToProfile')}
          onBack={() => goBackOrFallback('/profile')}
          title={t('profile.support.title')}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <p role="status" aria-live="polite" className="sr-only">
            {success ? t('profile.support.success') : ''}
          </p>
          {success ? (
            <SupportSuccessState
              email={resolvedEmail}
              onBack={() => router.push('/about')}
            />
          ) : (
            <div className="min-w-0 md:max-w-[520px]">
              <SupportForm
                name={displayedName}
                email={resolvedEmail}
                subject={subject}
                message={message}
                error={error}
                nameError={displayedNameError}
                emailError={displayedEmailError}
                subjectError={subjectError}
                messageError={messageError}
                isSending={isSending}
                isOnline={isOnline}
                disabled={disabled}
                disabledReason={incompleteReason}
                emailDisabled={Boolean(profile?.email)}
                nameFocusRequest={nameFocusRequest}
                emailFocusRequest={emailFocusRequest}
                messageFocusRequest={messageFocusRequest}
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
                  setSubjectError(null)
                  persistDraft({ subject: next })
                }}
                onSubjectBlur={() => {
                  if (!subject) setSubjectError(t('profile.support.subjectRequired'))
                }}
                onMessageChange={(next) => {
                  setMessage(next)
                  setMessageError(null)
                  persistDraft({ message: next })
                }}
                onMessageBlur={() => {
                  if (!message.trim()) setMessageError(t('profile.support.messageRequired'))
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
