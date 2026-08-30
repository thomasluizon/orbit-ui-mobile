import type { ComponentType } from 'react'
import type { IconProps } from '@orbit/shared/contracts/brand'
import {
  AdjustmentsHorizontal,
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  CreditCard,
  Download,
  Home,
  Minus,
  Plus,
  Snowflake,
  Target,
  WifiOff,
  X,
  type IconProps as TablerIconProps,
} from '@/components/ui/icons'

type TablerIcon = ComponentType<TablerIconProps>

const ICON_COMPONENTS: Readonly<Record<string, TablerIcon>> = {
  'adjustments-horizontal': AdjustmentsHorizontal,
  'alert-triangle': AlertTriangle,
  'arrow-left': ArrowLeft,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'credit-card': CreditCard,
  download: Download,
  'external-link': ArrowUpRight,
  home: Home,
  minus: Minus,
  plus: Plus,
  snowflake: Snowflake,
  target: Target,
  'wifi-off': WifiOff,
  x: X,
}

export function Icon({ name, size = 24, filled = false, color, label }: Readonly<IconProps>) {
  const Glyph = ICON_COMPONENTS[name]

  return (
    <span
      role={label == null ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label == null ? true : undefined}
      data-icon={name}
      data-filled={filled ? '' : undefined}
      style={{
        alignItems: 'center',
        color,
        display: 'inline-flex',
        height: size,
        justifyContent: 'center',
        lineHeight: 1,
        width: size,
      }}
    >
      {Glyph == null ? null : (
        <Glyph
          aria-hidden="true"
          color="currentColor"
          fill={filled ? 'currentColor' : 'none'}
          size={size}
          strokeWidth={filled ? 2 : 1.5}
        />
      )}
    </span>
  )
}
