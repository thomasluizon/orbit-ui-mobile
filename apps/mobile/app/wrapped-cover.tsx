import { Pressable, Text, View } from 'react-native'
import { Play } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { RECAP_SHARE_PERIODS, type RecapSharePeriod } from '@orbit/shared/utils'
import { Chip } from '@/components/ui/chip'
import { PillButton } from '@/components/ui/pill-button'
import { styles, type Tokens } from './wrapped-styles'

interface WrappedCoverProps {
  tokens: Tokens
  period: RecapSharePeriod
  onSelectPeriod: (period: RecapSharePeriod) => void
  isLoading: boolean
  isError: boolean
  isEmpty: boolean
  canStart: boolean
  onStart: () => void
  onRetry: () => void
}

/** Wrapped entry screen: period picker, Start CTA, and the loading / empty / error states before the player opens. */
export function WrappedCover({
  tokens,
  period,
  onSelectPeriod,
  isLoading,
  isError,
  isEmpty,
  canStart,
  onStart,
  onRetry,
}: Readonly<WrappedCoverProps>) {
  const { t } = useTranslation()

  return (
    <View style={styles.cover}>
      <View style={styles.coverHeader}>
        <Text style={[styles.eyebrow, { color: tokens.fg2 }]}>{t('wrapped.coverEyebrow')}</Text>
        <Text style={[styles.coverTitle, { color: tokens.fg1 }]}>{t('wrapped.title')}</Text>
        <Text style={[styles.coverSubtitle, { color: tokens.fg2 }]}>{t('wrapped.coverSubtitle')}</Text>
      </View>

      <View style={styles.periodRow}>
        {RECAP_SHARE_PERIODS.map((value) => (
          <Chip key={value} active={period === value} onPress={() => onSelectPeriod(value)}>
            {t(`wrapped.periods.${value}`)}
          </Chip>
        ))}
      </View>

      <View style={styles.ctaWrap}>
        <PillButton
          disabled={!canStart}
          onPress={onStart}
          leading={<Play size={18} strokeWidth={1.8} color={tokens.fgOnPrimary} />}
        >
          {t('wrapped.start')}
        </PillButton>

        {isLoading ? (
          <Text style={[styles.stateText, { color: tokens.fg3 }]}>{t('wrapped.loading')}</Text>
        ) : null}

        {!isLoading && isError ? (
          <>
            <Text style={[styles.stateText, { color: tokens.statusBad }]}>{t('wrapped.error')}</Text>
            <Pressable
              onPress={onRetry}
              accessibilityRole="button"
              accessibilityLabel={t('wrapped.retry')}
              style={({ pressed }) => [
                styles.retryChip,
                {
                  borderColor: tokens.hairline,
                  backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
                },
                pressed ? styles.retryChipPressed : null,
              ]}
            >
              <Text style={[styles.retryChipText, { color: tokens.fg1 }]}>{t('wrapped.retry')}</Text>
            </Pressable>
          </>
        ) : null}

        {!isLoading && !isError && isEmpty ? (
          <Text style={[styles.stateText, { color: tokens.fg3 }]}>{t('wrapped.empty')}</Text>
        ) : null}
      </View>
    </View>
  )
}
