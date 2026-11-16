'use client'

import { useLayoutEffect, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { QuestionFlowProps } from '@orbit/shared/contracts/flow'
import { formatStepUpCountdown, getStepUpFlowProgress, type StepUpOperation } from '@orbit/shared/utils'
import { FlowShell } from '@/components/shell/flow-shell'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { OtpInput } from '@/components/ui/otp-input'
import { PillButton } from '@/components/ui/pill-button'
import { QuestionFlow } from '@/components/ui/question-flow'
import { UpdateAvailableBanner } from '@/components/ui/update-available-banner'
import { useDateFormat } from '@/hooks/use-date-format'
import { captureGuidedFlowCompleted } from '@/lib/posthog'

const NOTE_CLASS = 'text-sm leading-[1.55] text-[var(--fg-3)]'
const COUNTDOWN_CLASS = 'font-mono text-xs leading-[1.5] tabular-nums text-[var(--fg-3)]'

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

type Translate = ReturnType<typeof useTranslations>

function GuidedStepUpResend({ cooldownSeconds, requesting, onResend, t }: Readonly<{ cooldownSeconds: number; requesting: boolean; onResend: () => void; t: Translate }>) {
  if (cooldownSeconds > 0) return <p data-resend-countdown="" className={COUNTDOWN_CLASS}>{t('cooldown', { time: formatStepUpCountdown(cooldownSeconds) })}</p>
  return <PillButton variant="ghost" size="sm" loading={requesting} onClick={onResend}>{t('resend')}</PillButton>
}

function challengeView(state: GuidedStepUpChallengeState, t: Translate, backLabel: string): GuidedStepUpView {
  const { checking, expired, requesting } = state
  return {
    step: expired ? 'expired' : 'code',
    question: expired ? t('expiredTitle') : t('codeLabel'),
    line: expired ? t('expiredBody') : t('body', { email: state.email }),
    back: checking ? undefined : { label: backLabel, onPress: state.onCancel },
    primary: expired ? { label: t('resend'), onPress: state.onResend, loading: requesting } : { label: t('confirm'), onPress: state.onConfirm, loading: checking },
    body: <>
      <OtpInput id="step-up-code" value={state.code} onChange={state.onCodeChange} error={state.otpError} focusRequest={state.codeFocusRequest} hint={expired ? undefined : t('codeHint')} disabled={checking || expired} autoFocus={!expired} label={t('codeLabel')} />
      {expired ? null : <GuidedStepUpResend cooldownSeconds={state.cooldownSeconds} requesting={requesting} onResend={state.onResend} t={t} />}
      {state.requestError ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{state.requestError}</p> : null}
      <p className={NOTE_CLASS}>{t('neverShare')}</p>
    </>,
  }
}

function exhaustedView(state: Extract<GuidedStepUpState, { kind: 'exhausted' }>, t: Translate): GuidedStepUpView {
  return {
    step: 'exhausted', question: t('exhaustedTitle'), line: t('exhaustedBody'), back: { label: state.backLabel, onPress: state.onBack },
    body: <>
      <div className="w-full text-start"><CapacityNotice message={t('exhaustedNotice')} /></div>
      {state.lockSeconds === null ? null : <p data-lock-countdown="" className={COUNTDOWN_CLASS}>{t('lockCountdown', { time: formatStepUpCountdown(state.lockSeconds) })}</p>}
      <p className={NOTE_CLASS}>{t('neverShare')}</p>
    </>,
  }
}

function successView(state: Extract<GuidedStepUpState, { kind: 'success' }>, t: Translate, titleDate: string): GuidedStepUpView {
  return {
    step: 'done', question: t('successTitle', { date: titleDate }), line: t('successBody'), primary: { label: t('signOut'), onPress: state.onSignOut },
    body: state.showProNotice ? <p className={NOTE_CLASS}>{t('successPro', { date: state.deletionDate })}</p> : null,
  }
}

function describeView(state: GuidedStepUpState, t: Translate, backLabel: string, displayDateNumeric: (value: string | null) => string): GuidedStepUpView {
  if (state.kind === 'success') return successView(state, t, displayDateNumeric(state.scheduledAt))
  return state.kind === 'exhausted' ? exhaustedView(state, t) : challengeView(state, t, backLabel)
}

/**
 * The step-up as the code question of the flow that asked for it: the centred question, the back arrow and the progress, with no mascot.
 * Every state renders through one flow frame, so one run reports its steps once and a confirmed deletion is never reported as left.
 */
export function GuidedStepUp({ operation, state }: Readonly<{ operation: StepUpOperation; state: GuidedStepUpState }>) {
  const t = useTranslations('stepUp')
  const translate = useTranslations()
  const { displayDateNumeric } = useDateFormat()
  const view = describeView(state, t, translate('common.back'), displayDateNumeric)
  const { flow, position, total } = getStepUpFlowProgress(operation)
  const closed = state.kind === 'success'
  useLayoutEffect(() => {
    // WHY: a layout effect runs before the passive cleanup of the flow frame, so its tracker reads a completed run, not an abandoned one. https://react.dev/reference/react/useLayoutEffect
    if (closed) captureGuidedFlowCompleted(flow, total, false)
  }, [closed, flow, total])
  return (
    <FlowShell mode="full">
      <div data-guided-step-up="" className="flex h-full w-full flex-col pb-[var(--safe-bottom)] pt-[var(--safe-top)]">
        <UpdateAvailableBanner inset={false} mascot={false} />
        <QuestionFlow flow={flow} showOrbit={false} stepKey={view.step} position={position} total={total} direction={1}
          progressLabel={translate('habits.flow.progress', { position, total })} backLabel={view.back?.label ?? translate('common.back')} onBack={view.back?.onPress}
          question={view.question} line={view.line} primary={view.primary}>
          {view.body ? <div className="flex flex-col items-center gap-3 text-center">{view.body}</div> : null}
        </QuestionFlow>
      </div>
    </FlowShell>
  )
}
