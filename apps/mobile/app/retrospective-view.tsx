import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { RetrospectiveResponse } from '@orbit/shared/utils/retrospective'
import { SkeletonLine } from '@/components/ui/skeleton'
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
        <View style={styles.skeletonStack}>
          <Text style={[styles.skeletonLabel, { color: tokens.fg3 }]}>
            {t('retrospective.generating')}
          </Text>
          <SkeletonLine width="60%" height={7} />
          <SkeletonLine width="80%" height={7} />
          <SkeletonLine width="40%" height={7} />
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
        <View style={styles.errorWrap}>
          <Text style={[styles.errorText, { color: tokens.statusBad }]}>
            {error || t('retrospective.error')}
          </Text>
          <Pressable
            onPress={onGenerate}
            disabled={!isOnline}
            accessibilityRole="button"
            accessibilityState={{ disabled: !isOnline }}
            hitSlop={{ top: 5, bottom: 5 }}
            style={({ pressed }) => [
              styles.actionChip,
              {
                backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
                borderColor: tokens.hairline,
                opacity: isOnline ? 1 : 0.5,
              },
              pressed ? styles.actionChipPressed : null,
            ]}
          >
            <Text style={[styles.actionChipText, { color: tokens.fg1 }]}>
              {t('common.retry')}
            </Text>
          </Pressable>
        </View>
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
