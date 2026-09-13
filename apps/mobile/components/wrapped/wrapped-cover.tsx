import { ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { RECAP_SHARE_PERIODS, type RecapSharePeriod } from '@orbit/shared/utils'
import { Chip } from '@/components/ui/chip'
import { ErrorState } from '@/components/ui/error-state'
import { Icon } from '@/components/ui/icon'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { Button } from '@/components/ui/pill-button'
import { Skeleton } from '@/components/ui/skeleton'
import { styles, type Tokens } from '@/app/wrapped-styles'

type WrappedCoverState = 'ready' | 'loading' | 'failed' | 'empty'

interface WrappedCoverProps {
  tokens: Tokens
  period: RecapSharePeriod
  onSelectPeriod: (period: RecapSharePeriod) => void
  state: WrappedCoverState
  onStart: () => void
  onRetry: () => void
}

export function WrappedCover({
  tokens,
  period,
  onSelectPeriod,
  state,
  onStart,
  onRetry,
}: Readonly<WrappedCoverProps>) {
  const { t } = useTranslation()

  return (
    <ScrollView
      contentContainerStyle={styles.cover}
      style={styles.coverScroller}
      testID={`wrapped-cover-${state}`}
    >
      <OrbitMark size={96} />

      <View style={styles.coverHeader}>
        <Text style={[styles.coverEyebrow, { color: tokens.fg3 }]}>{t('wrapped.title')}</Text>
        <Text accessibilityRole="header" style={[styles.coverTitle, { color: tokens.fg1 }]}>
          {t(`wrapped.coverTitles.${period}`)}
        </Text>
        <Text style={[styles.coverSubtitle, { color: tokens.fg3 }]}>
          {t('wrapped.coverSubtitle')}
        </Text>
      </View>

      <View
        style={styles.periodRow}
        role="group"
        accessibilityLabel={t('wrapped.periodGroup')}
      >
        {RECAP_SHARE_PERIODS.map((value) => (
          <Chip
            key={value}
            active={period === value}
            onPress={() => onSelectPeriod(value)}
            accessibilityLabel={t(`wrapped.periods.${value}`)}
          >
            {t(`wrapped.periods.${value}`)}
          </Chip>
        ))}
      </View>

      <CoverBody
        state={state}
        tokens={tokens}
        onStart={onStart}
        onRetry={onRetry}
      />
    </ScrollView>
  )
}

function CoverBody({
  state,
  tokens,
  onStart,
  onRetry,
}: Readonly<Pick<WrappedCoverProps, 'state' | 'tokens' | 'onStart' | 'onRetry'>>) {
  const { t } = useTranslation()

  if (state === 'loading') {
    return <Skeleton variant="settings" rows={3} label={t('wrapped.loading')} />
  }
  if (state === 'failed') {
    return (
      <View style={styles.coverBody}>
        <ErrorState
          message={t('wrapped.error')}
          action={<Button size="sm" onClick={onRetry}>{t('wrapped.retry')}</Button>}
        />
      </View>
    )
  }
  if (state === 'empty') {
    return (
      <View style={styles.coverBody}>
        <View style={styles.emptyRow}>
          <View style={[styles.emptyIcon, { backgroundColor: tokens.bgWell }]}>
            <Icon name="satellite" size={24} color={tokens.fg3} />
          </View>
          <Text style={[styles.stateText, { color: tokens.fg2 }]}>{t('wrapped.empty')}</Text>
        </View>
        <Button disabled>{t('wrapped.start')}</Button>
      </View>
    )
  }

  return (
    <View style={styles.coverBody}>
      <Button onClick={onStart}>{t('wrapped.start')}</Button>
    </View>
  )
}
