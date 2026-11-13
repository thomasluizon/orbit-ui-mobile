import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { SPACING } from '@orbit/shared/theme'
import { SUPPORT_SUBJECT_OPTIONS, type SupportSubjectId } from '@orbit/shared/utils'
import { SupportReplyEmail } from '@/components/support-reply-email'
import { FlowScreen } from '@/components/ui/flow-screen'
import { Input } from '@/components/ui/input'
import { OptionCard } from '@/components/ui/option-card'
import { QuestionFlow } from '@/components/ui/question-flow'
import { ResultDialog } from '@/components/ui/result-dialog'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

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
  const { t } = useTranslation()
  return SUPPORT_SUBJECT_OPTIONS.map((option) => (
    <OptionCard
      key={option.id}
      label={t(option.labelKey)}
      selected={props.subject === option.id}
      disabled={props.isSending}
      disabledReason={t('profile.support.subjectSendingReason')}
      onSelect={() => props.onSubjectSelect(option.id)}
    />
  ))
}

function MessageStep({ props }: Readonly<{ props: SupportFlowProps }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return (
    <>
      {props.error ? (
        <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.failure, { backgroundColor: tokens.bgWell }]}>
          <Text style={[styles.failureTitle, { color: tokens.fg1 }]}>{t('profile.support.failureTitle')}</Text>
          <Text style={[styles.note, { color: tokens.fg2 }]}>{props.validationMessage ?? t('profile.support.failureBody')}</Text>
        </View>
      ) : null}
      <Input
        label={t('profile.support.message')}
        hideLabel
        required
        value={props.message}
        onChange={props.onMessageChange}
        placeholder={t('profile.support.messagePlaceholder')}
        disabled={props.isSending}
        error={props.messageError ?? undefined}
        hint={props.messageError ? undefined : props.messageOverLimitHint ?? undefined}
        maxLength={props.messageMaxLength}
        multiline
        rows={6}
        autoComplete="off"
        autoFocus
        focusRequest={props.messageFocusRequest}
        onBlur={props.onMessageBlur}
      />
      <SupportReplyEmail email={props.email} />
      {props.appVersion ? <Text style={[styles.note, { color: tokens.fg3 }]}>{t('profile.support.versionIncluded', { version: props.appVersion })}</Text> : null}
      {props.isOnline ? null : <Text accessibilityLiveRegion="polite" style={[styles.note, { color: tokens.fg2 }]}>{t('profile.support.offlineReason')}</Text>}
    </>
  )
}

function SubjectError({ error }: Readonly<{ error: string | null }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return error ? <Text accessibilityRole="alert" style={[styles.note, { color: tokens.statusBadText }]}>{error}</Text> : null
}

function describeStep(props: SupportFlowProps, t: TFunction) {
  if (props.step === 'subject') {
    return { position: 1, direction: -1 as const, question: t('profile.support.subject'), line: null, onBack: undefined, onDismiss: props.onClose, primary: undefined }
  }
  const onBack = props.isSending ? undefined : props.onBack
  const hint = props.isOnline ? props.disabledReason ?? undefined : undefined
  const primary = { label: t(props.error ? 'profile.support.retry' : 'profile.support.send'), onPress: props.onSend, loading: props.isSending, hint }
  return { position: 2, direction: 1 as const, question: t('profile.support.message'), line: t('profile.support.description'), onBack, onDismiss: onBack ?? props.onClose, primary }
}

/** The support request as a one-question flow: the subject, then the message. No mascot. A failure stays on the message step with the failure text and retry. */
export function SupportFlow(props: Readonly<SupportFlowProps>) {
  const { t } = useTranslation()
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
  const { t } = useTranslation()
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

const styles = StyleSheet.create({
  failure: { gap: 8, borderRadius: radius.md, padding: SPACING.s16 },
  failureTitle: { fontFamily: 'Geist_500Medium', fontSize: 17, lineHeight: 23.8, textAlign: 'center' },
  note: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center' },
})
