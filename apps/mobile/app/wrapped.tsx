import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import type { RecapSharePeriod } from '@orbit/shared/utils'
import { Button } from '@/components/ui/pill-button'
import { ChevronLeft } from '@/components/ui/icons'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useWrapped } from '@/hooks/use-wrapped'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { WrappedCover } from '@/components/wrapped/wrapped-cover'
import { WrappedPlayer } from '@/components/wrapped/wrapped-player'
import { styles } from './wrapped-styles'

export default function WrappedScreen() {
  const { t } = useTranslation()
  const goBackOrFallback = useGoBackOrFallback()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
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
        : recap
          ? 'ready'
          : 'loading'

  if (isPlaying && recap && !isEmpty) {
    return (
      <View style={[styles.safeArea, { backgroundColor: tokens.bg }]}>
        <WrappedPlayer
          slides={slides}
          recap={recap}
          period={period}
          tokens={tokens}
          onClose={() => setIsPlaying(false)}
        />
      </View>
    )
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: tokens.bg }]} edges={['top']}>
      <View style={styles.coverExit}>
        {/* eslint-disable-next-line local/max-button-words -- ORB-57 requires the existing common.backToProfile copy. */}
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          label={t('common.backToProfile')}
          onClick={() => goBackOrFallback('/profile')}
        >
          <ChevronLeft size={20} strokeWidth={2} color={tokens.fg1} />
        </Button>
      </View>
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
