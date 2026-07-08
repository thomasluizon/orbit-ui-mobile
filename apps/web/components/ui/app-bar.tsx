'use client'

import { useTranslations } from 'next-intl'
import { ChevronLeft, HelpCircle, Share2, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { useInAppShell } from '@/components/shell/in-app-shell-context'

type AppBarRightVariant = 'help' | 'close' | 'share'

export function resolveAppBarRightActionLabel(
  right: AppBarRightVariant | undefined,
  rightLabel: string | undefined,
  t: (key: string) => string,
): string | undefined {
  if (!right) return undefined
  if (rightLabel) return rightLabel
  if (right === 'help') return t('help')
  if (right === 'close') return t('close')
  return t('share')
}

interface AppBarRightActionProps {
  right: AppBarRightVariant
  rightLabel?: string
  onRight?: () => void
  t: (key: string) => string
}

function AppBarRightAction({ right, rightLabel, onRight, t }: Readonly<AppBarRightActionProps>) {
  return (
    <button
      type="button"
      aria-label={resolveAppBarRightActionLabel(right, rightLabel, t)}
      onClick={onRight}
      className={right === 'help' ? 'icon-btn icon-btn-ring' : 'icon-btn'}
    >
      {right === 'help' && <HelpCircle size={22} strokeWidth={1.8} />}
      {right === 'close' && <X size={24} strokeWidth={1.8} />}
      {right === 'share' && <Share2 size={21} strokeWidth={1.8} />}
    </button>
  )
}

interface AppBarBackButtonProps {
  back: boolean
  leadingIcon?: ReactNode
  resolvedBackLabel: string
  onBack?: () => void
}

function AppBarBackButton({
  back,
  leadingIcon,
  resolvedBackLabel,
  onBack,
}: Readonly<AppBarBackButtonProps>) {
  return (
    <button type="button" aria-label={resolvedBackLabel} onClick={onBack} className="icon-btn">
      {back ? <ChevronLeft size={26} strokeWidth={2} /> : leadingIcon}
    </button>
  )
}

/** Kit NavHeader: 56px transparent bar — equal flexible side slots (min 40px)
 *  keep the uppercase title truly centered regardless of trailing cluster width.
 *  Inside the desktop app shell it renders as a compact ~48px back/action row
 *  (title suppressed; desktop pages carry their own headings) and renders
 *  nothing only when it would be empty. */
interface AppBarProps {
  back?: boolean
  /** Accessibility label for the back/leading button. Defaults to t('common.back'). */
  backLabel?: string
  onBack?: () => void
  leadingIcon?: ReactNode
  /** Mark rendered immediately before the centered title (e.g. Astra's avatar). */
  titleIcon?: ReactNode
  /** Centered uppercase label. Omit for bars whose content carries its own heading. */
  title?: string
  subtitle?: string
  /** Arbitrary right-slot cluster; takes precedence over `right`. */
  trailing?: ReactNode
  /** Standard right-slot action: help (ringed), close, or share. */
  right?: AppBarRightVariant
  onRight?: () => void
  /** Accessibility label for the `right` action. Defaults to the matching common.* key. */
  rightLabel?: string
}

export function AppBar({
  back = false,
  backLabel,
  onBack,
  leadingIcon,
  titleIcon,
  title,
  subtitle,
  trailing,
  right,
  onRight,
  rightLabel,
}: Readonly<AppBarProps>) {
  const t = useTranslations('common')
  const inAppShell = useInAppShell()
  const isDesktop = useIsDesktop()
  const resolvedBackLabel = backLabel ?? t('back')
  const hasBack = back || !!onBack

  const rightAction = right ? (
    <AppBarRightAction right={right} rightLabel={rightLabel} onRight={onRight} t={t} />
  ) : null

  const backButton = hasBack ? (
    <AppBarBackButton
      back={back}
      leadingIcon={leadingIcon}
      resolvedBackLabel={resolvedBackLabel}
      onBack={onBack}
    />
  ) : null

  if (inAppShell && isDesktop) {
    const trailingCluster = trailing ?? rightAction
    if (!backButton && !trailingCluster) return null
    return (
      <div
        className="flex items-center justify-between shrink-0"
        style={{ minHeight: 48 }}
      >
        <div className="flex items-center justify-start">{backButton}</div>
        <div className="flex items-center justify-end" style={{ gap: 10 }}>
          {trailingCluster}
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex items-center shrink-0"
      style={{ minHeight: 56, padding: '8px 14px', gap: 4 }}
    >
      <div className="flex justify-start" style={{ flex: '1 0 0%', minWidth: 40 }}>
        {backButton ??
          (leadingIcon ? (
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center"
              style={{ width: 40, height: 40, color: 'var(--fg-1)' }}
            >
              {leadingIcon}
            </span>
          ) : null)}
      </div>

      {(title || titleIcon) && (
        <div className="flex flex-col justify-center min-w-0" style={{ gap: 2 }}>
          <div className="flex items-center justify-center min-w-0" style={{ gap: 8 }}>
            {titleIcon}
            {title && (
              <span
                className="overflow-hidden whitespace-nowrap text-ellipsis"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  fontWeight: 500,
                  letterSpacing: '0.09em',
                  textTransform: 'uppercase',
                  color: 'var(--fg-1)',
                }}
              >
                {title}
              </span>
            )}
          </div>
          {subtitle && (
            <div
              className="overflow-hidden whitespace-nowrap text-ellipsis text-center"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--fg-3)',
                letterSpacing: '0.02em',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      )}

      <div
        className="flex items-center justify-end"
        style={{ flex: '1 0 0%', minWidth: 40, gap: 10 }}
      >
        {trailing ?? rightAction}
      </div>
    </div>
  )
}
