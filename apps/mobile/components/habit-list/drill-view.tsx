import type { ReactElement, ReactNode, RefObject } from 'react'
import {
  FlatList,
  Pressable,
  Text,
  View,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { ChevronLeft, Home } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { useDrillNavigation } from '@/hooks/use-drill-navigation'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import type { createStyles } from './styles'
import { SkeletonCard } from './empty-state'
import { PillButton } from '@/components/ui/pill-button'

interface HabitListDrillViewProps {
  drill: ReturnType<typeof useDrillNavigation>
  styles: ReturnType<typeof createStyles>
  listHeaderComponent: ReactNode
  drillListRef: RefObject<FlatList<NormalizedHabit> | null>
  renderDrillItem: ListRenderItem<NormalizedHabit>
  drillFooter: ReactElement
  refreshControl: ReactElement<RefreshControlProps>
  onListScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  onScrollBeginDrag?: () => void
  bulkBarStyle: StyleProp<ViewStyle>
}

/** Drill-down list view for a single parent habit's sub-habits. Presentational —
 *  HabitList owns drill state, the row renderer, and the shared overlays. */
export function HabitListDrillView({
  drill,
  styles,
  listHeaderComponent,
  drillListRef,
  renderDrillItem,
  drillFooter,
  refreshControl,
  onListScroll,
  onScrollBeginDrag,
  bulkBarStyle,
}: Readonly<HabitListDrillViewProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  const completedCount = drill.drillChildren.filter(
    (c) => c.isCompleted || c.isLoggedInRange,
  ).length

  const drillListHeader = (
    <>
      {listHeaderComponent}
      <View style={styles.drillHeader}>
        <Pressable
          onPress={drill.drillBack}
          hitSlop={2}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={({ pressed }) => [
            styles.drillBackBtn,
            pressed ? styles.drillBackBtnPressed : null,
          ]}
        >
          <ChevronLeft size={20} color={tokens.fg1} strokeWidth={1.8} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.drillTitle} numberOfLines={1}>
            {drill.currentParent?.title ?? ''}
          </Text>
          <Text style={styles.drillProgress}>
            {completedCount}/{drill.drillChildren.length}{' '}
            {t('habits.completed')}
          </Text>
        </View>
      </View>
      {drill.drillStack.length > 1 ? (
        <Pressable
          onPress={drill.drillReset}
          accessibilityRole="button"
          style={styles.drillResetRow}
        >
          {({ pressed }) => (
            <>
              <Home
                size={14}
                color={pressed ? tokens.primaryPressed : tokens.primary}
                strokeWidth={1.8}
              />
              <Text
                style={[
                  styles.drillResetText,
                  pressed ? { color: tokens.primaryPressed } : null,
                ]}
              >
                {t('habits.backToHabits')}
              </Text>
            </>
          )}
        </Pressable>
      ) : null}
    </>
  )

  const drillErrorState = drill.drillError ? (
    <View style={styles.drillErrorWrap}>
      <Text
        style={[styles.emptyText, { color: tokens.statusBadText }]}
        accessibilityLiveRegion="polite"
      >
        {drill.drillError}
      </Text>
      <PillButton
        variant="ghost"
        accessibilityLabel={t('common.retry')}
        style={styles.drillRetryButton}
        onPress={() => {
          void drill.refreshCurrent()
        }}
      >
        {t('common.retry')}
      </PillButton>
    </View>
  ) : (
    <Text style={styles.emptyText}>{t('habits.noSubHabits')}</Text>
  )

  const drillEmptyState = drill.drillLoading ? (
    <View style={styles.drillSkeletons}>
      <SkeletonCard styles={styles} />
      <SkeletonCard styles={styles} />
      <SkeletonCard styles={styles} />
    </View>
  ) : (
    drillErrorState
  )

  return (
    <FlatList
      ref={drillListRef}
      data={drill.drillLoading || drill.drillError ? [] : drill.drillChildren}
      keyExtractor={(item) => item.id}
      renderItem={renderDrillItem}
      ListHeaderComponent={drillListHeader}
      ListEmptyComponent={drillEmptyState}
      ListFooterComponent={drillFooter}
      contentContainerStyle={[styles.listContent, bulkBarStyle]}
      refreshControl={refreshControl}
      onScroll={onListScroll}
      scrollEventThrottle={16}
      onScrollBeginDrag={onScrollBeginDrag}
      showsVerticalScrollIndicator={false}
      initialNumToRender={10}
      maxToRenderPerBatch={5}
      windowSize={5}
      removeClippedSubviews={true}
    />
  )
}
