'use client'

import { Plus, Sparkles } from 'lucide-react'
import { getHabitEmptyStateKey } from '@orbit/shared/utils'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'

interface HabitListEmptyStateProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  askAstraLabel?: string
  onAskAstra?: () => void
  variant?: 'primary' | 'secondary'
}

/** InicioEmpty kit state — 104px satellite glyph, 22/500 title, 15 fg-2 body,
 *  then a stacked full-width Astra pill + ghost create pill. Description
 *  renders only when it's a distinct sentence from the title (avoids the
 *  legacy "title and description share the same key" double-render). */
export function HabitListEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  askAstraLabel,
  onAskAstra,
  variant = 'primary',
}: Readonly<HabitListEmptyStateProps>) {
  const isAstraPrompt = variant === 'primary'
  const hasDistinctDescription =
    Boolean(description) && description !== title
  const showAstraAction = isAstraPrompt && Boolean(askAstraLabel) && Boolean(onAskAstra)
  const showStackedActions = showAstraAction || (isAstraPrompt && Boolean(actionLabel))

  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{ padding: '64px 36px', gap: 16 }}
    >
      <SatelliteGlyph size={104} />
      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 22,
          fontWeight: 500,
          color: 'var(--fg-1)',
          textWrap: 'balance',
        }}
      >
        {title}
      </div>
      {hasDistinctDescription && (
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            color: 'var(--fg-2)',
            maxWidth: 300,
            lineHeight: 1.5,
            textWrap: 'pretty',
          }}
        >
          {description}
        </div>
      )}
      {showStackedActions ? (
        <div
          className="flex flex-col items-center"
          style={{ marginTop: 8, gap: 12 }}
        >
          {showAstraAction && (
            <PillButton
              className="min-w-[240px]"
              onClick={onAskAstra}
              leading={<Sparkles size={18} strokeWidth={1.8} aria-hidden="true" />}
            >
              {askAstraLabel}
            </PillButton>
          )}
          {actionLabel && (
            <PillButton
              variant="ghost"
              className="min-w-[240px]"
              onClick={onAction}
              leading={<Plus size={18} strokeWidth={1.8} aria-hidden="true" />}
            >
              {actionLabel}
            </PillButton>
          )}
        </div>
      ) : (
        actionLabel && (
          <button
            type="button"
            onClick={onAction}
            className="appearance-none border-0 bg-transparent cursor-pointer text-[var(--fg-1)] hover:text-[var(--primary)] transition-[color] duration-[var(--dur-fast)] ease-[var(--ease-standard)]"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              fontWeight: 500,
              padding: '12px 16px',
              margin: '-6px 0',
              textDecoration: 'underline',
              textUnderlineOffset: 4,
              textDecorationThickness: 1,
              textDecorationColor: 'var(--hairline-strong)',
            }}
          >
            {actionLabel}
          </button>
        )
      )}
    </div>
  )
}

const SKELETON_BONE = 'color-mix(in srgb, var(--fg-1) 8%, transparent)'

export function HabitListSkeleton() {
  return (
    <div>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center animate-pulse"
          style={{
            padding: '14px 16px',
            gap: 14,
            borderRadius: 18,
            background: 'var(--bg-card)',
            boxShadow: 'inset 0 0 0 1px var(--hairline)',
            margin: '0 20px 10px',
          }}
        >
          <div
            className="shrink-0"
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              background: SKELETON_BONE,
            }}
          />
          <div className="flex-1 flex flex-col" style={{ gap: 8 }}>
            <div
              style={{ width: '55%', height: 12, borderRadius: 6, background: SKELETON_BONE }}
            />
            <div
              style={{ width: '32%', height: 12, borderRadius: 6, background: SKELETON_BONE }}
            />
          </div>
          <div
            className="rounded-full shrink-0"
            style={{ width: 30, height: 30, background: SKELETON_BONE }}
          />
        </div>
      ))}
    </div>
  )
}

export function getEmptyHabitsMessage(
  view: 'today' | 'all' | 'general',
  t: (key: string) => string,
): string {
  return t(getHabitEmptyStateKey(view))
}
