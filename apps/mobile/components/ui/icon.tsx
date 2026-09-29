import type { ComponentType } from 'react'
import type { IconProps } from '@orbit/shared/contracts/brand'
import { View } from 'react-native'
import {
  AdjustmentsHorizontal,
  AlertTriangle,
  ArrowLeft,
  ArrowsMove,
  CalendarTime,
  Checkbox,
  Copy,
  ChevronsDown,
  ChevronsUp,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  CreditCard,
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
  'chevrons-up': ChevronsUp,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'credit-card': CreditCard,
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
  trash: Trash2,
  subtask: Subtask,
  'wifi-off': WifiOff,
  x: X,
}

export function Icon({ name, size = 24, strokeWidth = 1.5, filled = false, color, label }: Readonly<IconProps>) {
  const Glyph = ICON_COMPONENTS[name]

  return (
    <View
      accessible={label != null}
      accessibilityRole={label == null ? undefined : 'image'}
      accessibilityLabel={label}
      accessibilityElementsHidden={label == null}
      importantForAccessibility={label == null ? 'no-hide-descendants' : 'yes'}
      testID={`icon-${name}`}
      style={{
        alignItems: 'center',
        height: size,
        justifyContent: 'center',
        width: size,
      }}
    >
      {Glyph == null ? null : (
        <Glyph
          accessible={false}
          color={color}
          fill={filled ? color ?? 'currentColor' : 'none'}
          size={size}
          strokeWidth={filled ? 2 : strokeWidth}
        />
      )}
    </View>
  )
}
