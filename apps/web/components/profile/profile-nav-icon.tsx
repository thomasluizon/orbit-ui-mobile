import {
  Bell,
  Crown,
  Settings,
  User,
  CalendarPlus,
  Gift,
  HelpCircle,
  Info,
  Smartphone,
  type Icon,
} from '@/components/ui/icons'
import { OrbitMascotIcon } from '@/components/ui/orbit-mascot'
import type { ProfileNavIconKey } from '@orbit/shared/utils/profile-navigation'

interface ProfileNavIconProps {
  iconKey: ProfileNavIconKey
  color?: string
  size?: number
}

const ICON_BY_KEY: Record<Exclude<ProfileNavIconKey, 'orbit'>, Icon> = {
  account: User,
  pro: Crown,
  preferences: Settings,
  notifications: Bell,
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
  if (iconKey === 'orbit') return <OrbitMascotIcon size={size} color={color} />
  const Icon = ICON_BY_KEY[iconKey]
  return <Icon size={size} strokeWidth={1.5} color={color} />
}
