import {
  LOCKUP_MARK_PATHS,
  LOCKUP_WORD_PATH,
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
      width={89.395502773}
      height={17.882739221}
      viewBox="-0.000000087 0 89.395502773 17.882739221"
      fill="none"
      color={tokens.fg1}
      accessible={false}
      testID="orbit-lockup"
    >
      <G transform="translate(-11.101787705 -14.738114888) scale(0.049008704)">
        {LOCKUP_MARK_PATHS.map((path) => (
          <Path key={path.d} d={path.d} fill="currentColor" fillRule={path.fillRule} />
        ))}
      </G>
      <G transform="translate(38.84610376 15.708)">
        <Path d={LOCKUP_WORD_PATH} fill="currentColor" />
      </G>
    </Svg>
  )
}
