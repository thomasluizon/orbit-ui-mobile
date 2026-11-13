import {
  LOCKUP_HEIGHT,
  LOCKUP_MARK_PATHS,
  LOCKUP_MARK_TRANSFORM,
  LOCKUP_VIEW_BOX,
  LOCKUP_WIDTH,
  LOCKUP_WORD_PATH,
  LOCKUP_WORD_TRANSFORM,
  type LockupProps,
} from '@orbit/shared/contracts/brand'
import { useMemo } from 'react'
import Svg, { G, Path } from 'react-native-svg'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function Lockup(_props: Readonly<LockupProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )

  return (
    <Svg
      width={LOCKUP_WIDTH}
      height={LOCKUP_HEIGHT}
      viewBox={LOCKUP_VIEW_BOX}
      fill="none"
      color={tokens.fg1}
      accessible={false}
      testID="orbit-lockup"
    >
      <G transform={LOCKUP_MARK_TRANSFORM}>
        {LOCKUP_MARK_PATHS.map((path) => (
          <Path key={path.d} d={path.d} fill="currentColor" fillRule={path.fillRule} />
        ))}
      </G>
      <G transform={LOCKUP_WORD_TRANSFORM}>
        <Path d={LOCKUP_WORD_PATH} fill="currentColor" />
      </G>
    </Svg>
  )
}
