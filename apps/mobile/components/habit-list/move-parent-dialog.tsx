import { SPACING } from '@orbit/shared/theme'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Home, Search } from '@/components/ui/icons'
import { plural } from '@/lib/plural'
import { filterMoveTargetsBySearch } from '@orbit/shared/utils'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { PillButton } from '@/components/ui/pill-button'
import { ActionRow } from '@/components/ui/action-row'
import { RadioGroup } from '@/components/ui/radio-row'
import { RadioRow } from '@/components/ui/select-check'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export interface MoveParentOption {
  id: string | null
  label: string
  emoji: string | null
  depth: number
  childCount: number
  disabled: boolean
  reason: string | null
}

interface MoveParentDialogProps {
  t: (key: string, params?: Record<string, unknown>) => string
  visible: boolean
  isPending: boolean
  movingHabitTitle: string | null
  movingHabitCount?: number
  error?: string | null
  movingHabitParentId: string | null | undefined
  options: MoveParentOption[]
  selectedMoveParentId: string | null | undefined
  canSubmit: boolean
  onClose: () => void
  onConfirm: () => void | Promise<boolean>
  onSelectOption: (optionId: string | null) => void
}

const SEARCH_THRESHOLD = 8

type Styles = ReturnType<typeof createStyles>

function MoveDialogDescription({
  t, name, count, styles,
}: Readonly<{ t: MoveParentDialogProps['t']; name: string | null; count?: number; styles: Styles }>) {
  if (count !== undefined || !name) return null
  return <Text style={styles.moveDialogDescription}>{t('habits.moveParent.description', { name })}</Text>
}

function MoveTargetRow({
  option,
  selected,
  isCurrentParent,
  currentLabel,
  tokens,
  styles,
  onSelect,
}: Readonly<{
  option: MoveParentOption
  selected: boolean
  isCurrentParent: boolean
  currentLabel: string
  tokens: AppTokensV2
  styles: Styles
  onSelect: (optionId: string | null) => void
}>) {
  const availability = option.disabled
    ? { disabled: true as const, reason: option.reason ?? currentLabel }
    : { disabled: false as const }

  return (
    <RadioRow
      label={option.label}
      textMode={option.id === null ? undefined : 'personal'}
      selected={selected}
      {...availability}
      depth={option.depth}
      meta={option.childCount > 0 ? String(option.childCount) : undefined}
      tag={isCurrentParent ? currentLabel : undefined}
      leading={option.id === null
        ? <Home size={20} strokeWidth={1.8} color={tokens.fg2} />
        : <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.wellEmoji}>{option.emoji ?? '·'}</Text>}
      onSelect={() => onSelect(option.id)}
    />
  )
}

/** Move-parent picker sheet (mobile). Presentational: the parent HabitList
 *  owns the move state and supplies the validated option list plus handlers. */
export function MoveParentDialog({
  t,
  visible,
  isPending,
  movingHabitTitle,
  movingHabitParentId,
  movingHabitCount,
  error,
  options,
  selectedMoveParentId,
  canSubmit,
  onClose,
  onConfirm,
  onSelectOption,
}: Readonly<MoveParentDialogProps>) {
  const { sheetRef, closeSheet } = useSheetHost()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)

  const scrollRef = useRef<ScrollView>(null)
  const viewportLaidOutRef = useRef(false)
  const contentLaidOutRef = useRef(false)
  const rowLayouts = useRef(new Map<string, { y: number; height: number }>())
  const positionOptions = () => {
    if (hasPositionedRef.current || !scrollRef.current || !viewportLaidOutRef.current || !contentLaidOutRef.current) return
    const current = movingHabitParentId ? rowLayouts.current.get(movingHabitParentId) : null
    if (movingHabitParentId && !current) return
    const previous = Array.from(rowLayouts.current.values()).find((row) => current && row.y + row.height <= current.y && row.y + row.height >= current.y - 4)
    scrollRef.current.scrollTo({ y: current ? Math.max(0, current.y - (previous?.height ?? current.height)) : 0, animated: false })
    hasPositionedRef.current = true
  }
  const [searchQuery, setSearchQuery] = useState('')
  const hasPositionedRef = useRef(false)
  useEffect(() => {
    if (!visible) {
      hasPositionedRef.current = false
      rowLayouts.current.clear()
      viewportLaidOutRef.current = false
      contentLaidOutRef.current = false
    }
  }, [visible])
  const title = movingHabitCount === undefined ? t('habits.moveParent.title')
    : plural(t('habits.moveParent.titleMany', { count: movingHabitCount }), movingHabitCount)
  async function confirmMove() {
    if (await onConfirm() === true) {
      closeSheet(hideDialog, hideDialog)
    }
  }


  const rootOption = useMemo(
    () => options.find((option) => option.id === null) ?? null,
    [options],
  )
  const destinationCount = useMemo(
    () => options.reduce((total, option) => (option.id === null ? total : total + 1), 0),
    [options],
  )
  const showSearch = destinationCount > SEARCH_THRESHOLD

  const treeRows = useMemo(() => {
    const rows = showSearch ? filterMoveTargetsBySearch(options, searchQuery) : options
    return rows.filter((option) => option.id !== null)
  }, [options, showSearch, searchQuery])

  const isSearchEmpty = showSearch && searchQuery.trim().length > 0 && treeRows.length === 0

  const hideDialog = () => {
    setSearchQuery('')
    onClose()
  }

  return (
    visible ? (<Sheet
      ref={sheetRef}
      virtualizedBody
      boundedBody
      open
      onClose={isPending ? undefined : hideDialog}
      title={title}
      actions={
        <ActionRow>
          <PillButton size="sm" variant="ghost" disabled={isPending} onClick={() => closeSheet()}>
            {t('common.cancel')}
          </PillButton>
          <PillButton size="sm" disabled={!canSubmit} loading={isPending} onClick={() => void confirmMove()}>
            {t('habits.moveParent.confirm')}
          </PillButton>
        </ActionRow>
      }
    >
      <View style={{ flexShrink: 1, gap: 8 }}>
        <MoveDialogDescription
          t={t}
          name={movingHabitTitle}
          count={movingHabitCount}
          styles={styles}
        />

        {showSearch ? (
          <View style={styles.searchWrap}>
            <Input
              label={t('habits.moveParent.searchPlaceholder')}
              value={searchQuery}
              onChange={(query) => {
                setSearchQuery(query)
                hasPositionedRef.current = true
                scrollRef.current?.scrollTo({ y: 0, animated: false })
              }}
              placeholder={t('habits.moveParent.searchPlaceholder')}
              trailing={<Search size={20} strokeWidth={1.8} color={tokens.fg3} />}
            />
          </View>
        ) : null}

        {treeRows.length > 0 ? (
          <Text style={styles.eyebrow}>{t('habits.moveParent.destinations')}</Text>
        ) : null}

        <RadioGroup accessibilityLabel={t('habits.moveParent.destinations')} style={{ flexShrink: 1 }}>
          {rootOption ? (
            <MoveTargetRow
              option={rootOption}
              selected={!rootOption.disabled && rootOption.id === selectedMoveParentId}
              isCurrentParent={rootOption.id === movingHabitParentId}
              currentLabel={t('habits.moveParent.currentParent')}
              tokens={tokens}
              styles={styles}
              onSelect={onSelectOption}
            />
          ) : null}

          <ScrollView ref={scrollRef} testID="move-destinations-scroll" style={{ flexShrink: 1 }}
            keyboardShouldPersistTaps="handled"
            onLayout={() => { viewportLaidOutRef.current = true; positionOptions() }}
            onContentSizeChange={() => { contentLaidOutRef.current = true; positionOptions() }}
            contentContainerStyle={styles.moveOptionsContent}>
            {treeRows.map((option) => (
              <View key={option.id} testID={`move-target-${option.id}`} onLayout={({ nativeEvent }) => {
                rowLayouts.current.set(option.id!, nativeEvent.layout)
                positionOptions()
              }}>
                <MoveTargetRow
                  option={option}
                  selected={!option.disabled && option.id === selectedMoveParentId}
                  isCurrentParent={option.id === movingHabitParentId}
                  currentLabel={t('habits.moveParent.currentParent')}
                  tokens={tokens}
                  styles={styles}
                  onSelect={onSelectOption}
                />
            </View>
            ))}
          </ScrollView>
        </RadioGroup>

        <Text accessibilityLiveRegion="polite" style={[styles.moveDialogError, !error && styles.emptyError]}>{error}</Text>
        <MoveEmptyState t={t} options={options} isSearchEmpty={isSearchEmpty} styles={styles} />
      </View>
    </Sheet>) : null
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    moveDialogDescription: {
      fontFamily: 'Geist_400Regular',
      fontSize: 16,
      lineHeight: 24.8,
      color: tokens.fg2,
      marginBottom: SPACING.s16,
    },
    searchWrap: {
      position: 'relative',
      justifyContent: 'center',
      marginBottom: SPACING.s12,
    },
    eyebrow: {
      fontFamily: 'GeistMono_500Medium',
      fontSize: 12,
      letterSpacing: 0.96,
      textTransform: 'uppercase',
      color: tokens.fg3,
      marginTop: SPACING.s4,
      marginBottom: SPACING.s8,
    },
    moveOptionsContent: {
      gap: 4,
      paddingTop: SPACING.s4,
    },
    wellEmoji: {
      fontSize: 16,
      lineHeight: 20,
    },
    moveDialogError: {
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      color: tokens.fg2,
    },
    emptyError: {
      position: 'absolute',
    },
    moveDialogEmpty: {
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      color: tokens.fg3,
      textAlign: 'center',
      paddingVertical: SPACING.s16,
    },
  })
}

function hasNoDestinations(options: MoveParentOption[]) {
  return options.length > 0 && options.every((option) => option.disabled)
}

function MoveEmptyState({ t, options, isSearchEmpty, styles }: Readonly<{
  t: MoveParentDialogProps['t']; options: MoveParentOption[]; isSearchEmpty: boolean; styles: Styles
}>) {
  return <>
    {hasNoDestinations(options) ? <Text style={styles.moveDialogEmpty}>{t('habits.moveParent.noDestinations')}</Text> : null}
    {isSearchEmpty ? <Text style={styles.moveDialogEmpty}>{t('habits.moveParent.noSearchResults')}</Text> : null}
  </>
}
