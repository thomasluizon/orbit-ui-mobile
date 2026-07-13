import {
  Calendar,
  ChartLine,
  Compass,
  Gift,
  Settings,
  Sparkles,
  CircleHelp,
  Wrench,
  Users,
  Globe,
  Trophy,
} from 'lucide-react-native'
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
      return <Sparkles size={22} color={color} strokeWidth={1.8} />
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
