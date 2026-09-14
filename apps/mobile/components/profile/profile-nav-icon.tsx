import {
  CalendarPlus,
  Gift,
  HelpCircle,
  Info,
  Smartphone,
  type Icon,
} from '@/components/ui/icons'
import type { ProfileNavIconKey } from '@orbit/shared/utils/profile-navigation'

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
}: Readonly<{
  iconKey: ProfileNavIconKey
  color: string
}>) {
  const IconComponent = ICON_BY_KEY[iconKey]
  return <IconComponent size={24} color={color} strokeWidth={1.5} />
}
