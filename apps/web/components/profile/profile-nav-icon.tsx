import {
  CalendarPlus,
  Gift,
  HelpCircle,
  Info,
  Smartphone,
  type Icon,
} from '@/components/ui/icons'
import type { ProfileNavIconKey } from '@orbit/shared/utils/profile-navigation'

interface ProfileNavIconProps {
  iconKey: ProfileNavIconKey
  /** CSS color value used for stroke. Defaults to `var(--fg-1)`. */
  color?: string
  /** Pixel size. Defaults to the kit ListRow icon size, 24. */
  size?: number
}

const ICON_BY_KEY: Record<ProfileNavIconKey, Icon> = {
  wrapped: Gift,
  widget: Smartphone,
  calendar: CalendarPlus,
  support: HelpCircle,
  info: Info,
}

export function ProfileNavIcon({
  iconKey,
  color = 'var(--fg-1)',
  size = 24,
}: Readonly<ProfileNavIconProps>) {
  const Icon = ICON_BY_KEY[iconKey]
  return <Icon size={size} strokeWidth={1.5} color={color} />
}
