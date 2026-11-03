'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { AstraPlan, AstraPlanStep, ChatMessage } from '@orbit/shared/types'
import { PlanAnnouncementTracker, planStepStatus, planStepStatusKey } from '@orbit/shared/chat'
import { BlockFrame } from '@/components/ui/block-frame'
import { ProgressBar } from '@/components/ui/progress-bar'
import { Check, Minus, XCircle } from '@/components/ui/icons'
import { WorkingMark } from '@/components/ui/toast'

function StepMarker({ status, index }: Readonly<{ status: string; index: number }>) {
  if (status === 'done') return <Check size={16} strokeWidth={1.5} />
  if (status === 'failed') return <XCircle size={16} strokeWidth={1.5} color="var(--status-bad-text)" />
  if (status === 'skipped') return <Minus size={16} strokeWidth={1.5} />
  if (status === 'running') return <WorkingMark />
  return index + 1
}

function PlanStep({ step, index }: Readonly<{ step: AstraPlanStep; index: number }>) {
  const t = useTranslations()
  const status = planStepStatus(step.status)
  return <li data-plan-step={step.id} data-status={status} className="flex min-w-0 items-start gap-3 text-sm leading-6" style={{ color: status === 'failed' ? 'var(--status-bad-text)' : status === 'done' || status === 'skipped' ? 'var(--fg-3)' : 'var(--fg-1)' }}>
    <span aria-hidden="true" className="flex h-6 w-5 shrink-0 items-center justify-center text-xs tabular-nums" style={{ color: status === 'done' ? 'var(--fg-1)' : 'var(--fg-3)' }}><StepMarker status={status} index={index} /></span>
    <span className="min-w-0 flex-1 break-words" style={{ textDecorationLine: status === 'done' ? 'line-through' : undefined }}>{step.text}<span className="sr-only">{`, ${t(planStepStatusKey(status))}`}</span></span>
  </li>
}

export function PlanBlock({ plan }: Readonly<{ plan: AstraPlan }>) {
  const t = useTranslations()
  const done = plan.steps.filter(step => step.status === 'done').length
  const count = t('chat.plan.count', { done, total: plan.steps.length })
  return <div data-astra-plan={plan.id} className="min-w-0 w-full">
    <BlockFrame title={t('chat.plan.title')} count={count} state="resting" items={[]} body={<>
      <p className="break-words text-sm text-[var(--fg-2)]">{plan.title}</p>
      <ProgressBar value={done} max={plan.steps.length} label={count} />
      <ol aria-label={`${t('chat.plan.title')}: ${plan.title}`} className="flex min-w-0 list-none flex-col gap-2 p-0">
        {plan.steps.map((step, index) => <PlanStep key={step.id} step={step} index={index} />)}
      </ol>
    </>} />
  </div>
}

export function PlanAnnouncements({ messages }: Readonly<{ messages: readonly ChatMessage[] }>) {
  const t = useTranslations()
  const runningLabel = t('blockFrame.status.acting')
  const [tracker] = useState(() => new PlanAnnouncementTracker())
  const [announcement, setAnnouncement] = useState('')
  useEffect(() => {
    let mounted = true
    void Promise.resolve().then(() => {
      if (!mounted) return
      const next = tracker.next(messages, runningLabel)
      if (next) setAnnouncement(next)
    })
    return () => { mounted = false }
  }, [messages, runningLabel, tracker])
  return <p data-plan-announcement aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</p>
}
