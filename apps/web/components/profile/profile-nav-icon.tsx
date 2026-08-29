import {
  Calendar,
  CircleHelp,
  Compass,
  Gift,
  Settings,
  Sparkles,
  Wrench,
  type Icon,
} from '@/components/ui/icons'
import type { ProfileNavIconKey } from '@orbit/shared/utils/profile-navigation'

interface ProfileNavIconProps {
  iconKey: ProfileNavIconKey
  /** CSS color value used for stroke. Defaults to `var(--fg-1)`. */
  color?: string
  /** Pixel size. Defaults to the kit ListRow icon size, 22. */
  size?: number
}

const ICON_BY_KEY: Record<ProfileNavIconKey, Icon> = {
  settings: Settings,
  orbit: Sparkles,
  wrapped: Gift,
  calendar: Calendar,
  info: CircleHelp,
  wrench: Wrench,
  compass: Compass,
}

export function ProfileNavIcon({
  iconKey,
  color = 'var(--fg-1)',
  size = 22,
}: Readonly<ProfileNavIconProps>) {
  const Icon = ICON_BY_KEY[iconKey]
  return <Icon size={size} strokeWidth={1.8} color={color} />
}
