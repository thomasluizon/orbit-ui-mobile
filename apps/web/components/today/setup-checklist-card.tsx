'use client'

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { getSetupChecklist } from '@orbit/shared/utils'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useProfile } from '@/hooks/use-profile'
import { useUIPreferencesReadiness, useUIStore } from '@/stores/ui-store'
import { PillButton } from '@/components/ui/pill-button'
import { Check, Circle, X } from '@/components/ui/icons'

export function SetupChecklistCard() {
  const t = useTranslations()
  const titleId = useId()
  const errorId = useId()
  const { profile } = useProfile()
  const dismissed = useUIStore((state) => state.setupChecklistDismissed)
  const setDismissed = useUIStore((state) => state.setSetupChecklistDismissed)
  const preferencesReady = useUIPreferencesReadiness((state) => state.ready)
  const [pending, setPending] = useAccountScopedState(false)
  const [failed, setFailed] = useAccountScopedState(false)
  const checklist = getSetupChecklist(profile)

  async function dismiss() {
    if (pending) return
    setPending(true)
    setFailed(false)
    try {
      await setDismissed(true)
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  if (!preferencesReady || !checklist || (dismissed && !pending)) return null

  return (
    <div className="px-4">
      <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-6 rounded-[var(--r-card)] bg-[var(--bg-card)] p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h2 id={titleId} className="min-w-0 text-balance text-[20px] font-medium leading-[1.3] text-[var(--fg-1)]">{t('today.setupChecklist.title')}</h2>
            <p className="t-secondary text-pretty">{checklist.done === checklist.items.length ? t('today.setupChecklist.complete') : t('today.setupChecklist.subtitle')}</p>
          </div>
          <PillButton variant="ghost" iconOnly label={t('today.setupChecklist.dismiss')} loading={pending} descriptionId={failed ? errorId : undefined} onClick={() => void dismiss()}>
            <X size={20} strokeWidth={1.5} aria-hidden="true" focusable="false" />
          </PillButton>
        </div>
        <ul className="flex min-w-0 flex-col gap-3">
          {checklist.items.map((item) => {
            return <li key={item.key} className="flex items-start gap-3 text-[14px] leading-[1.5] text-[var(--fg-2)]">
              <span aria-hidden="true" className={`flex size-5 shrink-0 items-center justify-center ${item.done ? 'rounded-full bg-[var(--fg-1)] text-[var(--bg)]' : 'text-[var(--track-empty)]'}`}>
                {item.done ? <Check size={16} strokeWidth={2} focusable="false" /> : <Circle size={20} strokeWidth={1.5} focusable="false" />}
              </span>
              <span className="min-w-0">{t(`today.setupChecklist.items.${item.key}`)}{item.done ? <span className="sr-only">{`, ${t('habits.completed')}`}</span> : null}</span>
            </li>
          })}
        </ul>
        <p role="status" className="font-mono text-[12px] tabular-nums text-[var(--fg-3)]">{t('today.setupChecklist.progress', { done: checklist.done, total: checklist.items.length })}</p>
        <p id={errorId} role="alert" className={failed ? "text-[14px] leading-[1.5] text-[var(--status-bad-text)]" : "sr-only"}>{failed ? t('today.setupChecklist.dismissError') : null}</p>
      </section>
    </div>
  )
}
