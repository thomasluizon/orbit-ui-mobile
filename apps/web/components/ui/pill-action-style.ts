import type { CSSProperties } from 'react'
import { SPACING, BUTTON_SIZES, MATCHED_PILL_WIDTH, TOUCH_TARGET_MIN, type ButtonSize, type ButtonVariant } from '@orbit/shared/theme'

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--primary)] text-[var(--fg-on-primary)]',
  secondary: 'bg-[var(--fg-1)] text-[var(--bg)]',
  ghost: 'text-[var(--fg-1)] shadow-[inset_0_0_0_1.5px_var(--hairline-strong)] focus-visible:shadow-none',
  destructive: 'bg-[var(--status-bad)] text-[var(--fg-on-bad)]',
  caution: 'bg-[var(--status-overdue)] text-[var(--fg-on-overdue)]',
}

const buttonInteractionClasses: Record<ButtonVariant, string> = {
  primary: 'enabled:active:scale-[0.96]',
  secondary: 'enabled:hover:bg-[color-mix(in_srgb,var(--fg-1)_90%,var(--bg))] enabled:active:scale-[0.96] enabled:active:bg-[color-mix(in_srgb,var(--fg-1)_90%,var(--bg))]',
  ghost: 'overflow-hidden enabled:hover:bg-[var(--bg-hover)] enabled:active:bg-[var(--bg-hover)] motion-safe:enabled:active:scale-[0.96]',
  destructive: 'enabled:hover:bg-[color-mix(in_srgb,var(--status-bad)_85%,var(--fg-1))] enabled:active:scale-[0.96]',
  caution: 'enabled:hover:bg-[color-mix(in_srgb,var(--status-overdue)_85%,black)] enabled:active:scale-[0.96]',
}

const linkInteractionClasses: Record<ButtonVariant, string> = {
  primary: 'hover:bg-[var(--primary-hover)] active:scale-[0.96]',
  secondary: 'hover:bg-[color-mix(in_srgb,var(--fg-1)_90%,var(--bg))] active:scale-[0.96] active:bg-[color-mix(in_srgb,var(--fg-1)_90%,var(--bg))]',
  ghost: 'overflow-hidden hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] motion-safe:active:scale-[0.96]',
  destructive: 'hover:bg-[color-mix(in_srgb,var(--status-bad)_85%,var(--fg-1))] active:scale-[0.96]',
  caution: 'hover:bg-[color-mix(in_srgb,var(--status-overdue)_85%,black)] active:scale-[0.96]',
}

const baseClasses = 'focus-visible:-outline-offset-2 orbit-pill-action inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-full border-0 font-medium disabled:cursor-not-allowed'

export function actionClasses(variant: ButtonVariant, size: ButtonSize, element: 'button' | 'link', loading = false, quiet = false, elevated = false, borderless = false) {
  const variantInteractions = element === 'button'
    ? buttonInteractionClasses[variant]
    : linkInteractionClasses[variant]
  const interactionClasses = elevated && variant === 'ghost'
    ? 'overflow-hidden enabled:hover:bg-[var(--bg-elev-hover)] enabled:active:bg-[var(--bg-elev-hover)] motion-safe:enabled:active:scale-[0.96]'
    : quiet && variant === 'ghost'
    ? 'overflow-hidden enabled:hover:bg-[var(--bg-hover-opaque)] enabled:active:bg-[var(--bg-hover-opaque)] motion-safe:enabled:active:scale-[0.96]'
    : variantInteractions
  return [baseClasses, variant === 'ghost' && borderless ? 'text-[var(--fg-1)] outline-0 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--fg-1)] focus-visible:-outline-offset-2' : variantClasses[variant], variant === 'ghost' ? elevated ? 'bg-[var(--bg-elev)]' : 'bg-transparent' : undefined, loading ? undefined : interactionClasses,
    element === 'button' && !loading ? 'disabled:opacity-40' : undefined,
    size === 'sm' ? 'touch-target' : undefined]
    .filter(Boolean)
    .join(' ')
}

function inlineStartPadding(paddingX: number, iconOnly: boolean, leadingIcon: boolean): number {
  if (iconOnly) return 0
  return leadingIcon ? paddingX - 2 : paddingX
}

export function actionStyle(size: ButtonSize, iconOnly = false, matchedWidth = false, leadingIcon = false, hugLabel = false, minimumHeight?: number): CSSProperties & { '--pill-hit-padding'?: string } {
  const sizeSpec = BUTTON_SIZES[size]
  return {
    '--pill-hit-padding': iconOnly && minimumHeight !== undefined && minimumHeight >= TOUCH_TARGET_MIN ? '0px' : undefined,
    flexShrink: 0,
    fontFamily: 'var(--font-sans)',
    height: sizeSpec.height,
    width: iconOnly ? Math.max(minimumHeight ?? sizeSpec.height, sizeSpec.height) : matchedWidth ? MATCHED_PILL_WIDTH : hugLabel ? 'auto' : undefined,
    paddingInlineStart: inlineStartPadding(sizeSpec.paddingX, iconOnly, leadingIcon),
    paddingInlineEnd: iconOnly ? SPACING.s0 : sizeSpec.paddingX,
    paddingBlock: SPACING.s4,
    fontSize: sizeSpec.fontSize,
    gap: iconOnly ? 0 : sizeSpec.gap,
  }
}

