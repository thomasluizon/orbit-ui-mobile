'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/hooks/use-profile'
import { useOffline } from '@/hooks/use-offline'
import { isValidEmail } from '@orbit/shared/utils/email'
import { buildSupportRequestBody, getErrorMessage } from '@orbit/shared/utils'
import { sendSupportMessage } from '@/app/actions/support'
import { AppBar } from '@/components/ui/app-bar'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { SupportSuccessState } from './_components/support-success-state'
import { SupportForm } from './_components/support-form'

const SUPPORT_DRAFT_STORAGE_KEY = 'orbit-support-draft'

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
              title={t('offline.title')}
              description={t('offline.description')}
              compact
            />
          </div>
        )}

        {success ? (
          <SupportSuccessState />
        ) : (
          <SupportForm
            name={name}
            email={email}
            subject={subject}
            message={message}
            nameError={nameError}
            emailError={emailError}
            error={error}
            isSending={isSending}
            disabled={disabled}
            onNameChange={setName}
            onEmailChange={setEmail}
            onSubjectChange={setSubject}
            onMessageChange={setMessage}
            onSend={() => void handleSend()}
          />
        )}
      </div>
    </div>
  )
}
