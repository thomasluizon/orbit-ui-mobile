'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import type { ShellWideItem } from '@orbit/shared/contracts/shell'
import type { FrequencyUnit } from '@orbit/shared/types/habit'
import {
  buildOnboardingHabitInput,
  buildOnboardingScheduleFromPhrase,
  buildOnboardingScheduleFromSuggestion,
  changeOnboardingScheduleMode,
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  getOnboardingHabitTitle,
  ONBOARDING_DONE_STEP,
  ONBOARDING_REMIND_STEP,
  ONBOARDING_WHAT_STEP,
  ONBOARDING_WHEN_STEP,
  readHabitPhrase,
  shouldRequestOnboardingSuggestion,
  type OnboardingSchedule,
  type OnboardingScheduleMode,
} from '@orbit/shared/utils'
import { BottomTabBar } from '@/components/navigation/bottom-tab-bar'
import { FlowShell } from '@/components/shell/flow-shell'
import { Shell412 } from '@/components/shell/shell-412'
import { ShellWide } from '@/components/shell/shell-wide'
import { CalendarDays, ChartLine, Home, User } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { QuietLink } from '@/components/ui/quiet-link'
import { Toast } from '@/components/ui/toast'
import { useHabitSuggestion } from '@/hooks/use-habit-suggestion'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'
import { useProfile } from '@/hooks/use-profile'
import { requestWebPushPermission, subscribeToPushNotifications, usePushNotificationPreferences } from '@/hooks/use-push-notification-preferences'
import { useOnboardingDraftStore } from '@/stores/onboarding-draft-store'
import { OnboardingComplete } from './onboarding-complete'
import { OnboardingCreateHabit } from './onboarding-create-habit'
import { OnboardingRemind, type ReminderState } from './onboarding-remind'
import { OnboardingWelcome } from './onboarding-welcome'
import { useOnboardingActions, useOnboardingIsLive } from './onboarding-actions-context'

function ActionStack({ primary, secondary }: Readonly<{ primary: ReactNode; secondary?: ReactNode }>) {
  return <div className="flex flex-col gap-3">{primary}{secondary ? <div className="flex justify-center">{secondary}</div> : null}</div>
}

function DoneShell({ children }: Readonly<{ children: ReactNode }>) {
  const t = useTranslations()
  const router = useRouter()
  const wide = useIsWideDesktop()
  const items = useMemo(() => [
    { id: 'hoje', label: t('nav.today'), icon: 'home' },
    { id: 'calendario', label: t('nav.calendar'), icon: 'calendar' },
    { id: 'progresso', label: t('nav.progress'), icon: 'chart-line' },
    { id: 'perfil', label: t('nav.profile'), icon: 'user' },
  ] satisfies ShellWideItem[], [t])
  const routes: Record<string, string> = { hoje: '/', calendario: '/calendar', progresso: '/progress', perfil: '/profile' }
  const onSelect = (id: string) => router.push(routes[id] ?? '/')
  if (wide) return <ShellWide items={items} activeId="hoje" navLabel={t('nav.mainNavigation')} onSelect={onSelect}><div className="mx-auto flex min-h-full max-w-[440px] items-center px-4">{children}</div></ShellWide>
  return <Shell412 tabBar={<BottomTabBar activeId="hoje" label={t('nav.mainNavigation')} items={items.map((item) => ({ ...item, icon: ({ active }) => {
    const Icon = { hoje: Home, calendario: CalendarDays, progresso: ChartLine, perfil: User }[item.id] ?? Home
    return <Icon size={24} strokeWidth={active ? 2 : 1.5} />
  } }))} onSelect={onSelect} />}><div className="mx-auto flex min-h-full max-w-[440px] items-center px-6">{children}</div></Shell412>
}

interface DecisionProps {
  step: number
  sentence: string
  locale: 'en' | 'pt-BR'
  marks: ReturnType<typeof readHabitPhrase>['consumed']
  isLive: boolean
  emoji: string
  schedule: OnboardingSchedule
  days: string[]
  dueTime: string
  proposed: boolean
  correcting: boolean
  atLimit: boolean
  allowance: number
  createFailed: boolean
  creating: boolean
  suggestionPending: boolean
  pushLoading: boolean
  reminderState: ReminderState
  createdTitle: string
  onAccount: () => void
  onSentence: (value: string) => void
  onContinueWhat: () => void
  onCorrect: () => void
  onToggleDay: (day: string) => void
  onTime: (value: string) => void
  onMode: (mode: OnboardingScheduleMode) => void
  onFrequencyUnit: (unit: FrequencyUnit) => void
  onQuantity: (quantity: number) => void
  onIntervalWeeks: (intervalWeeks: number) => void
  onSave: () => void
  onAllow: () => void
  onContinueWithout: () => void
  onSetTime: () => void
}

function DecisionContent(props: Readonly<DecisionProps>) {
  if (props.step === ONBOARDING_WHAT_STEP) return <OnboardingWelcome sentence={props.sentence} marks={props.marks} onChange={props.onSentence} onHaveAccount={!props.isLive ? props.onAccount : undefined} />
  if (props.step === ONBOARDING_WHEN_STEP) return <OnboardingCreateHabit title={getOnboardingHabitTitle(props.sentence, props.locale)} emoji={props.emoji} schedule={props.schedule} proposed={props.proposed} correcting={props.correcting} atLimit={props.atLimit} allowance={props.allowance} onCorrect={props.onCorrect} onToggleDay={props.onToggleDay} onTimeChange={props.onTime} onModeChange={props.onMode} onFrequencyUnitChange={props.onFrequencyUnit} onQuantityChange={props.onQuantity} onIntervalWeeksChange={props.onIntervalWeeks} />
  return <OnboardingRemind state={props.reminderState} title={props.createdTitle} dueTime={props.dueTime} />
}

function DecisionAction(props: Readonly<DecisionProps>) {
  const t = useTranslations('onboarding.flow')
  if (props.step === ONBOARDING_WHAT_STEP) return <PillButton disabled={!props.sentence.trim()} loading={props.suggestionPending} onClick={props.onContinueWhat}>{t('continue')}</PillButton>
  if (props.step === ONBOARDING_WHEN_STEP) return <PillButton loading={props.creating} onClick={props.onSave}>{props.createFailed ? t('retry') : t('create')}</PillButton>
  if (props.reminderState === 'ask') return <ActionStack primary={<PillButton loading={props.pushLoading} onClick={props.onAllow}>{t('remind.allow')}</PillButton>} secondary={<QuietLink onClick={props.onContinueWithout}>{t('remind.deny')}</QuietLink>} />
  if (props.reminderState === 'failed') return <ActionStack primary={<PillButton loading={props.pushLoading} onClick={props.onAllow}>{t('retry')}</PillButton>} secondary={<QuietLink onClick={props.onContinueWithout}>{t('remind.continue')}</QuietLink>} />
  if (props.reminderState === 'no-time') return <ActionStack primary={<PillButton onClick={props.onContinueWithout}>{t('remind.continue')}</PillButton>} secondary={<QuietLink onClick={props.onSetTime}>{t('remind.setTime')}</QuietLink>} />
  return <PillButton onClick={props.onContinueWithout}>{t('remind.continue')}</PillButton>
}

function OnboardingHeader({ step, onBack, onSkip }: Readonly<{ step: number; onBack?: () => void; onSkip?: () => void }>) {
  const t = useTranslations('onboarding.flow')
  const displayStep = getOnboardingDisplayStep(step)
  return <div className="flex min-h-14 items-center justify-between px-4"><div className="flex items-center gap-4">{onBack && (step === ONBOARDING_WHEN_STEP || step === ONBOARDING_REMIND_STEP) ? <QuietLink onClick={onBack}>{t('back')}</QuietLink> : null}<span className="font-mono text-xs tracking-[0.04em] text-[var(--fg-3)] tabular-nums">Orbit <span className="text-[var(--fg-1)]">{String(displayStep).padStart(2, '0')}</span> / {String(getOnboardingDisplayTotal()).padStart(2, '0')}</span><span className="sr-only" role="status">{t('step', { current: displayStep, total: getOnboardingDisplayTotal() })}</span></div>{onSkip ? <QuietLink onClick={onSkip}>{t('skip')}</QuietLink> : null}</div>
}

export function OnboardingFlow() {
  const t = useTranslations('onboarding.flow')
  const router = useRouter()
  const locale = useLocale() === 'pt-BR' ? 'pt-BR' : 'en'
  const actions = useOnboardingActions()
  const isLive = useOnboardingIsLive()
  const deferredPushFailure = useOnboardingDraftStore((state) => isLive && state.pushRegistrationFailed)
  const deferredHabit = useOnboardingDraftStore((state) => deferredPushFailure ? state.habits[0] : undefined)
  const [resolvingDeferredPush] = useState(deferredPushFailure)
  const { profile } = useProfile({ enabled: isLive })
  const suggestion = useHabitSuggestion()
  const push = usePushNotificationPreferences()
  const [step, setStep] = useState(resolvingDeferredPush ? ONBOARDING_REMIND_STEP : ONBOARDING_WHAT_STEP)
  const [sentence, setSentence] = useState('')
  const [emoji, setEmoji] = useState('◎')
  const [schedule, setSchedule] = useState<OnboardingSchedule>(() => deferredHabit ? { frequencyUnit: deferredHabit.frequencyUnit ?? null, frequencyQuantity: deferredHabit.frequencyQuantity ?? null, intervalWeeks: 1, days: deferredHabit.days ?? [], isGeneral: deferredHabit.isGeneral ?? false, isFlexible: deferredHabit.isFlexible ?? false, dueTime: deferredHabit.dueTime ?? '' } : buildOnboardingScheduleFromPhrase('', locale))
  const [proposed, setProposed] = useState(false)
  const [correcting, setCorrecting] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(resolvingDeferredPush ? 'deferred' : null)
  const [createdTitle, setCreatedTitle] = useState(deferredHabit?.title ?? '')
  const [creating, setCreating] = useState(false)
  const [createFailed, setCreateFailed] = useState(false)
  const [reminderState, setReminderState] = useState<ReminderState>(resolvingDeferredPush ? 'failed' : 'ask')
  const [remindersOff, setRemindersOff] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [suggestionPending, setSuggestionPending] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const suggestionRevision = useRef(0)
  const read = useMemo(() => readHabitPhrase(sentence, locale), [locale, sentence])
  const { days, dueTime } = schedule
  const allowance = profile?.aiMessagesLimit ?? 5
  const atLimit = isLive && (profile?.aiMessagesUsed ?? 0) >= allowance

  async function continueFromWhat() {
    if (!sentence.trim() || suggestionPending) return
    const localSchedule = buildOnboardingScheduleFromPhrase(sentence, locale)
    setEmoji(read.emoji ?? '◎')
    setSchedule(localSchedule)
    setProposed(false)
    setCorrecting(false)
    if (!shouldRequestOnboardingSuggestion({ isLive, atLimit })) {
      setStep(ONBOARDING_WHEN_STEP)
      return
    }
    const revision = suggestionRevision.current + 1
    suggestionRevision.current = revision
    setSuggestionPending(true)
    try {
      const result = await suggestion.mutateAsync({ title: sentence, language: locale })
      if (suggestionRevision.current !== revision) return
      const nextSchedule = buildOnboardingScheduleFromSuggestion(result)
      setEmoji(result.emoji ?? read.emoji ?? '◎')
      setSchedule(nextSchedule)
      setProposed(true)
    } catch {
      if (suggestionRevision.current !== revision) return
      setCorrecting(true)
    } finally {
      if (suggestionRevision.current === revision) {
        setSuggestionPending(false)
        setStep(ONBOARDING_WHEN_STEP)
      }
    }
  }

  async function saveHabit() {
    if (creating) return
    setCreating(true)
    setCreateFailed(false)
    const input = buildOnboardingHabitInput({ sentence, locale, emoji, days, dueTime, schedule })
    try {
      if (createdId) await actions.updateHabit(createdId, { ...input, isGeneral: schedule.isGeneral, isFlexible: schedule.isFlexible })
      else {
        const result = await actions.createHabit(input)
        setCreatedId(result.id)
      }
      setCreatedTitle(input.title)
      setReminderState(!dueTime ? 'no-time' : !push.supported ? 'unsupported' : push.permission === 'denied' ? 'refused' : 'ask')
      setStep(ONBOARDING_REMIND_STEP)
    } catch {
      setCreateFailed(true)
    } finally {
      setCreating(false)
    }
  }

  async function persistReminderDecision(enabled: boolean): Promise<boolean> {
    if (!createdId || resolvingDeferredPush) return true
    const input = buildOnboardingHabitInput({ sentence, locale, emoji, days, dueTime, schedule })
    try {
      await actions.updateHabit(createdId, { ...input, reminderEnabled: enabled })
      return true
    } catch {
      setReminderState('failed')
      return false
    }
  }

  async function setReminderFailure(outcome: ReminderState) {
    if (await persistReminderDecision(false)) setReminderState(outcome)
  }

  async function allowSignedOutReminders() {
    const outcome = await requestWebPushPermission()
    if (outcome !== 'granted') {
      await setReminderFailure(outcome)
      return
    }
    if (!await persistReminderDecision(true)) return
    actions.deferPushRegistration()
    setStep(ONBOARDING_DONE_STEP)
  }

  async function finishRegisteredReminders() {
    if (resolvingDeferredPush) {
      useOnboardingDraftStore.getState().reset()
      await actions.finishOnboarding()
      return
    }
    if (await persistReminderDecision(true)) setStep(ONBOARDING_DONE_STEP)
  }

  async function allowLiveReminders() {
    const result = await subscribeToPushNotifications()
    if (result.status === 'registered') {
      await finishRegisteredReminders()
      return
    }
    const outcome = !result.supported ? 'unsupported' : result.status === 'denied' ? 'denied' : 'failed'
    await setReminderFailure(outcome)
  }

  async function allowReminders() {
    if (pushLoading) return
    setPushLoading(true)
    try {
      if (isLive) await allowLiveReminders()
      else await allowSignedOutReminders()
    } catch {
      await setReminderFailure('failed')
    } finally {
      setPushLoading(false)
    }
  }

  async function continueWithoutReminders() {
    if (resolvingDeferredPush) {
      useOnboardingDraftStore.getState().reset()
      void actions.finishOnboarding()
      return
    }
    if (!await persistReminderDecision(false)) return
    setRemindersOff(true)
    setStep(ONBOARDING_DONE_STEP)
  }

  function skip() {
    suggestionRevision.current += 1
    setSuggestionPending(false)
    setSkipped(true)
    setCreatedTitle('')
    setStep(ONBOARDING_DONE_STEP)
  }

  const decisionProps: DecisionProps = { step, sentence, locale, marks: read.consumed, isLive, emoji, schedule, days, dueTime, proposed, correcting, atLimit, allowance, createFailed, creating, suggestionPending, pushLoading, reminderState, createdTitle, onAccount: () => router.push('/login'), onSentence: (value) => { if (!suggestionPending) setSentence(value) }, onContinueWhat: () => void continueFromWhat(), onCorrect: () => setCorrecting(true), onToggleDay: (day) => setSchedule((current) => { const nextDays = current.days.includes(day) ? current.days.filter((value) => value !== day) : [...current.days, day]; return { ...current, days: nextDays, frequencyUnit: nextDays.length ? 'Day' : null, frequencyQuantity: nextDays.length ? 1 : null, isGeneral: nextDays.length === 0, isFlexible: false } }), onTime: (value) => setSchedule((current) => ({ ...current, dueTime: value })), onMode: (mode) => setSchedule((current) => changeOnboardingScheduleMode(current, mode)), onFrequencyUnit: (frequencyUnit) => setSchedule((current) => ({ ...current, frequencyUnit, days: [], isGeneral: false })), onQuantity: (frequencyQuantity) => setSchedule((current) => ({ ...current, frequencyQuantity })), onIntervalWeeks: (intervalWeeks) => setSchedule((current) => ({ ...current, intervalWeeks })), onSave: () => void saveHabit(), onAllow: () => void allowReminders(), onContinueWithout: () => void continueWithoutReminders(), onSetTime: () => setStep(ONBOARDING_WHEN_STEP) }

  function closeOverlay() {
    if (resolvingDeferredPush) return
    if (step === ONBOARDING_DONE_STEP) {
      void actions.finishOnboarding()
      return
    }
    if (step > ONBOARDING_WHAT_STEP) setStep(step - 1)
    else skip()
  }

  const overlay = step === ONBOARDING_DONE_STEP ? (
    <DoneShell><OnboardingComplete createdHabit={createdTitle} emoji={emoji} remindersOff={remindersOff} skipped={skipped} signedOut={!isLive} onFinish={() => void actions.finishOnboarding()} /></DoneShell>
  ) : (
    <FlowShell nav={false} header={<OnboardingHeader step={step} onBack={resolvingDeferredPush ? undefined : () => setStep(step - 1)} onSkip={createdId ? undefined : skip} />} action={<DecisionAction {...decisionProps} />} notice={createFailed ? <Toast kind="neutral" message={t('createFailed')} /> : undefined}><DecisionContent {...decisionProps} /></FlowShell>
  )
  return <Dialog.Root open modal disablePointerDismissal onOpenChange={(open) => { if (!open) closeOverlay() }}><Dialog.Portal><Dialog.Viewport className="z-modal fixed inset-0"><Dialog.Popup aria-labelledby="onboarding-title" className="fixed inset-0">{overlay}</Dialog.Popup></Dialog.Viewport></Dialog.Portal></Dialog.Root>
}
