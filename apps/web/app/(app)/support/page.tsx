'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Loader2, Send } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/hooks/use-profile'
import { useOffline } from '@/hooks/use-offline'
import { isValidEmail } from '@orbit/shared/utils/email'
import { buildSupportRequestBody, getErrorMessage } from '@orbit/shared/utils'
import { sendSupportMessage } from '@/app/actions/support'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'

const SUPPORT_DRAFT_STORAGE_KEY = 'orbit-support-draft'

export default function SupportPage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile } = useProfile()
  const { isOnline } = useOffline()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  useEffect(() => {
    if (globalThis.localStorage === undefined) return

    const storedDraft = globalThis.localStorage.getItem(SUPPORT_DRAFT_STORAGE_KEY)
    if (!storedDraft) return

    try {
      const draft = JSON.parse(storedDraft) as Partial<Record<'name' | 'email' | 'subject' | 'message', string>>
      setName(draft.name ?? '')
      setEmail(draft.email ?? '')
      setSubject(draft.subject ?? '')
      setMessage(draft.message ?? '')
    } catch {
      globalThis.localStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
    }
  }, [])

  // Pre-fill from profile
  useEffect(() => {
    if (profile) {
      setName((current) => current || profile.name || '')
      setEmail((current) => current || profile.email || '')
    }
  }, [profile])

  useEffect(() => {
    if (globalThis.localStorage === undefined) return

    const draft = {
      name,
      email,
      subject,
      message,
    }
    const hasDraft = Object.values(draft).some((value) => value.trim().length > 0)

    if (!hasDraft) {
      globalThis.localStorage.removeItem(SUPPORT_DRAFT_STORAGE_KEY)
      return
    }

    globalThis.localStorage.setItem(SUPPORT_DRAFT_STORAGE_KEY, JSON.stringify(draft))
  }, [email, message, name, subject])

  function validateForm(): boolean {
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
  }

  const handleSend = useCallback(async () => {
    if (!isOnline) {
      return
    }

    if (!subject.trim() || !message.trim()) return
    if (!validateForm()) return

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
  }, [email, isOnline, message, name, profile, subject, t])

  return (
    <div className="pb-8">
      {/* Header */}
      <header className="pt-8 pb-6 flex items-center gap-3">
        <button
          type="button"
          aria-label={t('common.backToProfile')}
          className="p-2 -ml-2 rounded-full hover:bg-surface transition-colors"
          onClick={() => goBackOrFallback('/profile')}
        >
          <ArrowLeft className="size-5 text-text-primary" />
        </button>
        <h1 className="text-[length:var(--text-fluid-2xl)] font-bold text-text-primary tracking-tight">
          {t('profile.support.title')}
        </h1>
      </header>

      <div className="space-y-4">
        <div className="bg-surface rounded-[var(--radius-xl)] shadow-[var(--shadow-sm)] p-5 space-y-3">
          <p className="text-sm text-text-secondary">{t('profile.support.description')}</p>
          {!isOnline && (
            <OfflineUnavailableState
              title={t('calendarSync.notConnected')}
              description={`${t('profile.support.send')} / ${t('profile.support.description')}`}
              compact
            />
          )}

          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-[var(--radius-lg)] px-4 py-3 text-sm text-emerald-400">
              {t('profile.support.success')}
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-[var(--radius-lg)] px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('profile.support.namePlaceholder')}
                  aria-label={t('profile.support.namePlaceholder')}
                  className={`w-full bg-background text-text-primary placeholder-text-muted rounded-[var(--radius-lg)] py-2.5 px-4 text-sm border focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all duration-200 ${
                    nameError ? 'border-red-500' : 'border-border'
                  }`}
                />
                {nameError && <p className="text-xs text-red-400 mt-1 px-1">{nameError}</p>}
              </div>
              <div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('profile.support.emailPlaceholder')}
                  aria-label={t('profile.support.emailPlaceholder')}
                  className={`w-full bg-background text-text-primary placeholder-text-muted rounded-[var(--radius-lg)] py-2.5 px-4 text-sm border focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all duration-200 ${
                    emailError ? 'border-red-500' : 'border-border'
                  }`}
                />
                {emailError && <p className="text-xs text-red-400 mt-1 px-1">{emailError}</p>}
              </div>
            </div>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t('profile.support.subjectPlaceholder')}
              aria-label={t('profile.support.subjectPlaceholder')}
              className="w-full bg-background text-text-primary placeholder-text-muted rounded-[var(--radius-lg)] py-2.5 px-4 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all duration-200"
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('profile.support.messagePlaceholder')}
              aria-label={t('profile.support.messagePlaceholder')}
              rows={5}
              className="w-full bg-background text-text-primary placeholder-text-muted rounded-[var(--radius-lg)] py-2.5 px-4 text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none transition-all duration-200"
            />
            <button
              disabled={isSending || !subject.trim() || !message.trim() || !isOnline}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-[var(--radius-xl)] transition-all duration-200 active:scale-[0.98] shadow-[var(--shadow-glow-sm)] disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              onClick={handleSend}
            >
              {isSending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {t('profile.support.send')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
