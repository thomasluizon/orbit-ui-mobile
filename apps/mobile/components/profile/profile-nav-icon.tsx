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
import { AstraGlyph } from '@/components/ui/astra-glyph'
import type { ProfileNavIconKey } from '@orbit/shared/utils/profile-navigation'

const ICON_BY_KEY: Record<Exclude<ProfileNavIconKey, 'astra'>, Icon> = {
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
}: Readonly<{
  iconKey: ProfileNavIconKey
  color?: string
}>) {
  if (iconKey === 'astra') return <AstraGlyph size={24} color={color} />
  const IconComponent = ICON_BY_KEY[iconKey]
  return <IconComponent size={24} color={color} strokeWidth={1.5} />
}
