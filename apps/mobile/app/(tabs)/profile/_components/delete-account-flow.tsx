import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { DELETE_ACCOUNT_FLOW_STEP_COUNT } from '@orbit/shared/utils'
import { describeDeleteAccountFlowStep } from '@orbit/shared/utils/delete-account'
import { ErrorState } from '@/components/ui/error-state'
import { FlowScreen } from '@/components/ui/flow-screen'
import { QuestionFlow } from '@/components/ui/question-flow'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface DeleteAccountFlowProps {
  step: 'warning' | 'send'
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

function StepBody({ props }: Readonly<{ props: DeleteAccountFlowProps }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  if (props.offline) return <ErrorState message={t('profile.deleteAccount.offlineDescription')} />
  if (props.step === 'warning') return <Warnings warnings={props.warnings} />
  return props.error ? <Text accessibilityRole="alert" style={[styles.error, { color: tokens.statusBadText }]}>{props.error}</Text> : null
}

/** Delete account as a one-question flow: the warning for the person's plan, then the code request. The code entry is the step-up screen, the last step of the same progress. No mascot in any step. */
export function DeleteAccountFlow(props: Readonly<DeleteAccountFlowProps>) {
  const { t } = useTranslation()
  const step = describeDeleteAccountFlowStep(props, (key, values) => t(key, values))
  return (
    <FlowScreen label={t('profile.settingsRows.deleteAccount')} onDismiss={step.onDismiss}>
      <QuestionFlow
        flow="delete_account"
        showOrbit={false}
        stepKey={props.step}
        position={step.position}
        total={DELETE_ACCOUNT_FLOW_STEP_COUNT}
        direction={step.direction}
        progressLabel={t('habits.flow.progress', { position: step.position, total: DELETE_ACCOUNT_FLOW_STEP_COUNT })}
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
