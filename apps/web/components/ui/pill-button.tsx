'use client'

import type { ButtonProps } from '@orbit/shared/contracts/actions'
import { Loader2 } from '@/components/ui/icons'
import { BUTTON_SIZES, type ButtonVariant } from '@orbit/shared/theme'

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--primary)] text-[var(--fg-on-primary)] enabled:active:scale-[0.96]',
  secondary:
    'bg-[var(--fg-1)] text-[var(--bg)] enabled:hover:opacity-90 enabled:active:scale-[0.96] enabled:active:opacity-85',
  ghost:
    'bg-transparent text-[var(--fg-1)] shadow-[inset_0_0_0_1.5px_var(--hairline-strong)] enabled:hover:bg-[var(--bg-card)] enabled:active:scale-[0.96]',
  destructive:
    'bg-[var(--status-bad)] text-[var(--fg-on-bad)] enabled:hover:bg-[color-mix(in_srgb,var(--status-bad)_85%,black)] enabled:active:scale-[0.96]',
  caution:
    'bg-[var(--status-overdue)] text-[var(--fg-on-overdue)] enabled:hover:bg-[color-mix(in_srgb,var(--status-overdue)_85%,black)] enabled:active:scale-[0.96]',
}

/** The canonical five-variant pill action in the shared two-size geometry. */
export function Button({
  variant = 'primary',
  size = 'md',
  onClick,
  disabled = false,
  loading = false,
  fullWidth = false,
  children,
  accessibleName,
  iconOnly,
  label,
  formId,
}: Readonly<ButtonProps>) {
  const sizeSpec = BUTTON_SIZES[size]

  return (
    <button
      type={onClick ? 'button' : 'submit'}
      form={formId}
      onClick={loading ? undefined : onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={iconOnly ? label : accessibleName}
      data-variant={variant}
      data-size={size}
      data-loading={loading || undefined}
      className={[
        'inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-full border-0 font-medium transition-[background-color,opacity,box-shadow,transform] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] disabled:cursor-not-allowed disabled:opacity-40',
        variantClasses[variant],
        fullWidth ? 'w-full sm:mx-auto sm:w-auto sm:min-w-[220px] sm:max-w-[360px]' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        fontFamily: 'var(--font-sans)',
        height: sizeSpec.height,
        width: iconOnly ? sizeSpec.height : undefined,
        paddingInline: iconOnly ? 0 : sizeSpec.paddingX,
        fontSize: sizeSpec.fontSize,
        gap: iconOnly ? 0 : sizeSpec.gap,
      }}
    >
      {loading ? (
        <Loader2 size={sizeSpec.iconSize} strokeWidth={1.8} className="animate-spin" aria-hidden="true" />
      ) : iconOnly ? children : null}
      {iconOnly ? null : <span className={loading ? 'opacity-60' : undefined}>{children}</span>}
    </button>
  )
}

export { Button as PillButton }
