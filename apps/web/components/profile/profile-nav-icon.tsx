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
  /** CSS color value used for stroke. Inherits from the parent when omitted. */
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
  color,
  size = 24,
}: Readonly<ProfileNavIconProps>) {
  const Icon = ICON_BY_KEY[iconKey]
  return <Icon size={size} strokeWidth={1.5} color={color} />
}
