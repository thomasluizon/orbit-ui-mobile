import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { RecapSharePeriod } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'
import { useWrapped } from '@/hooks/use-wrapped'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { AppBar } from '@/components/ui/app-bar'
import { WrappedCover } from './wrapped-cover'
import { WrappedPlayer } from './wrapped-player'
import { styles } from './wrapped-styles'

export default function WrappedScreen() {
  const { t } = useTranslation()
  const goBackOrFallback = useGoBackOrFallback()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const { profile } = useProfile()
  const [period, setPeriod] = useState<RecapSharePeriod>('week')
  const [isPlaying, setIsPlaying] = useState(false)
  const { recap, slides, isEmpty, isLoading, isError, refetch } = useWrapped(period, {
    active: isPlaying,
  })

  function selectPeriod(next: RecapSharePeriod) {
    setPeriod(next)
    setIsPlaying(false)
  }

  if (isPlaying && recap) {
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
      <AppBar back onBack={() => goBackOrFallback('/profile')} backLabel={t('wrapped.back')} />
      <WrappedCover
        tokens={tokens}
        period={period}
        onSelectPeriod={selectPeriod}
        isLoading={isLoading}
        isError={isError}
        isEmpty={isEmpty}
        canStart={!!recap && !isEmpty}
        onStart={() => setIsPlaying(true)}
        onRetry={() => void refetch()}
      />
    </SafeAreaView>
  )
}
