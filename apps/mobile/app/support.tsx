
import { unmappedBackendFormError } from '@orbit/shared/hooks'
import { extractBackendFieldErrors, getBackendFieldError } from '@orbit/shared/utils'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  AccessibilityInfo,
} from 'react-native'
import { useRouter } from 'expo-router'
import { getAppVersion } from '@/lib/app-version'
import { useTranslation } from 'react-i18next'
import { API } from '@orbit/shared/api'
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
import { useProfile } from '@/hooks/use-profile'
import { apiClient } from '@/lib/api-client'
import { SupportGuided } from '@/components/support-flow'
import { captureGuidedFlowCompleted } from '@/lib/posthog'
import { useOffline } from '@/hooks/use-offline'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import {
  forgetStoredSupportDraft,
  readStoredSupportDraft,
  writeStoredSupportDraft,
} from '@/lib/support-draft-storage'

interface SupportDraft {
  subject: SupportSubjectId | null
  message: string
}

export default function SupportScreen() {
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const { t } = useTranslation()
  const { isOnline } = useOffline()
  const { profile } = useProfile()
  const appVersion = getAppVersion()
  const draftRef = useRef<SupportDraft>({ subject: null, message: '' })
  const draftChangedRef = useRef(false)
  const [subject, setSubject] = useState<SupportSubjectId | null>(null)
  const [message, setMessage] = useState('')
  const [, setMessageAsked] = useState(false)
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [subjectError, setSubjectError] = useState<string | null>(null)
  const [messageError, setMessageError] = useState<string | null>(null)
  const [, setSubjectFocusRequest] = useState(0)
  const [messageFocusRequest, setMessageFocusRequest] = useState(0)
  const [step, setStep] = useState<'subject' | 'message'>('subject')
  const resolvedEmail = profile?.email || ''
  const hasSubject = subject !== null
  const hasMessage = Boolean(message.trim())
  const messageFit = getSupportMessageFit(message, appVersion)
  const messageMaxLength = Math.max(getSupportMessageMaxLength(appVersion), message.length)
  const messageOverLimitHint = messageFit.fits
    ? null
    : t('profile.support.messageOverLimit', { overage: messageFit.overage })
  const disabledReasonKey = getSupportSendReasonKey({
    hasMessage,
    hasProfile: Boolean(profile),
    hasSubject,
    isOnline,
    isSending: sending,
    messageFits: messageFit.fits,
  })
  const disabledReason = disabledReasonKey ? t(disabledReasonKey) : null

  useEffect(() => {
    let isMounted = true
    void readStoredSupportDraft()
      .then((storedDraft) => {
        if (!isMounted || !storedDraft || draftChangedRef.current) return
        try {
          const draft = JSON.parse(storedDraft) as Record<string, unknown>
          const restoredDraft = {
            subject: normalizeSupportSubjectId(draft.subject),
            message: typeof draft.message === 'string' ? draft.message : '',
          } satisfies SupportDraft
          draftRef.current = restoredDraft
          setSubject(restoredDraft.subject)
          setMessage(restoredDraft.message)
          setMessageAsked(restoredDraft.subject !== null || restoredDraft.message !== '')
          setStep(restoredDraft.subject === null ? 'subject' : 'message')
        } catch {
          void forgetStoredSupportDraft()
        }
      })
      .catch(() => {})
    return () => {
      isMounted = false
    }
  }, [])

  const persistDraft = useCallback((change: Partial<typeof draftRef.current>) => {
    draftChangedRef.current = true
    draftRef.current = { ...draftRef.current, ...change }
    void writeStoredSupportDraft(JSON.stringify(draftRef.current))
  }, [])

  const validateFields = () => {
    const nextSubjectError = subject ? null : t('profile.support.subjectRequired')
    const nextMessageError = !message.trim()
      ? t('profile.support.messageRequired')
      : messageOverLimitHint
    setSubjectError(nextSubjectError)
    setMessageError(nextMessageError)
    setMessageAsked(true)
    if (nextSubjectError) setSubjectFocusRequest((request) => request + 1)
    else if (nextMessageError) setMessageFocusRequest((request) => request + 1)
    return !nextSubjectError && !nextMessageError
  }

  const handleSend = async () => {
    if (sending || !isOnline) return
    if (!validateFields() || !profile) return
    const selectedSubject = SUPPORT_SUBJECT_OPTIONS.find((option) => option.id === subject)
    if (!selectedSubject) return

    setSending(true)
    setError(null)
    setValidationMessage(null)
    setSuccess(false)

    try {
      await apiClient(API.support.send, {
        method: 'POST',
        body: JSON.stringify(
          buildSupportRequestBody(profile, {
            subject: t(selectedSubject.labelKey),
            message: attachSupportVersion(message, appVersion),
          }),
        ),
      })
      setSuccess(true)
      captureGuidedFlowCompleted('support_request', 2, false)
      setStep('subject')
      draftRef.current = { subject: null, message: '' }
      setSubject(null)
      setMessage('')
      setMessageAsked(false)
      void forgetStoredSupportDraft()
    } catch (err: unknown) {
      const subjectFailure = getBackendFieldError(err, 'Subject')
      const messageFailure = getBackendFieldError(err, 'Message')
      if (extractBackendFieldErrors(err)) {
        const generalFailure = unmappedBackendFormError(err, ['Subject', 'Message'])
        setError(generalFailure ?? null)
        setValidationMessage(generalFailure ?? null)
        setSubjectError(subjectFailure ?? null)
        setMessageError(messageFailure ?? null)
        if (subjectFailure) setSubjectFocusRequest((request) => request + 1)
        else if (messageFailure) setMessageFocusRequest((request) => request + 1)
        return
      }
      setError(getFriendlyErrorMessage(err, t, 'auth.genericError', 'generic'))
      AccessibilityInfo.announceForAccessibility(
        `${t('profile.support.failureTitle')} ${t('profile.support.failureBody')}`,
      )
    } finally {
      setSending(false)
    }
  }
  const onSubjectChange = (next: SupportSubjectId) => {
    setSubject(next)
    setSubjectError(null)
    setMessageAsked(true)
    persistDraft({ subject: next })
  }
  const onMessageChange = (next: string) => {
    setMessage(next)
    setMessageError(null)
    persistDraft({ message: next })
  }
  const onMessageBlur = () => {
    if (!message.trim()) setMessageError(t('profile.support.messageRequired'))
  }

  return (
    <SupportGuided
      sent={success}
      onOpenAbout={() => router.push('/about')}
      onDismissResult={() => setSuccess(false)}
      step={step}
      email={resolvedEmail}
      subject={subject}
      message={message}
      appVersion={appVersion}
      messageMaxLength={messageMaxLength}
      messageOverLimitHint={messageOverLimitHint}
      validationMessage={validationMessage}
      error={error}
      subjectError={subjectError}
      messageError={messageError}
      isSending={sending}
      isOnline={isOnline}
      disabledReason={disabledReason}
      messageFocusRequest={messageFocusRequest}
      onSubjectSelect={(next) => { onSubjectChange(next); setStep('message') }}
      onMessageChange={onMessageChange}
      onMessageBlur={onMessageBlur}
      onSend={() => { void handleSend() }}
      onBack={() => setStep('subject')}
      onClose={() => goBackOrFallback('/profile')}
    />
  )
}
