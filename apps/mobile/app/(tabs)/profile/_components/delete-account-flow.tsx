import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ErrorState } from '@/components/ui/error-state'
import { FlowScreen } from '@/components/ui/flow-screen'
import { QuestionFlow } from '@/components/ui/question-flow'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface DeleteAccountFlowProps {
  step: 'warning' | 'send'
  /** The general warning, the warning for the person's plan (with the App Store notice) and the detail. */
  warnings: [string, string, string]
  email: string | null
  offline: boolean
  loading: boolean
  error: string
  canSend: boolean
  onContinue: () => void
  onBack: () => void
  onClose: () => void
  onSend: () => void
}

function Warnings({ warnings }: Readonly<{ warnings: DeleteAccountFlowProps['warnings'] }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [general, plan, detail] = warnings
  return (
    <View testID="delete-account-warnings" style={styles.warnings}>
      <Text style={[styles.strong, { color: tokens.statusBadText }]}>{general}</Text>
      <Text style={[styles.strong, { color: tokens.fg1 }]}>{plan}</Text>
      <Text style={[styles.body, { color: tokens.fg2 }]}>{detail}</Text>
    </View>
  )
}

function describeStep(props: DeleteAccountFlowProps, t: TFunction) {
  const send = () => { if (props.canSend && !props.loading) props.onSend() }
  if (props.step === 'warning') {
    const primary = props.offline ? undefined : { label: t('common.continue'), onPress: props.onContinue }
    return { position: 1, direction: -1 as const, question: t('profile.deleteAccount.headingAreYouSure'), line: null, onBack: undefined, onDismiss: props.onClose, primary }
  }
  const primary = props.offline ? undefined : { label: t('profile.deleteAccount.sendCode'), onPress: send, loading: props.loading, variant: 'destructive' as const }
  const line = props.email ? t('profile.deleteAccount.sendLine', { email: props.email }) : null
  const onBack = props.loading ? undefined : props.onBack
  return { position: 2, direction: 1 as const, question: t('profile.deleteAccount.sendQuestion'), line, onBack, onDismiss: onBack ?? props.onClose, primary }
}

function StepBody({ props }: Readonly<{ props: DeleteAccountFlowProps }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  if (props.offline) return <ErrorState message={t('profile.deleteAccount.offlineDescription')} />
  if (props.step === 'warning') return <Warnings warnings={props.warnings} />
  return props.error ? <Text accessibilityRole="alert" style={[styles.error, { color: tokens.statusBadText }]}>{props.error}</Text> : null
}

/** Delete account as a one-question flow: the warning for the person's plan, then the code request. The code entry is the step-up screen. No mascot in any step. */
export function DeleteAccountFlow(props: Readonly<DeleteAccountFlowProps>) {
  const { t } = useTranslation()
  const step = describeStep(props, t)
  return (
    <FlowScreen label={t('profile.settingsRows.deleteAccount')} onDismiss={step.onDismiss}>
      <QuestionFlow
        flow="delete_account"
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
        primary={step.primary}
      >
        <StepBody props={props} />
      </QuestionFlow>
    </FlowScreen>
  )
}

const styles = StyleSheet.create({
  warnings: { gap: 8 },
  strong: { fontFamily: 'Geist_500Medium', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  body: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  error: { fontFamily: 'Geist_400Regular', fontSize: 14, textAlign: 'center' },
})
