import {
  Calendar,
  ChartLine,
  Compass,
  Gift,
  Settings,
  CircleHelp,
  Wrench,
  Users,
  Globe,
  Trophy,
} from '@/components/ui/icons'
import { AstraMark } from '@/components/ui/astra-avatar'
import type { ProfileNavIconKey } from '@orbit/shared/utils/profile-navigation'

export function ProfileNavIcon({
  iconKey,
  color,
}: Readonly<{
  iconKey: ProfileNavIconKey
  color: string
}>) {
  switch (iconKey) {
    case 'settings':
      return <Settings size={22} color={color} strokeWidth={1.8} />
    case 'orbit':
      return <AstraMark size={22} color={color} />
    case 'retrospective':
      return <ChartLine size={22} color={color} strokeWidth={1.8} />
    case 'wrapped':
      return <Gift size={22} color={color} strokeWidth={1.8} />
    case 'achievements':
      return <Trophy size={22} color={color} strokeWidth={1.8} />
    case 'calendar':
      return <Calendar size={22} color={color} strokeWidth={1.8} />
    case 'info':
      return <CircleHelp size={22} color={color} strokeWidth={1.8} />
    case 'wrench':
      return <Wrench size={22} color={color} strokeWidth={1.8} />
    case 'compass':
      return <Compass size={22} color={color} strokeWidth={1.8} />
    case 'friends':
      return <Users size={22} color={color} strokeWidth={1.8} />
    case 'globe':
      return <Globe size={22} color={color} strokeWidth={1.8} />
    default:
      return null
  }
}
