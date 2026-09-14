'use client'

import { useTranslations } from 'next-intl'
import {
  SUPPORT_API_MESSAGE_MAX_LENGTH,
  SUPPORT_API_SUBJECT_MAX_LENGTH,
} from '@orbit/shared/utils'
import { Input } from '@/components/ui/input'
import { PillButton } from '@/components/ui/pill-button'

interface SupportFormProps {
  name: string
  email: string
  subject: string
  message: string
  error: string | null
  nameError: string | null
  emailError: string | null
  subjectError: string | null
  messageError: string | null
  isSending: boolean
  disabled: boolean
  emailDisabled: boolean
  nameFocusRequest: number
  emailFocusRequest: number
  subjectFocusRequest: number
  messageFocusRequest: number
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
  error,
  nameError,
  emailError,
  subjectError,
  messageError,
  isSending,
  disabled,
  emailDisabled,
  nameFocusRequest,
  emailFocusRequest,
  subjectFocusRequest,
  messageFocusRequest,
  onNameChange,
  onEmailChange,
  onSubjectChange,
  onMessageChange,
  onSend,
}: Readonly<SupportFormProps>) {
  const t = useTranslations()

  return (
    <form
      noValidate
      className="flex min-w-0 flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        onSend()
      }}
    >
      <p
        className="text-pretty text-[16px] leading-[1.55] text-[var(--fg-2)]"
        style={{
          fontFamily: 'var(--font-sans)',
        }}
      >
        {t('profile.support.description')}
      </p>
      <Input
        label={t('profile.support.name')}
        value={name}
        onChange={onNameChange}
        placeholder={t('profile.support.namePlaceholder')}
        disabled={isSending}
        error={nameError ?? undefined}
        autoComplete="name"
        focusRequest={nameFocusRequest}
      />
      <div className="flex flex-col gap-2">
        <Input
          label={t('profile.support.email')}
          value={email}
          onChange={onEmailChange}
          placeholder={t('profile.support.emailPlaceholder')}
          disabled={isSending || emailDisabled}
          error={emailError ?? undefined}
          kind="email"
          inputMode="email"
          autoComplete="email"
          focusRequest={emailFocusRequest}
        />
        {emailDisabled ? (
          <p className="text-xs text-[var(--fg-2)]">
            {t('profile.support.emailLockedReason')}
          </p>
        ) : null}
      </div>
      <Input
        label={t('profile.support.subject')}
        value={subject}
        onChange={onSubjectChange}
        placeholder={t('profile.support.subjectPlaceholder')}
        disabled={isSending}
        error={subjectError ?? undefined}
        maxLength={SUPPORT_API_SUBJECT_MAX_LENGTH}
        focusRequest={subjectFocusRequest}
      />
      <Input
        label={t('profile.support.message')}
        value={message}
        onChange={onMessageChange}
        placeholder={t('profile.support.messagePlaceholder')}
        disabled={isSending}
        error={messageError ?? undefined}
        maxLength={SUPPORT_API_MESSAGE_MAX_LENGTH}
        multiline
        rows={6}
        focusRequest={messageFocusRequest}
      />
      {error && (
        <div
          role="alert"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 14,
            color: 'var(--status-bad-text)',
          }}
        >
          {error}
        </div>
      )}
      <div className="[&_button]:w-full md:[&_button]:bg-[var(--fg-1)] md:[&_button]:text-[var(--bg)] md:[&_button:enabled:hover]:opacity-90 md:[&_button:enabled:active]:opacity-85">
        <PillButton
          disabled={disabled}
          loading={isSending}
        >
          {t('profile.support.send')}
        </PillButton>
      </div>
    </form>
  )
}
