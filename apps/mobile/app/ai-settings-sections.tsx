import { View, Text, Pressable } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import {
  BellRing,
  Brain,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Lock,
  Satellite,
  Sparkles,
  SquareX,
  Trash2,
  X,
} from 'lucide-react-native'
import { normalizeUserFactCategory } from '@orbit/shared/utils'
import { tintFromPrimary } from '@/lib/theme'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow, Switch } from '@/components/ui/settings-row'
import { RadioGlyph } from '@/components/ui/select-check'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { SkeletonLine } from '@/components/ui/skeleton'
import { PillButton } from '@/components/ui/pill-button'
import { ProBadge } from '@/components/ui/pro-badge'
import type { UseQueryResult } from '@tanstack/react-query'
import { createStyles, type Tokens } from './ai-settings-styles'
import type { UserFact } from './use-user-facts'

type TranslationFn = (key: string, params?: Record<string, unknown>) => string

type Styles = ReturnType<typeof createStyles>

function rowEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(Math.min(index, 8) * 40)
    .reduceMotion(ReduceMotion.System)
}

interface AiFeatureTogglesProps {
  tokens: Tokens
  t: TranslationFn
  hasProAccess: boolean
  aiMemoryEnabled: boolean
  aiSummaryEnabled: boolean
  proactiveAstraEnabled: boolean
  memoryPending: boolean
  summaryPending: boolean
  proactivePending: boolean
  onToggleMemory: () => void
  onToggleSummary: () => void
  onToggleProactive: () => void
  onUpgrade: () => void
}

export function AiFeatureToggles({
  tokens,
  t,
  hasProAccess,
  aiMemoryEnabled,
  aiSummaryEnabled,
  proactiveAstraEnabled,
  memoryPending,
  summaryPending,
  proactivePending,
  onToggleMemory,
  onToggleSummary,
  onToggleProactive,
  onUpgrade,
}: Readonly<AiFeatureTogglesProps>) {
  return (
    <>
      <SectionLabel bottom={4} trailing={<ProBadge />}>
        {t('profile.sections.aiFeatures')}
      </SectionLabel>
      {hasProAccess ? (
        <SettingsRow
          icon={Brain}
          label={t('profile.aiMemory.title')}
          desc={t('profile.aiMemory.description')}
          accessory="none"
          divider={false}
        >
          <Switch
            on={aiMemoryEnabled}
            onToggle={onToggleMemory}
            disabled={memoryPending}
            accessibilityLabel={t('profile.aiMemory.title')}
          />
        </SettingsRow>
      ) : (
        <SettingsRow
          icon={Brain}
          label={t('profile.aiMemory.title')}
          desc={t('profile.aiMemory.description')}
          onPress={onUpgrade}
          accessory="chevron"
          divider={false}
        >
          <Lock size={18} color={tokens.fg3} strokeWidth={1.8} />
        </SettingsRow>
      )}
      {hasProAccess ? (
        <SettingsRow
          icon={Satellite}
          label={t('profile.aiSummary.title')}
          desc={t('profile.aiSummary.description')}
          accessory="none"
          divider={false}
        >
          <Switch
            on={aiSummaryEnabled}
            onToggle={onToggleSummary}
            disabled={summaryPending}
            accessibilityLabel={t('profile.aiSummary.title')}
          />
        </SettingsRow>
      ) : (
        <SettingsRow
          icon={Satellite}
          label={t('profile.aiSummary.title')}
          desc={t('profile.aiSummary.description')}
          onPress={onUpgrade}
          accessory="chevron"
          divider={false}
        >
          <Lock size={18} color={tokens.fg3} strokeWidth={1.8} />
        </SettingsRow>
      )}
      {hasProAccess ? (
        <SettingsRow
          icon={BellRing}
          label={t('profile.proactiveAstra.title')}
          desc={t('profile.proactiveAstra.description')}
          accessory="none"
          divider={false}
        >
          <Switch
            on={proactiveAstraEnabled}
            onToggle={onToggleProactive}
            disabled={proactivePending}
            accessibilityLabel={t('profile.proactiveAstra.title')}
          />
        </SettingsRow>
      ) : (
        <SettingsRow
          icon={BellRing}
          label={t('profile.proactiveAstra.title')}
          desc={t('profile.proactiveAstra.description')}
          onPress={onUpgrade}
          accessory="chevron"
          divider={false}
        >
          <Lock size={18} color={tokens.fg3} strokeWidth={1.8} />
        </SettingsRow>
      )}
    </>
  )
}

interface FactsSelectBarProps {
  tokens: Tokens
  t: TranslationFn
  styles: Styles
  selectMode: boolean
  selectedCount: number
  allSelected: boolean
  bulkDeletePending: boolean
  showPaging: boolean
  page: number
  totalPages: number
  onPreviousPage: () => void
  onNextPage: () => void
  onToggleSelectAll: () => void
  onBulkDelete: () => void
  onToggleSelectMode: () => void
}

export function FactsSelectBar({
  tokens,
  t,
  styles,
  selectMode,
  selectedCount,
  allSelected,
  bulkDeletePending,
  showPaging,
  page,
  totalPages,
  onPreviousPage,
  onNextPage,
  onToggleSelectAll,
  onBulkDelete,
  onToggleSelectMode,
}: Readonly<FactsSelectBarProps>) {
  return (
    <View style={styles.headerControls}>
      {showPaging ? (
        <>
          <Text style={[styles.pagingText, { color: tokens.fg3 }]}>
            {t('profile.facts.count', { n: page, max: totalPages })}
          </Text>
          <Pressable
            onPress={onPreviousPage}
            disabled={page === 1}
            accessibilityRole="button"
            accessibilityLabel={t('common.previous')}
            hitSlop={7}
            style={({ pressed }) => [
              styles.pageBtn,
              { backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev },
              page === 1 ? { opacity: 0.4 } : null,
              pressed ? styles.pageBtnPressed : null,
            ]}
          >
            <ChevronLeft
              size={17}
              strokeWidth={1.8}
              color={page === 1 ? tokens.fg4 : tokens.fg2}
            />
          </Pressable>
          <Pressable
            onPress={onNextPage}
            disabled={page === totalPages}
            accessibilityRole="button"
            accessibilityLabel={t('common.next')}
            hitSlop={7}
            style={({ pressed }) => [
              styles.pageBtn,
              { backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev },
              page === totalPages ? { opacity: 0.4 } : null,
              pressed ? styles.pageBtnPressed : null,
            ]}
          >
            <ChevronRight
              size={17}
              strokeWidth={1.8}
              color={page === totalPages ? tokens.fg4 : tokens.fg2}
            />
          </Pressable>
        </>
      ) : null}

      {selectMode ? (
        <>
          <Pressable
            onPress={onToggleSelectAll}
            accessibilityRole="button"
            accessibilityLabel={
              allSelected
                ? t('profile.facts.deselectAll')
                : t('profile.facts.selectAll')
            }
            accessibilityState={{ selected: allSelected }}
            hitSlop={{ top: 8, bottom: 8 }}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev },
              pressed ? styles.actionChipPressed : null,
            ]}
          >
            {allSelected ? (
              <SquareX size={18} color={tokens.fg2} strokeWidth={1.8} />
            ) : (
              <CheckCheck size={18} color={tokens.fg2} strokeWidth={1.8} />
            )}
          </Pressable>
          {selectedCount > 0 ? (
            <Pressable
              onPress={onBulkDelete}
              disabled={bulkDeletePending}
              accessibilityRole="button"
              accessibilityLabel={t('profile.facts.deleteSelectedShort')}
              hitSlop={{ top: 8, bottom: 8 }}
              style={({ pressed }) => [
                styles.actionChip,
                {
                  backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev,
                  borderColor: tokens.hairline,
                },
                pressed ? styles.actionChipPressed : null,
                bulkDeletePending && { opacity: 0.45 },
              ]}
            >
              <Trash2 size={14} strokeWidth={1.8} color={tokens.statusBad} />
              <Text
                style={[styles.selectActionText, { color: tokens.statusBad }]}
              >
                {selectedCount}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onToggleSelectMode}
            accessibilityRole="button"
            accessibilityLabel={t('profile.facts.cancel')}
            hitSlop={6}
            style={({ pressed }) => [
              styles.iconBtn,
              { backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev },
              pressed ? styles.actionChipPressed : null,
            ]}
          >
            <X size={18} color={tokens.fg3} strokeWidth={1.8} />
          </Pressable>
        </>
      ) : (
        <Pressable
          onPress={onToggleSelectMode}
          accessibilityRole="button"
          accessibilityLabel={t('profile.facts.select')}
          hitSlop={6}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev },
            pressed ? styles.actionChipPressed : null,
          ]}
        >
          <ListChecks size={18} color={tokens.fg3} strokeWidth={1.8} />
        </Pressable>
      )}
    </View>
  )
}

interface FactItemProps {
  tokens: Tokens
  t: TranslationFn
  styles: Styles
  fact: UserFact
  index: number
  selectMode: boolean
  selected: boolean
  onToggleSelection: (id: string) => void
  onDelete: (id: string) => void
}

function FactItem({
  tokens,
  t,
  styles,
  fact,
  index,
  selectMode,
  selected,
  onToggleSelection,
  onDelete,
}: Readonly<FactItemProps>) {
  function categoryLabel(category: string | null): string {
    const norm = normalizeUserFactCategory(category)
    return t(`profile.facts.${norm}`, { defaultValue: norm }).toUpperCase()
  }

  return (
    <Animated.View entering={rowEntrance(index)}>
      <Pressable
        onPress={selectMode ? () => onToggleSelection(fact.id) : undefined}
        accessibilityRole={selectMode ? 'checkbox' : 'none'}
        accessibilityState={selectMode ? { checked: selected } : undefined}
        style={({ pressed }) => [
          styles.factCard,
          selected && selectMode
            ? {
                backgroundColor: tintFromPrimary(tokens, 0.08),
                borderColor: tintFromPrimary(tokens, 0.28),
              }
            : {
                backgroundColor:
                  pressed && selectMode
                    ? tokens.bgElevPressed
                    : tokens.bgCard,
                borderColor: tokens.hairline,
              },
          pressed && selectMode ? styles.factCardPressed : null,
        ]}
      >
        {selectMode ? (
          <View style={styles.checkSlot}>
            <RadioGlyph selected={selected} size={18} tokens={tokens} />
          </View>
        ) : null}
        <View style={styles.factBody}>
          {fact.category ? (
            <View
              style={[
                styles.categoryPill,
                { borderColor: tokens.hairlineStrong },
              ]}
            >
              <Text style={[styles.categoryText, { color: tokens.fg3 }]}>
                {categoryLabel(fact.category)}
              </Text>
            </View>
          ) : null}
          <Text style={[styles.factText, { color: tokens.fg1 }]}>
            {fact.factText}
          </Text>
        </View>
        {!selectMode ? (
          <Pressable
            onPress={() => onDelete(fact.id)}
            accessibilityRole="button"
            accessibilityLabel={t('profile.facts.delete')}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={({ pressed }) => [
              styles.deleteBtn,
              { backgroundColor: pressed ? tokens.bgElev2 : tokens.bgElev },
              pressed ? styles.actionChipPressed : null,
            ]}
          >
            {({ pressed }) => (
              <Trash2
                size={18}
                color={pressed ? tokens.statusBad : tokens.fg4}
                strokeWidth={1.8}
              />
            )}
          </Pressable>
        ) : null}
      </Pressable>
    </Animated.View>
  )
}

interface UserFactsListProps {
  tokens: Tokens
  t: TranslationFn
  styles: Styles
  hasProAccess: boolean
  factsQuery: Pick<UseQueryResult<UserFact[]>, 'isLoading' | 'error' | 'refetch'>
  facts: UserFact[]
  pagedFacts: UserFact[]
  selectMode: boolean
  selectedFactIds: Set<string>
  onToggleSelection: (id: string) => void
  onDelete: (id: string) => void
  onAskAstra: () => void
}

export function UserFactsList({
  tokens,
  t,
  styles,
  hasProAccess,
  factsQuery,
  facts,
  pagedFacts,
  selectMode,
  selectedFactIds,
  onToggleSelection,
  onDelete,
  onAskAstra,
}: Readonly<UserFactsListProps>) {
  if (!hasProAccess) {
    return (
      <View style={styles.lockedBlock}>
        <Text style={[styles.lockedText, { color: tokens.fg3 }]}>
          {t('profile.facts.lockedHint')}
        </Text>
      </View>
    )
  }

  if (factsQuery.isLoading) {
    return (
      <View style={styles.skelStack}>
        <SkeletonLine height={56} style={{ borderRadius: 16 }} />
        <SkeletonLine height={56} style={{ borderRadius: 16 }} />
      </View>
    )
  }

  if (factsQuery.error) {
    return (
      <Animated.View
        entering={FadeInDown.duration(280).reduceMotion(ReduceMotion.System)}
        style={styles.emptyBlock}
        accessibilityRole="alert"
      >
        <SatelliteGlyph size={96} />
        <Text style={[styles.emptyBody, { color: tokens.statusBadText }]}>
          {t('profile.facts.factsError')}
        </Text>
        <PillButton fullWidth onPress={() => void factsQuery.refetch()}>
          {t('profile.facts.retry')}
        </PillButton>
      </Animated.View>
    )
  }

  if (facts.length === 0) {
    return (
      <Animated.View
        entering={FadeInDown.duration(280).reduceMotion(ReduceMotion.System)}
        style={styles.emptyBlock}
      >
        <SatelliteGlyph size={96} />
        <Text style={[styles.emptyBody, { color: tokens.fg2 }]}>
          {t('profile.facts.empty')}
        </Text>
        <PillButton
          fullWidth
          onPress={onAskAstra}
          leading={
            <Sparkles size={18} color={tokens.fgOnPrimary} strokeWidth={1.8} />
          }
        >
          {t('summary.askAstra')}
        </PillButton>
      </Animated.View>
    )
  }

  return (
    <View style={styles.factsList}>
      {pagedFacts.map((fact, index) => (
        <FactItem
          key={fact.id}
          tokens={tokens}
          t={t}
          styles={styles}
          fact={fact}
          index={index}
          selectMode={selectMode}
          selected={selectedFactIds.has(fact.id)}
          onToggleSelection={onToggleSelection}
          onDelete={onDelete}
        />
      ))}
    </View>
  )
}
