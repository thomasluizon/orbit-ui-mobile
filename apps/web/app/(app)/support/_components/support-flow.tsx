'use client'

import { useTranslations } from 'next-intl'
import { SUPPORT_SUBJECT_OPTIONS, type SupportSubjectId } from '@orbit/shared/utils'
import { FlowScreen } from '@/components/ui/flow-screen'
import { Input } from '@/components/ui/input'
import { OptionCard } from '@/components/ui/option-card'
import { QuestionFlow } from '@/components/ui/question-flow'
import { ResultDialog } from '@/components/ui/result-dialog'
import { SupportReplyEmail } from './support-reply-email'

export interface SupportFlowProps {
  step: 'subject' | 'message'
  email: string
  subject: SupportSubjectId | null
  message: string
  appVersion: string | null
  messageMaxLength: number
  messageOverLimitHint: string | null
  validationMessage: string | null
  error: string | null
  subjectError: string | null
  messageError: string | null
  isSending: boolean
  isOnline: boolean
  disabledReason: string | null
  messageFocusRequest: number
  onSubjectSelect: (next: SupportSubjectId) => void
  onMessageChange: (next: string) => void
  onMessageBlur: () => void
  onSend: () => void
  onBack: () => void
  onClose: () => void
}

function SubjectOptions({ props }: Readonly<{ props: SupportFlowProps }>) {
  const t = useTranslations()
  return SUPPORT_SUBJECT_OPTIONS.map((option) => (
    <OptionCard
      key={option.id}
      label={t(option.optionKey)}
      selected={props.subject === option.id}
      disabled={props.isSending}
      disabledReason={t('profile.support.subjectSendingReason')}
      onSelect={() => props.onSubjectSelect(option.id)}
    />
  ))
}

function MessageStep({ props }: Readonly<{ props: SupportFlowProps }>) {
  const t = useTranslations()
  return (
    <>
      {props.error ? (
        <div role="alert" className="flex flex-col gap-2 rounded-[var(--r-well)] bg-[var(--bg-well)] p-4 text-center">
          <p className="text-[17px] font-medium leading-[1.4] text-[var(--fg-1)]">{t('profile.support.failureTitle')}</p>
          <p className="text-pretty text-sm leading-[1.55] text-[var(--fg-2)]">{props.validationMessage ?? t('profile.support.failureBody')}</p>
        </div>
      ) : null}
      <Input
        label={t('profile.support.message')}
        hideLabel
        required
        name="message"
        value={props.message}
        onChange={props.onMessageChange}
        placeholder={t('profile.support.messagePlaceholder')}
        disabled={props.isSending}
        error={props.messageError ?? undefined}
        hint={props.messageError ? undefined : props.messageOverLimitHint ?? undefined}
        maxLength={props.messageMaxLength}
        autoComplete="off"
        multiline
        rows={6}
        autoFocus
        focusRequest={props.messageFocusRequest}
        onBlur={props.onMessageBlur}
      />
      <SupportReplyEmail email={props.email} />
      {props.appVersion ? <p className="text-pretty text-center text-sm leading-[1.5] text-[var(--fg-3)]">{t('profile.support.versionIncluded', { version: props.appVersion })}</p> : null}
      {props.isOnline ? null : <p role="status" className="text-pretty text-center text-sm leading-[1.5] text-[var(--fg-2)]">{t('profile.support.offlineReason')}</p>}
    </>
  )
}

function describeStep(props: SupportFlowProps, t: ReturnType<typeof useTranslations>) {
  if (props.step === 'subject') {
    return { position: 1, direction: -1 as const, question: t('profile.support.subject'), line: null, onBack: undefined, onDismiss: props.onClose, primary: undefined }
  }
  const onBack = props.isSending ? undefined : props.onBack
  const hint = props.isOnline ? props.disabledReason ?? undefined : undefined
  const primary = { label: t(props.error ? 'profile.support.retry' : 'profile.support.send'), onPress: props.onSend, loading: props.isSending, hint }
  return { position: 2, direction: 1 as const, question: t('profile.support.message'), line: t('profile.support.description'), onBack, onDismiss: onBack ?? props.onClose, primary }
}

function SubjectError({ error }: Readonly<{ error: string | null }>) {
  return error ? <p role="alert" className="text-center text-sm text-[var(--status-bad-text)]">{error}</p> : null
}

/** The support request as a one-question flow: the subject, then the message. No mascot. A failure stays on the message step with the failure text and retry. */
export function SupportFlow(props: Readonly<SupportFlowProps>) {
  const t = useTranslations()
  const step = describeStep(props, t)
  const messaging = props.step === 'message'
  return (
    <FlowScreen label={t('profile.support.title')} onDismiss={step.onDismiss}>
      <QuestionFlow
        flow="support_request"
        showOrbit={false}
        stepKey={props.step}
        position={step.position}
        total={2}
        direction={step.direction}
        progressLabel={t('habits.flow.progress', { position: step.position, total: 2 })}
        backLabel={t('common.back')}
        closeLabel={t('common.close')}
        onClose={props.onClose}
        onBack={step.onBack}
        question={step.question}
        line={step.line}
        options={messaging ? undefined : <SubjectOptions props={props} />}
        primary={step.primary}
      >
        {messaging ? <MessageStep props={props} /> : <SubjectError error={props.subjectError} />}
      </QuestionFlow>
    </FlowScreen>
  )
}

/** The guided support surface: the flow, then the result dialog with Orbit in Feliz. The dialog replaces the success state and keeps the way back to About. */
export function SupportGuided({ sent, onOpenAbout, onDismissResult, ...flow }: Readonly<SupportFlowProps & { sent: boolean; onOpenAbout: () => void; onDismissResult: () => void }>) {
  const t = useTranslations()
  if (!sent) return <SupportFlow {...flow} />
  return (
    <ResultDialog
      title={t('result.title')}
      sentence={t('result.support.sent', { email: flow.email })}
      primaryLabel={t('profile.support.backToAbout')}
      onPrimary={onOpenAbout}
      onClose={onDismissResult}
      orbitState="feliz"
    />
  )
}
