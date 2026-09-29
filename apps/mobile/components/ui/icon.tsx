import type { ComponentType } from 'react'
import type { IconProps } from '@orbit/shared/contracts/brand'
import { View } from 'react-native'
import {
  AdjustmentsHorizontal,
  AlertTriangle,
  ArrowLeft,
  Checkbox,
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
  Minus,
  Plus,
  RefreshCw,
  Satellite,
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
  checkbox: Checkbox,
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
  minus: Minus,
  plus: Plus,
  refresh: RefreshCw,
  satellite: Satellite,
  snowflake: Snowflake,
  target: Target,
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
