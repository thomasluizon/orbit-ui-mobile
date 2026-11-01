import { KeyboardAwareFlatList } from '@/components/ui/keyboard-aware-scroll-view'
import { useRetainedHabitList } from '@/hooks/use-retained-habit-list'
import { useListScrollReservation } from '@/hooks/use-list-scroll-reservation'
import { usePrefersReducedMotion } from '@/lib/motion'
import { HabitListMotionRow } from '@/components/motion/habit-list-row'
import { IconButton } from '@/components/ui/icon-button'
import { useMemo, useState, type ReactElement, type ReactNode, type RefObject } from 'react'
import {
  type FlatList,
  Pressable,
  Text,
  View,
  type ListRenderItem,
  type NativeScrollEvent,
  type FocusEvent,
  type NativeSyntheticEvent,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { useDrillNavigation } from '@/hooks/use-drill-navigation'
import { PersonalText } from '@/components/ui/personal-text'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { ArrowLeft, RefreshCw } from '@/components/ui/icons'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { Skeleton } from '@/components/ui/skeleton'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import type { createStyles } from './styles'

interface HabitDrillProps {
  drill: ReturnType<typeof useDrillNavigation>
  styles: ReturnType<typeof createStyles>
  t: (key: string, values?: Record<string, string | number>) => string
  listHeaderComponent: ReactNode
  drillListRef: RefObject<FlatList<NormalizedHabit> | null>
  refreshControl: ReactElement<RefreshControlProps>
  onListScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  onFocus?: (event: FocusEvent) => void
  onScrollBeginDrag?: () => void
  bulkBarStyle: StyleProp<ViewStyle>
  renderHabitCard: (
    habit: NormalizedHabit,
    depth: number,
    hasChildren: boolean,
    hasSubHabits: boolean,
    options?: { isDrillCard?: boolean },
  ) => ReactNode
  onAddSubHabit: (parent: NormalizedHabit) => void
  onShowCompleted?: () => void
}

function DrillEmptyMessage({
  drill,
  styles,
  t,
  onShowCompleted,
}: Readonly<Pick<HabitDrillProps, 'drill' | 'styles' | 't' | 'onShowCompleted'>>) {
  return (
    <View style={styles.drillEmptyWrap}>
      <Text style={styles.drillEmptyText}>
        {t(drill.hasUnfilteredChildren ? 'habits.filterEmptySubHabits' : 'habits.noSubHabits')}
      </Text>
      {drill.canRevealCompletedChildren && onShowCompleted ? (
        <PillButton variant="ghost" onClick={onShowCompleted}>
          {t('habits.showCompleted')}
        </PillButton>
      ) : null}
    </View>
  )
}

/** The focused, stack-based view of one parent's direct sub habits. */
export function HabitDrill({
  drill,
  styles,
  t,
  listHeaderComponent,
  drillListRef,
  refreshControl,
  onListScroll,
  onFocus,
  onScrollBeginDrag,
  bulkBarStyle,
  renderHabitCard,
  onAddSubHabit,
  onShowCompleted,
}: Readonly<HabitDrillProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [clamped, setClamped] = useState(false)
  const reduced = usePrefersReducedMotion()
  const source = useMemo(() => drill.drillLoading || drill.drillError ? [] : drill.drillChildren, [drill.drillLoading, drill.drillError, drill.drillChildren])
  const presentation = useRetainedHabitList(source, drill.currentParentId ?? '', reduced)
  const reservation = useListScrollReservation(drill.currentParentId ?? '')
  const renderItem: ListRenderItem<NormalizedHabit> = ({ item: child, index }) => {
    const nestedChildren = drill.getDrillChildren(child.id)
    return <HabitListMotionRow id={child.id} phase={presentation.rows[index]!.phase} offset={presentation.rows[index]!.offset} itemIds={presentation.itemIds} measure={presentation.measure}>{renderHabitCard(
      child,
      0,
      nestedChildren.length > 0,
      child.hasSubHabits || nestedChildren.length > 0,
      { isDrillCard: true },
    )}</HabitListMotionRow> as ReactElement
  }

  const header = (
    <>
      {listHeaderComponent}
      <View style={styles.drillControls}>
        <View style={styles.drillHeader}>
          <Pressable
            onPress={drill.drillBack}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={({ pressed }) => [
              styles.drillBackBtn,
              pressed ? styles.drillBackBtnPressed : null,
            ]}
          >
            <ArrowLeft size={20} color={tokens.fg1} strokeWidth={1.8} />
          </Pressable>
          <View style={styles.drillHeading}>
            <PersonalText onClampedChange={setClamped} accessibilityRole="header" style={styles.drillTitle}>
              {drill.currentParent?.title ?? ''}
            </PersonalText>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text style={styles.drillProgress}>
                {t('habits.drillProgress', { done: drill.completedCount, total: drill.drillChildren.length })}
              </Text>
              <PersonalTextDetails iconOnly clamped={clamped}>{drill.currentParent?.title ?? ''}</PersonalTextDetails>
            </View>
          </View>
        </View>
        {drill.drillStack.length > 1 ? (
          <ListRow
            compact={false}
            icon="home"
            title={t('habits.backToHabits')}
            chevron={false}
            onClick={drill.drillReset}
          />
        ) : null}
      </View>
    </>
  )

  const addRow = drill.currentParent ? (
    <ListRow
      compact={false}
      icon="plus"
      title={t('habits.form.addSubHabit')}
      chevron={false}
      onClick={() => onAddSubHabit(drill.currentParent!)}
    />
  ) : null

  const empty = drill.drillLoading ? (
    <View style={styles.drillSkeletons}>
      {[1, 2, 3].map((unit) => (
        <Skeleton key={unit} variant="habit-row" label={t('common.loading')} />
      ))}
    </View>
  ) : drill.drillError ? (
    <View style={styles.drillErrorWrap}>
      <Text style={styles.drillErrorText} accessibilityLiveRegion="polite">
        {drill.drillError}
      </Text>
      <IconButton label={t('common.retry')} onClick={() => void drill.refreshCurrent()}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton>
    </View>
  ) : (
    <View>
      <DrillEmptyMessage drill={drill} styles={styles} t={t} onShowCompleted={onShowCompleted} />
      {addRow}
    </View>
  )

  return (
    <KeyboardAwareFlatList
      key={drill.currentParentId}
      ref={drillListRef}
      accessibilityLabel={t('habits.sectionLabel')}
      data={presentation.items}
      onLayout={reservation.onLayout}
      keyboardShouldPersistTaps="handled"
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={drill.drillChildren.length > 0 ? addRow : null}
      contentContainerStyle={[styles.listContent, bulkBarStyle, { minHeight: reservation.minimumHeight }]}
      refreshControl={refreshControl}
      onScroll={(event) => { reservation.onOffset(event.nativeEvent.contentOffset.y); onListScroll(event) }}
      onFocus={onFocus}
      scrollEventThrottle={16}
      onScrollBeginDrag={onScrollBeginDrag}
      showsVerticalScrollIndicator={false}
      initialNumToRender={10}
      maxToRenderPerBatch={5}
      windowSize={5}
      removeClippedSubviews={false}
    />
  )
}
