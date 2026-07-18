import {
  Calendar,
  ChartLine,
  CircleHelp,
  Compass,
  Gift,
  Globe,
  Settings,
  Trophy,
  Users,
  Wrench,
  type LucideIcon,
} from '@/components/ui/icons'
import { AstraMark } from '@/components/ui/astra-avatar'
import type { ProfileNavIconKey } from '@orbit/shared/utils/profile-navigation'

interface ProfileNavIconProps {
  iconKey: ProfileNavIconKey
  /** CSS color value used for stroke. Defaults to `var(--fg-1)`. */
  color?: string
  /** Pixel size. Defaults to the kit ListRow icon size, 22. */
  size?: number
}

const ICON_BY_KEY: Record<Exclude<ProfileNavIconKey, 'orbit'>, LucideIcon> = {
  settings: Settings,
  retrospective: ChartLine,
  wrapped: Gift,
  achievements: Trophy,
  calendar: Calendar,
  info: CircleHelp,
  wrench: Wrench,
  compass: Compass,
  friends: Users,
  globe: Globe,
}

export function ProfileNavIcon({
  iconKey,
  color = 'var(--fg-1)',
  size = 22,
}: Readonly<ProfileNavIconProps>) {
  if (iconKey === 'orbit') {
    return <AstraMark size={size} color={color} strokeWidth={1.8} />
  }
  const Icon = ICON_BY_KEY[iconKey]
  return <Icon size={size} strokeWidth={1.8} color={color} />
}
