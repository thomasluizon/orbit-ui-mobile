'use client'

import * as Primitive from '@radix-ui/react-toast'
import { SPACING, TOUCH_TARGET_MIN } from '@orbit/shared/theme'

import { useCallback, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useToastLifecycle } from '@/hooks/use-toast-lifecycle'
import type { ToastProps } from '@orbit/shared/contracts/feedback'
import { Check, X } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'

export function WorkingMark() {
  return (
    <span className="flex items-center gap-1 text-[var(--fg-2)]" data-working-mark aria-hidden="true">
      <span className="size-1 rounded-full bg-current" />
      <span className="size-1 rounded-full bg-current" />
      <span className="size-1 rounded-full bg-current" />
    </span>
  )
}

function DoneMark() {
  return (
    <span
      className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--status-done)] text-[var(--bg)]"
      data-done-mark
      aria-hidden="true"
    >
      <Check size={16} strokeWidth={2.4} />
    </span>
  )
}

export function Toast(props: Readonly<ToastProps & { outlined?: boolean; onDismiss?: () => void }>) {
  const t = useTranslations()
  const outsideEscape = useRef(false)
  const [viewport, setViewport] = useState<HTMLOListElement | null>(null)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const { dismissed, dismiss } = useToastLifecycle(props, hovered || focused, props.onDismiss)

  const handleBlur = useCallback((event: React.FocusEvent<HTMLLIElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
  }, [])

  const neutralColors = { background: 'bg-[var(--bg-elev)]', action: 'text-[var(--fg-1)]' }
  const lossColors = { background: 'bg-[var(--bg)]', action: 'text-[var(--primary-soft)]' }
  const colors = { neutral: neutralColors, working: neutralColors, done: neutralColors, lost: lossColors }[props.kind]

  if (dismissed) return null

  return (
    <Primitive.Provider announcerContainer={viewport?.parentElement ?? undefined} label={t('notifications.title')}><Primitive.Root
      key={`${props.kind}:${props.message}`}
      open={!dismissed}
      onOpenChange={(open) => { if (!open && !outsideEscape.current) dismiss() }}
      onEscapeKeyDown={(event) => {
        outsideEscape.current = !viewport?.contains(event.target as Node)
        queueMicrotask(() => { outsideEscape.current = false })
      }}
      duration={Infinity}
      type={props.kind === 'lost' ? 'foreground' : 'background'}
      role="group"
      aria-label={props.message}
      data-kind={props.kind}
      tabIndex={-1}
      className={`flex flex-wrap items-center gap-x-3 gap-y-0 rounded-[var(--r-card)] ${colors.background} p-4 text-[var(--fg-1)] shadow-[var(--sh-2)] ${props.outlined ? 'ring-1 ring-inset ring-[var(--fg-3)]' : ''}`}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={handleBlur}
    >
      {props.kind === 'working' ? <WorkingMark /> : null}
      {props.kind === 'done' ? <DoneMark /> : null}
      {(props.kind === 'neutral' || props.kind === 'lost') && props.icon ? (
        <span className="shrink-0 text-[var(--fg-2)]" aria-hidden="true">
          {props.icon}
        </span>
      ) : null}

      <span className="flex min-w-0 flex-1 flex-col gap-1" style={props.actionLabel ? { flexBasis: '50%' } : undefined}>
        <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-sans)' }}>
          {props.message}
        </span>
        {props.kind === 'lost' ? (
          <span className="text-sm text-[var(--fg-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
            {props.detail}
          </span>
        ) : null}
      </span>

      {props.actionLabel ? (
        <div className="ms-auto flex shrink-0 items-center gap-3">
          <Primitive.Action altText={props.actionLabel}
            className={`cursor-pointer whitespace-nowrap border-0 bg-transparent p-3 text-sm font-medium ${colors.action} underline underline-offset-4 hover:text-[var(--fg-2)] ${props.kind === 'lost' ? 'active:text-[var(--fg-1)]' : 'active:text-[var(--fg-2)]'} active:underline-offset-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--fg-1)]`}
            style={{ fontFamily: 'var(--font-sans)', minWidth: TOUCH_TARGET_MIN, minHeight: TOUCH_TARGET_MIN, margin: -SPACING.s4 }}
            onFocus={() => setFocused(true)}
            onClick={(event) => { event.preventDefault(); props.onAction() }}
          >
            {props.actionLabel}
          </Primitive.Action>
          <Primitive.Close asChild><PillButton variant="ghost" size="sm" iconOnly label={t('common.close')} minimumHeight={TOUCH_TARGET_MIN} onClick={dismiss}>
            <X size={20} aria-hidden="true" />
          </PillButton></Primitive.Close>
        </div>
      ) : null}
    </Primitive.Root><Primitive.Viewport ref={setViewport} hotkey={[]} label={t('notifications.title')} className="m-0 list-none p-0" /></Primitive.Provider>
  )
}
