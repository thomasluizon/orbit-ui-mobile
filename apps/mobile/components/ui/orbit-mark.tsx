import {
  ORBIT_MARK_VIEW_BOX,
  ORBIT_MARK_PATHS,
  type OrbitMarkProps,
} from '@orbit/shared/contracts/brand'
import { useMemo } from 'react'
import Svg, { Path } from 'react-native-svg'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function OrbitMark({ size = 24, accent = false }: Readonly<OrbitMarkProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )

  return (
    <Svg
      width={size}
      height={size}
      viewBox={ORBIT_MARK_VIEW_BOX}
      fill="none"
      color={tokens.fg1}
      accessible={false}
      testID={accent ? 'orbit-mark-accent' : 'orbit-mark'}
    >
      {ORBIT_MARK_PATHS.map((path, index) => (
        <Path
          key={path.d}
          d={path.d}
          fill={accent && index === ORBIT_MARK_PATHS.length - 1 ? tokens.primary : 'currentColor'}
          fillRule={path.fillRule}
        />
      ))}
    </Svg>
  )
}
