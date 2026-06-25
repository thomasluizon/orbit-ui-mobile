import { Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { RetrospectiveResponse } from '@orbit/shared/utils/retrospective'
import type { RetrospectivePeriod } from '@/hooks/use-retrospective'
import { Chip } from '@/components/ui/chip'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { RetrospectiveDashboard } from './retrospective-dashboard'
import { RetrospectiveEmptyState } from './retrospective-empty-state'
import { RetrospectiveNoDataState } from './retrospective-no-data-state'
import { styles, type Tokens } from './retrospective-styles'

interface RetrospectiveContentProps {
  tokens: Tokens
  isOnline: boolean
  isLoading: boolean
  isCacheLoading: boolean
  period: RetrospectivePeriod
  periodChips: { id: RetrospectivePeriod; label: string }[]
  displayedData: RetrospectiveResponse | null
  displayedFromCache: boolean
  error: string | null
  noData: boolean
  onSelectPeriod: (next: RetrospectivePeriod) => void
  onGenerate: () => void
}

export function RetrospectiveContent({
  tokens,
  isOnline,
  isLoading,
  isCacheLoading,
  period,
  periodChips,
  displayedData,
  displayedFromCache,
  error,
  noData,
  onSelectPeriod,
  onGenerate,
}: Readonly<RetrospectiveContentProps>) {
  const { t } = useTranslation()
  return (
    <>
      {!isOnline ? (
        <View style={styles.offlinePad}>
          <OfflineUnavailableState
            title={t('offline.title')}
            description={t('offline.description')}
            compact
          />
        </View>
      ) : null}

      <View
        style={[
          styles.tabsRow,
          { borderBottomColor: tokens.hairline },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScroll}
        >
          {periodChips.map((p) => (
            <Chip
              key={p.id}
              active={period === p.id}
              onPress={() => onSelectPeriod(p.id)}
            >
              {p.label}
            </Chip>
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.skeletonStack}>
          <Text
            style={[styles.skeletonLabel, { color: tokens.fg3 }]}
          >
            {t('retrospective.generating')}
          </Text>
          <View
            style={[
              styles.skeletonLine,
              { width: '60%', backgroundColor: tokens.bgCard },
            ]}
          />
          <View
            style={[
              styles.skeletonLine,
              { width: '80%', backgroundColor: tokens.bgCard },
            ]}
          />
          <View
            style={[
              styles.skeletonLine,
              { width: '40%', backgroundColor: tokens.bgCard },
            ]}
          />
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

      {!isLoading && !displayedData && !noData && error && (!displayedData || isOnline) ? (
        <View style={styles.errorWrap}>
          <Text style={[styles.errorText, { color: tokens.statusBad }]}>
            {t('retrospective.error')}
          </Text>
          <Pressable
            onPress={onGenerate}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.actionChip,
              {
                backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
                borderColor: tokens.hairline,
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
