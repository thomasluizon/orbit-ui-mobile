'use client'

import { useState, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useProfile } from '@/hooks/use-profile'
import { useOffline } from '@/hooks/use-offline'
import {
  buildSupportRequestBody,
  attachSupportVersion,
  getFriendlyErrorMessage,
  getSupportMessageFit,
  getSupportMessageMaxLength,
  getSupportSendReasonKey,
  normalizeSupportSubjectId,
  SUPPORT_SUBJECT_OPTIONS,
  type SupportSubjectId,
} from '@orbit/shared/utils'
import { sendSupportMessage } from '@/lib/actions/support'
import { getHeldAccountId } from '@/stores/auth-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import {
  forgetStoredSupportDraft,
  readStoredSupportDraft,
  writeStoredSupportDraft,
} from '@/lib/support-draft-storage'
import { PageHeader } from '@/components/ui/page-header'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useResetOnAccountChange } from '@/hooks/use-session-reset'
import { SupportSuccessState } from './_components/support-success-state'
import { SupportForm } from './_components/support-form'
import packageJson from '@/package.json'

interface SupportDraft {
  subject: SupportSubjectId | null
  message: string
}

function readSupportDraft(): SupportDraft {
  const stored = readStoredSupportDraft()
  if (!stored) return { subject: null, message: '' }
  try {
    const draft = JSON.parse(stored) as Record<string, unknown>
    return {
      subject: normalizeSupportSubjectId(draft.subject),
      message: typeof draft.message === 'string' ? draft.message : '',
    }
  } catch {
    forgetStoredSupportDraft()
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
  const [subject, setSubject] = useState(initialDraft.subject)
  const [message, setMessage] = useState(initialDraft.message)
  const [isSending, setIsSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [subjectError, setSubjectError] = useState<string | null>(null)
  const [messageError, setMessageError] = useState<string | null>(null)
  const [messageFocusRequest, setMessageFocusRequest] = useState(0)

  useResetOnAccountChange(() => {
    draftRef.current = { subject: null, message: '' }
    setSubject(null)
    setMessage('')
    setSuccess(false)
    setError(null)
    setSubjectError(null)
    setMessageError(null)
  })

  const resolvedEmail = profile?.email || ''
  const hasSubject = subject !== null
  const hasMessage = Boolean(message.trim())
  const appVersion = packageJson.version
  const messageFit = getSupportMessageFit(message, appVersion)
  const messageMaxLength = Math.max(getSupportMessageMaxLength(appVersion), message.length)
  const messageOverLimitHint = messageFit.fits
    ? null
    : t('profile.support.messageOverLimit', { overage: messageFit.overage })
  const isIncomplete = !hasSubject || !hasMessage
  const disabledReasonKey = getSupportSendReasonKey({
    hasMessage,
    hasProfile: Boolean(profile),
    hasSubject,
    isOnline,
    isSending,
    messageFits: messageFit.fits,
  })
  const disabledReason = disabledReasonKey ? t(disabledReasonKey) : null

  const persistDraft = useCallback((change: Partial<typeof initialDraft>) => {
    draftRef.current = { ...draftRef.current, ...change }
    writeStoredSupportDraft(JSON.stringify(draftRef.current))
  }, [])

  const validateFields = useCallback(() => {
    const nextSubjectError = subject ? null : t('profile.support.subjectRequired')
    const nextMessageError = message.trim() ? null : t('profile.support.messageRequired')
    setSubjectError(nextSubjectError)
    setMessageError(nextMessageError)
    if (nextMessageError) setMessageFocusRequest((request) => request + 1)
    return !nextSubjectError && !nextMessageError
  }, [message, subject, t])

  const handleSend = useCallback(async () => {
    if (!profile || !isOnline || !messageFit.fits) return
    if (!validateFields()) return
    const selectedSubject = SUPPORT_SUBJECT_OPTIONS.find((option) => option.id === subject)
    if (!selectedSubject) return

    const intendedAccountId = getHeldAccountId()
    const accountGeneration = getAccountGeneration()
    setIsSending(true)
    setError(null)
    setSuccess(false)

    try {
      const payload = buildSupportRequestBody(profile, {
        subject: t(selectedSubject.labelKey),
        message: attachSupportVersion(message, appVersion),
      })
      await sendSupportMessage(payload, intendedAccountId)
      if (getHeldAccountId() !== intendedAccountId || getAccountGeneration() !== accountGeneration) {
        setError(t('errors.api.accountChanged'))
        return
      }
      setSuccess(true)
      draftRef.current = { subject: null, message: '' }
      setSubject(null)
      setMessage('')
      forgetStoredSupportDraft()
    } catch (err: unknown) {
      setError(getFriendlyErrorMessage(err, t, 'auth.genericError', 'generic'))
    } finally {
      setIsSending(false)
    }
  }, [appVersion, isOnline, message, messageFit.fits, profile, subject, t, validateFields])

  const disabled = isSending || !isOnline || !profile || isIncomplete || !messageFit.fits

  return (
    <div className="min-w-0 md:mx-auto md:w-full md:max-w-[620px]">
      <div className="flex flex-col">
        <PageHeader
          backLabel={t('common.backToProfile')}
          onBack={() => goBackOrFallback('/profile')}
          title={t('profile.support.title')}
        />
        <div className="min-h-0 flex-1 px-4 pt-4">
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
                email={resolvedEmail}
                subject={subject}
                message={message}
                appVersion={appVersion}
                messageMaxLength={messageMaxLength}
                messageOverLimitHint={messageOverLimitHint}
                error={error}
                subjectError={subjectError}
                messageError={messageError}
                isSending={isSending}
                isOnline={isOnline}
                disabled={disabled}
                disabledReason={disabledReason}
                messageFocusRequest={messageFocusRequest}
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
