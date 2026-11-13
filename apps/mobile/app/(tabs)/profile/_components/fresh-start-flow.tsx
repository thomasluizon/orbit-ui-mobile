import { useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { FlowScreen } from '@/components/ui/flow-screen'
import { Input } from '@/components/ui/input'
import { QuestionFlow } from '@/components/ui/question-flow'
import { ResultDialog } from '@/components/ui/result-dialog'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { FreshStartLists } from './fresh-start-lists'

interface FreshStartFlowProps {
  step: 'info' | 'confirm'
  deletedItems: string[]
  preservedItems: string[]
  confirmText: string
  onConfirmTextChange: (value: string) => void
  loading: boolean
  error: string
  onContinue: () => void
  onBack: () => void
  onClose: () => void
  onReset: () => void
}

/** Start over as a one-question flow: what goes and what stays, then the typed confirmation. No mascot: the last step deletes. Offline, the reset queues as the sheet does. */
export function FreshStartFlow(props: Readonly<FreshStartFlowProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [focusRequest, setFocusRequest] = useState(0)
  const confirming = props.step === 'confirm'
  const confirmed = props.confirmText.trim().toUpperCase() === 'ORBIT'
  const submit = () => {
    if (props.loading) return
    if (!confirmed) {
      setFocusRequest((request) => request + 1)
      return
    }
    props.onReset()
  }
  return (
    <FlowScreen label={t('profile.settingsRows.startOver')} onDismiss={confirming && !props.loading ? props.onBack : props.onClose}>
      <QuestionFlow
        flow="fresh_start"
        showOrbit={false}
        stepKey={props.step}
        position={confirming ? 2 : 1}
        total={2}
        direction={confirming ? 1 : -1}
        progressLabel={t('habits.flow.progress', { position: confirming ? 2 : 1, total: 2 })}
        backLabel={t('common.back')}
        closeLabel={t('common.close')}
        onClose={props.onClose}
        onBack={confirming && !props.loading ? props.onBack : undefined}
        question={t(confirming ? 'profile.freshStart.confirmLabel' : 'profile.freshStart.question')}
        line={confirming ? null : t('profile.freshStart.description')}
        primary={confirming
          ? { label: t('profile.freshStart.deleteData'), onPress: submit, loading: props.loading, variant: 'caution' }
          : { label: t('profile.freshStart.reviewDeletion'), onPress: props.onContinue }}
      >
        {confirming ? (
          <>
            <Input
              label={t('profile.freshStart.confirmInstruction')}
              mono
              value={props.confirmText}
              onChange={props.onConfirmTextChange}
              placeholder={t('profile.freshStart.confirmPlaceholder')}
              autoComplete="off"
              autoFocus
              focusRequest={focusRequest}
              onSubmit={submit}
            />
            {props.error ? <Text accessibilityRole="alert" style={[styles.message, { color: tokens.statusBadText }]}>{props.error}</Text> : null}
          </>
        ) : <FreshStartLists deletedItems={props.deletedItems} preservedItems={props.preservedItems} />}
      </QuestionFlow>
    </FlowScreen>
  )
}

const styles = StyleSheet.create({
  message: { fontFamily: 'Geist_400Regular', fontSize: 14, textAlign: 'center' },
})

/** The guided fresh start: the flow, then the result dialog with Orbit in Parado. A queued reset says it waits for the connection. */
export function FreshStartGuided({ outcome, onOpenToday, ...flow }: Readonly<FreshStartFlowProps & { outcome: 'done' | 'queued' | null; onOpenToday: () => void }>) {
  const { t } = useTranslation()
  if (!outcome) return <FreshStartFlow {...flow} />
  return (
    <ResultDialog
      title={t('result.title')}
      sentence={t(outcome === 'queued' ? 'result.account.freshStartQueued' : 'result.account.freshStart')}
      primaryLabel={t('result.account.openToday')}
      onPrimary={onOpenToday}
      onClose={flow.onClose}
      orbitState="parado"
    />
  )
}
