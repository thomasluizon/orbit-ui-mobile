'use client'

import type { ReactNode } from 'react'

/** New v2 confirm dialog card: title (+ optional eyebrow/body) and right-aligned cancel/action.
 *  Destructive variant italicises the action label (no red). Phase 3 mounts inside a scrim. */
interface ConfirmDialogV2Props {
  eyebrow?: ReactNode
  title: ReactNode
  body?: ReactNode
  children?: ReactNode
  cancelLabel?: string
  actionLabel?: string
  destructive?: boolean
  onCancel: () => void
  onAction?: () => void
}

export function ConfirmDialogV2({
  eyebrow,
  title,
  body,
  children,
  cancelLabel = 'Cancel',
  actionLabel,
  destructive = false,
  onCancel,
  onAction,
}: Readonly<ConfirmDialogV2Props>) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="w-full flex flex-col"
      style={{
        maxWidth: 320,
        background: 'var(--bg-elev)',
        borderRadius: 12,
        padding: '18px 20px 12px',
        boxShadow:
          '0 12px 40px rgba(0,0,0,0.35), inset 0 0 0 1px var(--hairline)',
        gap: 8,
      }}
    >
      {eyebrow && (
        <div
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--fg-3)',
          }}
        >
          {eyebrow}
        </div>
      )}
      <div
        style={{
          fontFamily: 'var(--font-family-sans)',
          fontSize: 17,
          fontWeight: 600,
          color: 'var(--fg-1)',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </div>
      {body && (
        <div
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 14,
            lineHeight: 1.5,
            color: 'var(--fg-2)',
          }}
        >
          {body}
        </div>
      )}
      {children}
      <div
        className="flex items-center justify-end"
        style={{ gap: 16, marginTop: 4 }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="appearance-none border-0 bg-transparent cursor-pointer"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--fg-3)',
            padding: 6,
          }}
        >
          {cancelLabel}
        </button>
        {actionLabel && (
          <button
            type="button"
            onClick={onAction}
            className="appearance-none border-0 bg-transparent cursor-pointer"
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--fg-1)',
              padding: 6,
              fontStyle: destructive ? 'italic' : 'normal',
            }}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}
