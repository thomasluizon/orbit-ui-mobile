import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import type { Recap } from '@orbit/shared/types/gamification'
import {
  isRecapShareEmpty,
  RECAP_SHARE_PERIODS,
  recapPeriodLabelKey,
  type RecapSharePeriod,
} from '@orbit/shared/utils'
import { useRecap } from '@/hooks/use-recap'
import { useShareCard } from '@/hooks/use-share-card'
import { Sheet } from '@/components/ui/sheet'
import { Chip } from '@/components/ui/chip'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { Skeleton } from '@/components/ui/skeleton'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ShareCard } from './share-card'

interface ShareCardPanelProps {
  open: boolean
  onClose: () => void
  displayName?: string
}

interface LoadedShareCardProps {
  recap: Recap
  displayName?: string
  shareRef: ReturnType<typeof useShareCard>['shareRef']
  isSharing: boolean
  hasError: boolean
  share: ReturnType<typeof useShareCard>['share']
  styles: ReturnType<typeof createStyles>
}

function LoadedShareCard({
  recap,
  displayName,
  shareRef,
  isSharing,
  hasError,
  share,
  styles,
}: Readonly<LoadedShareCardProps>) {
  const { t } = useTranslation()
  return (
    <Animated.View
      entering={FadeInDown.duration(220).reduceMotion(ReduceMotion.System)}
      style={styles.cardBlock}
    >
      <View style={styles.cardWrap}>
        <ShareCard ref={shareRef} recap={recap} displayName={displayName} />
      </View>
      {hasError ? <Text style={styles.errorText}>{t('shareCard.shareError')}</Text> : null}
      <PillButton
        loading={isSharing}
        disabled={isSharing}
        onClick={() => void share(t('shareCard.shareTitle'))}
      >
        {t('shareCard.share')}
      </PillButton>
    </Animated.View>
  )
}

/** Recap share preview: period selector → recap fetch → branded ShareCard + native share. Reused by Profile + Retrospective. */
export function ShareCardPanel({ open, onClose, displayName }: Readonly<ShareCardPanelProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const [period, setPeriod] = useState<RecapSharePeriod>('week')
  const { data: recap, isLoading, isError, refetch } = useRecap(period, open)
  const { shareRef, isSharing, hasError, share } = useShareCard()

  const isEmpty = recap ? isRecapShareEmpty(recap.metrics) : false
  const showCard = !isLoading && !isError && recap && !isEmpty

  return (
    open ? (<Sheet
      open
      onClose={onClose}
      title={t('shareCard.title')}
    >
      <View style={styles.content}>
        <View style={styles.periodRow}>
          {RECAP_SHARE_PERIODS.map((value) => (
            <Chip key={value} active={period === value} onPress={() => setPeriod(value)}>
              {t(recapPeriodLabelKey(value))}
            </Chip>
          ))}
        </View>

        {isLoading ? (
          <View style={styles.loadingStack}>
            <Skeleton variant="grid" rows={1} cols={1} cell={360} gap={0} label={t('shareCard.loading')} />
            <Skeleton variant="settings" label={t('shareCard.loading')} />
          </View>
        ) : null}

        {!isLoading && isError ? (
          <View style={styles.errorState}>
            <Text style={styles.errorText}>{t('shareCard.error')}</Text>
            <PillButton variant="ghost" onClick={() => void refetch()}>
              {t('common.retry')}
            </PillButton>
          </View>
        ) : null}

        {!isLoading && !isError && recap && isEmpty ? (
          <View style={styles.emptyState}>
            <SatelliteGlyph />
            <Text style={styles.emptyText}>{t('shareCard.empty')}</Text>
          </View>
        ) : null}

        {showCard ? (
          <LoadedShareCard
            recap={recap}
            displayName={displayName}
            shareRef={shareRef}
            isSharing={isSharing}
            hasError={hasError}
            share={share}
            styles={styles}
          />
        ) : null}
      </View>
    </Sheet>) : null
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 16,
      paddingBottom: 24,
      gap: 16,
    },
    periodRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 4,
    },
    loadingStack: {
      alignItems: 'center',
      gap: 12,
    },
    cardSkeleton: {
      borderRadius: 20,
    },
    pillSkeleton: {
      borderRadius: 999,
    },
    errorState: {
      paddingVertical: 32,
      alignItems: 'center',
      gap: 12,
    },
    emptyState: {
      paddingVertical: 24,
      alignItems: 'center',
      gap: 12,
    },
    emptyText: {
      textAlign: 'center',
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      color: tokens.fg3,
    },
    cardBlock: {
      gap: 16,
    },
    cardWrap: {
      alignItems: 'center',
    },
    errorText: {
      textAlign: 'center',
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      color: tokens.statusBad,
    },
  })
}
