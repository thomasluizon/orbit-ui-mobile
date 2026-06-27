'use client'

import { useTranslations } from 'next-intl'
import { Check, X } from 'lucide-react'
import type { Profile } from '@orbit/shared/types'
import { useProfile } from '@/hooks/use-profile'
import { useUIStore } from '@/stores/ui-store'

const CHECKLIST_ITEMS: readonly { key: string; flag: keyof Profile }[] = [
  { key: 'createHabit', flag: 'hasCreatedFirstHabit' },
  { key: 'logHabit', flag: 'hasLoggedFirstHabit' },
  { key: 'tryAstra', flag: 'hasTriedAstra' },
]

/** Auto-tracked first-run setup checklist on Today; hides once completed or dismissed. */
export function SetupChecklistCard() {
  const t = useTranslations()
  const { profile } = useProfile()
  const dismissed = useUIStore((state) => state.setupChecklistDismissed)
  const setDismissed = useUIStore((state) => state.setSetupChecklistDismissed)

  if (!profile || dismissed || profile.hasCompletedOnboardingChecklist) {
    return null
  }

  const states = CHECKLIST_ITEMS.map((item) => Boolean(profile[item.flag]))
  const doneCount = states.filter(Boolean).length
  const total = CHECKLIST_ITEMS.length
  const allDone = doneCount === total

  return (
    <div style={{ padding: '6px 20px' }}>
      <section
        data-testid="setup-checklist-card"
        aria-label={t('today.setupChecklist.title')}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: 16,
          borderRadius: 18,
          background: 'var(--bg-card)',
          boxShadow: 'inset 0 0 0 1px var(--hairline)',
        }}
      >
        <div className="flex items-start justify-between" style={{ gap: 12 }}>
          <div className="flex min-w-0 flex-col" style={{ gap: 3 }}>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 18,
                fontWeight: 500,
                color: 'var(--fg-1)',
              }}
            >
              {t('today.setupChecklist.title')}
            </span>
            <span
              style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-3)' }}
            >
              {allDone
                ? t('today.setupChecklist.complete')
                : t('today.setupChecklist.subtitle')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label={t('today.setupChecklist.dismiss')}
            className="flex shrink-0 appearance-none items-center justify-center rounded-full border-0 bg-transparent"
            style={{ width: 28, height: 28, cursor: 'pointer' }}
          >
            <X size={18} strokeWidth={1.8} color="var(--fg-4)" />
          </button>
        </div>

        <ul
          className="flex flex-col"
          style={{ gap: 10, margin: 0, padding: 0, listStyle: 'none' }}
        >
          {CHECKLIST_ITEMS.map((item, index) => {
            const done = states[index]
            return (
              <li
                key={item.key}
                data-done={done}
                className="flex items-center"
                style={{ gap: 12 }}
              >
                <span
                  aria-hidden="true"
                  className="flex shrink-0 items-center justify-center rounded-full"
                  style={{
                    width: 24,
                    height: 24,
                    background: done ? 'var(--primary)' : 'transparent',
                    boxShadow: done ? 'none' : 'inset 0 0 0 2px var(--hairline-strong)',
                  }}
                >
                  {done ? (
                    <Check size={14} strokeWidth={2.4} color="var(--fg-on-primary)" />
                  ) : null}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 15,
                    color: done ? 'var(--fg-3)' : 'var(--fg-1)',
                    textDecoration: done ? 'line-through' : 'none',
                  }}
                >
                  {t(`today.setupChecklist.items.${item.key}`)}
                </span>
              </li>
            )
          })}
        </ul>

        <span
          data-testid="setup-checklist-progress"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--fg-3)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {t('today.setupChecklist.progress', { done: doneCount, total })}
        </span>
      </section>
    </div>
  )
}
