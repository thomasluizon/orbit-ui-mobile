import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { RecapSharePeriod } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'
import { useWrapped } from '@/hooks/use-wrapped'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { WrappedCover } from '@/components/wrapped/wrapped-cover'
import { WrappedPlayer } from '@/components/wrapped/wrapped-player'
import { styles } from './wrapped-styles'

export default function WrappedScreen() {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const { profile } = useProfile()
  const [period, setPeriod] = useState<RecapSharePeriod>('week')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const { recap, slides, isEmpty, isLoading, isError, refetch } = useWrapped(period, {
    active: isPlaying,
  })

  function selectPeriod(next: RecapSharePeriod) {
    setPeriod(next)
    setIsPlaying(false)
  }

  function startPlayer() {
    if (!recap || isEmpty) return
    setIsPlaying(true)
  }

  async function retryCover() {
    setIsRetrying(true)
    try {
      await refetch()
    } finally {
      setIsRetrying(false)
    }
  }

  const coverState = isLoading || isRetrying
    ? 'loading'
    : isError
      ? 'failed'
      : isEmpty
        ? 'empty'
        : 'ready'

  if (isPlaying && recap && !isEmpty) {
    return (
      <View style={[styles.safeArea, { backgroundColor: tokens.bg }]}>
        <WrappedPlayer
          slides={slides}
          recap={recap}
          period={period}
          tokens={tokens}
          displayName={profile?.name ?? undefined}
          onClose={() => setIsPlaying(false)}
        />
      </View>
    )
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: tokens.bg }]} edges={['top']}>
      <WrappedCover
        tokens={tokens}
        period={period}
        onSelectPeriod={selectPeriod}
        state={coverState}
        onStart={startPlayer}
        onRetry={() => void retryCover()}
      />
    </SafeAreaView>
  )
}
