'use client'

import { HABIT_CREATE_OVERLAY_ID } from '@orbit/shared/utils'
import { useUIStore } from '@/stores/ui-store'

import { useLayoutEffect, type ComponentProps } from 'react'
import { useHabitCreateNavigationGuard } from '@/hooks/use-habit-create-navigation-guard'
import { Sheet } from '@/components/ui/sheet'
import { FlowScreen } from '@/components/ui/flow-screen'

type HabitCreateFrameProps = ComponentProps<typeof Sheet> & {
  presentation: 'sheet' | 'screen'
  fromConversation: boolean
  actionRefreshKey: string
  leaving: boolean
  onNavigate: (action: () => void) => void
  onReturn: () => void
}

export function HabitCreateFrame({ presentation, leaving, onNavigate, onReturn, ...props }: Readonly<HabitCreateFrameProps>) {
  return <GuidedCreateFrame presentation={presentation} leaving={leaving} onNavigate={onNavigate} onReturn={onReturn} title={props.title} onClose={props.onClose} onAttemptDismiss={props.onAttemptDismiss}>{props.children}</GuidedCreateFrame>
}

function GuidedCreateFrame({ presentation, children, title, leaving, onAttemptDismiss, onNavigate, onReturn, onClose }: Readonly<Pick<HabitCreateFrameProps, 'presentation' | 'children' | 'title' | 'leaving' | 'onClose' | 'onAttemptDismiss' | 'onNavigate' | 'onReturn'>>) {
  const label = title ?? ''
  const dismiss = () => onAttemptDismiss?.()
  if (presentation === 'sheet') return <FlowScreen label={label} onDismiss={dismiss}>{children}</FlowScreen>
  return <GuidedCreateScreen leaving={leaving} dirty={!onClose} onNavigate={onNavigate} onReturn={onReturn}><FlowScreen presentation="route" label={label} onDismiss={dismiss}>{children}</FlowScreen></GuidedCreateScreen>
}

function GuidedCreateScreen({ children, leaving, dirty, onNavigate, onReturn }: Readonly<{ children: React.ReactNode; leaving: boolean; dirty: boolean; onNavigate: (action: () => void) => void; onReturn: () => void }>) {
  useLayoutEffect(() => {
    useUIStore.getState().registerOpenOverlay(HABIT_CREATE_OVERLAY_ID)
    return () => useUIStore.getState().unregisterOpenOverlay(HABIT_CREATE_OVERLAY_ID)
  }, [])
  useHabitCreateNavigationGuard({ active: true, dirty, leaving, onNavigate, onReturn })
  return <div data-habit-create-screen="" data-guided="" data-page-viewport="" className="flex min-h-0 w-full flex-1 flex-col">{children}</div>
}
