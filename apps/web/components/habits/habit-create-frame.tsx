'use client'

import { HABIT_CREATE_OVERLAY_ID } from '@orbit/shared/utils'
import { useUIStore } from '@/stores/ui-store'

import { useLayoutEffect, type ComponentProps } from 'react'
import { useHabitCreateNavigationGuard } from '@/hooks/use-habit-create-navigation-guard'
import { useTranslations } from 'next-intl'
import { Sheet } from '@/components/ui/sheet'
import { AppBar } from '@/components/ui/app-bar'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { useShellComposerSlot } from '@/components/shell/destination-shell'
import { ShellHeader, useHasShellHeaderHost } from '@/components/shell/shell-header'
import { useIsClient } from '@/hooks/use-is-client'

type HabitCreateFrameProps = ComponentProps<typeof Sheet> & {
  presentation: 'sheet' | 'screen'
  fromConversation: boolean
  actionRefreshKey: string
  leaving: boolean
  onNavigate: (action: () => void) => void
  onReturn: () => void
}

export function HabitCreateFrame({ presentation, fromConversation, actionRefreshKey, leaving, onNavigate, onReturn, ...props }: Readonly<HabitCreateFrameProps>) {
  if (presentation === 'sheet') return <Sheet {...props} />
  return <HabitCreateScreenFrame {...props} fromConversation={fromConversation} actionRefreshKey={actionRefreshKey} leaving={leaving} onNavigate={onNavigate} onReturn={onReturn} />
}

function HabitCreateScreenFrame({ children, actions, title, onAttemptDismiss, onClose, fromConversation, actionRefreshKey, leaving, onNavigate, onReturn }: Readonly<Omit<HabitCreateFrameProps, 'presentation'>>) {
  useLayoutEffect(() => {
    useUIStore.getState().registerOpenOverlay(HABIT_CREATE_OVERLAY_ID)
    return () => useUIStore.getState().unregisterOpenOverlay(HABIT_CREATE_OVERLAY_ID)
  }, [])
  const t = useTranslations()
  useHabitCreateNavigationGuard({ active: true, dirty: !onClose, leaving, onNavigate, onReturn })
  const footer = <div data-habit-create-action="" className="px-4 py-4 [&_button]:w-full sm:[&_button]:w-auto sm:[&_button]:max-w-[360px]">{actions}</div>
  const hasHost = useHasShellHeaderHost()
  const client = useIsClient()
  const hosted = hasHost && client
  useShellComposerSlot(true, () => footer, actionRefreshKey)
  return <>
    <ShellHeader><AppBar title={title ?? ''} onBack={() => onAttemptDismiss?.()} backLabel={t('common.back')} /></ShellHeader>
    <div data-habit-create-screen="" className="flex flex-col gap-6 px-4 py-4">
      {fromConversation ? <div className="flex items-start gap-2 text-sm text-[var(--fg-2)]"><AstraGlyph size={20} /><p className="min-w-0 flex-1 text-pretty leading-[1.5]">{t('habits.form.fromConversation')}</p></div> : null}
      <div className="w-full max-w-[560px]">{children}</div>
      {!hosted ? footer : null}
    </div>
  </>
}
