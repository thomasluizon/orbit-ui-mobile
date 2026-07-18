import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { RetrospectiveResponse } from '@orbit/shared/utils/retrospective'
import { AlertTriangle } from '@/components/ui/icons'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonCard, SkeletonLine } from '@/components/ui/skeleton'
import { RetrospectiveDashboard } from './retrospective-dashboard'
import { RetrospectiveEmptyState } from './retrospective-empty-state'
import { RetrospectiveNoDataState } from './retrospective-no-data-state'
import { styles, type Tokens } from './retrospective-styles'

interface RetrospectiveContentProps {
  tokens: Tokens
  isOnline: boolean
  isLoading: boolean
  isCacheLoading: boolean
  displayedData: RetrospectiveResponse | null
  displayedFromCache: boolean
  error: string | null
  noData: boolean
  onGenerate: () => void
}

function StatTileSkeleton({ tokens }: Readonly<{ tokens: Tokens }>) {
  return (
    <View
      style={[styles.skeletonTile, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}
    >
      <SkeletonLine width={28} height={28} />
      <SkeletonLine width={40} height={24} />
      <SkeletonLine width={48} height={12} />
    </View>
  )
}

export function RetrospectiveContent({
  tokens,
  isOnline,
  isLoading,
  isCacheLoading,
  displayedData,
  displayedFromCache,
  error,
  noData,
  onGenerate,
}: Readonly<RetrospectiveContentProps>) {
  const { t } = useTranslation()
  return (
    <>
      {isLoading ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('retrospective.generating')}
          style={styles.skeletonStack}
        >
          <SkeletonLine width="33%" height={12} />
          <View style={styles.statTilesRow}>
            <StatTileSkeleton tokens={tokens} />
            <StatTileSkeleton tokens={tokens} />
            <StatTileSkeleton tokens={tokens} />
          </View>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
        </View>
      ) : null}

      {!isLoading && displayedData ? (
        <RetrospectiveDashboard
          tokens={tokens}
          data={displayedData}
          fromCache={displayedFromCache}
          isOnline={isOnline}
          onRegenerate={onGenerate}
        />
      ) : null}

      {!isLoading && !displayedData && noData ? (
        <RetrospectiveNoDataState
          tokens={tokens}
          isOnline={isOnline}
          onGenerate={onGenerate}
        />
      ) : null}

      {!isLoading && !displayedData && !noData && error ? (
        <EmptyState
          icon={AlertTriangle}
          description={error || t('retrospective.error')}
          action={{
            label: t('common.retry'),
            onPress: onGenerate,
            disabled: !isOnline,
            variant: 'secondary',
          }}
        />
      ) : null}

      {!isLoading &&
      !displayedData &&
      !error &&
      !noData &&
      !isCacheLoading ? (
        <RetrospectiveEmptyState
          tokens={tokens}
          isOnline={isOnline}
          onGenerate={onGenerate}
        />
      ) : null}
    </>
  )
}
