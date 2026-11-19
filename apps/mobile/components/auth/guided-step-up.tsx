import { useLayoutEffect, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { QuestionFlowProps } from '@orbit/shared/contracts/flow'
import { formatStepUpCountdown, getStepUpFlowProgress, type StepUpOperation } from '@orbit/shared/utils'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { OtpInput } from '@/components/ui/otp-input'
import { PillButton } from '@/components/ui/pill-button'
import { QuestionFlow } from '@/components/ui/question-flow'
import { useDateFormat } from '@/hooks/use-date-format'
import { captureGuidedFlowCompleted } from '@/lib/posthog'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type StepUpTokens = ReturnType<typeof createTokensV2>

interface GuidedStepUpView {
  step: 'code' | 'expired' | 'exhausted' | 'done'
  question: string
  line: string
  back?: { label: string; onPress: () => void }
  primary?: QuestionFlowProps['primary']
  body: ReactNode
}

export interface GuidedStepUpChallengeState {
  kind: 'challenge'
  checking: boolean
  code: string
  /** Set by a short submit. Absent, a field error takes the focus. */
  codeFocusRequest: number | undefined
  cooldownSeconds: number
  email: string
  expired: boolean
  onCancel: () => void
  onCodeChange: (value: string) => void
  onConfirm: () => void
  onResend: () => void
  otpError?: string
  requestError: string | null
  requesting: boolean
}

export type GuidedStepUpState =
  | GuidedStepUpChallengeState
  | { kind: 'exhausted'; backLabel: string; lockSeconds: number | null; onBack: () => void }
  | {
      kind: 'success'
      /** The instant the server set. The title shows it as a numeric date: the long date takes a third line at 320. */
      scheduledAt: string | null
      deletionDate: string
      showProNotice: boolean
      onSignOut: () => void
    }

function GuidedStepUpResend({ cooldownSeconds, requesting, onResend, t, tokens }: Readonly<{ cooldownSeconds: number; requesting: boolean; onResend: () => void; t: TFunction; tokens: StepUpTokens }>) {
  if (cooldownSeconds > 0) return <Text testID="resend-countdown" style={[styles.countdown, { color: tokens.fg3 }]}>{t('stepUp.cooldown', { time: formatStepUpCountdown(cooldownSeconds) })}</Text>
  return <PillButton variant="ghost" size="sm" loading={requesting} onClick={onResend}>{t('stepUp.resend')}</PillButton>
}

function challengeView(state: GuidedStepUpChallengeState, t: TFunction, tokens: StepUpTokens): GuidedStepUpView {
  const { checking, expired, requesting } = state
  return {
    step: expired ? 'expired' : 'code',
    question: expired ? t('stepUp.expiredTitle') : t('stepUp.codeLabel'),
    line: expired ? t('stepUp.expiredBody') : t('stepUp.body', { email: state.email }),
    back: checking ? undefined : { label: t('common.back'), onPress: state.onCancel },
    primary: expired ? { label: t('stepUp.resend'), onPress: state.onResend, loading: requesting } : { label: t('stepUp.confirm'), onPress: state.onConfirm, loading: checking },
    body: <>
      <View style={styles.stretch}><OtpInput value={state.code} onChange={state.onCodeChange} error={state.otpError} focusRequest={state.codeFocusRequest} hint={expired ? undefined : t('stepUp.codeHint')} disabled={checking || expired} autoFocus={!expired} label={t('stepUp.codeLabel')} /></View>
      {expired ? null : <GuidedStepUpResend cooldownSeconds={state.cooldownSeconds} requesting={requesting} onResend={state.onResend} t={t} tokens={tokens} />}
      {state.requestError ? <Text accessibilityRole="alert" style={[styles.note, { color: tokens.statusBadText }]}>{state.requestError}</Text> : null}
      <Text style={[styles.note, { color: tokens.fg3 }]}>{t('stepUp.neverShare')}</Text>
    </>,
  }
}

function exhaustedView(state: Extract<GuidedStepUpState, { kind: 'exhausted' }>, t: TFunction, tokens: StepUpTokens): GuidedStepUpView {
  return {
    step: 'exhausted', question: t('stepUp.exhaustedTitle'), line: t('stepUp.exhaustedBody'), back: { label: state.backLabel, onPress: state.onBack },
    body: <>
      <View style={styles.stretch}><CapacityNotice message={t('stepUp.exhaustedNotice')} /></View>
      {state.lockSeconds === null ? null : <Text testID="lock-countdown" style={[styles.countdown, { color: tokens.fg3 }]}>{t('stepUp.lockCountdown', { time: formatStepUpCountdown(state.lockSeconds) })}</Text>}
      <Text style={[styles.note, { color: tokens.fg3 }]}>{t('stepUp.neverShare')}</Text>
    </>,
  }
}

function successView(state: Extract<GuidedStepUpState, { kind: 'success' }>, t: TFunction, tokens: StepUpTokens, titleDate: string): GuidedStepUpView {
  return {
    step: 'done', question: t('stepUp.successTitle', { date: titleDate }), line: t('stepUp.successBody'), primary: { label: t('stepUp.signOut'), onPress: state.onSignOut },
    body: state.showProNotice ? <Text style={[styles.note, { color: tokens.fg3 }]}>{t('stepUp.successPro', { date: state.deletionDate })}</Text> : null,
  }
}

function describeView(state: GuidedStepUpState, t: TFunction, tokens: StepUpTokens, displayDateNumeric: (value: string | null) => string): GuidedStepUpView {
  if (state.kind === 'success') return successView(state, t, tokens, displayDateNumeric(state.scheduledAt))
  return state.kind === 'exhausted' ? exhaustedView(state, t, tokens) : challengeView(state, t, tokens)
}

/**
 * The step-up as the code question of the flow that asked for it: the centred question, the back arrow and the progress, with no mascot.
 * Every state renders through one flow frame, so one run reports its steps once and a confirmed deletion is never reported as left.
 */
export function GuidedStepUp({ operation, state }: Readonly<{ operation: StepUpOperation; state: GuidedStepUpState }>) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { displayDateNumeric } = useDateFormat()
  const view = describeView(state, t, tokens, displayDateNumeric)
  const { flow, position, total } = getStepUpFlowProgress(operation)
  const closed = state.kind === 'success'
  useLayoutEffect(() => {
    // WHY: a layout effect runs before the passive cleanup of the flow frame, so its tracker reads a completed run, not an abandoned one. https://react.dev/reference/react/useLayoutEffect
    if (closed) captureGuidedFlowCompleted(flow, total, false)
  }, [closed, flow, total])
  return (
    <View testID="guided-step-up" style={[styles.root, { backgroundColor: tokens.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <QuestionFlow flow={flow} showOrbit={false} stepKey={view.step} position={position} total={total} direction={1}
        progressLabel={t('habits.flow.progress', { position, total })} backLabel={view.back?.label ?? t('common.back')} onBack={view.back?.onPress}
        question={view.question} line={view.line} primary={view.primary}>
        {view.body ? <View style={styles.body}>{view.body}</View> : null}
      </QuestionFlow>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { alignItems: 'center', gap: 12 },
  stretch: { alignSelf: 'stretch' },
  note: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 22, textAlign: 'center' },
  countdown: { fontFamily: 'GeistMono_400Regular', fontSize: 12, fontVariant: ['tabular-nums'], lineHeight: 18 },
})
