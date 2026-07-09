'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/hooks/use-profile'
import { useOffline } from '@/hooks/use-offline'
import { buildSupportRequestBody, getFriendlyErrorMessage } from '@orbit/shared/utils'
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
      return { subject: '', message: '' }
    }
    const stored = globalThis.localStorage.getItem(SUPPORT_DRAFT_STORAGE_KEY)
    if (!stored) return { subject: '', message: '' }
    try {
      const draft = JSON.parse(stored) as Partial<Record<'subject' | 'message', string>>
      return {
        subject: draft.subject ?? '',
        message: draft.message ?? '',
      }
    } catch {
      globalThis.localStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
      return { subject: '', message: '' }
    }
  })()
  const [subject, setSubject] = useState(initialDraft.subject)
  const [message, setMessage] = useState(initialDraft.message)
  const [isSending, setIsSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const draft = { subject, message }
    const hasDraft = Object.values(draft).some((value) => value.trim().length > 0)
    if (!hasDraft) {
      globalThis.localStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
      return
    }
    globalThis.localStorage.setItem(SUPPORT_DRAFT_STORAGE_KEY, JSON.stringify(draft))
  }, [message, subject])

  const handleSend = useCallback(async () => {
    if (!isOnline) return
    if (!subject.trim() || !message.trim()) return

    setIsSending(true)
    setError(null)
    setSuccess(false)

    try {
      const payload = buildSupportRequestBody(profile, {
        name: '',
        email: '',
        subject,
        message,
      })
      await sendSupportMessage(payload)
      setSuccess(true)
      setSubject('')
      setMessage('')
      globalThis.localStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
    } catch (err: unknown) {
      setError(getFriendlyErrorMessage(err, t, 'auth.genericError', 'generic'))
    } finally {
      setIsSending(false)
    }
  }, [isOnline, message, profile, subject, t])

  const disabled = isSending || !subject.trim() || !message.trim() || !isOnline

  return (
    <div className="md:mx-auto md:max-w-[900px]">
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
            <div>
              <SupportForm
                subject={subject}
                message={message}
                error={error}
                isSending={isSending}
                disabled={disabled}
                onSubjectChange={setSubject}
                onMessageChange={setMessage}
                onSend={() => void handleSend()}
              />
              <aside
                className="hidden md:flex md:flex-col"
                style={{ gap: 12, paddingTop: 28 }}
              >
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: 'var(--fg-3)',
                  }}
                >
                  {t('profile.support.description')}
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: 'var(--fg-3)',
                  }}
                >
                  {t('profile.support.successHint')}
                </p>
              </aside>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
