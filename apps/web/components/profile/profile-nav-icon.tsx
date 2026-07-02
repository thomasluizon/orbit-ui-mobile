import {
  Calendar,
  ChartLine,
  CircleHelp,
  Compass,
  Gift,
  Globe,
  Settings,
  Sparkles,
  Trophy,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { ProfileNavIconKey } from '@orbit/shared/utils/profile-navigation'

interface ProfileNavIconProps {
  iconKey: ProfileNavIconKey
  /** CSS color value used for stroke. Defaults to `var(--fg-1)`. */
  color?: string
  /** Pixel size. Defaults to the kit ListRow icon size, 22. */
  size?: number
}

const ICON_BY_KEY: Record<ProfileNavIconKey, LucideIcon> = {
  settings: Settings,
  orbit: Sparkles,
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
  const Icon = ICON_BY_KEY[iconKey]
  return <Icon size={size} strokeWidth={1.8} color={color} />
}
