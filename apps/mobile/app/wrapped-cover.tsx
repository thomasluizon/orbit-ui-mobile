import { Text, View } from 'react-native'
import { Play } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'
import { RECAP_SHARE_PERIODS, type RecapSharePeriod } from '@orbit/shared/utils'
import { RingMotif } from '@/components/gamification/ring-motif'
import { Chip } from '@/components/ui/chip'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
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
// react-doctor-disable-next-line no-many-boolean-props -- Deliberate presentational cover: independent loading/error/empty UI-state flags owned by the Wrapped screen; an options-object rewrite would churn the caller and the web parity mirror for no runtime benefit. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
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
      <RingMotif
        dashed
        ringSize={300}
        eyebrow={t('wrapped.coverEyebrow')}
        anchor={
          <View style={styles.coverHeader}>
            <Text style={[styles.coverTitle, { color: tokens.fg1 }]}>{t('wrapped.title')}</Text>
            <Text style={[styles.coverSubtitle, { color: tokens.fg2 }]}>
              {t('wrapped.coverSubtitle')}
            </Text>
          </View>
        }
      />

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
            <Text
              style={[styles.stateText, { color: tokens.statusBadText }]}
              accessibilityRole="alert"
            >
              {t('wrapped.error')}
            </Text>
            <Chip onPress={onRetry}>{t('wrapped.retry')}</Chip>
          </>
        ) : null}

        {!isLoading && !isError && isEmpty ? (
          <View style={styles.emptyState}>
            <SatelliteGlyph />
            <Text style={[styles.stateText, { color: tokens.fg3 }]}>{t('wrapped.empty')}</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}
