import Svg, { Path } from 'react-native-svg'
import { GOOGLE_MARK_PATHS, GOOGLE_MARK_SIZE } from '@orbit/shared/contracts/brand'

export function GoogleMark() {
  return <Svg width={GOOGLE_MARK_SIZE} height={GOOGLE_MARK_SIZE} viewBox="0 0 48 48"
    accessible={false} importantForAccessibility="no-hide-descendants" testID="google-mark">
    {GOOGLE_MARK_PATHS.map((path) => <Path key={path.fill} {...path} />)}
  </Svg>
}
