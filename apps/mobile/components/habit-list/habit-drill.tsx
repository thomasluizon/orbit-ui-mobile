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
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { useDrillNavigation } from '@/hooks/use-drill-navigation'
import { ArrowLeft } from '@/components/ui/icons'
import { Badge } from '@/components/ui/badge'
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
  hasProAccess: boolean
  listHeaderComponent: ReactNode
  drillListRef: RefObject<FlatList<NormalizedHabit> | null>
  refreshControl: ReactElement<RefreshControlProps>
  onListScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  onScrollBeginDrag?: () => void
  bulkBarStyle: StyleProp<ViewStyle>
  renderHabitCard: (
    habit: NormalizedHabit,
    depth: number,
    hasChildren: boolean,
    hasSubHabits: boolean,
    options?: { isDrillCard?: boolean },
  ) => ReactNode
  onAddSubHabit: (parentId: string) => void
}

/** The focused, stack-based view of one parent's direct sub habits. */
export function HabitDrill({
  drill,
  styles,
  t,
  hasProAccess,
  listHeaderComponent,
  drillListRef,
  refreshControl,
  onListScroll,
  onScrollBeginDrag,
  bulkBarStyle,
  renderHabitCard,
  onAddSubHabit,
}: Readonly<HabitDrillProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const completedCount = drill.drillChildren.filter(
    (child) => child.isCompleted || child.isLoggedInRange,
  ).length

  const renderItem: ListRenderItem<NormalizedHabit> = ({ item: child }) => {
    const nestedChildren = drill.getDrillChildren(child.id)
    return renderHabitCard(
      child,
      0,
      nestedChildren.length > 0,
      child.hasSubHabits || nestedChildren.length > 0,
      { isDrillCard: true },
    ) as ReactElement
  }

  const header = (
    <>
      {listHeaderComponent}
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
          <Text style={styles.drillTitle} numberOfLines={1}>
            {drill.currentParent?.title ?? ''}
          </Text>
          <Text style={styles.drillProgress}>
            {t('habits.drillProgress', {
              done: completedCount,
              total: drill.drillChildren.length,
            })}
          </Text>
        </View>
      </View>
      {drill.drillStack.length > 1 ? (
        <ListRow
          icon="home"
          title={t('habits.backToHabits')}
          chevron={false}
          onClick={drill.drillReset}
        />
      ) : null}
    </>
  )

  const addRow = drill.currentParentId ? (
    <ListRow
      icon="plus"
      title={t('habits.form.addSubHabit')}
      chevron={false}
      trailing={hasProAccess ? undefined : <Badge>Pro</Badge>}
      onClick={() => onAddSubHabit(drill.currentParentId!)}
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
      <PillButton variant="ghost" onClick={() => void drill.refreshCurrent()}>
        {t('common.retry')}
      </PillButton>
    </View>
  ) : (
    <View>
      <Text style={styles.drillEmptyText}>{t('habits.noSubHabits')}</Text>
      {addRow}
    </View>
  )

  return (
    <FlatList
      ref={drillListRef}
      data={drill.drillLoading || drill.drillError ? [] : drill.drillChildren}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={drill.drillChildren.length > 0 ? addRow : null}
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
