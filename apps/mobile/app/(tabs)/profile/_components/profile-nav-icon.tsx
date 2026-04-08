import { Settings, Sparkles, Info, Wrench } from 'lucide-react-native'
import Svg, { Path, Rect } from 'react-native-svg'
import type { ProfileNavIconKey } from '@orbit/shared/utils/profile-navigation'

export function ProfileNavIcon({
  iconKey,
  color,
}: {
  iconKey: ProfileNavIconKey
  color: string
}) {
  switch (iconKey) {
    case 'settings':
      return <Settings size={20} color={color} />
    case 'sparkles':
      return <Sparkles size={20} color={color} />
    case 'retrospective':
      return (
        <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M3 3v18h18" />
          <Path d="M18 9l-5 5-4-4-3 3" />
        </Svg>
      )
    case 'achievements':
      return (
        <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 9 8 9 8" />
          <Path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 15 8 15 8" />
          <Path d="M4 22h16" />
          <Path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
          <Path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
          <Path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </Svg>
      )
    case 'calendar':
      return (
        <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M8 2v4" />
          <Path d="M16 2v4" />
          <Rect width={18} height={18} x={3} y={4} rx={2} />
          <Path d="M3 10h18" />
        </Svg>
      )
    case 'info':
      return <Info size={20} color={color} />
    case 'wrench':
      return <Wrench size={20} color={color} />
    default:
      return null
  }
}
