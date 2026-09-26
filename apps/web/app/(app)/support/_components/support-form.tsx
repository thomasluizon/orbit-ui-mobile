'use client'

import { useTranslations } from 'next-intl'
import {
  SUPPORT_SUBJECT_OPTIONS,
  type SupportSubjectId,
} from '@orbit/shared/utils'
import { Input } from '@/components/ui/input'
import { PillButton } from '@/components/ui/pill-button'
import { RadioGroup } from '@/components/ui/radio-row'
import { RadioRow } from '@/components/ui/select-check'
import { WifiOff } from '@/components/ui/icons'

interface SupportFormProps {
  name: string
  email: string
  subject: SupportSubjectId | null
  message: string
  appVersion: string
  messageMaxLength: number
  messageOverLimitHint: string | null
  error: string | null
  nameError: string | null
  emailError: string | null
  subjectError: string | null
  messageError: string | null
  isSending: boolean
  isOnline: boolean
  disabled: boolean
  disabledReason: string | null
  emailDisabled: boolean
  nameFocusRequest: number
  emailFocusRequest: number
  messageFocusRequest: number
  onNameChange: (next: string) => void
  onEmailChange: (next: string) => void
  onSubjectChange: (next: SupportSubjectId) => void
  onMessageChange: (next: string) => void
  onSubjectBlur: () => void
  onMessageBlur: () => void
  onSend: () => void
}

export function SupportForm({
  name,
  email,
  subject,
  message,
  appVersion,
  messageMaxLength,
  messageOverLimitHint,
  error,
  nameError,
  emailError,
  subjectError,
  messageError,
  isSending,
  isOnline,
  disabled,
  disabledReason,
  emailDisabled,
  nameFocusRequest,
  emailFocusRequest,
  messageFocusRequest,
  onNameChange,
  onEmailChange,
  onSubjectChange,
  onMessageChange,
  onSubjectBlur,
  onMessageBlur,
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
      {error ? (
        <div role="alert" className="flex flex-col gap-2 rounded-[var(--r-well)] bg-[var(--bg-well)] p-4">
          <p className="text-[17px] font-medium leading-[1.4] text-[var(--fg-1)]">
            {t('profile.support.failureTitle')}
          </p>
          <p className="text-pretty text-sm leading-[1.55] text-[var(--fg-2)]">
            {t('profile.support.failureBody')}
          </p>
        </div>
      ) : null}
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
      <Input
        label={t('profile.support.email')}
        value={email}
        onChange={onEmailChange}
        placeholder={t('profile.support.emailPlaceholder')}
        disabled={isSending || emailDisabled}
        error={emailError ?? undefined}
        hint={emailDisabled ? t('profile.support.emailLockedReason') : undefined}
        kind="email"
        inputMode="email"
        autoComplete="email"
        focusRequest={emailFocusRequest}
      />
      <div className="flex min-w-0 flex-col gap-2">
        <span id="support-subject-label" className="text-sm font-medium text-[var(--fg-2)]">
          {t('profile.support.subject')}
        </span>
        <RadioGroup
          className="flex flex-col gap-1"
          aria-labelledby="support-subject-label"
          aria-describedby={subjectError ? 'support-subject-error' : undefined}
          aria-invalid={subjectError ? true : undefined}
          onBlur={onSubjectBlur}
        >
          {SUPPORT_SUBJECT_OPTIONS.map((option) => (
            isSending ? (
              <RadioRow
                key={option.id}
                label={t(option.labelKey)}
                description={t(option.descriptionKey)}
                selected={subject === option.id}
                disabled
                reason={t('profile.support.subjectSendingReason')}
              />
            ) : (
              <RadioRow
                key={option.id}
                label={t(option.labelKey)}
                description={t(option.descriptionKey)}
                selected={subject === option.id}
                onSelect={() => onSubjectChange(option.id)}
              />
            )
          ))}
        </RadioGroup>
        {subjectError ? (
          <p id="support-subject-error" role="alert" className="text-sm text-[var(--status-bad-text)]">
            {subjectError}
          </p>
        ) : null}
      </div>
      <Input
        label={t('profile.support.message')}
        value={message}
        onChange={onMessageChange}
        placeholder={t('profile.support.messagePlaceholder')}
        disabled={isSending}
        error={messageError ?? undefined}
        hint={messageOverLimitHint ?? undefined}
        maxLength={messageMaxLength}
        multiline
        rows={6}
        focusRequest={messageFocusRequest}
        onBlur={onMessageBlur}
      />
      <p className="text-pretty text-sm leading-[1.5] text-[var(--fg-3)]">
        {t('profile.support.versionIncluded', { version: appVersion })}
      </p>
      {!isOnline ? (
        <div
          id="support-send-reason"
          role="status"
          className="flex min-w-0 items-center gap-3 rounded-[var(--r-well)] bg-[var(--bg-well)] p-3"
        >
          <WifiOff size={20} aria-hidden className="shrink-0 text-[var(--fg-3)]" />
          <p className="min-w-0 flex-1 text-pretty text-sm leading-[1.5] text-[var(--fg-2)]">
            {t('profile.support.offlineReason')}
          </p>
        </div>
      ) : disabledReason ? (
        <p id="support-send-reason" className="text-sm text-[var(--fg-2)]">
          {disabledReason}
        </p>
      ) : null}
      <div className="[&_button]:w-full md:[&_button]:w-auto md:[&_button]:bg-[var(--fg-1)] md:[&_button]:text-[var(--bg)] md:[&_button:enabled:hover]:opacity-90 md:[&_button:enabled:active]:opacity-85">
        <PillButton
          disabled={disabled}
          loading={isSending}
          descriptionId={!isOnline || disabledReason ? 'support-send-reason' : undefined}
        >
          {error ? t('profile.support.retry') : t('profile.support.send')}
        </PillButton>
      </div>
    </form>
  )
}
