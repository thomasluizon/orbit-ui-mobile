'use client'

import { useCallback, type ComponentProps } from 'react'
import { useHabitCreateNavigationGuard } from '@/hooks/use-habit-create-navigation-guard'
import { useTranslations } from 'next-intl'
import { Sheet } from '@/components/ui/sheet'
import { AppBar } from '@/components/ui/app-bar'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { useShellComposerSlot, useShellHeaderSlot } from '@/components/shell/destination-shell'

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
  const t = useTranslations()
  useHabitCreateNavigationGuard({ active: true, dirty: !onClose, leaving, onNavigate, onReturn })
  const renderHeader = useCallback(() => <AppBar title={title ?? ''} onBack={() => onAttemptDismiss?.()} backLabel={t('common.back')} />, [onAttemptDismiss, t, title])
  const footer = <div data-habit-create-action="" className="px-4 py-4 [&_button]:w-full sm:[&_button]:w-auto sm:[&_button]:max-w-[360px]">{actions}</div>
  const hosted = useShellHeaderSlot(renderHeader, title ?? '')
  useShellComposerSlot(true, () => footer, actionRefreshKey)
  return <div data-habit-create-screen="" className="flex flex-col gap-6 px-4 py-4">
    {!hosted ? renderHeader() : null}
    {fromConversation ? <div className="flex items-start gap-2 text-sm text-[var(--fg-2)]"><AstraGlyph size={20} /><p className="min-w-0 flex-1 text-pretty leading-[1.5]">{t('habits.form.fromConversation')}</p></div> : null}
    <div className="w-full max-w-[560px]">{children}</div>
    {!hosted ? footer : null}
  </div>
}
