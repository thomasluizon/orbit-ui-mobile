import { SPACING } from '@orbit/shared/theme'
import { HABIT_CREATE_OVERLAY_ID } from '@orbit/shared/utils'
import { useUIStore } from '@/stores/ui-store'
import { useLayoutEffect, type ComponentProps, type ComponentType, type ReactNode } from 'react'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Sheet } from '@/components/ui/sheet'
import { FlowScreen } from '@/components/ui/flow-screen'
import { AppBar } from '@/components/ui/app-bar'
import { Shell412 } from '@/components/shell/shell-412'
import { KeyboardAwareScrollView, KeyboardAwareView } from '@/components/ui/keyboard-aware-scroll-view'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type HabitCreateFrameProps = ComponentProps<typeof Sheet> & {
  presentation: 'sheet' | 'screen'
  fromConversation: boolean
  leaving: boolean
  guided?: boolean
  discardSheet?: ReactNode
  leaveGuard?: ComponentType<{ leaving: boolean; requestLeave: () => void }>
}

export function HabitCreateFrame({ presentation, fromConversation, leaving, guided = false, discardSheet, leaveGuard, ...props }: Readonly<HabitCreateFrameProps>) {
  if (guided) return <GuidedCreateFrame presentation={presentation} leaving={leaving} leaveGuard={leaveGuard} title={props.title} discardSheet={discardSheet} onAttemptDismiss={props.onAttemptDismiss}>{props.children}</GuidedCreateFrame>
  if (presentation === 'sheet') return <Sheet {...props} />
  return <HabitCreateScreenFrame {...props} fromConversation={fromConversation} leaving={leaving} leaveGuard={leaveGuard} />
}

function HabitCreateScreenFrame({ fromConversation, leaving, leaveGuard: LeaveGuard, ...props }: Readonly<Omit<HabitCreateFrameProps, 'presentation'>>) {
  useLayoutEffect(() => {
    useUIStore.getState().registerOpenOverlay(HABIT_CREATE_OVERLAY_ID)
    return () => useUIStore.getState().unregisterOpenOverlay(HABIT_CREATE_OVERLAY_ID)
  }, [])
  const { width } = useWindowDimensions()
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <KeyboardAwareView style={styles.root}><Shell412 nav={false} safeAreaTop
    header={<AppBar titleVariant="screen" title={props.title ?? ''} onBack={() => props.onAttemptDismiss?.()} backLabel={t('common.back')} />}
    action={<View style={[styles.action, width >= 640 && styles.wideAction]}>{props.actions}</View>}>
    <KeyboardAwareScrollView avoidKeyboard={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    {fromConversation ? <View style={styles.origin}><Text style={[styles.originText, { color: tokens.fg2 }]}>{t('habits.form.fromConversation')}</Text></View> : null}
    {LeaveGuard ? <LeaveGuard leaving={leaving} requestLeave={() => props.onAttemptDismiss?.()} /> : null}
    {props.children}
    </KeyboardAwareScrollView>
  </Shell412></KeyboardAwareView>
}

function GuidedCreateFrame({ presentation, leaving, leaveGuard: LeaveGuard, title, children, discardSheet, onAttemptDismiss }: Readonly<Pick<HabitCreateFrameProps, 'presentation' | 'leaving' | 'leaveGuard' | 'title' | 'children' | 'discardSheet' | 'onAttemptDismiss'>>) {
  useLayoutEffect(() => {
    if (presentation !== 'screen') return undefined
    useUIStore.getState().registerOpenOverlay(HABIT_CREATE_OVERLAY_ID)
    return () => useUIStore.getState().unregisterOpenOverlay(HABIT_CREATE_OVERLAY_ID)
  }, [presentation])
  const dismiss = () => onAttemptDismiss?.()
  if (presentation === 'sheet') return <FlowScreen label={title ?? ''} onDismiss={dismiss}>{children}{discardSheet}</FlowScreen>
  return <FlowScreen presentation="route" label={title ?? ''} onDismiss={dismiss}>
    {LeaveGuard ? <LeaveGuard leaving={leaving} requestLeave={dismiss} /> : null}
    {children}
    {discardSheet}
  </FlowScreen>
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  action: { alignSelf: 'center', width: '100%', maxWidth: 740, padding: SPACING.s16 },
  wideAction: { maxWidth: 392 },
  content: { alignSelf: 'center', width: '100%', maxWidth: 592, padding: SPACING.s16, gap: 24 },
  origin: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  originText: { flex: 1, fontSize: 14, lineHeight: 21, fontFamily: 'Geist_400Regular' },
})
