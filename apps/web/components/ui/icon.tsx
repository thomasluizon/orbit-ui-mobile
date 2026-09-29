import type { ComponentType } from 'react'
import type { IconProps } from '@orbit/shared/contracts/brand'
import {
  AdjustmentsHorizontal,
  AlertTriangle,
  ArrowLeft,
  ArrowsMove,
  CalendarTime,
  Checkbox,
  Copy,
  ChevronsDown,
  ChevronDown,
  ChevronsUp,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  CreditCard,
  DeviceFloppy,
  Download,
  Eye,
  EyeOff,
  Home,
  ListTree,
  Minus,
  Plus,
  Pencil,
  RefreshCw,
  Satellite,
  SkipForward,
  Snowflake,
  Target,
  Template,
  Trash2,
  Subtask,
  WifiOff,
  X,
  type IconProps as TablerIconProps,
} from '@/components/ui/icons'

type TablerIcon = ComponentType<TablerIconProps>

const ICON_COMPONENTS: Readonly<Record<string, TablerIcon>> = {
  'adjustments-horizontal': AdjustmentsHorizontal,
  'alert-triangle': AlertTriangle,
  'arrow-left': ArrowLeft,
  'arrows-move': ArrowsMove,
  'calendar-time': CalendarTime,
  checkbox: Checkbox,
  copy: Copy,
  'chevrons-down': ChevronsDown,
  'chevron-down': ChevronDown,
  'chevrons-up': ChevronsUp,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'credit-card': CreditCard,
  'device-floppy': DeviceFloppy,
  download: Download,
  eye: Eye,
  'eye-off': EyeOff,
  'external-link': ArrowUpRight,
  home: Home,
  'list-tree': ListTree,
  minus: Minus,
  plus: Plus,
  pencil: Pencil,
  refresh: RefreshCw,
  satellite: Satellite,
  'player-skip-forward': SkipForward,
  snowflake: Snowflake,
  target: Target,
  template: Template,
  trash: Trash2,
  subtask: Subtask,
  'wifi-off': WifiOff,
  x: X,
}

export function Icon({ name, size = 24, strokeWidth = 1.5, filled = false, color, label }: Readonly<IconProps>) {
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
          strokeWidth={filled ? 2 : strokeWidth}
        />
      )}
    </span>
  )
}
