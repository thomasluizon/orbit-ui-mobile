import {
  ORBIT_MARK_16_PATHS,
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
  const isNativeSize = size < 20
  const paths = isNativeSize ? ORBIT_MARK_16_PATHS : ORBIT_MARK_PATHS

  return (
    <Svg
      width={size}
      height={size}
      viewBox={isNativeSize ? '0 0 16 16' : '0 0 1024 1024'}
      fill="none"
      color={tokens.fg1}
      accessible={false}
      testID={isNativeSize ? 'orbit-mark-16' : accent ? 'orbit-mark-accent' : 'orbit-mark'}
    >
      {paths.map((path, index) => (
        <Path
          key={path.d}
          d={path.d}
          fill={accent && index === paths.length - 1 ? tokens.primary : 'currentColor'}
          fillRule={path.fillRule}
        />
      ))}
    </Svg>
  )
}
