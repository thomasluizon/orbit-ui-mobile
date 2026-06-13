'use client'

import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'
import { SupportField } from './support-field'

interface SupportFormProps {
  name: string
  email: string
  subject: string
  message: string
  nameError: string | null
  emailError: string | null
  error: string | null
  isSending: boolean
  disabled: boolean
  onNameChange: (next: string) => void
  onEmailChange: (next: string) => void
  onSubjectChange: (next: string) => void
  onMessageChange: (next: string) => void
  onSend: () => void
}

export function SupportForm({
  name,
  email,
  subject,
  message,
  nameError,
  emailError,
  error,
  isSending,
  disabled,
  onNameChange,
  onEmailChange,
  onSubjectChange,
  onMessageChange,
  onSend,
}: Readonly<SupportFormProps>) {
  const t = useTranslations()

  return (
    <div className="flex flex-col stagger-enter" style={{ gap: 16 }}>
      <div className="flex" style={{ gap: 12 }}>
        <SupportField
          label={t('profile.support.namePlaceholder')}
          value={name}
          onChange={onNameChange}
          placeholder={t('profile.support.namePlaceholder')}
          ariaLabel={t('profile.support.namePlaceholder')}
          error={nameError}
        />
        <SupportField
          label={t('profile.support.emailPlaceholder')}
          value={email}
          onChange={onEmailChange}
          placeholder={t('profile.support.emailPlaceholder')}
          ariaLabel={t('profile.support.emailPlaceholder')}
          type="email"
          mono
          error={emailError}
        />
      </div>
      <SupportField
        label={t('profile.support.subjectPlaceholder')}
        value={subject}
        onChange={onSubjectChange}
        placeholder={t('profile.support.subjectPlaceholder')}
        ariaLabel={t('profile.support.subjectPlaceholder')}
      />
      <SupportField
        label={t('profile.support.messagePlaceholder')}
        value={message}
        onChange={onMessageChange}
        placeholder={t('profile.support.messagePlaceholder')}
        ariaLabel={t('profile.support.messagePlaceholder')}
        multiline
        rows={6}
      />
      {error && (
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            color: 'var(--status-bad)',
          }}
        >
          {error}
        </div>
      )}
      <div style={{ paddingTop: 8 }}>
        <PillButton
          onClick={onSend}
          disabled={disabled}
          fullWidth
          leading={
            isSending ? (
              <Loader2 size={16} strokeWidth={1.8} className="animate-spin" aria-hidden="true" />
            ) : undefined
          }
        >
          {t('profile.support.send')}
        </PillButton>
      </div>
    </div>
  )
}
