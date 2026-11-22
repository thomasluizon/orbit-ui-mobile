
import { HABIT_CREATE_OVERLAY_ID } from '@orbit/shared/utils'
import { useUIStore } from '@/stores/ui-store'
import { useLayoutEffect, type ComponentProps, type ComponentType, type ReactNode } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { FlowScreen } from '@/components/ui/flow-screen'

type HabitCreateFrameProps = ComponentProps<typeof Sheet> & {
  presentation: 'sheet' | 'screen'
  fromConversation: boolean
  leaving: boolean
  discardSheet?: ReactNode
  result?: ReactNode
  leaveGuard?: ComponentType<{ leaving: boolean; requestLeave: () => void }>
}

export function HabitCreateFrame({ presentation, leaving, discardSheet, result, leaveGuard, ...props }: Readonly<HabitCreateFrameProps>) {
  return <GuidedCreateFrame presentation={presentation} leaving={leaving} leaveGuard={leaveGuard} title={props.title} discardSheet={discardSheet} result={result} onAttemptDismiss={props.onAttemptDismiss}>{props.children}</GuidedCreateFrame>
}

function GuidedCreateFrame({ presentation, leaving, leaveGuard: LeaveGuard, title, children, discardSheet, result, onAttemptDismiss }: Readonly<Pick<HabitCreateFrameProps, 'presentation' | 'leaving' | 'leaveGuard' | 'title' | 'children' | 'discardSheet' | 'result' | 'onAttemptDismiss'>>) {
  useLayoutEffect(() => {
    if (presentation !== 'screen') return undefined
    useUIStore.getState().registerOpenOverlay(HABIT_CREATE_OVERLAY_ID)
    return () => useUIStore.getState().unregisterOpenOverlay(HABIT_CREATE_OVERLAY_ID)
  }, [presentation])
  const dismiss = () => onAttemptDismiss?.()
  if (presentation === 'sheet') return <FlowScreen label={title ?? ''} onDismiss={dismiss} result={result}>{children}{discardSheet}</FlowScreen>
  return <FlowScreen presentation="route" label={title ?? ''} onDismiss={dismiss} result={result}>
    {LeaveGuard ? <LeaveGuard leaving={leaving} requestLeave={dismiss} /> : null}
    {children}
    {discardSheet}
  </FlowScreen>
}
